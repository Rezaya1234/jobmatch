import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import AdminAlert

logger = logging.getLogger(__name__)
_DEDUP_HOURS = 24


async def maybe_insert_alert(
    session: AsyncSession,
    *,
    severity: str,
    title: str,
    description: str,
    metric_name: str | None = None,
    metric_value: float | None = None,
    threshold_value: float | None = None,
    failure_type: str | None = None,
) -> bool:
    """Insert AdminAlert unless an alert with the same title fired in the last 24 hours."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=_DEDUP_HOURS)
    result = await session.execute(
        select(AdminAlert.id)
        .where(AdminAlert.title == title, AdminAlert.triggered_at >= cutoff)
        .limit(1)
    )
    if result.scalar_one_or_none() is not None:
        return False
    session.add(AdminAlert(
        severity=severity,
        title=title,
        description=description,
        metric_name=metric_name,
        metric_value=metric_value,
        threshold_value=threshold_value,
        failure_type=failure_type,
    ))
    await session.commit()
    logger.info("AdminAlert inserted: [%s] %s", severity, title)
    return True
