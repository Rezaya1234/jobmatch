import logging
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from agents.orchestrator import OrchestratorAgent
from api.deps import get_llm, get_session
from db.database import AsyncSessionLocal
from llm.client import LLMClient

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/pipeline", tags=["pipeline"])


# ------------------------------------------------------------------
# In-memory pipeline state (single-process, good enough for local use)
# ------------------------------------------------------------------

class _State:
    status: str = "idle"          # idle | running | complete | error
    step: str = ""
    new_jobs: int = 0
    passed_filter: int = 0
    scored: int = 0
    error: str = ""
    started_at: str = ""
    finished_at: str = ""
    filter_warning: str = ""

_state = _State()


# ------------------------------------------------------------------
# Schemas
# ------------------------------------------------------------------

class PipelineResponse(BaseModel):
    status: str
    detail: str

class TestEmailRequest(BaseModel):
    email: str

class TestEmailResponse(BaseModel):
    status: str
    to: str | None = None
    error: str | None = None

class PipelineStatusResponse(BaseModel):
    status: str
    step: str
    new_jobs: int
    passed_filter: int
    scored: int
    error: str
    started_at: str
    finished_at: str
    filter_warning: str

class StepResult(BaseModel):
    status: str
    detail: str
    count: int = 0


# ------------------------------------------------------------------
# Routes
# ------------------------------------------------------------------

@router.get("/status", response_model=PipelineStatusResponse)
async def get_pipeline_status() -> PipelineStatusResponse:
    return PipelineStatusResponse(
        status=_state.status,
        step=_state.step,
        new_jobs=_state.new_jobs,
        passed_filter=_state.passed_filter,
        scored=_state.scored,
        error=_state.error,
        started_at=_state.started_at,
        finished_at=_state.finished_at,
        filter_warning=_state.filter_warning,
    )


@router.post("/collect", response_model=PipelineResponse, status_code=202)
async def trigger_collect(
    background_tasks: BackgroundTasks,
    llm: LLMClient = Depends(get_llm),
) -> PipelineResponse:
    """Fetch new jobs from all boards — no user context, no LLM cost."""
    if _state.status == "running":
        return PipelineResponse(status="already_running", detail="Pipeline is already running.")
    background_tasks.add_task(_run_collect, llm)
    return PipelineResponse(status="accepted", detail="Job collection started.")


@router.post("/match-all", response_model=PipelineResponse, status_code=202)
async def trigger_match_all(
    background_tasks: BackgroundTasks,
    llm: LLMClient = Depends(get_llm),
) -> PipelineResponse:
    """Filter + score all users against the current job pool."""
    if _state.status == "running":
        return PipelineResponse(status="already_running", detail="Pipeline is already running.")
    background_tasks.add_task(_run_match_all, llm)
    return PipelineResponse(status="accepted", detail="User matching started.")


@router.post("/daily", response_model=PipelineResponse, status_code=202)
async def trigger_daily_pipeline(
    background_tasks: BackgroundTasks,
    llm: LLMClient = Depends(get_llm),
) -> PipelineResponse:
    if _state.status == "running":
        return PipelineResponse(status="already_running", detail="Pipeline is already running.")
    background_tasks.add_task(_run_daily_pipeline, llm)
    return PipelineResponse(status="accepted", detail="Daily pipeline started in the background.")


@router.post("/reset-filters/{user_id}", response_model=PipelineResponse, status_code=202)
async def trigger_reset_filters(
    user_id: str,
    background_tasks: BackgroundTasks,
    llm: LLMClient = Depends(get_llm),
    session: AsyncSession = Depends(get_session),
) -> PipelineResponse:
    """Delete all job_match rows for a user so the next pipeline run re-filters everything fresh."""
    if _state.status == "running":
        return PipelineResponse(status="already_running", detail="Pipeline is already running.")
    import uuid as _uuid
    from sqlalchemy import delete, func, select
    from db.models import JobMatch
    try:
        uid = _uuid.UUID(user_id)
    except ValueError:
        return PipelineResponse(status="error", detail=f"Invalid user_id: {user_id}")
    before = await session.scalar(
        select(func.count()).select_from(JobMatch).where(JobMatch.user_id == uid)
    )
    await session.execute(delete(JobMatch).where(JobMatch.user_id == uid))
    await session.commit()
    logger.info("Reset filters for user %s — deleted %d job_match rows", user_id, before or 0)
    background_tasks.add_task(_run_match_all, llm)
    return PipelineResponse(status="accepted", detail=f"Filters reset ({before or 0} matches cleared) — re-running pipeline.")


