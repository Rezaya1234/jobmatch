import logging
import re
import uuid
from dataclasses import dataclass

from sqlalchemy import func, not_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from agents.embeddings import embed_and_score
from db.models import Job, JobMatch, UserProfile

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Module-level helpers — soft constraints + heuristic scoring
# ---------------------------------------------------------------------------

_STOP_WORDS = {
    'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
    'have', 'has', 'had', 'will', 'would', 'could', 'should', 'may', 'might',
    'do', 'does', 'did', 'not', 'this', 'that', 'these', 'those', 'we', 'you',
    'i', 'it', 'he', 'she', 'they', 'their', 'our', 'your', 'its', 'as',
    'we', 'our', 'about', 'what', 'which', 'who', 'how', 'all', 'each',
}

_EXP_RE = re.compile(
    r'(\d+)\+?\s*(?:to\s*\d+)?\s*years?\s+(?:of\s+)?(?:experience|exp)',
    re.IGNORECASE,
)

_SENIORITY_RANK: dict[str, int] = {
    'intern': -1, 'internship': -1,
    'junior': 0, 'entry': 0, 'associate': 0,
    'mid': 1, 'intermediate': 1,
    'senior': 2, 'sr': 2,
    'staff': 3,
    'principal': 4, 'architect': 4,
    'director': 5,
    'vp': 6, 'vice president': 6,
    'cto': 7, 'ceo': 7, 'coo': 7, 'chief': 7,
}

_PROFILE_SENIORITY_RANK: dict[str, int] = {
    'junior': 0, 'mid': 1, 'senior': 2,
    'staff': 3, 'principal': 4, 'unknown': 2,
}

_MANAGER_KW = {'manager', 'director', 'head of', 'vp', 'vice president'}
_EXEC_KW = {'cto', 'ceo', 'coo', 'cpo', 'chief', 'president', 'founder'}

# Heuristic scoring: top 50 candidates before embedding stage
_HEURISTIC_TOP_N = 50
# Final output size to Matching Agent
_CANDIDATES_MAX = 15
_CANDIDATES_MIN = 3  # below this → orchestrator should trigger fallback

# Embedding thresholds
_STAGE1_THRESHOLD = 0.60
_STAGE1_THRESHOLD_COLD = 0.50  # relaxed for users with < 10 feedback signals
_STAGE2_THRESHOLD = 0.70


def _keywords(text: str) -> set[str]:
    words = re.findall(r'[a-z][a-z0-9+#]*', text.lower())
    return {w for w in words if len(w) > 2 and w not in _STOP_WORDS}


def _extract_min_experience(text: str) -> int | None:
    matches = _EXP_RE.findall(text)
    return min(int(m) for m in matches) if matches else None


def _extract_job_seniority_rank(title: str) -> int | None:
    lower = title.lower()
    for kw, rank in sorted(_SENIORITY_RANK.items(), key=lambda x: -len(x[0])):
        if kw in lower:
            return rank
    return None


def _detect_role_type(title: str) -> str | None:
    lower = title.lower()
    for kw in _EXEC_KW:
        if kw in lower:
            return 'executive'
    for kw in _MANAGER_KW:
        if kw in lower:
            return 'manager'
    return 'ic'


def _heuristic_score(profile: UserProfile, job: Job) -> float:
    profile_text = ' '.join(filter(None, [
        profile.role_description or '',
        ' '.join(profile.title_include or []),
    ]))
    profile_kws = _keywords(profile_text)
    if not profile_kws:
        return 0.5  # neutral when no profile data

    job_text = f"{job.title} {(job.description or '')[:2000]}"
    job_kws = _keywords(job_text)
    if not job_kws:
        return 0.0

    title_kws = _keywords(job.title)
    title_hits = len(profile_kws & title_kws)
    desc_hits = len(profile_kws & job_kws)

    union = len(profile_kws | job_kws)
    jaccard = desc_hits / union if union else 0.0
    title_boost = min(title_hits / max(len(profile_kws), 1), 0.3)
    return min(round(jaccard + title_boost, 4), 1.0)


def _build_profile_text(profile: UserProfile) -> str:
    parts = []
    if profile.role_description:
        parts.append(profile.role_description)
    if profile.title_include:
        parts.append('Skills: ' + ', '.join(profile.title_include))
    if profile.preferred_sectors:
        parts.append('Sectors: ' + ', '.join(profile.preferred_sectors))
    return ' '.join(parts) or 'software engineer'


# ---------------------------------------------------------------------------
# FilterResult (used by hard constraint phase)
# ---------------------------------------------------------------------------

@dataclass
class FilterResult:
    passed: bool
    reason: str | None = None


# ---------------------------------------------------------------------------
# FilterAgent
# ---------------------------------------------------------------------------

