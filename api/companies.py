import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_session
from db.models import CompanyInsight, Job

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/companies", tags=["companies"])


class CompanySummary(BaseModel):
    slug: str
    company_name: str
    sector: str | None
    company_size: str | None
    hiring_outlook: str | None
    hiring_trend: str | None
    active_job_count: int
    overall_rating: float | None
    summary: str | None
    logo_url: str | None
    website: str | None
    hiring_areas: list | None


class CompanyDetail(BaseModel):
    slug: str
    company_name: str
    sector: str | None
    company_size: str | None
    company_type: str | None
    hq_location: str | None
    website: str | None
    logo_url: str | None
    summary: str | None
    hiring_outlook: str | None
    hiring_outlook_reason: str | None
    interview_difficulty: int | None
    response_rate: str | None
    time_to_hire: str | None
    hiring_trend: str | None
    overall_rating: float | None
    rating_source: str | None
    pros: list | None
    cons: list | None
    signals: list | None
    hiring_areas: list | None
    risks: list | None
    active_job_count: int
    generated_at: str | None


class JobSummary(BaseModel):
    id: str
    title: str
    location_raw: str | None
    work_mode: str | None
    salary_min: int | None
    salary_max: int | None
    salary_currency: str | None
    url: str
    posted_at: str | None


@router.get("", response_model=list[CompanySummary])
async def list_companies(
    q: str | None = Query(None),
    outlook: str | None = Query(None),
    limit: int = Query(50, le=200),
    offset: int = Query(0),
    session: AsyncSession = Depends(get_session),
) -> list[CompanySummary]:
    stmt = select(CompanyInsight).order_by(CompanyInsight.active_job_count.desc())
    if q:
        stmt = stmt.where(CompanyInsight.company_name.ilike(f"%{q}%"))
    if outlook:
        stmt = stmt.where(CompanyInsight.hiring_outlook == outlook)
    stmt = stmt.offset(offset).limit(limit)
    result = await session.execute(stmt)
    rows = result.scalars().all()
    return [
        CompanySummary(
            slug=r.slug,
            company_name=r.company_name,
            sector=r.sector,
            company_size=r.company_size,
            hiring_outlook=r.hiring_outlook,
            hiring_trend=r.hiring_trend,
            active_job_count=r.active_job_count,
            overall_rating=r.overall_rating,
            summary=r.summary,
            logo_url=r.logo_url,
            website=r.website,
            hiring_areas=r.hiring_areas,
        )
        for r in rows
    ]


@router.get("/{slug}", response_model=CompanyDetail)
async def get_company(
    slug: str,
    session: AsyncSession = Depends(get_session),
) -> CompanyDetail:
    result = await session.execute(
        select(CompanyInsight).where(CompanyInsight.slug == slug)
    )
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Company not found")
    return CompanyDetail(
        slug=row.slug,
        company_name=row.company_name,
        sector=row.sector,
        company_size=row.company_size,
        company_type=row.company_type,
        hq_location=row.hq_location,
        website=row.website,
        logo_url=row.logo_url,
        summary=row.summary,
        hiring_outlook=row.hiring_outlook,
        hiring_outlook_reason=row.hiring_outlook_reason,
        interview_difficulty=row.interview_difficulty,
        response_rate=row.response_rate,
        time_to_hire=row.time_to_hire,
        hiring_trend=row.hiring_trend,
        overall_rating=row.overall_rating,
        rating_source=row.rating_source,
        pros=row.pros,
        cons=row.cons,
        signals=row.signals,
        hiring_areas=row.hiring_areas,
        risks=row.risks,
        active_job_count=row.active_job_count,
        generated_at=row.generated_at.isoformat() if row.generated_at else None,
    )


@router.get("/{slug}/jobs", response_model=list[JobSummary])
async def get_company_jobs(
    slug: str,
    limit: int = Query(20, le=100),
    session: AsyncSession = Depends(get_session),
) -> list[JobSummary]:
    result = await session.execute(
        select(CompanyInsight).where(CompanyInsight.slug == slug)
    )
    insight = result.scalar_one_or_none()
    if insight is None:
        raise HTTPException(status_code=404, detail="Company not found")

    jobs_result = await session.execute(
        select(Job)
        .where(Job.company == insight.company_name, Job.is_active == True)
        .order_by(Job.scraped_at.desc())
        .limit(limit)
    )
    return [
        JobSummary(
            id=str(j.id),
            title=j.title,
            location_raw=j.location_raw,
            work_mode=j.work_mode,
            salary_min=j.salary_min,
            salary_max=j.salary_max,
            salary_currency=j.salary_currency,
            url=j.url,
            posted_at=j.posted_at.isoformat() if j.posted_at else None,
        )
        for j in jobs_result.scalars().all()
    ]
