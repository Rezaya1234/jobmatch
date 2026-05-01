"""
Match Agent — multi-head LLM scoring with explicit dimension weights.
Call 1: fast batch scoring (Haiku). Call 2: deep per-job analysis (Sonnet, active users only, cached).
Weighted scores computed in code, not by LLM.
"""
import json
import logging
import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from agents.profile_agent import DEFAULT_WEIGHTS
from db.models import Job, JobMatch, UserProfile
from llm.client import LLMClient, Message, ModelTier

logger = logging.getLogger(__name__)

_TOP_K = 10
_EMBEDDING_THRESHOLD = 0.65
_CALL2_ACTIVE_DAYS = 7
_CALL2_TTL_DAYS = 7
_DESC_TARGET_CHARS = 1200

ALLOWED_DIMENSIONS = [
    "skills_match",
    "industry_alignment",
    "experience_level",
    "function_type",
    "salary",
    "career_trajectory",
]

_COST_PER_BATCH_USD = 0.00125   # Haiku Call 1, ~10-job batch
_COST_PER_CALL2_USD = 0.003     # Sonnet Call 2, per job


@dataclass
class MatchRunResult:
    scored: int
    call2_count: int

# Regex strips common boilerplate lines before truncation
_BOILERPLATE = re.compile(
    r"^[^\n]*("
    r"equal opportunity employer"
    r"|unlimited pto"
    r"|health (insurance|benefits|dental|vision)"
    r"|competitive salary|competitive compensation|competitive pay"
    r"|apply now|apply today|apply online"
    r"|401k|retirement plan"
    r"|we (are|offer|provide|believe|celebrate|value) (an? )?(equal|diverse|inclusive|great)"
    r"|benefits include"
    r")\s*[^\n]*$",
    re.IGNORECASE | re.MULTILINE,
)