@router.post("/rescore/{user_id}", response_model=PipelineResponse, status_code=202)
async def trigger_rescore(
    user_id: str,
    background_tasks: BackgroundTasks,
    llm: LLMClient = Depends(get_llm),
    session: AsyncSession = Depends(get_session),
) -> PipelineResponse:
    """Reset all match scores for a user and re-score from scratch using their current profile."""
    from sqlalchemy import update
    from db.models import JobMatch
    await session.execute(
        update(JobMatch)
        .where(JobMatch.user_id == user_id)
        .values(score=None, reasoning=None)
    )
    await session.commit()
    background_tasks.add_task(_run_rescore, user_id, llm)
    return PipelineResponse(status="accepted", detail="Re-scoring started.")


@router.post("/test-email", response_model=TestEmailResponse, status_code=200)
async def send_test_email(body: TestEmailRequest) -> TestEmailResponse:
    """Send a plain test email to verify SendGrid is configured. No auth required."""
    import asyncio
    from mailer.sender import _send_via_sendgrid
    subject = "Stellapath - test email"
    plain = (
        "If you receive this email, SendGrid is configured correctly "
        "and Stellapath email delivery is working."
    )
    html = f"<p>{plain}</p>"
    try:
        await asyncio.to_thread(_send_via_sendgrid, body.email, subject, html, plain)
        return TestEmailResponse(status="sent", to=body.email)
    except Exception as exc:
        return TestEmailResponse(status="failed", error=str(exc))


@router.post("/test-email/{user_id}", response_model=PipelineResponse, status_code=200)
async def trigger_test_email(
    user_id: str,
    session: AsyncSession = Depends(get_session),
) -> PipelineResponse:
    """Send a test email — digest if matches exist, confirmation email if not."""
    import asyncio
    from sqlalchemy import select
    from db.models import User
    from mailer.sender import send_daily_digest, _send_via_sendgrid, FROM_EMAIL, FROM_NAME

    sent = await send_daily_digest(user_id, session, test=True)
    if sent:
        return PipelineResponse(status="sent", detail="Test digest email sent!")

    # No matches yet — send a simple delivery confirmation instead
    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        return PipelineResponse(status="error", detail="User not found.")

    subject = "Stellapath — email delivery test"
    plain = (
        "Your Stellapath email delivery is working correctly. "
        "You will receive your first job matches after completing "
        "your profile and our next pipeline run."
    )
    html = f"<p>{plain}</p>"
    try:
        await asyncio.to_thread(_send_via_sendgrid, user.email, subject, html, plain)
        return PipelineResponse(status="sent", detail=f"Confirmation email sent to {user.email}.")
    except Exception as exc:
        return PipelineResponse(status="error", detail=str(exc))


@router.post("/company-insights", response_model=PipelineResponse, status_code=202)
async def trigger_company_insights(
    background_tasks: BackgroundTasks,
    llm: LLMClient = Depends(get_llm),
) -> PipelineResponse:
    """Generate/refresh company insights for all qualifying companies."""
    background_tasks.add_task(_run_company_insights, llm)
    return PipelineResponse(status="accepted", detail="Company insights generation started.")


@router.post("/backfill-logos", response_model=PipelineResponse, status_code=200)
async def backfill_logos(
    session: AsyncSession = Depends(get_session),
) -> PipelineResponse:
    """Set website on existing company_insights rows from the known domain list."""
    from agents.company_sources import COMPANY_DOMAIN
    from db.models import CompanyInsight
    from sqlalchemy import select
    result = await session.execute(select(CompanyInsight))
    rows = result.scalars().all()
    updated = 0
    for row in rows:
        domain = COMPANY_DOMAIN.get(row.company_name)
        if domain and not row.website:
            row.website = f'https://{domain}'
            updated += 1
    await session.commit()
    return PipelineResponse(status="ok", detail=f"Backfilled {updated} company logo domains.")


