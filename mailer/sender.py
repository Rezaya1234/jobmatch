import asyncio
import logging
import os
import uuid
from datetime import datetime, timezone

from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import Job, JobMatch, User
from mailer.templates import JobDigestItem, build_html, build_plain_text

logger = logging.getLogger(__name__)

TOP_N = int(os.getenv("DIGEST_TOP_N", "10"))
FROM_EMAIL = os.getenv("FROM_EMAIL", "digest@jobmatch.app")
FROM_NAME = os.getenv("FROM_NAME", "JobMatch")
BACKEND_URL = os.getenv("BACKEND_URL", "").rstrip("/")


async def send_daily_digest(user_id: str, session: AsyncSession) -> int:
    """
    Build and send the daily digest for one user.
    Returns 1 on success, 0 if nothing to send or on failure.
    """
    user = await _get_user(user_id, session)
    if user is None:
        logger.warning("User %s not found — skipping email", user_id)
        return 0

    matches = await _get_top_matches(user_id, session)
    if not matches:
        logger.info("No scored matches to email for user %s", user_id)
        return 0

    items = [_to_digest_item(match, job) for match, job in matches]
    date_str = datetime.now(timezone.utc).strftime("%B %d, %Y")

    html = build_html(user.email, items, date_str)
    plain = build_plain_text(user.email, items, date_str)
    subject = f"Your {len(items)} top job match{'es' if len(items) != 1 else ''} — {date_str}"

    try:
        await asyncio.to_thread(_send_via_sendgrid, user.email, subject, html, plain)
    except Exception:
        logger.exception("SendGrid call failed for user %s", user_id)
        return 0

    # Mark all sent matches so they aren't re-sent tomorrow
    now = datetime.now(timezone.utc)
    for match, _ in matches:
        match.emailed_at = now
    await session.commit()

    logger.info("Digest sent to %s (%d jobs)", user.email, len(items))
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
        raise RuntimeError(
            f"SendGrid returned {response.status_code}: {response.body}"
        )


# ------------------------------------------------------------------
# DB helpers
# ------------------------------------------------------------------

async def _get_user(user_id: str, session: AsyncSession) -> User | None:
    uid = uuid.UUID(user_id) if isinstance(user_id, str) else user_id
    result = await session.execute(select(User).where(User.id == uid))
    return result.scalar_one_or_none()


async def _get_top_matches(
    user_id: str, session: AsyncSession
) -> list[tuple[JobMatch, Job]]:
    """Return top-N scored, not-yet-emailed matches joined with their job."""
    uid = uuid.UUID(user_id) if isinstance(user_id, str) else user_id
    result = await session.execute(
        select(JobMatch, Job)
        .join(Job, JobMatch.job_id == Job.id)
        .where(
            JobMatch.user_id == uid,
            JobMatch.passed_hard_filter.is_(True),
            JobMatch.score.isnot(None),
            JobMatch.emailed_at.is_(None),
        )
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
        user_id=str(match.user_id),
        job_id=str(match.job_id),
        feedback_base_url=BACKEND_URL,
    )
