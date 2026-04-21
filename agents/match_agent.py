import asyncio
import json
import logging
from itertools import islice

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import Job, JobMatch, UserProfile
from llm.client import LLMClient, Message, ModelTier

logger = logging.getLogger(__name__)

_BATCH_SIZE = 10          # jobs scored per LLM call (smaller = more detail per job)
_MAX_CONCURRENT = 4       # parallel LLM calls
_DESC_CHAR_LIMIT = 800    # truncate long descriptions


class MatchAgent:
    """
    Scores jobs that passed the hard filter against a user's soft preferences.
    Uses the LLM abstraction layer — works with any provider.
    """

    def __init__(self, session: AsyncSession, llm: LLMClient) -> None:
        self._session = session
        self._llm = llm

    async def run(self, user_id: str) -> int:
        """Score all unscored, passed-filter jobs for a user. Returns count scored."""
        profile = await self._get_profile(user_id)
        if profile is None:
            logger.warning("No profile for user %s — skipping matching", user_id)
            return 0

        matches = await self._get_unscored_matches(user_id)
        if not matches:
            logger.info("No unscored matches for user %s", user_id)
            return 0

        jobs_by_id = await self._load_jobs([str(m.job_id) for m in matches])
        feedback_map, liked_jobs, disliked_jobs = await self._get_feedback_with_examples(user_id)
        system_prompt = _build_system_prompt(profile, liked_jobs, disliked_jobs)

        batches = list(_batched(matches, _BATCH_SIZE))
        sem = asyncio.Semaphore(_MAX_CONCURRENT)

        async def score_batch_safe(batch):
            batch_jobs = [jobs_by_id[str(m.job_id)] for m in batch if str(m.job_id) in jobs_by_id]
            if not batch_jobs:
                return {}
            async with sem:
                try:
                    return await self._score_batch(system_prompt, batch_jobs)
                except Exception:
                    logger.exception("Scoring batch failed for user %s", user_id)
                    return {}

        results_list = await asyncio.gather(*[score_batch_safe(b) for b in batches])

        scored = 0
        for batch, scores in zip(batches, results_list):
            for match in batch:
                job_id = str(match.job_id)
                rating = feedback_map.get(job_id)
                if rating == "thumbs_down":
                    match.score = 0.0
                    match.reasoning = "Marked as not a fit."
                    scored += 1
                    continue
                result = scores.get(job_id)
                if result:
                    match.score = max(0.0, min(1.0, float(result["score"])))
                    match.reasoning = result.get("reasoning")
                    scored += 1

        await self._session.commit()
        logger.info("Scored %d jobs for user %s", scored, user_id)
        return scored

    # ------------------------------------------------------------------
    # LLM scoring
    # ------------------------------------------------------------------

    async def _score_batch(
        self, system_prompt: str, jobs: list[Job]
    ) -> dict[str, dict]:
        """Call the LLM to score a batch of jobs. Returns {job_id: {score, reasoning}}."""
        payload = [_format_job(j) for j in jobs]
        prompt = (
            f"Score these {len(payload)} jobs against the candidate's preferences:\n"
            + json.dumps(payload, indent=2)
        )

        response = await self._llm.complete(
            messages=[Message(role="user", content=prompt)],
            system=system_prompt,
            tier=ModelTier.FAST,
        )

        results = _parse_json_array(response)
        return {
            r["job_id"]: {"score": r["score"], "reasoning": r.get("reasoning", "")}
            for r in results
            if isinstance(r, dict) and "job_id" in r and "score" in r
        }

    # ------------------------------------------------------------------
    # DB helpers
    # ------------------------------------------------------------------

    async def _get_profile(self, user_id: str) -> UserProfile | None:
        result = await self._session.execute(
            select(UserProfile).where(UserProfile.user_id == user_id)
        )
        return result.scalar_one_or_none()

    async def _get_unscored_matches(self, user_id: str) -> list[JobMatch]:
        result = await self._session.execute(
            select(JobMatch)
            .join(Job, JobMatch.job_id == Job.id)
            .where(
                JobMatch.user_id == user_id,
                JobMatch.passed_hard_filter.is_(True),
                JobMatch.score.is_(None),
                Job.is_active.is_(True),
            )
            .order_by(Job.posted_at.desc().nulls_last())
            .limit(50)
        )
        return list(result.scalars().all())

    async def _load_jobs(self, job_ids: list[str]) -> dict[str, Job]:
        result = await self._session.execute(
            select(Job).where(Job.id.in_(job_ids))
        )
        return {str(j.id): j for j in result.scalars().all()}

    async def _get_feedback_with_examples(
        self, user_id: str
    ) -> tuple[dict[str, str], list[dict], list[dict]]:
        """Returns (feedback_map, liked_job_examples, disliked_job_examples)."""
        from db.models import Feedback
        result = await self._session.execute(
            select(Feedback, Job)
            .join(Job, Feedback.job_id == Job.id)
            .where(Feedback.user_id == user_id)
            .order_by(Feedback.created_at.desc())
        )
        feedback_map: dict[str, str] = {}
        liked: list[dict] = []
        disliked: list[dict] = []
        for fb, job in result.all():
            job_id = str(job.id)
            feedback_map[job_id] = fb.rating
            entry = {
                "title": job.title,
                "company": job.company,
                "sector": job.sector,
                "work_mode": job.work_mode,
                "company_size": job.company_size,
                "description_snippet": (job.description or "")[:300],
            }
            if fb.comment:
                entry["user_comment"] = fb.comment
            if fb.rating == "thumbs_up":
                liked.append(entry)
            else:
                disliked.append(entry)
        return feedback_map, liked[:10], disliked[:10]


