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


@router.get("", response_model=list[JobResponse])
async def list_jobs(
    limit: int = Query(default=100, ge=1, le=10000),
    offset: int = Query(default=0, ge=0),
    search: str = Query(default=""),
    session: AsyncSession = Depends(get_session),
) -> list[JobResponse]:
    stmt = select(Job).where(Job.is_active.is_(True)).order_by(Job.created_at.desc()).limit(limit).offset(offset)
    if search:
        like = f"%{search}%"
        stmt = stmt.where(
            Job.title.ilike(like) | Job.company.ilike(like) | Job.description.ilike(like)
        )
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
        )
        for j in result.scalars().all()
    ]


@router.get("/count")
async def count_jobs(session: AsyncSession = Depends(get_session)) -> dict:
    result = await session.execute(
        select(func.count()).select_from(Job).where(Job.is_active.is_(True))
    )
    return {"count": result.scalar()}
