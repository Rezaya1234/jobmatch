"""
Orchestrator — coordinates the daily matching pipeline.

Pipeline per user:
  filter (hard constraints, no LLM)
    → heuristic scoring (no LLM, no API)
    → embedding scoring (local model)
    → LLM scoring (only if ≥3 candidates)
    → 3-job delivery selection with 6-step fallback
    → mark shown_at / delivered_at
    → send email

No job is ever shown twice (shown_at is permanent).
"""
import logging
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from datetime import date

from agents.alert_writer import maybe_insert_alert
from agents.feedback_agent import FeedbackAgent
from agents.filter_agent import FilterAgent
from agents.match_agent import MatchAgent, _COST_PER_BATCH_USD, _COST_PER_CALL2_USD
from agents.search_agent import JobSearchAgent
from db.models import Job, JobMatch, OrchestrationLog, User, UserProfile
from llm.client import LLMClient

logger = logging.getLogger(__name__)

_DELIVERY_TARGET = 3        # guaranteed daily delivery count
_MIN_CANDIDATES_FOR_LLM = 3  # skip LLM if fewer candidates pass filtering
_COST_ALERT_THRESHOLD_USD = 1.50  # per-run LLM cost that triggers a WARNING alert


@dataclass
class PipelineStats:
    new_jobs: int = 0
    users_processed: int = 0
    users_failed: int = 0
    total_passed_filter: int = 0
    total_scored: int = 0
    total_emailed: int = 0
    errors: list[str] = field(default_factory=list)

    def __str__(self) -> str:
        return (
            f"new_jobs={self.new_jobs} users={self.users_processed} "
            f"passed_filter={self.total_passed_filter} scored={self.total_scored} "
            f"emailed={self.total_emailed} failed={self.users_failed}"
        )


