import logging
import uuid
from dataclasses import dataclass

from sqlalchemy import func, not_, select
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import Job, JobMatch, UserProfile

logger = logging.getLogger(__name__)


@dataclass
class FilterResult:
    passed: bool
    reason: str | None = None  # populated only on failure


class FilterAgent:
    """
    Applies hard constraints from a user's profile to a batch of jobs.
    Writes pass/fail results to job_matches. No LLM involved.
    """

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def run(self, user_id: str, job_ids: list[str] | None = None) -> dict[str, int]:
        """
        Filter jobs for a user. If job_ids is None, processes all jobs not yet
        matched for this user.

        Returns {"passed": N, "failed": N}.
        """
        profile = await self._get_profile(user_id)
        if profile is None:
            logger.warning("No profile found for user %s — skipping filter", user_id)
            return {"passed": 0, "failed": 0}

        jobs = await self._get_unmatched_jobs(user_id, job_ids)
        if not jobs:
            logger.info("No new jobs to filter for user %s", user_id)
            return {"passed": 0, "failed": 0}

        counts = {"passed": 0, "failed": 0}

        for job in jobs:
            result = self._apply_constraints(job, profile)
            self._session.add(JobMatch(
                user_id=user_id,
                job_id=str(job.id),
                passed_hard_filter=result.passed,
                hard_filter_reason=result.reason,
            ))
            counts["passed" if result.passed else "failed"] += 1

        await self._session.commit()
        logger.info(
            "User %s — filtered %d jobs: %d passed, %d failed",
            user_id, len(jobs), counts["passed"], counts["failed"],
        )
        return counts

    # ------------------------------------------------------------------
    # Constraint logic
    # ------------------------------------------------------------------

    def _apply_constraints(self, job: Job, profile: UserProfile) -> FilterResult:
        """Run each hard constraint in order. First failure short-circuits."""

        result = self._check_job_type(job, profile)
        if not result.passed:
            return result

        result = self._check_work_mode(job, profile)
        if not result.passed:
            return result

        result = self._check_location(job, profile)
        if not result.passed:
            return result

        result = self._check_company(job, profile)
        if not result.passed:
            return result

        result = self._check_title_keywords(job, profile)
        if not result.passed:
            return result

        result = self._check_visa_sponsorship(job, profile)
        if not result.passed:
            return result

        result = self._check_excluded_companies(job, profile)
        if not result.passed:
            return result

        return FilterResult(passed=True)

    def _check_job_type(self, job: Job, profile: UserProfile) -> FilterResult:
        if not profile.job_types:
            return FilterResult(passed=True)
        if not job.job_type:
            # Missing data — give benefit of the doubt
            return FilterResult(passed=True)
        if job.job_type in profile.job_types:
            return FilterResult(passed=True)
        return FilterResult(
            passed=False,
            reason=f"job_type '{job.job_type}' not in user's accepted types {profile.job_types}",
        )

    def _check_work_mode(self, job: Job, profile: UserProfile) -> FilterResult:
        if not profile.work_modes:
            return FilterResult(passed=True)
        if not job.work_mode:
            return FilterResult(passed=True)
        if job.work_mode in profile.work_modes:
            return FilterResult(passed=True)
        return FilterResult(
            passed=False,
            reason=f"work_mode '{job.work_mode}' not in user's accepted modes {profile.work_modes}",
        )

    def _check_location(self, job: Job, profile: UserProfile) -> FilterResult:
        if not profile.locations:
            return FilterResult(passed=True)

        if not job.location_raw:
            return FilterResult(passed=True)

        job_location = job.location_raw.lower()

        _US_ALIASES = {"united states", "usa", "us", "u.s.", "u.s.a.", "america"}
        accepted_set = {a.lower() for a in profile.locations}
        accepts_us = bool(accepted_set & _US_ALIASES)

        for accepted in profile.locations:
            if accepted.lower() in job_location:
                return FilterResult(passed=True)

        if accepts_us:
            # Match explicit US aliases in job location string
            for alias in _US_ALIASES:
                if alias in job_location:
                    return FilterResult(passed=True)
            # Match US state abbreviations (e.g. "San Francisco, CA")
            if _contains_us_state(job.location_raw):
                return FilterResult(passed=True)

        _GLOBAL_KEYWORDS = {"remote", "worldwide", "anywhere", "global", "distributed"}
        if "remote" in profile.work_modes and any(k in job_location for k in _GLOBAL_KEYWORDS):
            return FilterResult(passed=True)

        return FilterResult(
            passed=False,
            reason=(
                f"location '{job.location_raw}' does not match "
                f"accepted locations {profile.locations}"
            ),
        )

    def _check_title_keywords(self, job: Job, profile: UserProfile) -> FilterResult:
        title = (job.title or "").lower()

        exclude = [k.lower().strip() for k in (profile.title_exclude or []) if k.strip()]
        for kw in exclude:
            if kw in title:
                return FilterResult(passed=False, reason=f"title contains excluded keyword '{kw}'")

        include = [k.lower().strip() for k in (profile.title_include or []) if k.strip()]
        if include and not any(kw in title for kw in include):
            return FilterResult(passed=False, reason=f"title matches none of required keywords {include}")

        return FilterResult(passed=True)

    def _check_company(self, job: Job, profile: UserProfile) -> FilterResult:
        if not profile.preferred_companies:
            return FilterResult(passed=True)
        # treat ["all"] as no filter
        if {c.lower().strip() for c in profile.preferred_companies} <= {"all", ""}:
            return FilterResult(passed=True)
        if not job.company:
            return FilterResult(passed=True)
        job_company = job.company.lower()
        for preferred in profile.preferred_companies:
            if preferred.lower() in job_company or job_company in preferred.lower():
                return FilterResult(passed=True)
        return FilterResult(
            passed=False,
            reason=f"company '{job.company}' not in preferred companies {profile.preferred_companies}",
        )

    def _check_visa_sponsorship(self, job: Job, profile: UserProfile) -> FilterResult:
        if not getattr(profile, "visa_sponsorship_required", False):
            return FilterResult(passed=True)
        desc = (job.description or "").lower()
        _NO_SPONSORSHIP_PHRASES = (
            "no visa sponsorship",
            "not able to sponsor",
            "unable to sponsor",
            "cannot sponsor",
            "will not sponsor",
            "sponsorship not available",
            "must be authorized to work",
            "must be legally authorized",
            "not eligible for sponsorship",
            "citizen or permanent resident",
        )
        for phrase in _NO_SPONSORSHIP_PHRASES:
            if phrase in desc:
                return FilterResult(
                    passed=False,
                    reason=f"job explicitly states no visa sponsorship (matched: '{phrase}')",
                )
        return FilterResult(passed=True)

    def _check_excluded_companies(self, job: Job, profile: UserProfile) -> FilterResult:
        excluded = getattr(profile, "excluded_companies", None) or []
        if not excluded or not job.company:
            return FilterResult(passed=True)
        job_company = job.company.lower()
        for excl in excluded:
            if excl.lower().strip() in job_company or job_company in excl.lower().strip():
                return FilterResult(
                    passed=False,
                    reason=f"company '{job.company}' is on user's excluded list",
                )
        return FilterResult(passed=True)

    # ------------------------------------------------------------------
    # DB helpers
    # ------------------------------------------------------------------

    async def _get_profile(self, user_id: str) -> UserProfile | None:
        result = await self._session.execute(
            select(UserProfile).where(UserProfile.user_id == user_id)
        )
        return result.scalar_one_or_none()

    async def _get_unmatched_jobs(
        self, user_id: str, job_ids: list[str] | None
    ) -> list[Job]:
        """Return jobs that don't yet have a job_match row for this user."""
        try:
            uid = uuid.UUID(user_id) if isinstance(user_id, str) else user_id
        except ValueError:
            logger.error("Invalid user_id format: %s", user_id)
            return []

        # Debug: count active jobs and existing matches
        active_count = await self._session.scalar(
            select(func.count()).select_from(Job).where(Job.is_active.is_(True))
        )
        match_count = await self._session.scalar(
            select(func.count()).select_from(JobMatch).where(JobMatch.user_id == uid)
        )
        logger.info(
            "User %s — active jobs: %d, existing job_match rows: %d",
            user_id, active_count or 0, match_count or 0,
        )

        # Use NOT EXISTS instead of NOT IN for correctness
        already_matched = (
            select(JobMatch.id)
            .where(JobMatch.user_id == uid, JobMatch.job_id == Job.id)
            .correlate(Job)
        )
        stmt = select(Job).where(not_(already_matched.exists()), Job.is_active.is_(True))

        if job_ids:
            stmt = stmt.where(Job.id.in_(job_ids))

        result = await self._session.execute(stmt)
        return list(result.scalars().all())


_US_STATES = {
    "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN",
    "IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV",
    "NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN",
    "TX","UT","VT","VA","WA","WV","WI","WY","DC",
}

def _contains_us_state(location: str) -> bool:
    """Return True if any comma/semicolon-separated part is a US state abbreviation."""
    parts = [p.strip() for p in location.replace(";", ",").split(",")]
    return any(p.upper() in _US_STATES for p in parts)
