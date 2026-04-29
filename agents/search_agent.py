import asyncio
import hashlib
import logging
import uuid
from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy import delete, func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from agents.alert_writer import maybe_insert_alert
from agents.ats_fetchers import fetch_company_jobs
from agents.company_sources import COMPANY_SOURCES
from agents.embeddings import embed_single
from db.models import (
    CompanyHiringSnapshot,
    Feedback,
    Job,
    JobDescriptionHistory,
    SourceTrustScore,
)

logger = logging.getLogger(__name__)

_MAX_TOTAL_JOBS = 10_000
_CONCURRENCY = 5
_TIMEOUT = 20
_HEALTH_CHECK_LIMIT = 50    # max job URLs to HEAD-check per run
_TRUST_SKIP = 0.50          # skip source entirely below this
_TRUST_WARN = 0.70          # log warning below this
_DECAY = 0.85               # exponential decay for rolling counts (~7 days half-life)

# Phase C — title keyword classifiers
_SENIORITY_MAP: dict[str, list[str]] = {
    "intern":     ["intern", "internship"],
    "junior":     ["junior", "jr", "entry", "entry-level", "associate"],
    "mid":        ["mid", "intermediate"],
    "senior":     ["senior", "sr", "lead"],
    "staff":      ["staff"],
    "principal":  ["principal", "distinguished", "fellow"],
    "manager":    ["manager"],
    "director":   ["director"],
    "executive":  ["vp", "vice president", "head of", "chief", "cto", "ceo", "coo", "cpo"],
}

_DEPARTMENT_MAP: dict[str, list[str]] = {
    "engineering": ["engineer", "developer", "software", "backend", "frontend", "fullstack",
                    "devops", "sre", "platform", "infrastructure", "security"],
    "data_ml":     ["data", "machine learning", "ml", "ai", "analytics", "scientist", "analyst"],
    "product":     ["product manager", "product", " pm "],
    "design":      ["design", "designer", "ux", "ui"],
    "marketing":   ["marketing", "growth", "content", "brand", "demand"],
    "sales":       ["sales", "account executive", "business development"],
    "operations":  ["operations", "ops", "supply chain", "logistics"],
    "finance":     ["finance", "accounting", "financial"],
    "hr":          ["hr", "human resources", "recruiting", "talent", "people"],
    "legal":       ["legal", "counsel", "compliance"],
}


def _compute_trust(success: float, fail: float, dead: float, returned: int) -> float:
    total = success + fail
    parse_pct = success / total if total > 0 else 1.0
    dead_pct = dead / returned if returned > 0 else 0.0
    returned_ok = 1.0 if returned > 0 else 0.5
    return round(parse_pct * 0.5 + (1.0 - min(dead_pct, 1.0)) * 0.3 + returned_ok * 0.2, 4)


def _classify_titles(titles: list[str], keyword_map: dict[str, list[str]]) -> dict[str, int]:
    """Classify job titles into categories using keyword matching. First match wins."""
    counts: dict[str, int] = {}
    for title in titles:
        lower = title.lower()
        matched = False
        for category, keywords in keyword_map.items():
            if any(kw in lower for kw in keywords):
                counts[category] = counts.get(category, 0) + 1
                matched = True
                break
        if not matched:
            counts["other"] = counts.get("other", 0) + 1
    return counts


def _md5(text: str) -> str:
    return hashlib.md5(text.encode("utf-8", errors="replace")).hexdigest()


