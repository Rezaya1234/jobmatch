"""Thin helpers for writing to the activity_log table."""
import logging
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from db.models import ActivityLog

logger = logging.getLogger(__name__)


async def log_event(
    session: AsyncSession,
    user_id: str | uuid.UUID,
    event_type: str,
    **meta,
) -> None:
    """Write one activity_log row. Never raises — logging must not break the main flow."""
    try:
        uid = uuid.UUID(str(user_id))
        entry = ActivityLog(user_id=uid, event_type=event_type, meta=meta or None)
        session.add(entry)
        await session.flush()   # write in current transaction without committing
    except Exception:
        logger.exception("activity_log write failed (event=%s user=%s)", event_type, user_id)
