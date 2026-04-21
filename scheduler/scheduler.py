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
    hour = int(os.getenv("PIPELINE_CRON_HOUR", "8"))
    minute = int(os.getenv("PIPELINE_CRON_MINUTE", "0"))
    timezone = os.getenv("PIPELINE_TIMEZONE", "UTC")

    _scheduler.add_job(
        _run_daily_pipeline,
        CronTrigger(hour=hour, minute=minute, timezone=timezone),
        id="daily_pipeline",
        replace_existing=True,
    )
    _scheduler.start()
    logger.info(
        "Scheduler started — daily pipeline at %02d:%02d %s", hour, minute, timezone
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