class JobSearchAgent:
    """
    Fetches all open positions directly from company career pages via ATS APIs.
    On each run: inserts new jobs, marks closed ones inactive, enforces 10k cap.
    Phase A: tracks per-source trust scores and health-checks recently scraped URLs.
    Phase C: saves daily company hiring snapshots and versions job descriptions.
    """

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def run(self, **_kwargs) -> int:
        """Sync all companies. Returns count of newly inserted jobs."""
        # Load existing trust scores — used to skip low-trust sources
        trust_map = await self._load_trust_scores()

        # Determine which sources to fetch this run
        sources_to_fetch = []
        for source in COMPANY_SOURCES:
            slug = source["slug"]
            score = trust_map.get(slug, {}).get("score", 1.0)
            if score < _TRUST_SKIP:
                logger.warning(
                    "Skipping %s — trust score %.2f below skip threshold %.2f",
                    source["name"], score, _TRUST_SKIP,
                )
            else:
                sources_to_fetch.append(source)

        # Phase 1: fetch all sources concurrently (network I/O only)
        sem = asyncio.Semaphore(_CONCURRENCY)
        async with httpx.AsyncClient(timeout=_TIMEOUT, follow_redirects=True) as client:
            fetch_tasks = [self._fetch(client, sem, s) for s in sources_to_fetch]
            results = await asyncio.gather(*fetch_tasks)

        # Phase 2: write to DB sequentially, collect per-source stats
        new_total = 0
        fetch_stats: dict[str, dict] = {}
        all_raw_jobs: dict[str, list[dict]] = {}  # slug → raw jobs (Phase C)

        for source, (raw_jobs, fetch_ok) in zip(sources_to_fetch, results):
            slug = source["slug"]
            fetch_stats[slug] = {"returned": len(raw_jobs), "ok": fetch_ok, "new": 0, "closed": 0}
            all_raw_jobs[slug] = raw_jobs
            if not raw_jobs:
                continue
            try:
                new, closed = await self._sync_to_db(source, raw_jobs)
                fetch_stats[slug]["new"] = new
                fetch_stats[slug]["closed"] = closed
                if new or closed:
                    logger.info("%s — +%d new, -%d closed", source["name"], new, closed)
                new_total += new
            except Exception:
                logger.exception("DB sync failed for %s", source["name"])
                await self._session.rollback()

        # Phase 3: update trust scores (decay old counts + add today's result)
        await self._update_trust_scores(fetch_stats, trust_map)

        # Phase 4: HEAD-check a sample of recently scraped active jobs
        dead_by_source = await self._health_check_sample()
        if dead_by_source:
            await self._record_dead_links(dead_by_source)

        # Phase 5: enforce 10k job cap
        removed = await self._enforce_job_limit()
        if removed:
            logger.info("Job cap enforced — removed %d oldest jobs", removed)

        # Phase C-A: save one hiring snapshot row per company per day
        await self._save_company_snapshots(sources_to_fetch, fetch_stats)

        # Phase C-B: version job descriptions — write history only when content changes
        await self._check_description_changes(sources_to_fetch, all_raw_jobs)

        # Alert: any reachable source returned zero jobs (trigger 4)
        for slug, stats in fetch_stats.items():
            if stats["ok"] and stats["returned"] == 0:
                source_name = next(
                    (s["name"] for s in sources_to_fetch if s["slug"] == slug), slug
                )
                await maybe_insert_alert(
                    self._session,
                    severity="WARNING",
                    title=f"Source returned zero jobs: {source_name}",
                    description=(
                        f"{source_name} ({slug}) was reachable but returned no job listings."
                    ),
                    metric_name="jobs_returned",
                    metric_value=0.0,
                    threshold_value=1.0,
                    failure_type="data",
                )

        return new_total

    # ------------------------------------------------------------------
    # Phase 1: network fetch
    # ------------------------------------------------------------------

    async def _fetch(
        self, client: httpx.AsyncClient, sem: asyncio.Semaphore, source: dict
    ) -> tuple[list[dict], bool]:
        async with sem:
            try:
                jobs = await fetch_company_jobs(client, source)
                return jobs, True
            except Exception:
                logger.exception("Fetch failed for %s", source["name"])
                return [], False

    # ------------------------------------------------------------------
    # Phase 2: DB sync (sequential)
    # ------------------------------------------------------------------

    async def _sync_to_db(self, source: dict, raw_jobs: list[dict]) -> tuple[int, int]:
        if not raw_jobs:
            return 0, 0

        slug = source["slug"]
        current_urls = {j["url"] for j in raw_jobs if j.get("url")}

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

        # Insert new jobs
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
                sector=source.get("sector"),
            ).on_conflict_do_nothing(index_elements=["url"])
            await self._session.execute(stmt)
            new_count += 1

        await self._session.commit()

        if new_urls:
            await self._embed_new_jobs(new_urls)

        return new_count, len(closed_ids)

    async def _embed_new_jobs(self, new_urls: set[str]) -> None:
        """Embed newly inserted jobs and store the vector. Skips any that already have one."""
        result = await self._session.execute(
            select(Job.id, Job.title, Job.description)
            .where(Job.url.in_(new_urls), Job.embedding_vector.is_(None))
        )
        jobs = result.all()
        if not jobs:
            return

        embedded = 0
        for job_id, title, description in jobs:
            text = f"{title}. {(description or '')[:500]}"
            vector = await embed_single(text)
            if vector is not None:
                await self._session.execute(
                    update(Job).where(Job.id == job_id).values(embedding_vector=vector)
                )
                embedded += 1

        if embedded:
            await self._session.commit()
            logger.info("Embedded %d new jobs", embedded)

    # ------------------------------------------------------------------
    # Phase 3: trust score tracking
    # ------------------------------------------------------------------

    async def _load_trust_scores(self) -> dict:
        result = await self._session.execute(select(SourceTrustScore))
        return {
            row.source_slug: {
                "score": row.rolling_trust_score,
                "success": row.parse_success_count,
                "fail": row.parse_fail_count,
                "dead": row.dead_link_count,
                "returned_prev": row.jobs_returned_last,
            }
            for row in result.scalars().all()
        }

    async def _update_trust_scores(
        self, fetch_stats: dict[str, dict], existing: dict
    ) -> None:
        now = datetime.now(timezone.utc)
        for slug, stats in fetch_stats.items():
            prev = existing.get(slug, {})
            # Exponential decay on rolling counts — weights recent runs more
            new_success = prev.get("success", 0.0) * _DECAY + (1.0 if stats["ok"] else 0.0)
            new_fail = prev.get("fail", 0.0) * _DECAY + (0.0 if stats["ok"] else 1.0)
            new_dead = prev.get("dead", 0.0) * _DECAY  # updated separately after health check
            new_score = _compute_trust(new_success, new_fail, new_dead, stats["returned"])

            if new_score < _TRUST_WARN:
                logger.warning("Low trust score for %s: %.2f", slug, new_score)

            stmt = pg_insert(SourceTrustScore).values(
                id=uuid.uuid4(),
                source_slug=slug,
                jobs_returned_last=stats["returned"],
                jobs_returned_prev=prev.get("returned_prev", 0),
                parse_success_count=new_success,
                parse_fail_count=new_fail,
                dead_link_count=new_dead,
                rolling_trust_score=new_score,
                last_scrape_at=now,
            ).on_conflict_do_update(
                index_elements=["source_slug"],
                set_={
                    "jobs_returned_prev": SourceTrustScore.jobs_returned_last,
                    "jobs_returned_last": stats["returned"],
                    "parse_success_count": new_success,
                    "parse_fail_count": new_fail,
                    "dead_link_count": new_dead,
                    "rolling_trust_score": new_score,
                    "last_scrape_at": now,
                },
            )
            await self._session.execute(stmt)

        await self._session.commit()

    # ------------------------------------------------------------------
    # Phase 4: URL health check
    # ------------------------------------------------------------------

    async def _health_check_sample(self) -> dict[str, int]:
        """HEAD-check recently scraped active jobs. Returns dead count per source slug."""
        cutoff = datetime.now(timezone.utc) - timedelta(hours=48)
        result = await self._session.execute(
            select(Job.id, Job.url, Job.source_company)
            .where(Job.is_active.is_(True), Job.scraped_at >= cutoff)
            .order_by(Job.scraped_at.desc())
            .limit(_HEALTH_CHECK_LIMIT)
        )
        jobs = result.all()
        if not jobs:
            return {}

        dead_ids: list = []
        dead_by_source: dict[str, int] = {}
        sem = asyncio.Semaphore(10)

        async def check(job_id, url, slug):
            async with sem:
                try:
                    async with httpx.AsyncClient(timeout=10, follow_redirects=True) as c:
                        r = await c.head(url)
                    if r.status_code in (404, 410):
                        dead_ids.append(job_id)
                        dead_by_source[slug] = dead_by_source.get(slug, 0) + 1
                except Exception:
                    pass  # network error — don't penalise

        await asyncio.gather(*[check(j.id, j.url, j.source_company) for j in jobs])

        if dead_ids:
            await self._session.execute(
                update(Job).where(Job.id.in_(dead_ids)).values(is_active=False)
            )
            await self._session.commit()
            logger.info("Health check — marked %d dead links inactive", len(dead_ids))

        return dead_by_source

    async def _record_dead_links(self, dead_by_source: dict[str, int]) -> None:
        for slug, count in dead_by_source.items():
            await self._session.execute(
                update(SourceTrustScore)
                .where(SourceTrustScore.source_slug == slug)
                .values(dead_link_count=SourceTrustScore.dead_link_count + count)
            )
        await self._session.commit()

    # ------------------------------------------------------------------
    # Phase 5: 10k cap — delete oldest inactive jobs with no user feedback
    # ------------------------------------------------------------------

    async def _enforce_job_limit(self) -> int:
        count_result = await self._session.execute(
            select(func.count()).select_from(Job).where(Job.is_active.is_(True))
        )
        total = count_result.scalar() or 0
        if total <= _MAX_TOTAL_JOBS:
            return 0

        excess = total - _MAX_TOTAL_JOBS
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

    # ------------------------------------------------------------------
    # Phase C-A: company hiring snapshots
    # ------------------------------------------------------------------

    async def _save_company_snapshots(
        self, sources: list[dict], fetch_stats: dict[str, dict]
    ) -> None:
        """Upsert one CompanyHiringSnapshot row per source per day."""
        today = datetime.now(timezone.utc).date()
        today_start = datetime.now(timezone.utc).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        saved = 0

        for source in sources:
            slug = source["slug"]
            stats = fetch_stats.get(slug, {})

            # Total active jobs for this source
            count_res = await self._session.execute(
                select(func.count()).select_from(Job)
                .where(Job.source_company == slug, Job.is_active.is_(True))
            )
            active_count = count_res.scalar() or 0

            # New jobs first seen today
            new_res = await self._session.execute(
                select(func.count()).select_from(Job)
                .where(
                    Job.source_company == slug,
                    Job.is_active.is_(True),
                    Job.scraped_at >= today_start,
                )
            )
            new_today = new_res.scalar() or 0

            # Breakdown by work_mode (remote/hybrid/onsite)
            loc_res = await self._session.execute(
                select(Job.work_mode, func.count().label("cnt"))
                .where(Job.source_company == slug, Job.is_active.is_(True))
                .group_by(Job.work_mode)
            )
            jobs_by_location = {(row.work_mode or "unknown"): row.cnt for row in loc_res}

            # Breakdowns by seniority and department from title keywords
            title_res = await self._session.execute(
                select(Job.title)
                .where(Job.source_company == slug, Job.is_active.is_(True))
            )
            titles = [row.title for row in title_res]
            jobs_by_seniority = _classify_titles(titles, _SENIORITY_MAP)
            jobs_by_department = _classify_titles(titles, _DEPARTMENT_MAP)

            stmt = pg_insert(CompanyHiringSnapshot).values(
                id=uuid.uuid4(),
                source_slug=slug,
                snapshot_date=today,
                active_job_count=active_count,
                new_jobs_since_yesterday=new_today,
                removed_jobs_since_yesterday=stats.get("closed", 0),
                jobs_by_department=jobs_by_department,
                jobs_by_seniority=jobs_by_seniority,
                jobs_by_location=jobs_by_location,
            ).on_conflict_do_update(
                index_elements=["source_slug", "snapshot_date"],
                set_={
                    "active_job_count": active_count,
                    "new_jobs_since_yesterday": new_today,
                    "removed_jobs_since_yesterday": stats.get("closed", 0),
                    "jobs_by_department": jobs_by_department,
                    "jobs_by_seniority": jobs_by_seniority,
                    "jobs_by_location": jobs_by_location,
                },
            )
            await self._session.execute(stmt)
            saved += 1

        await self._session.commit()
        logger.info("Phase C — company snapshots saved for %d sources", saved)

    # ------------------------------------------------------------------
    # Phase C-B: description versioning
    # ------------------------------------------------------------------

    async def _check_description_changes(
        self, sources: list[dict], all_raw_jobs: dict[str, list[dict]]
    ) -> None:
        """
        For every scraped job, compare MD5 hash of description to stored hash.
        New hash → close old JobDescriptionHistory row, insert new, increment version.
        Same hash → no-op.
        Null hash (first time) → set initial hash, create first history row.
        """
        now = datetime.now(timezone.utc)
        changes = 0

        for source in sources:
            slug = source["slug"]
            raw_jobs = all_raw_jobs.get(slug, [])
            if not raw_jobs:
                continue

            url_to_desc: dict[str, str] = {
                j["url"]: (j.get("description") or "")
                for j in raw_jobs if j.get("url")
            }
            if not url_to_desc:
                continue

            # Load matching Job rows in one query
            result = await self._session.execute(
                select(Job.id, Job.url, Job.description_hash, Job.description_version)
                .where(
                    Job.source_company == slug,
                    Job.url.in_(list(url_to_desc.keys())),
                )
            )
            rows = result.all()

            for job_id, url, stored_hash, stored_version in rows:
                desc = url_to_desc.get(url, "")
                new_hash = _md5(desc)

                if stored_hash is None:
                    # First time — set initial hash and create history record
                    await self._session.execute(
                        update(Job).where(Job.id == job_id).values(
                            description_hash=new_hash,
                            description_version=1,
                            description_last_changed_at=now,
                        )
                    )
                    await self._session.execute(
                        pg_insert(JobDescriptionHistory).values(
                            id=uuid.uuid4(),
                            job_id=job_id,
                            description_text=desc,
                            description_hash=new_hash,
                            version_number=1,
                            valid_from=now,
                            valid_to=None,
                        ).on_conflict_do_nothing()
                    )
                    changes += 1

                elif new_hash != stored_hash:
                    # Description changed — close current history row, open new one
                    new_version = (stored_version or 1) + 1
                    await self._session.execute(
                        update(JobDescriptionHistory)
                        .where(
                            JobDescriptionHistory.job_id == job_id,
                            JobDescriptionHistory.valid_to.is_(None),
                        )
                        .values(valid_to=now)
                    )
                    await self._session.execute(
                        pg_insert(JobDescriptionHistory).values(
                            id=uuid.uuid4(),
                            job_id=job_id,
                            description_text=desc,
                            description_hash=new_hash,
                            version_number=new_version,
                            valid_from=now,
                            valid_to=None,
                        ).on_conflict_do_nothing()
                    )
                    await self._session.execute(
                        update(Job).where(Job.id == job_id).values(
                            description_hash=new_hash,
                            description_version=new_version,
                            description_last_changed_at=now,
                        )
                    )
                    changes += 1
                # Same hash — no action needed

        if changes:
            await self._session.commit()
        logger.info("Phase C — description versioning: %d jobs updated", changes)
