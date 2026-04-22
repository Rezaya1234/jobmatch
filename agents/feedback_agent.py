import json
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import Feedback, Job, UserProfile
from llm.client import LLMClient, Message, ModelTier

logger = logging.getLogger(__name__)

_MIN_FEEDBACK = 3   # minimum feedback items needed before updating the profile

_SYSTEM = """\
You are a job preference analyst. You will receive a candidate's current profile and their \
feedback history (thumbs up/down + optional comments) on job listings.

Analyze the patterns and return ONLY a JSON object — no prose, no markdown fences — \
with updated fields based on what you observe.

Fields you may update (omit any where feedback gives no clear signal):
  preferred_sectors       (array of strings)
  company_type            ("public", "private", or null)
  preferred_company_sizes (array of: "startup", "small", "medium", "large")
  seniority_level         ("junior", "mid", "senior", "staff", "principal", or null)
  salary_min              (integer or null)
  salary_max              (integer or null)
  role_description        (string) — rewrite this to reflect what the candidate ACTUALLY wants,
                           based on their feedback patterns. Be specific: include the types of
                           roles, companies, domains, and responsibilities they keep liking vs
                           rejecting. This is the most important field — it directly drives scoring.
  reasoning               (string) — brief summary of signals observed

Rules:
- thumbs_up = liked; thumbs_down = disliked. Comments carry extra weight.
- weight=2 means an explicit button press (strong signal); weight=1 means a passive click (weak signal). Treat weight-2 items with more confidence.
- Only update a field when you see a clear repeated pattern (2+ data points).
- For role_description: synthesize patterns from liked AND disliked jobs. What does this
  person consistently gravitate toward? What do they keep rejecting? Be concrete.
- Return {} if there are truly no reliable signals."""


class FeedbackAgent:
    """
    Reads thumbs up/down + comments from the feedback table, uses the LLM to
    extract preference signals, then updates the user's soft preferences.
    """

    def __init__(self, session: AsyncSession, llm: LLMClient) -> None:
        self._session = session
        self._llm = llm

    async def run(self, user_id: str) -> bool:
        """
        Process all feedback for a user and update soft preferences.
        Returns True if the profile was updated.
        """
        feedback_rows = await self._get_feedback_with_jobs(user_id)

        if len(feedback_rows) < _MIN_FEEDBACK:
            logger.info(
                "User %s has %d feedback items (min %d) — skipping",
                user_id, len(feedback_rows), _MIN_FEEDBACK,
            )
            return False

        profile = await self._get_profile(user_id)
        if profile is None:
            logger.warning("No profile for user %s — skipping feedback", user_id)
            return False

        try:
            updates = await self._extract_signals(feedback_rows, profile)
        except Exception:
            logger.exception("Signal extraction failed for user %s", user_id)
            return False

        if not updates:
            logger.info("No reliable signals found for user %s", user_id)
            return False

        self._apply_updates(profile, updates)
        await self._session.commit()
        logger.info("Updated profile for user %s: %s", user_id, updates.get("reasoning", ""))
        return True

    # ------------------------------------------------------------------
    # LLM call
    # ------------------------------------------------------------------

    async def _extract_signals(
        self,
        feedback_rows: list[dict],
        profile: UserProfile,
    ) -> dict:
        current_prefs = _format_current_profile(profile)
        prompt = (
            f"Current soft preferences:\n{json.dumps(current_prefs, indent=2)}\n\n"
            f"Feedback history ({len(feedback_rows)} items):\n"
            + json.dumps(feedback_rows, indent=2)
        )

        response = await self._llm.complete(
            messages=[Message(role="user", content=prompt)],
            system=_SYSTEM,
            tier=ModelTier.STANDARD,
        )

        return _parse_json_object(response)

    # ------------------------------------------------------------------
    # Profile update
    # ------------------------------------------------------------------

    def _apply_updates(self, profile: UserProfile, updates: dict) -> None:
        for field in ("preferred_sectors", "company_type", "preferred_company_sizes",
                      "seniority_level", "salary_min", "salary_max", "role_description"):
            if field in updates:
                setattr(profile, field, updates[field])

    # ------------------------------------------------------------------
    # DB helpers
    # ------------------------------------------------------------------

    async def _get_feedback_with_jobs(self, user_id: str) -> list[dict]:
        """Return feedback rows joined with job details, newest first."""
        result = await self._session.execute(
            select(Feedback, Job)
            .join(Job, Feedback.job_id == Job.id)
            .where(Feedback.user_id == user_id)
            .order_by(Feedback.created_at.desc())
        )
        rows = []
        for feedback, job in result.all():
            rows.append({
                "rating": feedback.rating,
                "weight": feedback.weight or 1,
                "comment": feedback.comment or None,
                "job_title": job.title,
                "company": job.company,
                "sector": job.sector,
                "company_type": job.company_type,
                "company_size": job.company_size,
                "salary_min": job.salary_min,
                "salary_max": job.salary_max,
                "work_mode": job.work_mode,
                "description_snippet": (job.description or "")[:300],
            })
        return rows

    async def _get_profile(self, user_id: str) -> UserProfile | None:
        result = await self._session.execute(
            select(UserProfile).where(UserProfile.user_id == user_id)
        )
        return result.scalar_one_or_none()


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------

def _format_current_profile(profile: UserProfile) -> dict:
    return {
        "role_description": profile.role_description,
        "seniority_level": profile.seniority_level,
        "salary_min": profile.salary_min,
        "salary_max": profile.salary_max,
        "salary_currency": profile.salary_currency,
        "preferred_sectors": profile.preferred_sectors,
        "company_type": profile.company_type,
        "preferred_company_sizes": profile.preferred_company_sizes,
    }


def _parse_json_object(text: str) -> dict:
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        logger.warning("No JSON object in feedback agent response")
        return {}
    try:
        data = json.loads(text[start : end + 1])
        return data if isinstance(data, dict) else {}
    except json.JSONDecodeError:
        logger.warning("Failed to parse JSON object from feedback agent response")
        return {}
