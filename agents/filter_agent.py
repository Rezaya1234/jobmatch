import logging
import re
import uuid
from dataclasses import dataclass

import numpy as np
from sqlalchemy import func, not_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from agents.embeddings import embed_single
from agents.profile_agent import build_intent_query
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

# Final output size to Matching Agent
_CANDIDATES_MAX = 15
_CANDIDATES_MIN = 3  # below this → orchestrator should trigger fallback

# ANN search pool before soft-constraint post-filter
_ANN_POOL = 50

# Sector diversification — cap any single sector at this fraction of results
_SECTOR_CAP_FRACTION = 0.60
# Skip diversification if fewer than this fraction of jobs have sector data
_SECTOR_DATA_MIN_FRACTION = 0.20

# Patterns for explicitly non-US locations. Word-boundary safe.
# Applied when user profile only accepts US locations.
_NON_US_LOCATION_PATTERNS: list[re.Pattern] = [
    # Countries / territories
    re.compile(r'\bindia\b'),
    re.compile(r'\bcanada\b'),
    re.compile(r'\bunited kingdom\b'),
    re.compile(r'\b(?:england|scotland|wales)\b'),
    re.compile(r'\b(?:germany|france|spain|italy|netherlands|poland|sweden|norway|denmark|finland|austria|switzerland|belgium|portugal|ireland|czechia|czech republic|romania|hungary|ukraine|greece|serbia|croatia|bulgaria|slovakia)\b'),
    re.compile(r'\b(?:singapore|malaysia|philippines|indonesia|thailand|vietnam|myanmar|pakistan|bangladesh|sri lanka)\b'),
    re.compile(r'\b(?:china|japan|south korea|taiwan)\b'),
    re.compile(r'\bhong kong\b'),
    re.compile(r'\b(?:saudi arabia|uae|united arab emirates|qatar|kuwait|bahrain|israel|turkey|egypt|jordan|iraq|iran|oman|azerbaijan)\b'),
    re.compile(r'\b(?:brazil|argentina|chile|colombia|peru|venezuela|uruguay|ecuador|bolivia|paraguay)\b'),
    re.compile(r'(?<!new )mexico\b'),  # "New Mexico" (US state) is exempt via lookbehind
    re.compile(r'\b(?:australia|new zealand)\b'),
    re.compile(r'\b(?:south africa|nigeria|kenya|ghana|ethiopia|morocco|algeria|tunisia|cameroon)\b'),
    re.compile(r'\b(?:uk|u\.k\.)\b'),
    # High-confidence non-US cities (no meaningful US counterpart)
    re.compile(r'\b(?:bangalore|bengaluru|hyderabad|mumbai|delhi|pune|chennai|kolkata|ahmedabad|noida|gurgaon|gurugram)\b'),
    re.compile(r'\b(?:montreal|calgary|ottawa|edmonton|winnipeg|quebec)\b'),
    re.compile(r'\b(?:tokyo|osaka|kyoto|yokohama|nagoya|sapporo)\b'),
    re.compile(r'\b(?:seoul|busan|incheon)\b'),
    re.compile(r'\b(?:beijing|shanghai|guangzhou|shenzhen|chengdu|hangzhou|nanjing|wuhan|tianjin)\b'),
    re.compile(r'\b(?:dubai|abu dhabi|riyadh|doha|kuwait city|manama|muscat)\b'),
    re.compile(r'\b(?:cape town|johannesburg|nairobi|lagos|accra|addis ababa)\b'),
    # Regions
    re.compile(r'\b(?:emea|apac|latam)\b'),
    re.compile(r'\b(?:europe|asia[- ]pacific|middle east|latin america|southeast asia|south asia|east asia)\b'),
]


