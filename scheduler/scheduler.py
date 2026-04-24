import logging
import os

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from agents.orchestrator import OrchestratorAgent
from api.deps import get_llm
from db.database import AsyncSessionLocal

logger = logging.getLogger(__name__)

_scheduler = AsyncIOScheduler()


def start() -> None:
    hour = int(os.getenv("PIPELINE_CRON_HOUR", "3"))
    minute = int(os.getenv("PIPELINE_CRON_MINUTE", "0"))
    timezone = os.getenv("PIPELINE_TIMEZONE", "America/Chicago")
    recap_hour = int(os.getenv("RECAP_CRON_HOUR", "9"))
    recap_day = os.getenv("RECAP_CRON_DAY_OF_WEEK", "sun")

    _scheduler.add_job(
        _run_daily_pipeline,
        CronTrigger(hour=hour, minute=minute, timezone=timezone),
        id="daily_pipeline",
        replace_existing=True,
    )
    _scheduler.add_job(
        _run_weekly_recap,
        CronTrigger(day_of_week=recap_day, hour=recap_hour, minute=0, timezone=timezone),
        id="weekly_recap",
        replace_existing=True,
    )
    _scheduler.start()
    logger.info(
        "Scheduler started — daily pipeline at %02d:%02d %s, weekly recap %s at %02d:00",
        hour, minute, timezone, recap_day.upper(), recap_hour,
    )


def stop() -> None:
    _scheduler.shutdown(wait=False)
    logger.info("Scheduler stopped")


async def _run_daily_pipeline() -> None:
    logger.info("Scheduler: starting daily pipeline")
    llm = get_llm()
    async with AsyncSessionLocal() as session:
        orchestrator = OrchestratorAgent(session, llm)
        try:
            stats = await orchestrator.run_daily_pipeline()
            logger.info("Scheduler: pipeline complete — %s", stats)
        except Exception:
            logger.exception("Scheduler: daily pipeline crashed")


async def _run_weekly_recap() -> None:
    logger.info("Scheduler: starting weekly recap")
    from db.models import User, UserProfile
    from sqlalchemy import select
    from mailer.sender import send_weekly_recap
    async with AsyncSessionLocal() as session:
        try:
            result = await session.execute(
                select(User).join(UserProfile, User.id == UserProfile.user_id)
            )
            users = list(result.scalars().all())
            sent = 0
            for user in users:
                try:
                    sent += await send_weekly_recap(str(user.id), session)
                except Exception:
                    logger.exception("Weekly recap failed for user %s", user.id)
            logger.info("Scheduler: weekly recap complete — %d sent", sent)
        except Exception:
            logger.exception("Scheduler: weekly recap crashed")
