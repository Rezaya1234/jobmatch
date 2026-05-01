import logging
import uuid as _uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_llm, get_session
from db.activity import log_event
from db.database import AsyncSessionLocal
from db.models import ActivityLog, Feedback, FeedbackSignal, Job, JobMatch, UserProfile
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

    if feedback is None and body.weight == 1:
        # Passive link-click with no existing feedback — log the event but don't
        # create a Feedback row, so it never inflates the "Feedback given" counter.
        await log_event(
            session, user_id, "link_click",
            job_title=job.title, company=job.company,
        )
        await session.commit()
        return FeedbackResponse(
            id="00000000-0000-0000-0000-000000000000",
            job_id=str(job.id),
            job_title=job.title,
            company=job.company,
            rating="thumbs_up",
            comment=None,
            created_at=datetime.now(timezone.utc),
        )

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


@router.delete("/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_feedback(
    user_id: str,
    job_id: str,
    session: AsyncSession = Depends(get_session),
) -> None:
    fb_result = await session.execute(
        select(Feedback).where(
            Feedback.user_id == user_id,
            Feedback.job_id == job_id,
        )
    )
    feedback = fb_result.scalar_one_or_none()
    if feedback is not None:
        await session.delete(feedback)
        await session.commit()


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


# ------------------------------------------------------------------
# Feedback summary endpoint
# ------------------------------------------------------------------

_SHOWN_EVENT_TYPES = {"thumbs_up", "thumbs_down", "link_click", "email_thumbs_up", "email_thumbs_down", "applied", "interview"}


class CourseItem(BaseModel):
    id: str
    title: str
    provider: str
    url: str
    tags: list[str]
    level: str
    description: str
    quality_score: float
    gap_reason: str = ""


class ActivityItem(BaseModel):
    event_type: str
    job_title: str | None
    company: str | None
    created_at: datetime


class NextStep(BaseModel):
    text: str
    subtext: str = ""
    category: str   # "Filter optimization" | "Skill improvement" | "Focus strategy"


class FeedbackSummaryResponse(BaseModel):
    liked_count: int
    disliked_count: int
    viewed_count: int
    feedback_count: int
    learning_status: str
    learning_progress: int
    learning_message: str
    impact_message: str
    insights: list[str]
    next_steps: list[NextStep]
    preferences: dict[str, Any]
    courses: list[CourseItem]
    all_courses: list[CourseItem]
    recent_activity: list[ActivityItem]
    all_activity: list[ActivityItem]


