import logging
import uuid as _uuid
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_llm, get_session
from db.activity import log_event
from db.database import AsyncSessionLocal
from db.models import Feedback, Job, JobMatch
from llm.client import LLMClient

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/users/{user_id}/feedback", tags=["feedback"])
click_router = APIRouter(prefix="/feedback", tags=["feedback"])

_VALID_RATINGS = {"thumbs_up", "thumbs_down"}


# ------------------------------------------------------------------
# Schemas
# ------------------------------------------------------------------

class SubmitFeedbackRequest(BaseModel):
    job_id: str
    rating: str          # "thumbs_up" or "thumbs_down"
    comment: str | None = None
    weight: int | None = None  # 1 = passive click signal, 2 = explicit button press


class FeedbackResponse(BaseModel):
    id: str
    job_id: str
    job_title: str
    company: str
    rating: str
    comment: str | None
    created_at: datetime


# ------------------------------------------------------------------
# Routes
# ------------------------------------------------------------------

_AUTO_LEARN_THRESHOLD = 5   # trigger learning every N feedback submissions

@router.post("", response_model=FeedbackResponse, status_code=status.HTTP_201_CREATED)
async def submit_feedback(
    user_id: str,
    body: SubmitFeedbackRequest,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
    llm: LLMClient = Depends(get_llm),
) -> FeedbackResponse:
    if body.rating not in _VALID_RATINGS:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"rating must be one of {sorted(_VALID_RATINGS)}",
        )

    # Confirm the job exists
    job_result = await session.execute(select(Job).where(Job.id == body.job_id))
    job = job_result.scalar_one_or_none()
    if job is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Job not found")

    # Resolve match_id if this job was matched for the user
    match_result = await session.execute(
        select(JobMatch).where(
            JobMatch.user_id == user_id,
            JobMatch.job_id == body.job_id,
        )
    )
    match = match_result.scalar_one_or_none()

    # Upsert: update existing feedback or create new
    fb_result = await session.execute(
        select(Feedback).where(
            Feedback.user_id == user_id,
            Feedback.job_id == body.job_id,
        )
    )
    feedback = fb_result.scalar_one_or_none()

    if feedback is None:
        feedback = Feedback(
            user_id=user_id,
            job_id=body.job_id,
            match_id=str(match.id) if match else None,
        )
        session.add(feedback)
    elif body.weight == 1:
        # Passive click signal — never overrides an existing explicit rating
        await session.refresh(feedback)
        return FeedbackResponse(
            id=str(feedback.id),
            job_id=str(feedback.job_id),
            job_title=job.title,
            company=job.company,
            rating=feedback.rating,
            comment=feedback.comment,
            created_at=feedback.created_at,
        )

    feedback.rating = body.rating
    feedback.comment = body.comment
    feedback.weight = body.weight

    # Determine event type for audit log
    if body.weight == 1:
        event = "link_click"
    elif body.rating == "thumbs_up":
        event = "thumbs_up"
    else:
        event = "thumbs_down"

    await log_event(
        session, user_id, event,
        job_title=job.title, company=job.company,
        comment=body.comment or None,
    )

    await session.commit()
    await session.refresh(feedback)

    # Count only explicit (weight >= 2) feedback for auto-learn threshold
    # Passive link clicks (weight=1) are weak signals and shouldn't trigger profile rewrites
    count_result = await session.execute(
        select(func.count()).select_from(Feedback).where(
            Feedback.user_id == user_id,
            Feedback.weight >= 2,
        )
    )
    explicit_feedback = count_result.scalar() or 0
    if explicit_feedback >= _AUTO_LEARN_THRESHOLD and explicit_feedback % _AUTO_LEARN_THRESHOLD == 0:
        background_tasks.add_task(_run_learn_and_rescore, user_id, llm)

    return FeedbackResponse(
        id=str(feedback.id),
        job_id=str(feedback.job_id),
        job_title=job.title,
        company=job.company,
        rating=feedback.rating,
        comment=feedback.comment,
        created_at=feedback.created_at,
    )


@router.get("", response_model=list[FeedbackResponse])
async def list_feedback(
    user_id: str,
    session: AsyncSession = Depends(get_session),
) -> list[FeedbackResponse]:
    result = await session.execute(
        select(Feedback, Job)
        .join(Job, Feedback.job_id == Job.id)
        .where(Feedback.user_id == user_id)
        .order_by(Feedback.created_at.desc())
    )
    return [
        FeedbackResponse(
            id=str(fb.id),
            job_id=str(fb.job_id),
            job_title=job.title,
            company=job.company,
            rating=fb.rating,
            comment=fb.comment,
            created_at=fb.created_at,
        )
        for fb, job in result.all()
    ]


