from datetime import datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_session
from db.models import Job

router = APIRouter(prefix="/jobs", tags=["jobs"])


class JobResponse(BaseModel):
    id: str
    title: str
    company: str
    url: str
    work_mode: str | None
    job_type: str | None
    location_raw: str | None
    salary_min: int | None
    salary_max: int | None
    salary_currency: str | None
    sector: str | None
    source: str | None
    posted_at: datetime | None
    created_at: datetime
    description: str | None


_SORT_MAP = {
    "date_desc":    Job.created_at.desc(),
    "date_asc":     Job.created_at.asc(),
    "company_asc":  Job.company.asc(),
    "title_asc":    Job.title.asc(),
}


def _apply_filters(stmt, search: str, work_mode: str, job_type: str):
    if search:
        like = f"%{search}%"
        stmt = stmt.where(Job.title.ilike(like) | Job.company.ilike(like))
    if work_mode:
        stmt = stmt.where(Job.work_mode == work_mode)
    if job_type:
        stmt = stmt.where(Job.job_type == job_type)
    return stmt


@router.get("", response_model=list[JobResponse])
async def list_jobs(
    limit: int = Query(default=25, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    search: str = Query(default=""),
    work_mode: str = Query(default=""),
    job_type: str = Query(default=""),
    sort_by: str = Query(default="date_desc"),
    session: AsyncSession = Depends(get_session),
) -> list[JobResponse]:
    order = _SORT_MAP.get(sort_by, Job.created_at.desc())
    stmt = select(Job).where(Job.is_active.is_(True))
    stmt = _apply_filters(stmt, search, work_mode, job_type)
    stmt = stmt.order_by(order).limit(limit).offset(offset)
    result = await session.execute(stmt)
    return [
        JobResponse(
            id=str(j.id),
            title=j.title,
            company=j.company,
            url=j.url,
            work_mode=j.work_mode,
            job_type=j.job_type,
            location_raw=j.location_raw,
            salary_min=j.salary_min,
            salary_max=j.salary_max,
            salary_currency=j.salary_currency,
            sector=j.sector,
            source=j.source,
            posted_at=j.posted_at,
            created_at=j.created_at,
            description=j.description or None,
        )
        for j in result.scalars().all()
    ]


@router.get("/count")
async def count_jobs(
    search: str = Query(default=""),
    work_mode: str = Query(default=""),
    job_type: str = Query(default=""),
    session: AsyncSession = Depends(get_session),
) -> dict:
    stmt = select(func.count()).select_from(Job).where(Job.is_active.is_(True))
    stmt = _apply_filters(stmt, search, work_mode, job_type)
    result = await session.execute(stmt)
    return {"count": result.scalar()}