class MatchAgent:
    def __init__(self, session: AsyncSession, llm: LLMClient) -> None:
        self._session = session
        self._llm = llm

    async def run(
        self,
        user_id: str,
        match_run_id: str | None = None,
        candidate_job_ids: list[str] | None = None,
    ) -> MatchRunResult:
        """Score top candidates (Call 1), then enrich with Call 2 for active users.

        candidate_job_ids: if provided, score exactly these jobs (the final output
        of FilterAgent.get_candidates — soft-filtered + diversified). When omitted,
        falls back to a DB query using the embedding_score threshold.
        """
        profile = await self._get_profile(user_id)
        if profile is None:
            logger.warning("No profile for user %s — skipping matching", user_id)
            return MatchRunResult(scored=0, call2_count=0)

        weights = self._resolve_weights(profile)
        if not _validate_weights(weights):
            logger.warning("Invalid weights for user %s — falling back to defaults", user_id)
            weights = DEFAULT_WEIGHTS.copy()

        # ---- Call 1: batch LLM scoring ----
        matches = await self._get_top_candidates(user_id, job_ids=candidate_job_ids)
        jobs_by_id: dict[str, Job] = {}
        scored = 0

        if matches:
            jobs_by_id = await self._load_jobs([str(m.job_id) for m in matches])
            try:
                raw_scores = await self._score_batch(profile, jobs_by_id, weights)
            except Exception:
                logger.exception("Batch scoring failed for user %s", user_id)
                return MatchRunResult(scored=0, call2_count=0)

            weighted_scores = _compute_weighted_scores(raw_scores, jobs_by_id, weights)
            normalized = _normalize(weighted_scores)

            for match in matches:
                job_id = str(match.job_id)
                if job_id not in raw_scores:
                    continue
                job = jobs_by_id[job_id]
                dim_scores = raw_scores[job_id]
                match.dimension_scores = _build_dimension_scores(dim_scores, job)
                match.weights_used = weights
                match.weighted_score = round(weighted_scores.get(job_id, 0.0), 4)
                match.normalized_score = round(normalized.get(job_id, 0.0), 4)
                match.score = match.normalized_score
                match.low_confidence = _is_low_confidence(dim_scores)
                match.match_run_id = match_run_id
                scored += 1

        # ---- Call 2: deep analysis for active users ----
        call2_count = 0
        if _is_active_user(profile):
            call2_matches = list(matches) if matches else []

            # Also pick up previously scored matches that are missing call2
            pending = await self._get_call2_pending(user_id)
            existing_ids = {str(m.job_id) for m in call2_matches}
            extra_pending = [m for m in pending if str(m.job_id) not in existing_ids]

            if extra_pending:
                extra_job_ids = [str(m.job_id) for m in extra_pending if str(m.job_id) not in jobs_by_id]
                if extra_job_ids:
                    jobs_by_id.update(await self._load_jobs(extra_job_ids))
                call2_matches += extra_pending

            current_pv = profile.profile_version or 1
            for match in call2_matches:
                job = jobs_by_id.get(str(match.job_id))
                if job and not _call2_cache_valid(match, job, current_pv, weights):
                    content = await self._run_call2(profile, match, job)
                    if content:
                        match.call2_content = content
                        match.call2_generated_at = datetime.now(timezone.utc)
                        match.call2_profile_version = current_pv
                        match.call2_weights_snapshot = dict(weights)
                        call2_count += 1

        await self._session.commit()

        if scored > 0:
            from db.activity import log_event
            await log_event(self._session, user_id, "llm_scored",
                            jobs_scored=scored, estimated_cost_usd=round(_COST_PER_BATCH_USD, 5))
            await self._session.commit()

        logger.info("Scored %d jobs for user %s (call2=%d, cold_start=%s)", scored, user_id, call2_count, profile.cold_start)
        return MatchRunResult(scored=scored, call2_count=call2_count)

    def _resolve_weights(self, profile: UserProfile) -> dict[str, float]:
        if profile.cold_start or not profile.learned_weights:
            return DEFAULT_WEIGHTS.copy()
        return profile.learned_weights

    async def _score_batch(
        self, profile: UserProfile, jobs_by_id: dict[str, Job], weights: dict
    ) -> dict[str, dict[str, float]]:
        job_list = [_format_job(j) for j in jobs_by_id.values()]
        system = _build_system_prompt(profile, weights)
        user_prompt = (
            f"Score these {len(job_list)} jobs. Return ONLY a valid JSON array.\n"
            "Each element must have: job_id (string), "
            + ", ".join(f"{d} (float 0.0-1.0)" for d in ALLOWED_DIMENSIONS)
            + ".\n\n"
            + json.dumps(job_list, indent=2)
        )
        response = await self._llm.complete(
            messages=[Message(role="user", content=user_prompt)],
            system=system,
            tier=ModelTier.FAST,
            max_tokens=4096,
        )
        items = _parse_json_array(response)
        result: dict[str, dict[str, float]] = {}
        for item in items:
            if not isinstance(item, dict) or "job_id" not in item:
                continue
            dim_scores = {
                d: float(item[d])
                for d in ALLOWED_DIMENSIONS
                if d in item and isinstance(item[d], (int, float))
            }
            result[str(item["job_id"])] = dim_scores
        return result

    async def _run_call2(
        self, profile: UserProfile, match: JobMatch, job: Job
    ) -> dict | None:
        dim_scores = match.dimension_scores or {}
        dim_summary = ", ".join(
            f"{d}={_get_score(dim_scores.get(d)):.2f}"
            for d in ALLOWED_DIMENSIONS
            if _get_score(dim_scores.get(d)) is not None
        )

        profile_lines = []
        if profile.role_description:
            profile_lines.append(f"Background: {profile.role_description}")
        if profile.seniority_level:
            profile_lines.append(f"Seniority: {profile.seniority_level}")
        if profile.years_experience:
            profile_lines.append(f"Experience: {profile.years_experience} years")
        if profile.preferred_sectors:
            profile_lines.append(f"Target sectors: {', '.join(profile.preferred_sectors)}")

        if job.salary_min or job.salary_max:
            lo, hi = job.salary_min or "?", job.salary_max or "?"
            salary_str = f"Salary: {lo}–{hi} {job.salary_currency or 'USD'}"
        else:
            salary_str = "Salary: not disclosed"

        desc_excerpt = _compress_job_description(job.description or "")[:600]

        user_prompt = (
            f"Candidate:\n{chr(10).join(profile_lines) or 'No profile data.'}\n\n"
            f"Job: {job.title} at {job.company}\n"
            f"{salary_str}\n"
            f"Description excerpt:\n{desc_excerpt}\n\n"
            f"Call-1 dimension scores: {dim_summary}\n\n"
            "Return JSON only:\n"
            '{"why_worth_pursuing": "2-3 sentences why genuinely worth their time", '
            '"potential_gaps": ["gap 1", "gap 2"], '
            '"course_gaps": ["what to learn if relevant"], '
            '"confidence": "high|medium|low", '
            '"advisor_summary": "one direct candid sentence"}'
        )

        try:
            response = await self._llm.complete(
                messages=[Message(role="user", content=user_prompt)],
                system="You are a candid career advisor. Be specific and honest. Return valid JSON only.",
                tier=ModelTier.STANDARD,
                max_tokens=512,
            )
            start, end = response.find("{"), response.rfind("}")
            if start != -1 and end != -1:
                return json.loads(response[start:end + 1])
        except Exception:
            logger.exception("Call 2 failed for match %s", match.id)
        return None

    async def _get_top_candidates(
        self, user_id: str, job_ids: list[str] | None = None
    ) -> list[JobMatch]:
        if job_ids is not None:
            # Score exactly the jobs that survived soft filter + diversification.
            result = await self._session.execute(
                select(JobMatch)
                .join(Job, JobMatch.job_id == Job.id)
                .where(
                    JobMatch.user_id == user_id,
                    JobMatch.passed_hard_filter.is_(True),
                    JobMatch.score.is_(None),
                    Job.is_active.is_(True),
                    JobMatch.job_id.in_(job_ids),
                )
            )
        else:
            # Fallback: use embedding threshold (legacy path, no candidate list available).
            result = await self._session.execute(
                select(JobMatch)
                .join(Job, JobMatch.job_id == Job.id)
                .where(
                    JobMatch.user_id == user_id,
                    JobMatch.passed_hard_filter.is_(True),
                    JobMatch.score.is_(None),
                    Job.is_active.is_(True),
                    or_(
                        JobMatch.embedding_score.is_(None),
                        JobMatch.embedding_score >= _EMBEDDING_THRESHOLD,
                    ),
                )
                .order_by(
                    JobMatch.embedding_score.desc().nulls_last(),
                    JobMatch.heuristic_score.desc().nulls_last(),
                    Job.posted_at.desc().nulls_last(),
                )
                .limit(_TOP_K)
            )
        return list(result.scalars().all())

    async def _get_call2_pending(self, user_id: str) -> list[JobMatch]:
        result = await self._session.execute(
            select(JobMatch)
            .join(Job, JobMatch.job_id == Job.id)
            .where(
                JobMatch.user_id == user_id,
                JobMatch.score.isnot(None),
                JobMatch.call2_content.is_(None),
                Job.is_active.is_(True),
            )
            .order_by(JobMatch.score.desc())
            .limit(5)
        )
        return list(result.scalars().all())

    async def _get_profile(self, user_id: str) -> UserProfile | None:
        result = await self._session.execute(
            select(UserProfile).where(UserProfile.user_id == user_id)
        )
        return result.scalar_one_or_none()

    async def _load_jobs(self, job_ids: list[str]) -> dict[str, Job]:
        result = await self._session.execute(select(Job).where(Job.id.in_(job_ids)))
        return {str(j.id): j for j in result.scalars().all()}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _is_active_user(profile: UserProfile) -> bool:
    if profile.last_engaged_at is None:
        return False
    cutoff = datetime.now(timezone.utc) - timedelta(days=_CALL2_ACTIVE_DAYS)
    engaged = profile.last_engaged_at
    if engaged.tzinfo is None:
        engaged = engaged.replace(tzinfo=timezone.utc)
    return engaged >= cutoff