async def _run_learn_and_rescore(user_id: str, llm: LLMClient) -> None:
    """Run feedback learning then re-score only unscored matches with the updated profile.

    We do NOT wipe existing scores — doing so would make all matches invisible until
    MatchAgent finishes (it caps at 50 per run), leaving hundreds of matches with NULL
    scores that the matches API silently drops. Instead we update the profile and let
    MatchAgent score any jobs that haven't been scored yet. Full rescoring of old matches
    happens on the next daily pipeline run.
    """
    async with AsyncSessionLocal() as session:
        from agents.feedback_agent import FeedbackAgent
        from agents.match_agent import MatchAgent
        try:
            updated = await FeedbackAgent(session, llm).run(user_id)
            if updated:
                logger.info("Profile updated from feedback for user %s — scoring pending matches", user_id)
                scored = await MatchAgent(session, llm).run(user_id)
                logger.info("Auto re-score complete for user %s — %d new matches scored", user_id, scored)
            else:
                logger.info("No profile updates from feedback for user %s", user_id)
        except Exception:
            logger.exception("learn_and_rescore failed for user %s", user_id)


# ------------------------------------------------------------------
# One-click email feedback  GET /feedback/click
# ------------------------------------------------------------------

@click_router.get("/click", response_class=HTMLResponse, include_in_schema=False)
async def feedback_click(
    user_id: str = Query(...),
    job_id: str = Query(...),
    rating: str = Query(...),
    session: AsyncSession = Depends(get_session),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    llm: LLMClient = Depends(get_llm),
) -> HTMLResponse:
    """One-click feedback from email links. Returns a simple thank-you page."""
    if rating not in _VALID_RATINGS:
        return HTMLResponse(_thanks_page("Invalid rating.", error=True), status_code=400)
    try:
        uid = _uuid.UUID(user_id)
        jid = _uuid.UUID(job_id)
    except ValueError:
        return HTMLResponse(_thanks_page("Invalid link.", error=True), status_code=400)

    job_result = await session.execute(select(Job).where(Job.id == jid))
    job = job_result.scalar_one_or_none()
    if job is None:
        return HTMLResponse(_thanks_page("Job not found.", error=True), status_code=404)

    match_result = await session.execute(
        select(JobMatch).where(JobMatch.user_id == uid, JobMatch.job_id == jid)
    )
    match = match_result.scalar_one_or_none()

    fb_result = await session.execute(
        select(Feedback).where(Feedback.user_id == uid, Feedback.job_id == jid)
    )
    feedback = fb_result.scalar_one_or_none()
    if feedback is None:
        feedback = Feedback(user_id=uid, job_id=jid, match_id=match.id if match else None)
        session.add(feedback)
    feedback.rating = rating
    feedback.weight = 2  # email click is an explicit user action

    event = "email_thumbs_up" if rating == "thumbs_up" else "email_thumbs_down"
    await log_event(session, uid, event, job_title=job.title, company=job.company)

    await session.commit()
    logger.info("Email feedback: user=%s job=%s rating=%s", user_id, job_id, rating)

    count_result = await session.scalar(
        select(func.count()).select_from(Feedback).where(
            Feedback.user_id == uid,
            Feedback.weight >= 2,
        )
    )
    if (count_result or 0) >= _AUTO_LEARN_THRESHOLD and (count_result or 0) % _AUTO_LEARN_THRESHOLD == 0:
        background_tasks.add_task(_run_learn_and_rescore, user_id, llm)

    emoji = "👍" if rating == "thumbs_up" else "👎"
    label = "Great match" if rating == "thumbs_up" else "Not relevant"
    return HTMLResponse(_thanks_page(f"{emoji} Got it — <strong>{label}</strong> for <em>{job.title}</em> at {job.company}. Thanks!"))


def _thanks_page(message: str, error: bool = False) -> str:
    color = "#dc2626" if error else "#16a34a"
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Stellapath</title>
  <style>
    body {{ font-family: Arial, sans-serif; background: #f5f5f5; display: flex; align-items: center;
            justify-content: center; min-height: 100vh; margin: 0; }}
    .card {{ background: #fff; border-radius: 12px; padding: 40px 48px; text-align: center;
             max-width: 480px; box-shadow: 0 2px 16px rgba(0,0,0,.08); }}
    h1 {{ color: {color}; font-size: 20px; margin-bottom: 12px; }}
    p {{ color: #555; font-size: 15px; line-height: 1.6; }}
  </style>
</head>
<body>
  <div class="card">
    <h1>JobMatch</h1>
    <p>{message}</p>
    <p style="margin-top:20px;font-size:13px;color:#aaa;">You can close this tab.</p>
  </div>
</body>
</html>"""