@router.post("/match/{user_id}", response_model=PipelineResponse, status_code=202)
async def trigger_on_demand_match(
    user_id: str,
    background_tasks: BackgroundTasks,
    llm: LLMClient = Depends(get_llm),
) -> PipelineResponse:
    """Run filter + score for a single user on-demand. Safe to call on profile completion."""
    background_tasks.add_task(_run_on_demand_match, user_id, llm)
    return PipelineResponse(status="accepted", detail=f"On-demand matching started for user {user_id}.")


@router.post("/feedback/{user_id}", response_model=PipelineResponse, status_code=202)
async def trigger_feedback_pipeline(
    user_id: str,
    background_tasks: BackgroundTasks,
    llm: LLMClient = Depends(get_llm),
) -> PipelineResponse:
    background_tasks.add_task(_run_feedback_pipeline, user_id, llm)
    return PipelineResponse(status="accepted", detail=f"Feedback pipeline started for user {user_id}.")


# ------------------------------------------------------------------
# Step-by-step testing endpoints (synchronous — return result directly)
# ------------------------------------------------------------------

@router.post("/step/reset/{user_id}", response_model=StepResult, status_code=200)
async def trigger_step_reset(
    user_id: str,
    session: AsyncSession = Depends(get_session),
) -> StepResult:
    """Clear all job_match rows for a user — no background tasks triggered."""
    import uuid as _uuid
    from sqlalchemy import delete, func, select
    from db.models import JobMatch
    try:
        uid = _uuid.UUID(user_id)
    except ValueError:
        return StepResult(status="error", detail=f"Invalid user_id: {user_id}")
    before = await session.scalar(
        select(func.count()).select_from(JobMatch).where(JobMatch.user_id == uid)
    )
    await session.execute(delete(JobMatch).where(JobMatch.user_id == uid))
    await session.commit()
    return StepResult(status="done", detail=f"{before or 0} match rows cleared", count=int(before or 0))


@router.post("/step/filter/{user_id}", response_model=StepResult, status_code=200)
async def trigger_step_filter(
    user_id: str,
    session: AsyncSession = Depends(get_session),
) -> StepResult:
    """Step 2: Hard constraint filtering for a single user."""
    import uuid as _uuid
    from sqlalchemy import func, select
    from db.models import Job, JobMatch, UserProfile
    from agents.filter_agent import FilterAgent

    # Diagnose before running
    try:
        uid = _uuid.UUID(user_id)
    except ValueError:
        return StepResult(status="error", detail=f"Invalid user_id: {user_id}")

    profile = await session.scalar(
        select(func.count()).select_from(UserProfile).where(UserProfile.user_id == uid)
    )
    if not profile:
        return StepResult(status="error", detail="No profile found for this user — complete your profile first")

    active_jobs = await session.scalar(
        select(func.count()).select_from(Job).where(Job.is_active.is_(True))
    )
    already_matched = await session.scalar(
        select(func.count()).select_from(JobMatch).where(JobMatch.user_id == uid)
    )

    try:
        result = await FilterAgent(session).run(user_id)
        return StepResult(
            status="done",
            detail=f"{result['passed']} passed, {result['failed']} failed (active jobs: {active_jobs}, already matched: {already_matched})",
            count=result["passed"],
        )
    except Exception as exc:
        return StepResult(status="error", detail=str(exc))


@router.post("/step/candidates/{user_id}", response_model=StepResult, status_code=200)
async def trigger_step_candidates(
    user_id: str,
    session: AsyncSession = Depends(get_session),
) -> StepResult:
    """Step 3: Count hard-passed unseen jobs available for scoring."""
    import uuid as _uuid
    from sqlalchemy import func, select
    from db.models import Job, JobMatch
    try:
        uid = _uuid.UUID(user_id)
    except ValueError:
        return StepResult(status="error", detail=f"Invalid user_id: {user_id}")
    try:
        count = await session.scalar(
            select(func.count())
            .select_from(JobMatch)
            .join(Job, JobMatch.job_id == Job.id)
            .where(
                JobMatch.user_id == uid,
                JobMatch.passed_hard_filter.is_(True),
                JobMatch.shown_at.is_(None),
                Job.is_active.is_(True),
            )
        )
        return StepResult(
            status="done",
            detail=f"{count or 0} hard-passed unseen jobs ready for scoring",
            count=int(count or 0),
        )
    except Exception as exc:
        return StepResult(status="error", detail=str(exc))


