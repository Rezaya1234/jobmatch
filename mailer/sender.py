import asyncio
import logging
import os
import uuid
from datetime import datetime, timezone

from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import Job, JobMatch, User, UserProfile
from mailer.templates import (
    JobDigestItem,
    build_html,
    build_plain_text,
    build_reengagement_html,
    build_reengagement_plain_text,
    build_weekly_recap_html,
    build_weekly_recap_plain_text,
)

logger = logging.getLogger(__name__)

TOP_N = int(os.getenv("DIGEST_TOP_N", "10"))
FROM_EMAIL = os.getenv("FROM_EMAIL", "digest@jobmatch.app")
FROM_NAME = os.getenv("FROM_NAME", "JobMatch")
FRONTEND_URL = os.getenv("FRONTEND_URL", "").rstrip("/")


# ------------------------------------------------------------------
# Frequency tiers (days since last engagement → minimum days between emails)
# ------------------------------------------------------------------

def _email_cadence(last_engaged_at: datetime | None, last_emailed_at: datetime | None) -> str:
    """
    Returns one of: 'daily', 'every_other_day', 'weekly', 'reengagement', 'skip'.
    """
    now = datetime.now(timezone.utc)

    # Never engaged = new user, treat as active
    if last_engaged_at is None:
        engagement_days = 0
    else:
        engagement_days = (now - last_engaged_at).days

    days_since_email = (now - last_emailed_at).days if last_emailed_at else 9999

    if engagement_days >= 30:
        return 'reengagement' if days_since_email >= 30 else 'skip'
    if engagement_days >= 10:
        return 'weekly' if days_since_email >= 7 else 'skip'
    if engagement_days >= 3:
        return 'every_other_day' if days_since_email >= 2 else 'skip'
    return 'daily'   # < 3 days since engagement — send every day


async def send_daily_digest(user_id: str, session: AsyncSession, test: bool = False) -> int:
    """
    Build and send the daily digest for one user.
    Returns 1 on success, 0 if nothing to send / skipped / failed.
    If test=True, bypasses cadence check, includes already-emailed matches,
    and does not update timestamps.
    """
    user = await _get_user(user_id, session)
    if user is None:
        logger.warning("User %s not found — skipping email", user_id)
        return 0

    # Respect notification preferences
    prefs = user.notification_prefs or {}
    if not test and not prefs.get("new_matches", True):
        logger.info("Skipping daily digest for user %s (new_matches disabled)", user_id)
        return 0

    profile = await _get_profile(user_id, session)

    # Determine whether to send and what kind of email
    if not test:
        cadence = _email_cadence(
            getattr(profile, 'last_engaged_at', None) if profile else None,
            getattr(profile, 'last_emailed_at', None) if profile else None,
        )
        if cadence == 'skip':
            logger.info("Skipping email for user %s (cadence=skip)", user_id)
            return 0
        if cadence == 'reengagement':
            return await _send_reengagement(user, profile, session)
    else:
        cadence = 'daily'

    matches = await _get_top_matches(user_id, session, include_emailed=test)
    if not matches:
        logger.info("No scored matches to email for user %s", user_id)
        return 0

    logger.info("Sending digest to %s — %d matches", user.email, len(matches))
    items = [_to_digest_item(match, job) for match, job in matches]
    date_str = datetime.now(timezone.utc).strftime("%B %d, %Y")

    html = build_html(user.email, items, date_str, FRONTEND_URL)
    plain = build_plain_text(user.email, items, date_str, FRONTEND_URL)
    subject = f"Your {len(items)} top job match{'es' if len(items) != 1 else ''} — {date_str}"

    try:
        await asyncio.to_thread(_send_via_sendgrid, user.email, subject, html, plain)
    except Exception:
        logger.exception("SendGrid call failed for user %s", user_id)
        return 0

    if not test:
        now = datetime.now(timezone.utc)
        for match, _ in matches:
            match.emailed_at = now
        if profile is not None:
            profile.last_emailed_at = now
        from db.activity import log_event
        await log_event(session, user_id, "email_sent",
                        job_count=len(items), cadence=cadence,
                        jobs=[{"title": i.title, "company": i.company} for i in items])
        await session.commit()

    logger.info("Digest sent to %s (%d jobs)", user.email, len(items))
    return 1


async def send_weekly_recap(user_id: str, session: AsyncSession) -> int:
    """
    Send a weekly recap of high-scoring shown jobs that the user never clicked or rated.
    Returns 1 on success, 0 if nothing to send / skipped / failed.
    """
    from datetime import timedelta
    user = await _get_user(user_id, session)
    if user is None:
        return 0

    prefs = user.notification_prefs or {}
    if not prefs.get("weekly_recap", True):
        logger.info("Skipping weekly recap for user %s (weekly_recap disabled)", user_id)
        return 0

    uid = uuid.UUID(user_id) if isinstance(user_id, str) else user_id
    cutoff = datetime.now(timezone.utc) - timedelta(days=7)
    result = await session.execute(
        select(JobMatch, Job)
        .join(Job, JobMatch.job_id == Job.id)
        .where(
            JobMatch.user_id == uid,
            JobMatch.shown_at.isnot(None),
            JobMatch.shown_at >= cutoff,
            JobMatch.recap_sent_at.is_(None),
            # No interaction: not clicked, not rated (emailed but never fed back)
            JobMatch.score.isnot(None),
        )
        .order_by(JobMatch.score.desc())
        .limit(5)
    )
    matches = list(result.all())
    if not matches:
        logger.info("No recap-eligible jobs for user %s", user_id)
        return 0

    items = [_to_digest_item(match, job) for match, job in matches]
    date_str = datetime.now(timezone.utc).strftime("%B %d, %Y")
    html = build_weekly_recap_html(user.email, items, date_str, FRONTEND_URL)
    plain = build_weekly_recap_plain_text(user.email, items, date_str, FRONTEND_URL)
    subject = f"Jobs you haven't checked yet — weekly recap"

    try:
        await asyncio.to_thread(_send_via_sendgrid, user.email, subject, html, plain)
    except Exception:
        logger.exception("SendGrid recap failed for user %s", user_id)
        return 0

    now = datetime.now(timezone.utc)
    for match, _ in matches:
        match.recap_sent_at = now
    from db.activity import log_event
    await log_event(session, user_id, "recap_sent", job_count=len(items))
    await session.commit()
    logger.info("Weekly recap sent to %s (%d jobs)", user.email, len(items))
    return 1