@router.get("/summary", response_model=FeedbackSummaryResponse)
async def get_feedback_summary(
    user_id: str,
    days: int = Query(default=30, ge=1, le=365),
    session: AsyncSession = Depends(get_session),
) -> FeedbackSummaryResponse:
    try:
        uid = _uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Invalid user_id")

    since = datetime.now(timezone.utc) - timedelta(days=days)

    # --- Windowed counts (for the selected date range) ---
    liked_count = (await session.scalar(
        select(func.count()).select_from(Feedback).where(
            Feedback.user_id == uid, Feedback.rating == "thumbs_up",
            Feedback.weight >= 2, Feedback.created_at >= since,
        )
    )) or 0

    disliked_count = (await session.scalar(
        select(func.count()).select_from(Feedback).where(
            Feedback.user_id == uid, Feedback.rating == "thumbs_down",
            Feedback.weight >= 2, Feedback.created_at >= since,
        )
    )) or 0

    viewed_count = (await session.scalar(
        select(func.count()).select_from(ActivityLog).where(
            ActivityLog.user_id == uid, ActivityLog.event_type == "link_click", ActivityLog.created_at >= since,
        )
    )) or 0

    feedback_count = liked_count + disliked_count

    # --- All-time signal count for learning status (not date-windowed) ---
    alltime_feedback = (await session.scalar(
        select(func.count()).select_from(Feedback).where(Feedback.user_id == uid)
    )) or 0
    alltime_clicks = (await session.scalar(
        select(func.count()).select_from(ActivityLog).where(
            ActivityLog.user_id == uid, ActivityLog.event_type == "link_click",
        )
    )) or 0
    total_signals = alltime_feedback + alltime_clicks

    # --- Liked / disliked jobs (all-time, for pattern detection) ---
    liked_jobs_result = await session.execute(
        select(Job).join(Feedback, Feedback.job_id == Job.id).where(
            Feedback.user_id == uid, Feedback.rating == "thumbs_up",
        ).order_by(Feedback.created_at.desc()).limit(50)
    )
    liked_jobs = liked_jobs_result.scalars().all()

    disliked_jobs_result = await session.execute(
        select(Job).join(Feedback, Feedback.job_id == Job.id).where(
            Feedback.user_id == uid, Feedback.rating == "thumbs_down",
        ).order_by(Feedback.created_at.desc()).limit(50)
    )
    disliked_jobs = disliked_jobs_result.scalars().all()

    # --- User profile ---
    profile = (await session.execute(
        select(UserProfile).where(UserProfile.user_id == uid)
    )).scalar_one_or_none()

    # --- Learning status ---
    learning_status, learning_progress, learning_message = _compute_learning_status(total_signals)
    impact_message = _compute_impact_message(total_signals)

    # --- Actionable insights ---
    insights = _generate_insights(liked_jobs, disliked_jobs, alltime_feedback, len(liked_jobs), len(disliked_jobs))

    # --- Next steps ---
    from courses.recommender import (
        detect_gaps, recommend_courses, recommend_all_courses,
        skill_counts_in_texts, course_gap_reason,
    )
    liked_texts = [f"{j.title} {j.description[:500]}" for j in liked_jobs]
    profile_text = (profile.role_description or "") if profile else ""
    gaps = detect_gaps(liked_texts, profile_text)
    skill_counts = skill_counts_in_texts(liked_texts)
    total_liked = len(liked_texts)

    next_steps = _generate_next_steps(liked_jobs, disliked_jobs, gaps, profile)

    # --- Preferences ---
    preferences = _build_preferences(profile)

    # --- Course recommendations with gap reasons ---
    courses_raw = recommend_courses(gaps, limit=3)
    all_courses_raw = recommend_all_courses(gaps, limit=15)

    courses = [
        CourseItem(id=c.id, title=c.title, provider=c.provider, url=c.url,
                   tags=c.tags, level=c.level, description=c.description,
                   quality_score=c.quality_score,
                   gap_reason=course_gap_reason(c, gaps, skill_counts, total_liked))
        for c in courses_raw
    ]
    all_courses = [
        CourseItem(id=c.id, title=c.title, provider=c.provider, url=c.url,
                   tags=c.tags, level=c.level, description=c.description,
                   quality_score=c.quality_score,
                   gap_reason=course_gap_reason(c, gaps, skill_counts, total_liked))
        for c in all_courses_raw
    ]

    # --- Activity log (only meaningful events) ---
    all_activity_result = await session.execute(
        select(ActivityLog).where(
            ActivityLog.user_id == uid,
            ActivityLog.event_type.in_(_SHOWN_EVENT_TYPES),
        ).order_by(ActivityLog.created_at.desc()).limit(50)
    )
    all_activity_rows = all_activity_result.scalars().all()
    all_activity = [
        ActivityItem(
            event_type=row.event_type,
            job_title=(row.meta or {}).get("job_title"),
            company=(row.meta or {}).get("company"),
            created_at=row.created_at,
        )
        for row in all_activity_rows
    ]
    recent_activity = all_activity[:15]

    return FeedbackSummaryResponse(
        liked_count=liked_count,
        disliked_count=disliked_count,
        viewed_count=viewed_count,
        feedback_count=feedback_count,
        learning_status=learning_status,
        learning_progress=learning_progress,
        learning_message=learning_message,
        impact_message=impact_message,
        insights=insights,
        next_steps=next_steps,
        preferences=preferences,
        courses=courses,
        all_courses=all_courses,
        recent_activity=recent_activity,
        all_activity=all_activity,
    )