@router.post("/step/score/{user_id}", response_model=StepResult, status_code=200)
async def trigger_step_score(
    user_id: str,
    session: AsyncSession = Depends(get_session),
    llm: LLMClient = Depends(get_llm),
) -> StepResult:
    """Step 4: LLM scoring (Claude Haiku batch)."""
    from agents.match_agent import MatchAgent
    try:
        result = await MatchAgent(session, llm).run(user_id)
        return StepResult(
            status="done",
            detail=f"{result.scored} jobs scored",
            count=result.scored,
        )
    except Exception as exc:
        return StepResult(status="error", detail=str(exc))


@router.post("/step/deliver/{user_id}", response_model=StepResult, status_code=200)
async def trigger_step_deliver(
    user_id: str,
    session: AsyncSession = Depends(get_session),
) -> StepResult:
    """Step 5: Select top 3 scored jobs and mark as delivered."""
    import uuid as _uuid
    from sqlalchemy import select
    from db.models import Job, JobMatch
    try:
        uid = _uuid.UUID(user_id)
    except ValueError:
        return StepResult(status="error", detail=f"Invalid user_id: {user_id}")
    try:
        # Primary: LLM-scored jobs ordered by score
        stmt = (
            select(JobMatch)
            .join(Job, JobMatch.job_id == Job.id)
            .where(
                JobMatch.user_id == uid,
                JobMatch.passed_hard_filter.is_(True),
                JobMatch.shown_at.is_(None),
                Job.is_active.is_(True),
                JobMatch.score.isnot(None),
            )
            .order_by(JobMatch.score.desc())
            .limit(3)
        )
        result = await session.execute(stmt)
        matches = list(result.scalars().all())
        # Fallback: heuristic-scored if not enough LLM-scored
        if len(matches) < 3:
            stmt2 = (
                select(JobMatch)
                .join(Job, JobMatch.job_id == Job.id)
                .where(
                    JobMatch.user_id == uid,
                    JobMatch.passed_hard_filter.is_(True),
                    JobMatch.shown_at.is_(None),
                    Job.is_active.is_(True),
                    JobMatch.score.is_(None),
                    JobMatch.heuristic_score.isnot(None),
                )
                .order_by(JobMatch.heuristic_score.desc())
                .limit(3 - len(matches))
            )
            result2 = await session.execute(stmt2)
            matches += list(result2.scalars().all())
        now = datetime.now(timezone.utc)
        for m in matches:
            m.shown_at = now
            m.delivered_at = now
        await session.commit()
        return StepResult(
            status="done",
            detail=f"{len(matches)} jobs delivered",
            count=len(matches),
        )
    except Exception as exc:
        return StepResult(status="error", detail=str(exc))


# ------------------------------------------------------------------
# Background task functions
# ------------------------------------------------------------------

async def _run_daily_pipeline(llm: LLMClient) -> None:
    _state.status = "running"
    _state.step = "Searching job boards..."
    _state.new_jobs = 0
    _state.passed_filter = 0
    _state.scored = 0
    _state.error = ""
    _state.started_at = datetime.now(timezone.utc).isoformat()
    _state.finished_at = ""

    async with AsyncSessionLocal() as session:
        async def on_step(msg: str) -> None:
            _state.step = msg

        orchestrator = OrchestratorAgent(session, llm, on_step=on_step)
        try:
            stats = await orchestrator.run_daily_pipeline()
            _state.new_jobs = stats.new_jobs
            _state.passed_filter = stats.total_passed_filter
            _state.scored = stats.total_scored
            _state.filter_warning = ""
            _state.status = "complete"
            _state.step = f"Done — {stats.new_jobs} new jobs, {stats.total_passed_filter} passed filter, {stats.total_scored} scored"
            logger.info("Daily pipeline finished: %s", stats)
        except Exception as e:
            _state.status = "error"
            _state.step = ""
            _state.error = str(e)
            logger.exception("Daily pipeline crashed")
        finally:
            _state.finished_at = datetime.now(timezone.utc).isoformat()