_CALL2_WEIGHT_DRIFT = 0.10


def _call2_cache_valid(match: JobMatch, job: Job, profile_version: int, weights: dict) -> bool:
    if not match.call2_content or match.call2_generated_at is None:
        return False
    if match.call2_profile_version != profile_version:
        return False
    # Invalidate if weights have drifted more than threshold since call2 was generated
    snapshot = match.call2_weights_snapshot or {}
    if snapshot:
        drift = sum(abs(weights.get(d, 0.0) - snapshot.get(d, 0.0)) for d in ALLOWED_DIMENSIONS)
        if drift > _CALL2_WEIGHT_DRIFT:
            return False
    generated = match.call2_generated_at
    if generated.tzinfo is None:
        generated = generated.replace(tzinfo=timezone.utc)
    cutoff = datetime.now(timezone.utc) - timedelta(days=_CALL2_TTL_DAYS)
    if generated < cutoff:
        return False
    if job.description_last_changed_at:
        changed = job.description_last_changed_at
        if changed.tzinfo is None:
            changed = changed.replace(tzinfo=timezone.utc)
        if changed > generated:
            return False
    return True


def _get_score(v) -> float | None:
    """Extract float score from either new {score, ...} format or legacy float."""
    if isinstance(v, dict):
        return v.get("score")
    if isinstance(v, (int, float)):
        return float(v)
    return None


def _score_confidence(score: float) -> str:
    if score == 0.5:
        return "low"
    if abs(score - 0.5) >= 0.25:
        return "high"
    return "medium"


