from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_session
from db.models import Feedback, Job, JobMatch, UserProfile

router = APIRouter(prefix="/users/{user_id}/matches", tags=["matches"])


# ------------------------------------------------------------------
# Response schema
# ------------------------------------------------------------------

from pydantic import BaseModel


class MatchResponse(BaseModel):
    match_id: str
    job_id: str
    title: str
    company: str
    url: str
    score: float | None
    reasoning: str | None
    dimension_scores: dict | None
    work_mode: str | None
    location_raw: str | None
    salary_min: int | None
    salary_max: int | None
    salary_currency: str | None
    sector: str | None
    emailed_at: datetime | None
    created_at: datetime


# ------------------------------------------------------------------
# Routes
# ------------------------------------------------------------------

async def _get_preferred_companies(user_id: str, session: AsyncSession) -> list[str]:
    result = await session.execute(
        select(UserProfile.preferred_companies).where(UserProfile.user_id == user_id)
    )
    row = result.scalar_one_or_none() or []
    # treat ["all"] or [""] as no filter
    if {c.lower().strip() for c in row} <= {"all", ""}:
        return []
    return row


def _company_filter(companies: list[str]):
    """Return a SQLAlchemy OR clause matching any preferred company (case-insensitive)."""
    from sqlalchemy import or_
    return or_(*[Job.company.ilike(f"%{c}%") for c in companies])


@router.get("/count")
async def count_matches(
    user_id: str,
    min_score: float = Query(default=0.8, ge=0.0, le=1.0),
    session: AsyncSession = Depends(get_session),
) -> dict:
    companies = await _get_preferred_companies(user_id, session)
    stmt = (
        select(func.count())
        .select_from(JobMatch)
        .join(Job, JobMatch.job_id == Job.id)
        .where(
            JobMatch.user_id == user_id,
            JobMatch.passed_hard_filter.is_(True),
            JobMatch.score >= min_score,
            Job.is_active.is_(True),
        )
    )
    if companies:
        stmt = stmt.where(_company_filter(companies))
    result = await session.execute(stmt)
    return {"count": result.scalar()}


@router.get("", response_model=list[MatchResponse])
async def list_matches(
    user_id: str,
    min_score: float = Query(default=0.0, ge=0.0, le=1.0),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    include_disliked: bool = Query(default=False),
    session: AsyncSession = Depends(get_session),
) -> list[MatchResponse]:
    companies = await _get_preferred_companies(user_id, session)
    # When min_score=0, include unscored (NULL) matches so the dashboard never goes blank
    # while a background rescore is in progress. When min_score>0, only show scored matches.
    from sqlalchemy import or_
    score_clause = (
        or_(JobMatch.score >= min_score, JobMatch.score.is_(None))
        if min_score == 0.0
        else JobMatch.score >= min_score
    )
    stmt = (
        select(JobMatch, Job)
        .join(Job, JobMatch.job_id == Job.id)
        .where(
            JobMatch.user_id == user_id,
            JobMatch.passed_hard_filter.is_(True),
            score_clause,
            Job.is_active.is_(True),
        )
    )
    if not include_disliked:
        disliked = select(Feedback.job_id).where(
            Feedback.user_id == user_id,
            Feedback.rating == "thumbs_down",
        )
        stmt = stmt.where(JobMatch.job_id.notin_(disliked))
    if companies:
        stmt = stmt.where(_company_filter(companies))
    stmt = stmt.order_by(JobMatch.score.desc().nulls_last()).limit(limit).offset(offset)
    result = await session.execute(stmt)
    return [_to_response(match, job) for match, job in result.all()]


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------

def _to_response(match: JobMatch, job: Job) -> MatchResponse:
    return MatchResponse(
        match_id=str(match.id),
        job_id=str(job.id),
        title=job.title,
        company=job.company,
        url=job.url,
        score=match.score,
        reasoning=match.reasoning,
        dimension_scores=match.dimension_scores,
        work_mode=job.work_mode,
        location_raw=job.location_raw,
        salary_min=job.salary_min,
        salary_max=job.salary_max,
        salary_currency=job.salary_currency,
        sector=job.sector,
        emailed_at=match.emailed_at,
        created_at=match.created_at,
    )