# ------------------------------------------------------------------
# Prompt builder
# ------------------------------------------------------------------

def _build_system_prompt(
    profile: UserProfile,
    liked_jobs: list[dict] | None = None,
    disliked_jobs: list[dict] | None = None,
) -> str:
    lines = []
    if profile.role_description:
        lines.append(f"- Background & goal: {profile.role_description}")
    if profile.seniority_level:
        lines.append(f"- Seniority: {profile.seniority_level}")
    if profile.salary_min or profile.salary_max:
        lo = profile.salary_min or "unspecified"
        hi = profile.salary_max or "unspecified"
        lines.append(f"- Salary range: {lo}–{hi} {profile.salary_currency}")
    if profile.preferred_sectors:
        lines.append(f"- Preferred sectors: {', '.join(profile.preferred_sectors)}")
    if profile.company_type:
        lines.append(f"- Company type preference: {profile.company_type}")
    if profile.preferred_company_sizes:
        lines.append(f"- Preferred company sizes: {', '.join(profile.preferred_company_sizes)}")

    prefs = "\n".join(lines) if lines else "No specific soft preferences set."

    feedback_section = ""
    if liked_jobs:
        liked_summary = "\n".join(
            f"  - {j['title']} at {j['company']}"
            + (f" [{j['sector']}]" if j.get("sector") else "")
            + (f" — user said: \"{j['user_comment']}\"" if j.get("user_comment") else "")
            for j in liked_jobs
        )
        feedback_section += f"\nJobs this candidate LIKED (👍) — score similar jobs higher:\n{liked_summary}\n"
    if disliked_jobs:
        disliked_summary = "\n".join(
            f"  - {j['title']} at {j['company']}"
            + (f" [{j['sector']}]" if j.get("sector") else "")
            + (f" — user said: \"{j['user_comment']}\"" if j.get("user_comment") else "")
            for j in disliked_jobs
        )
        feedback_section += f"\nJobs this candidate DISLIKED (👎) — score similar jobs lower:\n{disliked_summary}\n"

    if feedback_section:
        feedback_section = (
            "\nLEARNED PREFERENCES FROM FEEDBACK (this overrides generic scoring):\n"
            + feedback_section
            + "\nUse these examples to calibrate: if a new job resembles a liked job, score higher; "
            "if it resembles a disliked job, score lower.\n"
        )

    return f"""\
You are a strict job matching expert. Score each job against the candidate's background, target role, and past feedback.

Candidate profile:
{prefs}
{feedback_section}
SCORING RULES — follow these exactly:
- 0.9–1.0: Almost perfect fit. Strongly resembles liked jobs. Role, domain, seniority all match.
- 0.7–0.89: Good fit. Most criteria match, minor gaps.
- 0.5–0.69: Partial fit. Some overlap but notable mismatches.
- 0.3–0.49: Poor fit. Mostly irrelevant.
- 0.0–0.29: Very poor fit. Wrong domain, wrong level, or resembles disliked jobs.

YOU MUST spread scores across this full range. Do NOT cluster around 0.6–0.75.

Return ONLY a valid JSON array — no prose, no markdown.
Each element: job_id (string), score (number), reasoning (string, one sentence)."""


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------

def _format_job(job: Job) -> dict:
    return {
        "job_id": str(job.id),
        "title": job.title,
        "company": job.company,
        "sector": job.sector,
        "company_type": job.company_type,
        "company_size": job.company_size,
        "salary_min": job.salary_min,
        "salary_max": job.salary_max,
        "salary_currency": job.salary_currency,
        "description": (job.description or "")[:_DESC_CHAR_LIMIT],
    }


def _parse_json_array(text: str) -> list[dict]:
    start, end = text.find("["), text.rfind("]")
    if start == -1 or end == -1:
        logger.warning("No JSON array in match agent response")
        return []
    try:
        data = json.loads(text[start : end + 1])
        return [item for item in data if isinstance(item, dict)]
    except json.JSONDecodeError:
        logger.warning("Failed to parse JSON from match agent response")
        return []


def _batched(iterable, n: int):
    it = iter(iterable)
    while batch := list(islice(it, n)):
        yield batch