def _diversify(jobs: list[Job], max_count: int) -> list[Job]:
    """Cap any single sector at 60% of returned jobs. Skip if <20% have sector data."""
    with_sector = sum(1 for j in jobs if j.sector)
    if with_sector / max(len(jobs), 1) < _SECTOR_DATA_MIN_FRACTION:
        return jobs[:max_count]

    cap = max(1, int(max_count * _SECTOR_CAP_FRACTION))
    sector_counts: dict[str, int] = {}
    result: list[Job] = []

    for job in jobs:
        sector = job.sector
        if sector is None:
            result.append(job)
        else:
            count = sector_counts.get(sector, 0)
            if count < cap:
                result.append(job)
                sector_counts[sector] = count + 1
        if len(result) >= max_count:
            break

    return result


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
        ANN search: cosine similarity against user's profile embedding.
        Returns top 10-15 jobs for the Matching Agent.
        pool_limit: cap the ANN pool (for step testing endpoints only).
        """
        profile = await self._get_profile(user_id)
        if not profile:
            return []

        query_vector = await self._build_query_vector(profile)
        if query_vector is None:
            logger.warning("User %s — no query vector available, returning empty candidates", user_id)
            return []

        try:
            uid = uuid.UUID(user_id) if isinstance(user_id, str) else user_id
        except ValueError:
            return []

        # ANN search on hard-passed unseen jobs ordered by cosine distance
        ann_limit = pool_limit or _ANN_POOL
        dist_col = Job.embedding_vector.cosine_distance(query_vector).label("ann_dist")
        stmt = (
            select(Job, dist_col)
            .join(JobMatch, JobMatch.job_id == Job.id)
            .where(
                JobMatch.user_id == uid,
                JobMatch.passed_hard_filter.is_(True),
                JobMatch.shown_at.is_(None),
                Job.is_active.is_(True),
                Job.embedding_vector.is_not(None),
            )
            .order_by(dist_col)
            .limit(ann_limit)
        )
        result = await self._session.execute(stmt)
        rows = result.all()

        if not rows:
            logger.info("User %s — no hard-passed unseen jobs with embeddings", user_id)
            return []

        jobs = [row[0] for row in rows]
        distances = [float(row[1]) for row in rows]

        # Soft constraints as post-filter (applied AFTER ANN, never as pre-filter)
        soft_pairs = [(j, d) for j, d in zip(jobs, distances) if self._passes_soft(j, profile)]
        if not soft_pairs:
            logger.info("User %s — soft constraints eliminated all jobs, using ANN top results", user_id)
            soft_pairs = list(zip(jobs, distances))

        # Persist cosine similarity scores (1 - cosine_distance for pgvector cosine op)
        sim_scores = {j.id: round(1.0 - d, 4) for j, d in soft_pairs}
        await self._write_scores(user_id, sim_scores, field="embedding_score")

        # Industry diversification
        soft_jobs = [j for j, _ in soft_pairs]
        final = _diversify(soft_jobs, _CANDIDATES_MAX)

        logger.info(
            "User %s — ANN pool %d → %d soft-passed → %d final",
            user_id, len(rows), len(soft_pairs), len(final),
        )
        return final

    async def _build_query_vector(self, profile: UserProfile) -> list[float] | None:
        """Aspiration blend: 0.7 × profile_embedding + 0.3 × goals_embedding (normalized)."""
        profile_vec = profile.profile_embedding

        if profile_vec is None:
            text = build_intent_query(profile)
            profile_vec = await embed_single(text)

        if profile_vec is None:
            return None

        if profile.goals_text:
            goals_vec = await embed_single(profile.goals_text)
            if goals_vec is not None:
                p = np.array(profile_vec, dtype=np.float32)
                g = np.array(goals_vec, dtype=np.float32)
                blended = 0.7 * p + 0.3 * g
                norm = np.linalg.norm(blended)
                if norm > 0:
                    blended = blended / norm
                return blended.tolist()

        return profile_vec

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

        job_location = job.location_raw.lower()
        _US_ALIASES = {"united states", "usa", "us", "u.s.", "u.s.a.", "america"}
        accepted_set = {a.lower() for a in profile.locations}
        accepts_us = bool(accepted_set & _US_ALIASES)
        open_to_relocation = getattr(profile, "open_to_relocation", True)

        # Onsite + no relocation: city-level check (must precede broad US pass)
        if (
            job.work_mode == "onsite"
            and "onsite" in (profile.work_modes or [])
            and not open_to_relocation
        ):
            user_city = next(
                (loc for loc in profile.locations if loc.lower() not in _US_ALIASES),
                None,
            )
            if user_city and user_city.lower() not in job_location:
                return FilterResult(
                    passed=False,
                    reason=f"onsite job in '{job.location_raw}' does not match user city '{user_city}' (relocation off)",
                )

        # Accepted-location substring match (handles multi-country profiles)
        for accepted in profile.locations:
            if accepted.lower() in job_location:
                return FilterResult(passed=True)

        # US-specific location matching
        if accepts_us:
            for alias in _US_ALIASES:
                if _alias_in_location(alias, job_location):
                    return FilterResult(passed=True)
            if _contains_us_state(job.location_raw):
                return FilterResult(passed=True)

        # Block jobs with an explicit non-US location for US-only users.
        # This must come after the accepted-location loop so that multi-country
        # profiles (e.g. "United States" + "Canada") still pass their other country.
        if accepts_us and not _is_us_compatible_location(job.location_raw):
            logger.debug("Blocked non-US location '%s' for US user", job.location_raw)
            return FilterResult(
                passed=False,
                reason=f"location '{job.location_raw}' is outside the US",
            )

        # Remote jobs: pass if user accepts remote
        # (non-US remotes already blocked above for US-only users)
        if job.work_mode == "remote" and "remote" in (profile.work_modes or []):
            return FilterResult(passed=True)

        _GLOBAL_KEYWORDS = {"remote", "worldwide", "anywhere", "global", "distributed"}
        if "remote" in (profile.work_modes or []) and any(k in job_location for k in _GLOBAL_KEYWORDS):
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


def _alias_in_location(alias: str, job_location_lower: str) -> bool:
    """
    Check whether alias appears as a standalone token in job_location.
    Splits on whitespace/comma/semicolon/slash so "us" matches "New York, NY, US"
    but not "Brussels" or "Cyprus".
    """
    tokens = {t.strip('()').lower() for t in re.split(r'[,;\s/]+', job_location_lower) if t.strip()}
    return alias.lower() in tokens


def _contains_us_state(location: str) -> bool:
    parts = [p.strip() for p in location.replace(";", ",").split(",")]
    return any(p.upper() in _US_STATES for p in parts)


def _is_us_compatible_location(location_raw: str) -> bool:
    """Return False if location explicitly names a non-US country or region."""
    loc_lower = location_raw.lower()
    return not any(p.search(loc_lower) for p in _NON_US_LOCATION_PATTERNS)