def _build_dimension_scores(raw: dict[str, float], job: Job) -> dict:
    """Convert raw LLM float scores → {score, data_available, confidence} per dimension."""
    result = {}
    salary_available = bool(job.salary_min or job.salary_max)
    for d in ALLOWED_DIMENSIONS:
        score = raw.get(d, 0.5)
        if d == "salary":
            data_available = salary_available
        else:
            data_available = True
        result[d] = {
            "score": round(score, 4),
            "data_available": data_available,
            "confidence": _score_confidence(score),
        }
    return result


def _compute_weighted_scores(
    raw_scores: dict[str, dict[str, float]],
    jobs_by_id: dict[str, Job],
    weights: dict[str, float],
) -> dict[str, float]:
    """Compute weighted score per job, excluding salary dimension when no salary data."""
    result = {}
    for job_id, dim_scores in raw_scores.items():
        job = jobs_by_id.get(job_id)
        if job and not (job.salary_min or job.salary_max):
            # Exclude salary and renormalize remaining weights
            active_dims = [d for d in ALLOWED_DIMENSIONS if d != "salary"]
            raw_sum = sum(weights.get(d, 0.0) for d in active_dims)
            if raw_sum > 0:
                effective = {d: weights.get(d, 0.0) / raw_sum for d in active_dims}
            else:
                effective = {d: 1.0 / len(active_dims) for d in active_dims}
            result[job_id] = sum(dim_scores.get(d, 0.5) * effective[d] for d in active_dims)
        else:
            result[job_id] = sum(dim_scores.get(d, 0.5) * weights.get(d, 0.0) for d in ALLOWED_DIMENSIONS)
    return result


def _compress_job_description(text: str) -> str:
    if not text:
        return ""
    text = _BOILERPLATE.sub("", text)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    if len(text) <= _DESC_TARGET_CHARS:
        return text
    return text[:_DESC_TARGET_CHARS].rsplit(" ", 1)[0] + "…"


def _build_system_prompt(profile: UserProfile, weights: dict) -> str:
    lines = []
    if profile.role_description:
        lines.append(f"Background: {profile.role_description}")
    if profile.seniority_level:
        lines.append(f"Seniority: {profile.seniority_level}")
    if profile.salary_min or profile.salary_max:
        lo = profile.salary_min or "?"
        hi = profile.salary_max or "?"
        lines.append(f"Salary range: {lo}–{hi} {profile.salary_currency}")
    if profile.preferred_sectors:
        lines.append(f"Preferred sectors: {', '.join(profile.preferred_sectors)}")
    if profile.years_experience:
        lines.append(f"Years of experience: {profile.years_experience}")

    profile_str = "\n".join(lines) or "No profile data."
    weight_str = "\n".join(f"  {d}: {v:.2f}" for d, v in weights.items())

    return f"""You are a job-matching expert. Score each job on exactly these 6 dimensions.

CANDIDATE PROFILE:
{profile_str}

DIMENSION WEIGHTS (reference only — do NOT compute weighted totals):
{weight_str}

STRICT RULES:
- Score ONLY these dimensions: {', '.join(ALLOWED_DIMENSIONS)}
- Do NOT invent new dimensions or criteria
- Do NOT compute weighted totals — return raw per-dimension scores only
- Do NOT hallucinate information not in the job description
- If a dimension cannot be evaluated, return 0.5
- Use the full 0.0–1.0 range — do not cluster scores
- Return ONLY valid JSON — no prose, no markdown"""


def _format_job(job: Job) -> dict:
    return {
        "job_id": str(job.id),
        "title": job.title,
        "company": job.company,
        "description": _compress_job_description(job.description or ""),
        "salary_min": job.salary_min,
        "salary_max": job.salary_max,
        "sector": job.sector,
    }


def _validate_weights(weights: dict) -> bool:
    if not weights or set(weights.keys()) != set(ALLOWED_DIMENSIONS):
        return False
    return abs(sum(weights.values()) - 1.0) < 0.01


def _is_low_confidence(dim_scores: dict) -> bool:
    return sum(1 for d in ALLOWED_DIMENSIONS if d not in dim_scores) > 2


def _normalize(scores: dict[str, float]) -> dict[str, float]:
    if not scores:
        return {}
    lo, hi = min(scores.values()), max(scores.values())
    span = hi - lo if hi > lo else 1.0
    return {k: round((v - lo) / span, 4) for k, v in scores.items()}


def _parse_json_array(text: str) -> list[dict]:
    start, end = text.find("["), text.rfind("]")
    if start == -1 or end == -1:
        logger.warning("No JSON array in match agent response")
        return []
    try:
        data = json.loads(text[start: end + 1])
        return [i for i in data if isinstance(i, dict)]
    except json.JSONDecodeError:
        logger.warning("Failed to parse match agent JSON")
        return []
