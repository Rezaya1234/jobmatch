from datetime import datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_session
from db.models import ActivityLog

router = APIRouter(prefix="/users/{user_id}/qa", tags=["qa"])


class ActivityItem(BaseModel):
    id: str
    event_type: str
    meta: dict | None
    created_at: datetime


@router.get("/activity", response_model=list[ActivityItem])
async def get_activity(
    user_id: str,
    limit: int = Query(default=200, ge=1, le=500),
    session: AsyncSession = Depends(get_session),
) -> list[ActivityItem]:
    result = await session.execute(
        select(ActivityLog)
        .where(ActivityLog.user_id == user_id)
        .order_by(ActivityLog.created_at.desc())
        .limit(limit)
    )
    return [
        ActivityItem(
            id=str(row.id),
            event_type=row.event_type,
            meta=row.meta,
            created_at=row.created_at,
        )
        for row in result.scalars().all()
    ]