async def _send_reengagement(user: User, profile: UserProfile | None, session: AsyncSession) -> int:
    """Send a 'we miss you' email with no job listings, just a dashboard link."""
    logger.info("Sending re-engagement email to %s", user.email)
    html = build_reengagement_html(user.email, FRONTEND_URL)
    plain = build_reengagement_plain_text(user.email, FRONTEND_URL)
    subject = f"Your career path is waiting — come back to {FROM_NAME}"
    try:
        await asyncio.to_thread(_send_via_sendgrid, user.email, subject, html, plain)
    except Exception:
        logger.exception("Re-engagement SendGrid call failed for user %s", user.id)
        return 0
    now = datetime.now(timezone.utc)
    if profile is not None:
        profile.last_emailed_at = now
        from db.activity import log_event
        await log_event(session, user.id, "email_sent", job_count=0, cadence="reengagement")
        await session.commit()
    logger.info("Re-engagement email sent to %s", user.email)
    return 1


# ------------------------------------------------------------------
# SendGrid
# ------------------------------------------------------------------

def _send_via_sendgrid(to_email: str, subject: str, html: str, plain: str) -> None:
    api_key = os.getenv("SENDGRID_API_KEY")
    if not api_key:
        raise RuntimeError("SENDGRID_API_KEY is not set")
    message = Mail(
        from_email=(FROM_EMAIL, FROM_NAME),
        to_emails=to_email,
        subject=subject,
        html_content=html,
        plain_text_content=plain,
    )
    client = SendGridAPIClient(api_key)
    response = client.send(message)
    if response.status_code >= 400:
        raise RuntimeError(f"SendGrid returned {response.status_code}: {response.body}")


# ------------------------------------------------------------------
# DB helpers
# ------------------------------------------------------------------

async def _get_user(user_id: str, session: AsyncSession) -> User | None:
    uid = uuid.UUID(user_id) if isinstance(user_id, str) else user_id
    result = await session.execute(select(User).where(User.id == uid))
    return result.scalar_one_or_none()


async def _get_profile(user_id: str, session: AsyncSession) -> UserProfile | None:
    uid = uuid.UUID(user_id) if isinstance(user_id, str) else user_id
    result = await session.execute(select(UserProfile).where(UserProfile.user_id == uid))
    return result.scalar_one_or_none()


async def _get_top_matches(
    user_id: str, session: AsyncSession, include_emailed: bool = False
) -> list[tuple[JobMatch, Job]]:
    """
    Return jobs to include in the daily digest.
    Prefers jobs the orchestrator marked with delivered_at (3-job guaranteed set).
    Falls back to top-scored unshown matches if no delivered batch exists.
    """
    uid = uuid.UUID(user_id) if isinstance(user_id, str) else user_id

    # Primary: orchestrator-selected delivery jobs
    delivery_conditions = [
        JobMatch.user_id == uid,
        JobMatch.passed_hard_filter.is_(True),
        JobMatch.delivered_at.isnot(None),
        JobMatch.emailed_at.is_(None),
    ]
    result = await session.execute(
        select(JobMatch, Job)
        .join(Job, JobMatch.job_id == Job.id)
        .where(*delivery_conditions)
        .order_by(
            JobMatch.score.desc().nulls_last(),
            JobMatch.heuristic_score.desc().nulls_last(),
        )
        .limit(TOP_N)
    )
    rows = list(result.all())
    if rows:
        return rows

    # Fallback: top-scored matches not yet emailed (for test mode / legacy)
    fallback_conditions = [
        JobMatch.user_id == uid,
        JobMatch.passed_hard_filter.is_(True),
        JobMatch.score.isnot(None),
    ]
    if not include_emailed:
        fallback_conditions.append(JobMatch.emailed_at.is_(None))
    result = await session.execute(
        select(JobMatch, Job)
        .join(Job, JobMatch.job_id == Job.id)
        .where(*fallback_conditions)
        .order_by(JobMatch.score.desc())
        .limit(TOP_N)
    )
    return list(result.all())


def _to_digest_item(match: JobMatch, job: Job) -> JobDigestItem:
    return JobDigestItem(
        title=job.title,
        company=job.company,
        url=job.url,
        score=match.score,
        reasoning=match.reasoning,
        work_mode=job.work_mode,
        location_raw=job.location_raw,
        salary_min=job.salary_min,
        salary_max=job.salary_max,
        salary_currency=job.salary_currency,
    )