async def _run_collect(llm: LLMClient) -> None:
    _state.status = "running"
    _state.step = "Fetching jobs from all boards..."
    _state.new_jobs = 0
    _state.error = ""
    _state.filter_warning = ""
    _state.started_at = datetime.now(timezone.utc).isoformat()
    _state.finished_at = ""
    async with AsyncSessionLocal() as session:
        async def on_step(msg: str) -> None:
            _state.step = msg
        orchestrator = OrchestratorAgent(session, llm, on_step=on_step)
        try:
            stats = await orchestrator.run_job_collection()
            _state.new_jobs = stats.new_jobs
            _state.status = "complete"
            _state.step = f"Done — {stats.new_jobs} new jobs collected"
        except Exception as e:
            _state.status = "error"
            _state.error = str(e)
            logger.exception("Job collection crashed")
        finally:
            _state.finished_at = datetime.now(timezone.utc).isoformat()


async def _run_match_all(llm: LLMClient) -> None:
    _state.status = "running"
    _state.step = "Matching jobs to user profiles..."
    _state.passed_filter = 0
    _state.scored = 0
    _state.error = ""
    _state.filter_warning = ""
    _state.started_at = datetime.now(timezone.utc).isoformat()
    _state.finished_at = ""
    async with AsyncSessionLocal() as session:
        async def on_step(msg: str) -> None:
            _state.step = msg
        orchestrator = OrchestratorAgent(session, llm, on_step=on_step)
        try:
            stats = await orchestrator.run_user_matching()
            _state.passed_filter = stats.total_passed_filter
            _state.scored = stats.total_scored
            _state.filter_warning = ""
            _state.status = "complete"
            _state.step = f"Done — {stats.total_passed_filter} passed filter, {stats.total_scored} scored"
        except Exception as e:
            _state.status = "error"
            _state.error = str(e)
            logger.exception("User matching crashed")
        finally:
            _state.finished_at = datetime.now(timezone.utc).isoformat()


async def _run_rescore(user_id: str, llm: LLMClient) -> None:
    _state.status = "running"
    _state.step = "Re-scoring matches with updated profile..."
    _state.scored = 0
    _state.error = ""
    _state.started_at = datetime.now(timezone.utc).isoformat()
    _state.finished_at = ""
    async with AsyncSessionLocal() as session:
        from agents.match_agent import MatchAgent
        agent = MatchAgent(session, llm)
        try:
            scored = await agent.run(user_id)
            _state.scored = scored
            _state.status = "complete"
            _state.step = f"Done — re-scored {scored} matches"
            logger.info("Re-score finished for user %s: %d scored", user_id, scored)
        except Exception as e:
            _state.status = "error"
            _state.error = str(e)
            logger.exception("Re-score failed for user %s", user_id)
        finally:
            _state.finished_at = datetime.now(timezone.utc).isoformat()


async def _run_on_demand_match(user_id: str, llm: LLMClient) -> None:
    async with AsyncSessionLocal() as session:
        orchestrator = OrchestratorAgent(session, llm)
        try:
            scored = await orchestrator.run_user_on_demand(user_id)
            logger.info("On-demand match complete for user %s — %d scored", user_id, scored)
        except Exception:
            logger.exception("On-demand match failed for user %s", user_id)


async def _run_feedback_pipeline(user_id: str, llm: LLMClient) -> None:
    from api.feedback import _run_learn_and_rescore
    await _run_learn_and_rescore(user_id, llm)


async def _run_company_insights(llm: LLMClient) -> None:
    from agents.company_insight_agent import CompanyInsightAgent
    logger.info("Company insights pipeline started")
    async with AsyncSessionLocal() as session:
        agent = CompanyInsightAgent(session, llm)
        try:
            count = await agent.run()
            logger.info("Company insights pipeline complete — %d companies processed", count)
        except Exception:
            logger.exception("Company insights pipeline crashed")
