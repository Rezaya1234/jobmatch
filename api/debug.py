"""
Read-only pipeline inspection endpoints for the /admin/debug page.
Never modifies data — step execution lives in api/pipeline.py.
"""
import uuid
import logging

import numpy as np
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_session
from db.models import Job, JobMatch, User, UserProfile
from agents.filter_agent import (
    _detect_role_type,
    _extract_min_experience,
    _extract_job_seniority_rank,
    _PROFILE_SENIORITY_RANK,
    _ANN_POOL,
    _CANDIDATES_MAX,
    _SECTOR_CAP_FRACTION,
    _SECTOR_DATA_MIN_FRACTION,
)
from agents.profile_agent import build_intent_query
from agents.embeddings import embed_single

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/debug", tags=["debug"])


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------

class UserLookupResponse(BaseModel):
    user_id: str
    email: str
    profile_complete: bool
    has_embedding: bool


class HardFilterSummary(BaseModel):
    total_jobs: int
    passed: int
    failed: int
    by_reason: dict[str, int]


class AnnJob(BaseModel):
    rank: int
    job_id: str
    title: str
    company: str
    sector: str | None
    similarity: float


class AnnPoolResponse(BaseModel):
    jobs: list[AnnJob]
    total: int
    query_type: str  # "aspiration_blend" | "profile_embedding" | "intent_query_fallback"


class SoftFilterJob(BaseModel):
    rank: int
    job_id: str
    title: str
    company: str
    sector: str | None
    similarity: float
    passed_soft: bool
    soft_reason: str | None
    passed_diversity: bool
    diversity_reason: str | None


class SoftFilterResponse(BaseModel):
    jobs: list[SoftFilterJob]
    soft_passed: int
    soft_failed: int
    diversity_dropped: int
    final_count: int


class ScoredJob(BaseModel):
    rank: int
    job_id: str
    title: str
    company: str
    sector: str | None
    skills_match: float | None
    industry_alignment: float | None
    experience_level: float | None
    function_type: float | None
    salary: float | None
    career_trajectory: float | None
    score: float | None
    delivered: bool


class ScoredResponse(BaseModel):
    jobs: list[ScoredJob]
    total_scored: int
    delivered_count: int


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _soft_fail_reason(job: Job, profile: UserProfile) -> str | None:
    if profile.salary_min and job.salary_max:
        if job.salary_max < profile.salary_min * 0.9:
            return "Salary floor"
    if profile.role_type and profile.role_type not in ("either", None):
        detected = _detect_role_type(job.title)
        if detected and detected != profile.role_type:
            return f"Role type ({detected} ≠ {profile.role_type})"
    if profile.years_experience is not None:
        min_exp = _extract_min_experience(job.description or "")
        if min_exp is not None and min_exp > profile.years_experience + 2:
            return f"Experience floor ({min_exp}y required, user has {profile.years_experience}y)"
    if profile.seniority_level and profile.seniority_level != "unknown":
        job_rank = _extract_job_seniority_rank(job.title)
        user_rank = _PROFILE_SENIORITY_RANK.get(profile.seniority_level, 2)
        if job_rank is not None and job_rank > user_rank + 1:
            return "Seniority ceiling"
    return None


async def _build_query_vector(profile: UserProfile) -> tuple[list[float] | None, str]:
    """Returns (vector, query_type_label)."""
    profile_vec = profile.profile_embedding
    query_type = "profile_embedding"

    if profile_vec is None:
        text = build_intent_query(profile)
        profile_vec = await embed_single(text)
        query_type = "intent_query_fallback"

    if profile_vec is None:
        return None, "no_vector"

    if profile.goals_text:
        goals_vec = await embed_single(profile.goals_text)
        if goals_vec is not None:
            p = np.array(profile_vec, dtype=np.float32)
            g = np.array(goals_vec, dtype=np.float32)
            blended = 0.7 * p + 0.3 * g
            norm = np.linalg.norm(blended)
            if norm > 0:
                blended = blended / norm
            return blended.tolist(), "aspiration_blend"

    return profile_vec, query_type