def _compute_learning_status(total_signals: int) -> tuple[str, int, str]:
    if total_signals < 5:
        remaining = 5 - total_signals
        return (
            "Early stage", 10,
            f"Rate {remaining} more job{'s' if remaining != 1 else ''} to start calibrating your matches",
        )
    if total_signals < 10:
        remaining = 10 - total_signals
        return (
            "Building understanding", 35,
            f"{remaining} more rating{'s' if remaining != 1 else ''} will significantly improve your results",
        )
    if total_signals < 20:
        remaining = 20 - total_signals
        return (
            "Good understanding", 65,
            f"Keep rating — {remaining} more will fine-tune your recommendations",
        )
    return "Strong understanding", 92, "Your profile is well-calibrated — keep rating to stay sharp"


def _compute_impact_message(total_signals: int) -> str:
    if total_signals >= 20:
        return "Your feedback has meaningfully shaped your match quality"
    if total_signals >= 10:
        return "Your recent ratings are actively improving your recommendations"
    if total_signals >= 5:
        return "Your feedback is starting to improve your matches"
    return ""


def _generate_insights(liked: list, disliked: list, total: int, liked_count: int, disliked_count: int) -> list[str]:
    from collections import Counter

    if total == 0:
        return []

    MODE_LABEL = {"remote": "Remote", "hybrid": "Hybrid", "onsite": "On-site"}

    liked_modes    = Counter(j.work_mode    for j in liked    if j.work_mode)
    disliked_modes = Counter(j.work_mode    for j in disliked if j.work_mode)
    liked_sectors  = Counter(j.sector       for j in liked    if j.sector)
    liked_sizes    = Counter(j.company_size for j in liked    if j.company_size)

    # --- Contrast: same work mode dominates both liked and disliked ---
    contrast: str | None = None
    if liked_modes and disliked_modes and liked and disliked:
        top_lk_mode  = liked_modes.most_common(1)[0][0]
        top_dis_mode = disliked_modes.most_common(1)[0][0]
        lk_pct  = round(liked_modes[top_lk_mode]    / max(len(liked),    1) * 100)
        dis_pct = round(disliked_modes[top_dis_mode] / max(len(disliked), 1) * 100)
        if top_lk_mode == top_dis_mode and lk_pct >= 50 and dis_pct >= 40:
            contrast = "Your preferences vary across roles — refining your filters can improve match quality"

    # --- Individual observations ---
    obs: list[str] = []

    # Skipped work mode
    if disliked_modes and disliked:
        top_dis, dis_count = disliked_modes.most_common(1)[0]
        dis_pct = round(dis_count / max(len(disliked), 1) * 100)
        dl = MODE_LABEL.get(top_dis, top_dis.title())
        if dis_pct >= 50 and dis_count >= 2:
            obs.append(f"You skip most {dl} roles ({dis_pct}%)")

    # Liked work mode
    if liked_modes and liked:
        top_mode, top_count = liked_modes.most_common(1)[0]
        mode_pct = round(top_count / max(len(liked), 1) * 100)
        ml = MODE_LABEL.get(top_mode, top_mode.title())
        if mode_pct >= 60:
            obs.append(f"You tend to like {ml} roles ({mode_pct}%)")

    # Sector concentration
    if liked_sectors and liked_sectors.most_common(1)[0][1] >= 2:
        top_sector, sec_count = liked_sectors.most_common(1)[0]
        sec_pct = round(sec_count / max(len(liked), 1) * 100)
        obs.append(f"Most liked roles are in {top_sector} ({sec_pct}%)")

    # Company size concentration
    if liked_sizes and liked_sizes.most_common(1)[0][1] >= 2:
        top_size, size_count = liked_sizes.most_common(1)[0]
        size_pct = round(size_count / max(len(liked), 1) * 100)
        size_label = {"startup": "startups", "small": "small companies",
                      "medium": "mid-size companies", "large": "large companies"}.get(top_size, top_size)
        obs.append(f"You lean toward {size_label} ({size_pct}%)")

    # Approval rate — only when notably high or low
    rate = round(liked_count / total * 100) if total else 0
    if total >= 5:
        if rate >= 70:
            obs.append(f"You've approved {rate}% of rated roles")
        elif rate <= 25:
            obs.append(f"Only {rate}% of rated roles approved — your filters may need adjusting")

    if contrast:
        return obs[:2] + [contrast]
    return obs[:3]