class FilterAgent:
    """
    Two-phase candidate selection.

    Phase 1 — run():
        Hard constraint filtering on all unmatched active jobs.
        Writes pass/fail to job_matches. No LLM involved.

    Phase 2 — get_candidates():
        Soft constraints → heuristic scoring → BGE-small → BGE-large.
        Returns top 10-15 jobs for the Matching Agent.
    """

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    # ------------------------------------------------------------------
    # Phase 1: hard constraint filtering
    # ------------------------------------------------------------------

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
        if len(jobs) > 0:
            from db.activity import log_event
            await log_event(
                self._session, user_id, "filter_run",
                total=len(jobs),
                passed=counts["passed"],
                failed=counts["failed"],
            )
            await self._session.commit()
        return counts

    # ------------------------------------------------------------------
    # Phase 2: soft constraints + heuristic + embeddings → top 10-15
    # ------------------------------------------------------------------

    async def get_candidates(self, user_id: str, pool_limit: int | None = None) -> list[Job]:
        """
        Returns top 10-15 candidate jobs for the Matching Agent.
        Returns fewer than _CANDIDATES_MIN when orchestrator should trigger fallback.
        pool_limit: cap the initial hard-passed pool (for step testing endpoints only).
        """
        profile = await self._get_profile(user_id)
        if not profile:
            return []

        # Jobs that passed hard filter and haven't been shown yet
        jobs = await self._get_hard_passed_unseen(user_id, limit=pool_limit)
        if not jobs:
            logger.info("User %s — no hard-passed unseen jobs for candidate selection", user_id)
            return []

        # Soft constraints (benefit of doubt when data missing)
        soft_passed = [j for j in jobs if self._passes_soft(j, profile)]
        if not soft_passed:
            logger.info("User %s — no jobs survived soft constraints, using hard-passed set", user_id)
            soft_passed = jobs  # fall through with full set

        # Heuristic scoring → top 50
        scored = sorted(
            [(j, _heuristic_score(profile, j)) for j in soft_passed],
            key=lambda x: x[1],
            reverse=True,
        )
        top50 = scored[:_HEURISTIC_TOP_N]
        top50_jobs = [j for j, _ in top50]

        # Persist heuristic scores
        await self._write_scores(
            user_id,
            {j.id: s for j, s in top50},
            field="heuristic_score",
        )

        # Stage 1: BGE-small
        threshold1 = _STAGE1_THRESHOLD_COLD if (profile.feedback_signal_count or 0) < 10 else _STAGE1_THRESHOLD
        stage1 = await self._embedding_filter(profile, top50_jobs, "small", threshold1)
        if not stage1:
            logger.info("User %s — BGE-small unavailable or no jobs passed threshold, using heuristic top-15", user_id)
            stage1 = [(j, 0.0) for j in top50_jobs[:_CANDIDATES_MAX]]

        # Stage 2: BGE-large
        stage1_jobs = [j for j, _ in stage1]
        stage2 = await self._embedding_filter(profile, stage1_jobs, "large", _STAGE2_THRESHOLD)
        if not stage2:
            logger.info("User %s — BGE-large unavailable or no jobs passed threshold, using stage1 results", user_id)
            stage2 = stage1

        # Persist final embedding scores
        await self._write_scores(
            user_id,
            {j.id: s for j, s in stage2},
            field="embedding_score",
        )

        final = [j for j, _ in stage2[:_CANDIDATES_MAX]]
        logger.info(
            "User %s — %d hard-passed → %d soft → %d heuristic → %d stage1 → %d stage2 → %d final",
            user_id, len(jobs), len(soft_passed), len(top50_jobs),
            len(stage1), len(stage2), len(final),
        )
        return final

    # ------------------------------------------------------------------
    # Soft constraint logic
    # ------------------------------------------------------------------

    def _passes_soft(self, job: Job, profile: UserProfile) -> bool:
        # SOFT 1: salary floor — job.salary_max must meet user's minimum
        if profile.salary_min and job.salary_max:
            if job.salary_max < profile.salary_min * 0.9:
                return False

        # SOFT 2: role type (ic / manager / executive)
        if profile.role_type and profile.role_type not in ('either', None):
            detected = _detect_role_type(job.title)
            if detected and detected != profile.role_type:
                return False

        # SOFT 3: experience floor — job must not require far more than user has
        if profile.years_experience is not None:
            min_exp = _extract_min_experience(job.description or '')
            if min_exp is not None and min_exp > profile.years_experience + 2:
                return False

        # SOFT 4: seniority ceiling — job must not be too senior for user
        if profile.seniority_level and profile.seniority_level != 'unknown':
            job_rank = _extract_job_seniority_rank(job.title)
            user_rank = _PROFILE_SENIORITY_RANK.get(profile.seniority_level, 2)
            if job_rank is not None and job_rank > user_rank + 1:
                return False

        return True

    # ------------------------------------------------------------------
    # Embedding filter
    # ------------------------------------------------------------------

    async def _embedding_filter(
        self,
        profile: UserProfile,
        jobs: list[Job],
        model_size: str,
        threshold: float,
    ) -> list[tuple[Job, float]]:
        if not jobs:
            return []

        profile_text = _build_profile_text(profile)
        job_texts = [f"{j.title}. {(j.description or '')[:1500]}" for j in jobs]

        scores = await embed_and_score(profile_text, job_texts, model_size)
        if scores is None:
            return []

        result = [(j, s) for j, s in zip(jobs, scores) if s >= threshold]
        result.sort(key=lambda x: x[1], reverse=True)
        return result

    # ------------------------------------------------------------------
    # DB helpers
    # ------------------------------------------------------------------

    async def _write_scores(
        self,
        user_id: str,
        scores: dict,
        field: str,
    ) -> None:
        try:
            uid = uuid.UUID(user_id) if isinstance(user_id, str) else user_id
        except ValueError:
            return
        for job_id, score in scores.items():
            await self._session.execute(
                update(JobMatch)
                .where(JobMatch.user_id == uid, JobMatch.job_id == job_id)
                .values(**{field: score})
            )
        await self._session.commit()

    async def _get_hard_passed_unseen(self, user_id: str, limit: int | None = None) -> list[Job]:
        try:
            uid = uuid.UUID(user_id) if isinstance(user_id, str) else user_id
        except ValueError:
            return []

        stmt = (
            select(Job)
            .join(JobMatch, JobMatch.job_id == Job.id)
            .where(
                JobMatch.user_id == uid,
                JobMatch.passed_hard_filter.is_(True),
                JobMatch.shown_at.is_(None),
                Job.is_active.is_(True),
            )
        )
        if limit:
            stmt = stmt.limit(limit)
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    async def _get_profile(self, user_id: str) -> UserProfile | None:
        result = await self._session.execute(
            select(UserProfile).where(UserProfile.user_id == user_id)
        )
        return result.scalar_one_or_none()

    async def _get_unmatched_jobs(
        self, user_id: str, job_ids: list[str] | None
    ) -> list[Job]:
        try:
            uid = uuid.UUID(user_id) if isinstance(user_id, str) else user_id
        except ValueError:
            logger.error("Invalid user_id format: %s", user_id)
            return []

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

    # ------------------------------------------------------------------
    # Hard constraint logic (unchanged)
    # ------------------------------------------------------------------

    def _apply_constraints(self, job: Job, profile: UserProfile) -> FilterResult:
        for check in (
            self._check_job_type,
            self._check_work_mode,
            self._check_location,
            self._check_company,
            self._check_title_keywords,
            self._check_visa_sponsorship,
            self._check_excluded_companies,
        ):
            result = check(job, profile)
            if not result.passed:
                return result
        return FilterResult(passed=True)

    def _check_job_type(self, job: Job, profile: UserProfile) -> FilterResult:
        if not profile.job_types:
            return FilterResult(passed=True)
        if not job.job_type:
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

        # A job tagged remote passes location for any user who accepts remote
        if job.work_mode == "remote" and "remote" in (profile.work_modes or []):
            return FilterResult(passed=True)

        job_location = job.location_raw.lower()
        _US_ALIASES = {"united states", "usa", "us", "u.s.", "u.s.a.", "america"}
        accepted_set = {a.lower() for a in profile.locations}
        accepts_us = bool(accepted_set & _US_ALIASES)

        for accepted in profile.locations:
            if accepted.lower() in job_location:
                return FilterResult(passed=True)

        if accepts_us:
            for alias in _US_ALIASES:
                if alias in job_location:
                    return FilterResult(passed=True)
            if _contains_us_state(job.location_raw):
                return FilterResult(passed=True)

        _GLOBAL_KEYWORDS = {"remote", "worldwide", "anywhere", "global", "distributed"}
        if "remote" in profile.work_modes and any(k in job_location for k in _GLOBAL_KEYWORDS):
            return FilterResult(passed=True)

        return FilterResult(
            passed=False,
            reason=f"location '{job.location_raw}' does not match accepted locations {profile.locations}",
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
            "no visa sponsorship", "not able to sponsor", "unable to sponsor",
            "cannot sponsor", "will not sponsor", "sponsorship not available",
            "must be authorized to work", "must be legally authorized",
            "not eligible for sponsorship", "citizen or permanent resident",
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


# ---------------------------------------------------------------------------
# US state helper (used by location check)
# ---------------------------------------------------------------------------

_US_STATES = {
    "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN",
    "IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV",
    "NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN",
    "TX","UT","VT","VA","WA","WV","WI","WY","DC",
}


def _contains_us_state(location: str) -> bool:
    parts = [p.strip() for p in location.replace(";", ",").split(",")]
    return any(p.upper() in _US_STATES for p in parts)