def _dim_score(dimension_scores: dict | None, key: str) -> float | None:
    if not dimension_scores:
        return None
    val = dimension_scores.get(key)
    if isinstance(val, dict):
        return val.get("score")
    return float(val) if val is not None else None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/user-lookup", response_model=UserLookupResponse)
async def user_lookup(
    email: str = Query(...),
    session: AsyncSession = Depends(get_session),
) -> UserLookupResponse:
    result = await session.execute(
        select(User, UserProfile)
        .outerjoin(UserProfile, UserProfile.user_id == User.id)
        .where(User.email == email)
    )
    row = result.first()
    if row is None:
        raise HTTPException(status_code=404, detail=f"No user found with email '{email}'")
    user, profile = row
    return UserLookupResponse(
        user_id=str(user.id),
        email=user.email,
        profile_complete=profile.profile_complete if profile else False,
        has_embedding=profile.profile_embedding is not None if profile else False,
    )


@router.get("/hard-filter-summary/{user_id}", response_model=HardFilterSummary)
async def hard_filter_summary(
    user_id: str,
    session: AsyncSession = Depends(get_session),
) -> HardFilterSummary:
    try:
        uid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user_id")

    total = await session.scalar(
        select(func.count()).select_from(JobMatch).where(JobMatch.user_id == uid)
    ) or 0
    passed = await session.scalar(
        select(func.count()).select_from(JobMatch)
        .where(JobMatch.user_id == uid, JobMatch.passed_hard_filter.is_(True))
    ) or 0

    rows = await session.execute(
        select(JobMatch.hard_filter_reason, func.count().label("cnt"))
        .where(JobMatch.user_id == uid, JobMatch.passed_hard_filter.is_(False))
        .group_by(JobMatch.hard_filter_reason)
    )
    by_reason = {(r or "unknown"): c for r, c in rows.all()}

    return HardFilterSummary(total_jobs=total, passed=passed, failed=total - passed, by_reason=by_reason)


@router.get("/ann-pool/{user_id}", response_model=AnnPoolResponse)
async def ann_pool(
    user_id: str,
    session: AsyncSession = Depends(get_session),
) -> AnnPoolResponse:
    try:
        uid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user_id")

    profile = await session.scalar(select(UserProfile).where(UserProfile.user_id == uid))
    if profile is None:
        return AnnPoolResponse(jobs=[], total=0, query_type="no_profile")

    query_vec, query_type = await _build_query_vector(profile)
    if query_vec is None:
        return AnnPoolResponse(jobs=[], total=0, query_type=query_type)

    dist_col = Job.embedding_vector.cosine_distance(query_vec).label("ann_dist")
    result = await session.execute(
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
        .limit(_ANN_POOL)
    )
    rows = result.all()

    jobs = [
        AnnJob(
            rank=i + 1,
            job_id=str(job.id),
            title=job.title,
            company=job.company,
            sector=job.sector,
            similarity=round(1.0 - float(dist), 4),
        )
        for i, (job, dist) in enumerate(rows)
    ]
    return AnnPoolResponse(jobs=jobs, total=len(jobs), query_type=query_type)


