import logging
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from agents.company_sources import COMPANY_SOURCE_SLUG
from api.deps import get_session
from db.models import CompanyHiringSnapshot, CompanyInsight, FeedbackEvent, Job

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


class HiringVelocity(BaseModel):
    jobs_today: int
    jobs_7_days_ago: int
    jobs_30_days_ago: int
    week_change: int
    week_change_pct: float
    month_change: int
    month_change_pct: float
    trend: str
    data_available: bool
    snapshot_date: date | None


class DepartmentBreakdownItem(BaseModel):
    department: str
    count: int
    pct: float


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
    hiring_velocity: HiringVelocity | None
    department_breakdown: list[DepartmentBreakdownItem]
    user_feedback_count: int


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
    live_counts = (
        select(Job.company, func.count(Job.id).label("cnt"))
        .where(Job.is_active.is_(True))
        .group_by(Job.company)
        .subquery()
    )
    stmt = (
        select(CompanyInsight, func.coalesce(live_counts.c.cnt, 0).label("live_count"))
        .outerjoin(live_counts, CompanyInsight.company_name == live_counts.c.company)
        .order_by(func.coalesce(live_counts.c.cnt, 0).desc())
    )
    if q:
        stmt = stmt.where(CompanyInsight.company_name.ilike(f"%{q}%"))
    if outlook:
        stmt = stmt.where(CompanyInsight.hiring_outlook == outlook)
    stmt = stmt.offset(offset).limit(limit)
    result = await session.execute(stmt)
    return [
        CompanySummary(
            slug=r.slug,
            company_name=r.company_name,
            sector=r.sector,
            company_size=r.company_size,
            hiring_outlook=r.hiring_outlook,
            hiring_trend=r.hiring_trend,
            active_job_count=live_count,
            overall_rating=r.overall_rating,
            summary=r.summary,
            logo_url=r.logo_url,
            website=r.website,
            hiring_areas=r.hiring_areas,
        )
        for r, live_count in result.all()
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

    # ---- Live job count ----
    live_count_result = await session.execute(
        select(func.count(Job.id)).where(
            Job.company == row.company_name,
            Job.is_active.is_(True),
        )
    )
    live_active_count = int(live_count_result.scalar() or 0)

    # ---- Hiring velocity from CompanyHiringSnapshot ----
    # Use the ATS source slug (may differ from _slugify slug stored on CompanyInsight)
    source_slug = COMPANY_SOURCE_SLUG.get(row.company_name, slug)
    snap_result = await session.execute(
        select(CompanyHiringSnapshot)
        .where(CompanyHiringSnapshot.source_slug == source_slug)
        .order_by(CompanyHiringSnapshot.snapshot_date.desc())
        .limit(1)
    )
    recent = snap_result.scalar_one_or_none()

    if recent:
        snap_date = recent.snapshot_date
        jobs_today = recent.active_job_count

        snap_7_result = await session.execute(
            select(CompanyHiringSnapshot)
            .where(
                CompanyHiringSnapshot.source_slug == source_slug,
                CompanyHiringSnapshot.snapshot_date <= snap_date - timedelta(days=7),
            )
            .order_by(CompanyHiringSnapshot.snapshot_date.desc())
            .limit(1)
        )
        snap_7 = snap_7_result.scalar_one_or_none()

        snap_30_result = await session.execute(
            select(CompanyHiringSnapshot)
            .where(
                CompanyHiringSnapshot.source_slug == source_slug,
                CompanyHiringSnapshot.snapshot_date <= snap_date - timedelta(days=30),
            )
            .order_by(CompanyHiringSnapshot.snapshot_date.desc())
            .limit(1)
        )
        snap_30 = snap_30_result.scalar_one_or_none()

        jobs_7 = snap_7.active_job_count if snap_7 else jobs_today
        jobs_30 = snap_30.active_job_count if snap_30 else jobs_today

        week_change = jobs_today - jobs_7
        week_change_pct = round((week_change / jobs_7 * 100) if jobs_7 else 0.0, 1)
        month_change = jobs_today - jobs_30
        month_change_pct = round((month_change / jobs_30 * 100) if jobs_30 else 0.0, 1)
        trend = "up" if week_change > 0 else "down" if week_change < 0 else "flat"

        hiring_velocity = HiringVelocity(
            jobs_today=jobs_today,
            jobs_7_days_ago=jobs_7,
            jobs_30_days_ago=jobs_30,
            week_change=week_change,
            week_change_pct=week_change_pct,
            month_change=month_change,
            month_change_pct=month_change_pct,
            trend=trend,
            data_available=True,
            snapshot_date=snap_date,
        )

        dept_raw: dict = recent.jobs_by_department or {}
        sorted_depts = sorted(dept_raw.items(), key=lambda x: x[1], reverse=True)
        total = sum(dept_raw.values()) or 1
        top6 = sorted_depts[:6]
        other_count = sum(v for _, v in sorted_depts[6:])
        department_breakdown: list[DepartmentBreakdownItem] = [
            DepartmentBreakdownItem(department=k, count=v, pct=round(v / total * 100, 1))
            for k, v in top6
        ]
        if other_count > 0:
            department_breakdown.append(
                DepartmentBreakdownItem(
                    department="Other",
                    count=other_count,
                    pct=round(other_count / total * 100, 1),
                )
            )
    else:
        hiring_velocity = HiringVelocity(
            jobs_today=0, jobs_7_days_ago=0, jobs_30_days_ago=0,
            week_change=0, week_change_pct=0.0,
            month_change=0, month_change_pct=0.0,
            trend="flat", data_available=False, snapshot_date=None,
        )
        department_breakdown = []

    # ---- User feedback count (distinct users who interacted with this company's jobs) ----
    fb_result = await session.execute(
        select(func.count(FeedbackEvent.user_id.distinct()))
        .join(Job, FeedbackEvent.job_id == Job.id)
        .where(Job.company == row.company_name)
    )
    user_feedback_count = int(fb_result.scalar() or 0)

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
        active_job_count=live_active_count,
        generated_at=row.generated_at.isoformat() if row.generated_at else None,
        hiring_velocity=hiring_velocity,
        department_breakdown=department_breakdown,
        user_feedback_count=user_feedback_count,
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