def _generate_next_steps(liked: list, disliked: list, gaps: list[str], profile) -> list[NextStep]:
    from collections import Counter
    from courses.recommender import gap_reason, skill_counts_in_texts

    candidates: list[NextStep] = []

    liked_modes    = Counter(j.work_mode    for j in liked    if j.work_mode)
    disliked_modes = Counter(j.work_mode    for j in disliked if j.work_mode)
    liked_sectors  = Counter(j.sector       for j in liked    if j.sector)
    liked_texts    = [f"{j.title} {j.description[:300]}" for j in liked] if liked else []
    skill_counts   = skill_counts_in_texts(liked_texts) if liked_texts else Counter()
    total_liked    = max(len(liked), 1)

    MODE_LABEL = {"remote": "Remote", "hybrid": "Hybrid", "onsite": "On-site"}

    # 1. Filter: liked work mode not yet set in profile
    if liked_modes and liked:
        top_mode, top_count = liked_modes.most_common(1)[0]
        top_pct = round(top_count / total_liked * 100)
        current_modes = (profile.work_modes if profile else None) or []
        ml = MODE_LABEL.get(top_mode, top_mode.title())
        if top_pct >= 60 and top_mode not in current_modes:
            candidates.append(NextStep(
                text=f"Focus on {ml} roles to see better matches",
                subtext=f"{top_pct}% of your liked jobs are {ml}",
                category="Filter optimization",
            ))

    # 2. Filter: disliked work mode (if no liked-mode step was added)
    if len(candidates) == 0 and disliked_modes and disliked:
        top_dis, dis_count = disliked_modes.most_common(1)[0]
        dis_pct = round(dis_count / max(len(disliked), 1) * 100)
        if dis_pct >= 50 and dis_count >= 2:
            dl = MODE_LABEL.get(top_dis, top_dis.title())
            candidates.append(NextStep(
                text=f"Filter out {dl} roles to reduce noise",
                subtext=f"{dis_pct}% of jobs you skip are {dl}",
                category="Filter optimization",
            ))

    # 3. Focus: dominant sector not yet in profile
    if liked_sectors and liked_sectors.most_common(1)[0][1] >= 2:
        top_sector, sec_count = liked_sectors.most_common(1)[0]
        sec_pct = round(sec_count / total_liked * 100)
        current_sectors = (profile.preferred_sectors if profile else None) or []
        if top_sector not in current_sectors:
            candidates.append(NextStep(
                text=f"Focus your search on {top_sector}",
                subtext=f"{sec_pct}% of your liked jobs are in this sector",
                category="Focus strategy",
            ))

    # 4. Focus: seniority pattern
    if liked:
        senior_liked = sum(
            1 for j in liked
            if any(kw in (j.title or "").lower() for kw in ["senior", "lead", "principal", "staff", "vp", "director"])
        )
        if senior_liked >= 2:
            sen_pct = round(senior_liked / total_liked * 100)
            current_seniority = (profile.seniority_level if profile else None) or ""
            if not current_seniority or current_seniority in ("junior", "mid", "unknown"):
                candidates.append(NextStep(
                    text="Target Senior / Lead roles",
                    subtext=f"{sen_pct}% of your liked jobs are at this level",
                    category="Focus strategy",
                ))

    # 5. Skill improvement: top gap
    if gaps:
        g = gaps[0]
        label = gap_reason(g)
        pct = round(skill_counts.get(g, 0) / total_liked * 100) if liked else 0
        subtext = f"Required in ~{pct}% of roles you engage with" if pct >= 10 else "A gap in roles you consistently like"
        candidates.append(NextStep(
            text=f"Add {label} skills to unlock more relevant roles",
            subtext=subtext,
            category="Skill improvement",
        ))

    # 6. Skill improvement: second gap (fills slot if we have room)
    if len(gaps) > 1 and len(candidates) < 3:
        g2 = gaps[1]
        label2 = gap_reason(g2)
        pct2 = round(skill_counts.get(g2, 0) / total_liked * 100) if liked else 0
        subtext2 = f"Present in ~{pct2}% of roles you engage with" if pct2 >= 10 else "Seen in roles you like but missing from your profile"
        candidates.append(NextStep(
            text=f"Build {label2} skills",
            subtext=subtext2,
            category="Skill improvement",
        ))

    # 7. Filter: low approval rate (last resort)
    total_rated = len(liked) + len(disliked)
    if total_rated >= 5 and len(liked) / total_rated < 0.35 and len(candidates) < 3:
        candidates.append(NextStep(
            text="Revisit your match filters",
            subtext="Your approval rate suggests your criteria need updating",
            category="Filter optimization",
        ))

    # Prefer variety: deduplicate same category if we have 3+ candidates
    if len(candidates) >= 3:
        seen: set[str] = set()
        result: list[NextStep] = []
        for c in candidates:
            if c.category not in seen or len(result) < 2:
                result.append(c)
                seen.add(c.category)
            if len(result) == 3:
                break
        return result

    return candidates[:3]