@router.get("/soft-filter/{user_id}", response_model=SoftFilterResponse)
async def soft_filter_debug(
    user_id: str,
    session: AsyncSession = Depends(get_session),
) -> SoftFilterResponse:
    try:
        uid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user_id")

    profile = await session.scalar(select(UserProfile).where(UserProfile.user_id == uid))
    if profile is None:
        return SoftFilterResponse(jobs=[], soft_passed=0, soft_failed=0, diversity_dropped=0, final_count=0)

    query_vec, _ = await _build_query_vector(profile)
    if query_vec is None:
        return SoftFilterResponse(jobs=[], soft_passed=0, soft_failed=0, diversity_dropped=0, final_count=0)

    dist_col = Job.embedding_vector.cosine_distance(query_vec).label("ann_dist")
    result = await session.execute(
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
        .limit(_ANN_POOL)
    )
    ann_rows = result.all()

    # Soft filter pass/fail
    soft_results = [
        (job, round(1.0 - float(dist), 4), _soft_fail_reason(job, profile))
        for job, dist in ann_rows
    ]
    soft_passed = [(j, s) for j, s, r in soft_results if r is None]
    soft_failed_count = sum(1 for _, _, r in soft_results if r is not None)

    # Diversification
    with_sector = sum(1 for j, _ in soft_passed if j.sector)
    use_diversity = (
        len(soft_passed) > 0 and
        with_sector / max(len(soft_passed), 1) >= _SECTOR_DATA_MIN_FRACTION
    )
    cap = max(1, int(_CANDIDATES_MAX * _SECTOR_CAP_FRACTION))
    sector_counts: dict[str, int] = {}
    kept_ids: set[str] = set()
    diversity_dropped_ids: set[str] = set()

    if use_diversity:
        count = 0
        for job, _ in soft_passed:
            if count >= _CANDIDATES_MAX:
                diversity_dropped_ids.add(str(job.id))
                continue
            s = job.sector
            if s is None or sector_counts.get(s, 0) < cap:
                kept_ids.add(str(job.id))
                if s:
                    sector_counts[s] = sector_counts.get(s, 0) + 1
                count += 1
            else:
                diversity_dropped_ids.add(str(job.id))
    else:
        for job, _ in soft_passed[:_CANDIDATES_MAX]:
            kept_ids.add(str(job.id))
        for job, _ in soft_passed[_CANDIDATES_MAX:]:
            diversity_dropped_ids.add(str(job.id))

    output = []
    for i, (job, sim, soft_reason) in enumerate(soft_results):
        jid = str(job.id)
        passed_soft = soft_reason is None
        if passed_soft:
            passed_div = jid in kept_ids
            div_reason = (f"Sector cap ({job.sector})" if job.sector else "Limit reached") if not passed_div else None
        else:
            passed_div = False
            div_reason = None

        output.append(SoftFilterJob(
            rank=i + 1, job_id=jid, title=job.title, company=job.company,
            sector=job.sector, similarity=sim,
            passed_soft=passed_soft, soft_reason=soft_reason,
            passed_diversity=passed_div, diversity_reason=div_reason,
        ))

    return SoftFilterResponse(
        jobs=output,
        soft_passed=len(soft_passed),
        soft_failed=soft_failed_count,
        diversity_dropped=len(diversity_dropped_ids),
        final_count=len(kept_ids),
    )


@router.get("/scored/{user_id}", response_model=ScoredResponse)
async def scored_jobs(
    user_id: str,
    session: AsyncSession = Depends(get_session),
) -> ScoredResponse:
    try:
        uid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user_id")

    result = await session.execute(
        select(JobMatch, Job)
        .join(Job, JobMatch.job_id == Job.id)
        .where(
            JobMatch.user_id == uid,
            JobMatch.passed_hard_filter.is_(True),
            JobMatch.score.isnot(None),
        )
        .order_by(JobMatch.score.desc())
    )
    rows = result.all()

    jobs = [
        ScoredJob(
            rank=i + 1,
            job_id=str(job.id),
            title=job.title,
            company=job.company,
            sector=job.sector,
            skills_match=_dim_score(match.dimension_scores, "skills_match"),
            industry_alignment=_dim_score(match.dimension_scores, "industry_alignment"),
            experience_level=_dim_score(match.dimension_scores, "experience_level"),
            function_type=_dim_score(match.dimension_scores, "function_type"),
            salary=_dim_score(match.dimension_scores, "salary"),
            career_trajectory=_dim_score(match.dimension_scores, "career_trajectory"),
            score=match.score,
            delivered=match.shown_at is not None,
        )
        for i, (match, job) in enumerate(rows)
    ]

    return ScoredResponse(
        jobs=jobs,
        total_scored=len(jobs),
        delivered_count=sum(1 for j in jobs if j.delivered),
    )
