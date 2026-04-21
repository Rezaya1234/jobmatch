import asyncio
import logging

import httpx
from sqlalchemy import delete, func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from agents.ats_fetchers import fetch_company_jobs
from agents.company_sources import COMPANY_SOURCES
from db.models import Feedback, Job

logger = logging.getLogger(__name__)

_MAX_TOTAL_JOBS = 10_000
_CONCURRENCY = 5        # parallel network fetches
_TIMEOUT = 20


class JobSearchAgent:
    """
    Fetches all open positions directly from company career pages via ATS APIs.
    On each run: inserts new jobs, marks closed ones inactive, enforces 10k cap.
    """

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def run(self, **_kwargs) -> int:
        """Sync all companies. Returns count of newly inserted jobs."""
        # Phase 1: fetch all companies concurrently (network I/O only)
        sem = asyncio.Semaphore(_CONCURRENCY)
        async with httpx.AsyncClient(timeout=_TIMEOUT, follow_redirects=True) as client:
            fetch_tasks = [self._fetch(client, sem, source) for source in COMPANY_SOURCES]
            fetched = await asyncio.gather(*fetch_tasks)

        # Phase 2: write to DB sequentially (avoid shared-session race conditions)
        new_total = 0
        for source, raw_jobs in zip(COMPANY_SOURCES, fetched):
            try:
                new, closed = await self._sync_to_db(source, raw_jobs)
                if new or closed:
                    logger.info("%s — +%d new, -%d closed", source["name"], new, closed)
                new_total += new
            except Exception:
                logger.exception("DB sync failed for %s", source["name"])
                await self._session.rollback()

        removed = await self._enforce_job_limit()
        if removed:
            logger.info("Job cap enforced — removed %d oldest jobs", removed)

        return new_total

    # ------------------------------------------------------------------
    # Phase 1: network fetch
    # ------------------------------------------------------------------

    async def _fetch(
        self, client: httpx.AsyncClient, sem: asyncio.Semaphore, source: dict
    ) -> list[dict]:
        async with sem:
            return await fetch_company_jobs(client, source)

    # ------------------------------------------------------------------
    # Phase 2: DB sync (sequential)
    # ------------------------------------------------------------------

    async def _sync_to_db(self, source: dict, raw_jobs: list[dict]) -> tuple[int, int]:
        if not raw_jobs:
            return 0, 0

        slug = source["slug"]
        current_urls = {j["url"] for j in raw_jobs if j.get("url")}

        # All known jobs for this company (active or inactive)
        result = await self._session.execute(
            select(Job.id, Job.url, Job.is_active).where(Job.source_company == slug)
        )
        existing = {url: (job_id, active) for job_id, url, active in result}
        existing_urls = set(existing.keys())

        # Mark closed (active jobs no longer in ATS)
        closed_ids = [
            job_id for url, (job_id, active) in existing.items()
            if active and url not in current_urls
        ]
        if closed_ids:
            await self._session.execute(
                update(Job).where(Job.id.in_(closed_ids)).values(is_active=False)
            )

        # Re-activate jobs that reappeared
        reactivate_ids = [
            job_id for url, (job_id, active) in existing.items()
            if not active and url in current_urls
        ]
        if reactivate_ids:
            await self._session.execute(
                update(Job).where(Job.id.in_(reactivate_ids)).values(is_active=True)
            )

        # Insert new jobs — ON CONFLICT DO NOTHING guards against duplicates
        new_urls = current_urls - existing_urls
        new_count = 0
        for raw in raw_jobs:
            url = raw.get("url")
            if not url or url not in new_urls:
                continue
            stmt = pg_insert(Job).values(
                url=url,
                title=raw.get("title") or "Untitled",
                company=raw.get("company") or source["name"],
                source_company=slug,
                is_active=True,
                location_raw=raw.get("location_raw"),
                work_mode=raw.get("work_mode"),
                job_type=raw.get("job_type"),
                description=raw.get("description") or "",
                posted_at=raw.get("posted_at"),
                source=slug,
            ).on_conflict_do_nothing(index_elements=["url"])
            await self._session.execute(stmt)
            new_count += 1

        await self._session.commit()
        return new_count, len(closed_ids)

    # ------------------------------------------------------------------
    # 10k cap: delete oldest inactive jobs with no user feedback
    # ------------------------------------------------------------------

    async def _enforce_job_limit(self) -> int:
        count_result = await self._session.execute(
            select(func.count()).select_from(Job).where(Job.is_active.is_(True))
        )
        total = count_result.scalar() or 0

        if total <= _MAX_TOTAL_JOBS:
            return 0

        excess = total - _MAX_TOTAL_JOBS

        # Delete oldest active jobs that have no user feedback
        jobs_with_feedback = select(Feedback.job_id).distinct()
        subq = (
            select(Job.id)
            .where(Job.is_active.is_(True), Job.id.not_in(jobs_with_feedback))
            .order_by(Job.posted_at.asc().nulls_first(), Job.scraped_at.asc())
            .limit(excess)
            .subquery()
        )
        result = await self._session.execute(
            delete(Job).where(Job.id.in_(select(subq.c.id))).returning(Job.id)
        )
        deleted = len(result.fetchall())
        await self._session.commit()
        return deleted
