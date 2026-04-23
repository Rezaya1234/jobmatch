import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from agents.feedback_agent import FeedbackAgent
from agents.filter_agent import FilterAgent
from agents.match_agent import MatchAgent
from agents.search_agent import JobSearchAgent
from db.models import Job, JobMatch, User, UserProfile
from llm.client import LLMClient

logger = logging.getLogger(__name__)


_SCORE_LIMIT_PER_RUN = 50  # max jobs scored per user per pipeline run


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
      search → (per user) filter → match → email

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
        """Full daily run: collect jobs then match all users."""
        stats = await self.run_job_collection()
        await self.run_user_matching(stats)
        return stats

    async def run_job_collection(self) -> PipelineStats:
        """Fetch new jobs from all company ATS pages. No user context, no LLM."""
        stats = PipelineStats()
        await self._run_search(stats)
        logger.info("Job collection complete — %s new jobs", stats.new_jobs)
        return stats

    async def run_user_matching(self, stats: PipelineStats | None = None) -> PipelineStats:
        """Step 2: filter + score new jobs for every user with a profile."""
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
        await self._emit("Fetching jobs from 21 company career pages...")
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
        from db.models import UserProfile
        profile_result = await self._session.execute(
            select(UserProfile).where(UserProfile.user_id == user_id)
        )
        profile = profile_result.scalar_one_or_none()
        cadence = _email_cadence(
            getattr(profile, 'last_engaged_at', None),
            getattr(profile, 'last_emailed_at', None),
        )

        if cadence == 'skip':
            logger.info("User %s is inactive (cadence=skip) — skipping entirely", user_id)
            return

        # Filter is cheap (no LLM) — always run it so new jobs are tracked
        logger.info("User %s — filtering (cadence=%s)", user_id, cadence)
        await self._emit("Applying filters (work mode, location, job type, company)...")
        filter_agent = FilterAgent(self._session)
        filter_stats = await filter_agent.run(user_id)
        passed = filter_stats["passed"]
        stats.total_passed_filter += passed

        if cadence == 'reengagement':
            # User is dormant — send re-engagement email, skip LLM scoring
            logger.info("User %s — reengagement cadence, skipping MatchAgent", user_id)
            emailed = await self._send_email(user_id)
            stats.total_emailed += emailed
            return

        if passed == 0 and not await self._has_pending_matches(user_id):
            logger.info("User %s — no new jobs to score", user_id)
            return

        await self._emit(f"Scoring up to {_SCORE_LIMIT_PER_RUN} newest jobs with AI...")
        match_agent = MatchAgent(self._session, self._llm)
        scored = await match_agent.run(user_id)
        stats.total_scored += scored

        emailed = await self._send_email(user_id)
        stats.total_emailed += emailed

    async def _send_email(self, user_id: str) -> int:
        from mailer.sender import send_daily_digest
        return await send_daily_digest(user_id, self._session)

    # ------------------------------------------------------------------
    # On-demand matching (triggered by dashboard visit)
    # ------------------------------------------------------------------

    async def run_user_on_demand(self, user_id: str) -> int:
        """Filter + score for one user on dashboard visit. No email sent."""
        logger.info("On-demand matching for user %s", user_id)
        filter_agent = FilterAgent(self._session)
        await filter_agent.run(user_id)
        if not await self._has_pending_matches(user_id):
            logger.info("User %s — no pending matches to score on-demand", user_id)
            return 0
        match_agent = MatchAgent(self._session, self._llm)
        scored = await match_agent.run(user_id)
        logger.info("On-demand scoring complete for user %s — %d scored", user_id, scored)
        return scored

    # ------------------------------------------------------------------
    # On-demand feedback pipeline
    # ------------------------------------------------------------------

    async def run_feedback_pipeline(self, user_id: str) -> bool:
        """
        Process a user's feedback and update their soft preferences.
        Call this after a user submits thumbs up/down via the API.
        """
        logger.info("Running feedback pipeline for user %s", user_id)
        agent = FeedbackAgent(self._session, self._llm)
        updated = await agent.run(user_id)
        if updated:
            logger.info("Soft preferences updated for user %s", user_id)
        return updated

    # ------------------------------------------------------------------
    # DB helpers
    # ------------------------------------------------------------------

    async def _has_pending_matches(self, user_id: str) -> bool:
        result = await self._session.execute(
            select(func.count()).select_from(JobMatch)
            .join(Job, JobMatch.job_id == Job.id)
            .where(
                JobMatch.user_id == user_id,
                JobMatch.passed_hard_filter.is_(True),
                JobMatch.score.is_(None),
                Job.is_active.is_(True),
            )
        )
        return (result.scalar() or 0) > 0

    async def _get_users_with_profiles(self) -> list[User]:
        """Return only users who have a profile set up."""
        result = await self._session.execute(
            select(User).join(UserProfile, User.id == UserProfile.user_id)
        )
        return list(result.scalars().all())