def _build_preferences(profile) -> dict:
    if profile is None:
        return {}
    return {
        "work_modes":              profile.work_modes or [],
        "seniority_level":         profile.seniority_level,
        "salary_min":              profile.salary_min,
        "salary_max":              profile.salary_max,
        "salary_currency":         profile.salary_currency,
        "preferred_sectors":       profile.preferred_sectors or [],
        "company_type":            profile.company_type,
        "preferred_company_sizes": profile.preferred_company_sizes or [],
        "preferred_companies":     profile.preferred_companies or [],
        "locations":               profile.locations or [],
        "title_include":           profile.title_include or [],
        "title_exclude":           profile.title_exclude or [],
        "visa_sponsorship_required": profile.visa_sponsorship_required,
        "excluded_companies":      profile.excluded_companies or [],
    }


_VALID_SIGNALS = {"click", "applied", "interview"}
_IMMEDIATE_SIGNAL_TYPES = {"applied", "interview"}


class SignalRequest(BaseModel):
    job_id: str
    signal_type: str   # "click", "applied", "interview"


@router.post("/signal", status_code=status.HTTP_201_CREATED)
async def record_signal(
    user_id: str,
    body: SignalRequest,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
    llm: LLMClient = Depends(get_llm),
) -> dict:
    """
    Record a high-value behavioral signal (click, applied, interview).
    'applied' and 'interview' trigger immediate weight update.
    """
    if body.signal_type not in _VALID_SIGNALS:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"signal_type must be one of {sorted(_VALID_SIGNALS)}",
        )

    job_result = await session.execute(select(Job).where(Job.id == body.job_id))
    job = job_result.scalar_one_or_none()
    if job is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Job not found")

    sig = FeedbackSignal(
        user_id=user_id,
        job_id=body.job_id,
        signal_type=body.signal_type,
    )
    session.add(sig)
    await log_event(
        session, user_id, body.signal_type,
        job_title=job.title, company=job.company,
    )
    await session.commit()

    if body.signal_type in _IMMEDIATE_SIGNAL_TYPES:
        background_tasks.add_task(
            _run_learn_and_rescore, user_id, llm, signal_type=body.signal_type
        )

    return {"status": "recorded", "signal_type": body.signal_type}


async def _run_learn_and_rescore(
    user_id: str, llm: LLMClient, signal_type: str | None = None
) -> None:
    """Run feedback learning then re-score only unscored matches with the updated profile."""
    async with AsyncSessionLocal() as session:
        from agents.feedback_agent import FeedbackAgent
        from agents.match_agent import MatchAgent
        try:
            updated = await FeedbackAgent(session, llm).run(user_id, signal_type=signal_type)
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
  <title>JobMatch</title>
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