class OrchestratorAgent:
    """
    Coordinates the daily pipeline:
      search → (per user) filter → heuristic → embedding → match → deliver

    Feedback processing runs separately via run_feedback_pipeline(),
    triggered when a user submits feedback.
    """

    def __init__(
        self,
        session: AsyncSession,
        llm: LLMClient,
        on_step: Callable[[str], Awaitable[None]] | None = None,
    ) -> None:
        self._session = session
        self._llm = llm
        self._on_step = on_step

    async def _emit(self, msg: str) -> None:
        if self._on_step:
            await self._on_step(msg)

    # ------------------------------------------------------------------
    # Daily pipeline
    # ------------------------------------------------------------------

    async def run_daily_pipeline(self) -> PipelineStats:
        """Full daily run: collect jobs, match all users, then run evaluation."""
        stats = await self.run_job_collection()
        await self.run_user_matching(stats)
        await self.run_test_agent()

        # Alert: pipeline completed after 09:00 UTC (trigger 3)
        finish_time = datetime.now(timezone.utc)
        if finish_time.hour >= 9:
            await maybe_insert_alert(
                self._session,
                severity="CRITICAL",
                title="Daily pipeline completed after 09:00 UTC",
                description=(
                    f"Pipeline finished at {finish_time.strftime('%H:%M UTC')} — "
                    "expected to complete before 09:00 UTC."
                ),
                metric_name="pipeline_finish_hour_utc",
                metric_value=float(finish_time.hour) + finish_time.minute / 60.0,
                threshold_value=9.0,
                failure_type="infra",
            )

        return stats

    async def run_test_agent(self) -> None:
        """Compute daily pipeline evaluation metrics and write to TestAgentMetrics."""
        try:
            from agents.test_agent import TestAgent
            await TestAgent(self.session).run()
        except Exception:
            logger.exception("TestAgent run failed")

    async def run_job_collection(self) -> PipelineStats:
        """Fetch new jobs from all company ATS pages. No user context, no LLM."""
        stats = PipelineStats()
        await self._run_search(stats)
        logger.info("Job collection complete — %s new jobs", stats.new_jobs)
        return stats

    async def run_user_matching(self, stats: PipelineStats | None = None) -> PipelineStats:
        """Filter + score new jobs for every user with a profile."""
        if stats is None:
            stats = PipelineStats()
        users = await self._get_users_with_profiles()
        logger.info("Matching %d users against job pool", len(users))
        for user in users:
            user_id = str(user.id)
            try:
                await self._process_user(user_id, stats)
                stats.users_processed += 1
            except Exception:
                logger.exception("Matching failed for user %s", user_id)
                stats.users_failed += 1
                stats.errors.append(f"user:{user_id}")
        logger.info("User matching complete — %s", stats)
        return stats

    async def _run_search(self, stats: PipelineStats) -> None:
        logger.info("Fetching jobs from company career pages")
        await self._emit("Fetching jobs from company career pages...")
        try:
            agent = JobSearchAgent(self._session)
            stats.new_jobs = await agent.run()
            logger.info("Search complete — %d new jobs saved", stats.new_jobs)
            await self._emit(f"Found {stats.new_jobs} new jobs — filtering...")
        except Exception:
            logger.exception("Search agent failed — continuing with existing jobs")
            stats.errors.append("search_agent")

    async def _process_user(self, user_id: str, stats: PipelineStats) -> None:
        from mailer.sender import _email_cadence

        match_run_id = str(uuid.uuid4())
        run_date = date.today()
        llm_calls = 0
        llm_cost = 0.0

        profile = await self._get_profile(user_id)
        cadence = _email_cadence(
            getattr(profile, "last_engaged_at", None) if profile else None,
            getattr(profile, "last_emailed_at", None) if profile else None,
        )

        if cadence == "skip":
            logger.info("User %s is inactive (cadence=skip) — skipping entirely", user_id)
            return

        # Step 1: Hard filter (cheap, always run so new jobs are tracked)
        await self._emit("Applying filters (work mode, location, job type, company)...")
        filter_agent = FilterAgent(self._session)
        filter_stats = await filter_agent.run(user_id)
        passed = filter_stats["passed"]
        stats.total_passed_filter += passed

        if cadence == "reengagement":
            logger.info("User %s — reengagement cadence, skipping scoring", user_id)
            emailed = await self._send_email(user_id)
            stats.total_emailed += emailed
            return

        # Step 2: Soft constraints + heuristic + BGE embedding → top 10-15 candidates
        candidates = await filter_agent.get_candidates(user_id)

        # Step 3: LLM scoring — only if enough candidates and within daily cap
        pending = len(candidates)
        scored = 0
        calls_today = await self._llm_calls_today(user_id)
        if calls_today >= 2:
            logger.info("User %s — LLM cap reached (%d calls today), skipping LLM", user_id, calls_today)
        elif pending >= _MIN_CANDIDATES_FOR_LLM:
            await self._emit(f"Scoring top candidates with AI ({pending} candidates)...")
            match_agent = MatchAgent(self._session, self._llm)
            result = await match_agent.run(user_id, match_run_id=match_run_id)
            scored = result.scored
            stats.total_scored += scored
            if result.scored > 0:
                llm_calls += 1
                llm_cost += _COST_PER_BATCH_USD
            if result.call2_count > 0:
                llm_calls += 1
                llm_cost += result.call2_count * _COST_PER_CALL2_USD
        else:
            logger.info(
                "User %s — only %d LLM candidates (min %d), skipping LLM",
                user_id, pending, _MIN_CANDIDATES_FOR_LLM,
            )

        # Step 4: Select delivery jobs with 6-step fallback
        delivery_matches, fallback_step = await self._select_delivery_jobs(user_id)
        if delivery_matches:
            now = datetime.now(timezone.utc)
            jobs_by_id = await self._load_jobs([str(m.job_id) for m in delivery_matches])
            for match in delivery_matches:
                match.shown_at = now
                match.delivered_at = now
            from db.activity import log_event
            await log_event(
                self._session, user_id, "jobs_delivered",
                job_count=len(delivery_matches),
                match_run_id=match_run_id,
                jobs=[{
                    "job_id": str(m.job_id),
                    "title": jobs_by_id[str(m.job_id)].title if str(m.job_id) in jobs_by_id else "?",
                    "company": jobs_by_id[str(m.job_id)].company if str(m.job_id) in jobs_by_id else "?",
                    "score": m.score,
                    "heuristic_score": m.heuristic_score,
                    "dimension_scores": m.dimension_scores,
                } for m in delivery_matches],
            )
            await self._session.commit()
            logger.info("User %s — %d jobs marked for delivery", user_id, len(delivery_matches))

        # Write orchestration log
        uid = uuid.UUID(user_id) if isinstance(user_id, str) else user_id
        orch_log = OrchestrationLog(
            match_run_id=match_run_id,
            user_id=uid,
            run_date=run_date,
            jobs_evaluated=passed,
            jobs_delivered=len(delivery_matches),
            llm_calls_made=llm_calls,
            llm_cost_usd=round(llm_cost, 5),
            fallback_triggered=fallback_step > 0,
            fallback_steps_used=fallback_step,
        )
        self._session.add(orch_log)
        await self._session.commit()

        # Alert: LLM cost spike (trigger 1)
        if llm_cost > _COST_ALERT_THRESHOLD_USD:
            await maybe_insert_alert(
                self._session,
                severity="WARNING",
                title=f"High LLM cost — user {user_id[:8]}",
                description=(
                    f"Per-run LLM cost ${llm_cost:.3f} exceeded threshold "
                    f"${_COST_ALERT_THRESHOLD_USD:.2f} for user {user_id[:8]}."
                ),
                metric_name="llm_cost_usd",
                metric_value=round(llm_cost, 5),
                threshold_value=_COST_ALERT_THRESHOLD_USD,
                failure_type="model",
            )

        # Alert: delivery shortfall (trigger 2)
        if len(delivery_matches) < _DELIVERY_TARGET:
            await maybe_insert_alert(
                self._session,
                severity="WARNING",
                title=f"Delivery shortfall — user {user_id[:8]}",
                description=(
                    f"Only {len(delivery_matches)} of {_DELIVERY_TARGET} target jobs delivered "
                    f"after all fallback steps for user {user_id[:8]}."
                ),
                metric_name="jobs_delivered",
                metric_value=float(len(delivery_matches)),
                threshold_value=float(_DELIVERY_TARGET),
                failure_type="data",
            )

        # Step 5: Send email
        emailed = await self._send_email(user_id)
        stats.total_emailed += emailed

    # ------------------------------------------------------------------
    # 3-job delivery selection with 6-step fallback
    # ------------------------------------------------------------------

    async def _select_delivery_jobs(
        self, user_id: str, target: int = _DELIVERY_TARGET
    ) -> tuple[list[JobMatch], int]:
        """
        Return (matches, fallback_step) where fallback_step is 0 if primary
        delivery (score >= 0.70) was sufficient, or 1-6 for the highest step used.
        """
        uid = uuid.UUID(user_id) if isinstance(user_id, str) else user_id
        selected: list[JobMatch] = []
        selected_ids: list = []
        highest_step = 0

        async def _fetch(extra_wheres, order_clauses) -> list[JobMatch]:
            needed = target - len(selected)
            if needed <= 0:
                return []
            stmt = (
                select(JobMatch)
                .join(Job, JobMatch.job_id == Job.id)
                .where(
                    JobMatch.user_id == uid,
                    JobMatch.passed_hard_filter.is_(True),
                    JobMatch.shown_at.is_(None),
                    Job.is_active.is_(True),
                    *extra_wheres,
                )
                .order_by(*order_clauses)
                .limit(needed * 2)
            )
            if selected_ids:
                stmt = stmt.where(JobMatch.id.notin_(selected_ids))
            result = await self._session.execute(stmt)
            return list(result.scalars().all())

        def _absorb(rows: list[JobMatch], step: int) -> None:
            nonlocal highest_step
            for r in rows:
                if r.id not in selected_ids and len(selected) < target:
                    r.is_fallback = step > 0
                    selected.append(r)
                    selected_ids.append(r.id)
                    if step > highest_step:
                        highest_step = step

        # Steps 1-4: LLM-scored, progressive score thresholds (step 0 = primary)
        for step, threshold in enumerate((0.70, 0.50, 0.30, 0.0)):
            if len(selected) >= target:
                break
            rows = await _fetch(
                [JobMatch.score.isnot(None), JobMatch.score >= threshold],
                [JobMatch.score.desc()],
            )
            _absorb(rows, step)

        # Step 5: heuristic/embedding scored, no LLM score
        if len(selected) < target:
            rows = await _fetch(
                [JobMatch.score.is_(None), JobMatch.heuristic_score.isnot(None)],
                [
                    JobMatch.embedding_score.desc().nulls_last(),
                    JobMatch.heuristic_score.desc().nulls_last(),
                ],
            )
            _absorb(rows, 5)

        # Step 6: any hard-filter-passed job
        if len(selected) < target:
            rows = await _fetch([], [Job.posted_at.desc().nulls_last()])
            _absorb(rows, 6)

        logger.info(
            "User %s — delivery selection: %d/%d jobs (fallback_step=%d)",
            user_id, len(selected), target, highest_step,
        )
        return selected, highest_step

    # ------------------------------------------------------------------
    # On-demand matching (triggered by dashboard visit)
    # ------------------------------------------------------------------

    async def run_user_on_demand(self, user_id: str) -> int:
        """Filter + score for one user on dashboard visit. No email sent."""
        logger.info("On-demand matching for user %s", user_id)

        calls_today = await self._llm_calls_today(user_id)
        if calls_today >= 2:
            logger.info("User %s — LLM cap reached on-demand (%d calls today), skipping", user_id, calls_today)
            return 0

        filter_agent = FilterAgent(self._session)
        await filter_agent.run(user_id)
        candidates = await filter_agent.get_candidates(user_id)

        if len(candidates) < _MIN_CANDIDATES_FOR_LLM:
            logger.info(
                "User %s — only %d candidates on-demand, skipping LLM", user_id, len(candidates)
            )
            return 0

        match_agent = MatchAgent(self._session, self._llm)
        result = await match_agent.run(user_id)
        logger.info("On-demand scoring complete for user %s — %d scored", user_id, result.scored)
        return result.scored

    # ------------------------------------------------------------------
    # On-demand feedback pipeline
    # ------------------------------------------------------------------

    async def run_feedback_pipeline(self, user_id: str, signal_type: str | None = None) -> bool:
        """
        Process a user's feedback and update their soft preferences.
        Call this after a user submits thumbs up/down or a high-value signal.
        signal_type: 'applied' or 'interview' triggers immediate weight update.
        """
        logger.info("Running feedback pipeline for user %s (signal=%s)", user_id, signal_type)
        agent = FeedbackAgent(self._session, self._llm)
        updated = await agent.run(user_id, signal_type=signal_type)
        if updated:
            logger.info("Weights/preferences updated for user %s", user_id)
        return updated

    # ------------------------------------------------------------------
    # Email
    # ------------------------------------------------------------------

    async def _send_email(self, user_id: str) -> int:
        from mailer.sender import send_daily_digest
        return await send_daily_digest(user_id, self._session)

    # ------------------------------------------------------------------
    # DB helpers
    # ------------------------------------------------------------------

    async def _llm_calls_today(self, user_id: str) -> int:
        """Return total llm_calls_made recorded for this user today."""
        from sqlalchemy import func as sqlfunc
        uid = uuid.UUID(user_id) if isinstance(user_id, str) else user_id
        result = await self._session.execute(
            select(sqlfunc.coalesce(sqlfunc.sum(OrchestrationLog.llm_calls_made), 0))
            .where(
                OrchestrationLog.user_id == uid,
                OrchestrationLog.run_date == date.today(),
            )
        )
        return int(result.scalar() or 0)

    async def _load_jobs(self, job_ids: list[str]) -> dict[str, Job]:
        if not job_ids:
            return {}
        result = await self._session.execute(select(Job).where(Job.id.in_(job_ids)))
        return {str(j.id): j for j in result.scalars().all()}

    async def _get_profile(self, user_id: str) -> UserProfile | None:
        uid = uuid.UUID(user_id) if isinstance(user_id, str) else user_id
        result = await self._session.execute(
            select(UserProfile).where(UserProfile.user_id == uid)
        )
        return result.scalar_one_or_none()

    async def _get_users_with_profiles(self) -> list[User]:
        result = await self._session.execute(
            select(User).join(UserProfile, User.id == UserProfile.user_id)
        )
        return list(result.scalars().all())
