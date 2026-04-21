import logging
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_llm, get_session
from db.database import AsyncSessionLocal
from db.models import Feedback, Job, JobMatch
from llm.client import LLMClient

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/users/{user_id}/feedback", tags=["feedback"])

_VALID_RATINGS = {"thumbs_up", "thumbs_down"}


# ------------------------------------------------------------------
# Schemas
# ------------------------------------------------------------------

class SubmitFeedbackRequest(BaseModel):
    job_id: str
    rating: str          # "thumbs_up" or "thumbs_down"
    comment: str | None = None


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

    feedback.rating = body.rating
    feedback.comment = body.comment

    await session.commit()
    await session.refresh(feedback)

    # Count total feedback and auto-trigger learning every N items
    count_result = await session.execute(
        select(func.count()).select_from(Feedback).where(Feedback.user_id == user_id)
    )
    total_feedback = count_result.scalar() or 0
    if total_feedback >= _AUTO_LEARN_THRESHOLD and total_feedback % _AUTO_LEARN_THRESHOLD == 0:
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
    """Run feedback learning then re-score matches with the updated profile."""
    async with AsyncSessionLocal() as session:
        from agents.feedback_agent import FeedbackAgent
        from agents.match_agent import MatchAgent
        from sqlalchemy import update
        from db.models import JobMatch
        try:
            updated = await FeedbackAgent(session, llm).run(user_id)
            if updated:
                logger.info("Profile updated from feedback for user %s — re-scoring", user_id)
                await session.execute(
                    update(JobMatch)
                    .where(JobMatch.user_id == user_id)
                    .values(score=None, reasoning=None)
                )
                await session.commit()
                scored = await MatchAgent(session, llm).run(user_id)
                logger.info("Auto re-score complete for user %s — %d scored", user_id, scored)
            else:
                logger.info("No profile updates from feedback for user %s", user_id)
        except Exception:
            logger.exception("learn_and_rescore failed for user %s", user_id)
