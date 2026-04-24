"""
Match Agent — multi-head LLM scoring with explicit dimension weights.
Single batch LLM call per user. Weighted scores computed in code, not by LLM.
"""
import json
import logging

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from agents.profile_agent import DEFAULT_WEIGHTS
from db.models import Job, JobMatch, UserProfile
from llm.client import LLMClient, Message, ModelTier

logger = logging.getLogger(__name__)

_TOP_K = 10               # hard cap — never pass more than this to LLM
_DESC_CHAR_LIMIT = 800
_EMBEDDING_THRESHOLD = 0.65

ALLOWED_DIMENSIONS = [
    "skills_match",
    "industry_alignment",
    "experience_level",
    "function_type",
    "salary",
    "career_trajectory",
]

_COST_PER_BATCH_USD = 0.00125  # approximate Haiku cost per 10-job batch


class MatchAgent:
    def __init__(self, session: AsyncSession, llm: LLMClient) -> None:
        self._session = session
        self._llm = llm

    async def run(self, user_id: str) -> int:
        """Score top candidates in a single LLM call. Returns count scored."""
        profile = await self._get_profile(user_id)
        if profile is None:
            logger.warning("No profile for user %s — skipping matching", user_id)
            return 0

        weights = self._resolve_weights(profile)
        if not _validate_weights(weights):
            logger.warning("Invalid weights for user %s — falling back to defaults", user_id)
            weights = DEFAULT_WEIGHTS.copy()

        matches = await self._get_top_candidates(user_id)
        if not matches:
            logger.info("No unscored candidates for user %s", user_id)
            return 0

        jobs_by_id = await self._load_jobs([str(m.job_id) for m in matches])

        try:
            raw_scores = await self._score_batch(profile, jobs_by_id, weights)
        except Exception:
            logger.exception("Batch scoring failed for user %s", user_id)
            return 0

        # Weighted scores computed in code — LLM returns raw per-dimension values only
        weighted: dict[str, float] = {
            job_id: sum(dim_scores.get(d, 0.5) * weights.get(d, 0.0) for d in ALLOWED_DIMENSIONS)
            for job_id, dim_scores in raw_scores.items()
        }
        normalized = _normalize(weighted)

        scored = 0
        for match in matches:
            job_id = str(match.job_id)
            if job_id not in raw_scores:
                continue
            dim_scores = raw_scores[job_id]
            match.dimension_scores = {d: dim_scores.get(d) for d in ALLOWED_DIMENSIONS}
            match.weights_used = weights
            match.weighted_score = round(weighted.get(job_id, 0.0), 4)
            match.normalized_score = round(normalized.get(job_id, 0.0), 4)
            match.score = match.normalized_score
            match.low_confidence = _is_low_confidence(dim_scores)
            scored += 1

        await self._session.commit()

        from db.activity import log_event
        await log_event(self._session, user_id, "llm_scored",
                        jobs_scored=scored, estimated_cost_usd=round(_COST_PER_BATCH_USD, 5))
        await self._session.commit()

        logger.info("Scored %d jobs for user %s (cold_start=%s)", scored, user_id, profile.cold_start)
        return scored

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

    async def _get_top_candidates(self, user_id: str) -> list[JobMatch]:
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
        "description": (job.description or "")[:_DESC_CHAR_LIMIT],
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
