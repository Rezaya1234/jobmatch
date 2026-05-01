"""
Profile Agent — cold start initialization and profile enrichment status.
Sets default dimension weights for new users and manages cold start graduation.
"""
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from agents.embeddings import embed_single
from db.models import UserProfile


def build_intent_query(profile: UserProfile) -> str:
    """
    Build an intent-weighted text query for embedding.

    HIGH:    role_description, title_include (repeated for semantic weight)
    MEDIUM:  seniority_level, work_modes
    EXCLUDED: preferred_sectors, preferred_companies — industry history and
              employer names skew the embedding toward past experience rather
              than future intent.
    """
    parts = []

    if profile.role_description:
        parts.append(profile.role_description)

    if profile.title_include:
        skill_text = ", ".join(profile.title_include)
        parts.append(f"Skills and roles: {skill_text}")
        parts.append(f"Looking for: {skill_text}")

    if profile.seniority_level and profile.seniority_level != "unknown":
        parts.append(f"{profile.seniority_level} level position")

    if profile.work_modes:
        parts.append(f"Work mode: {', '.join(profile.work_modes)}")

    return " ".join(parts) or "software engineer"


async def update_profile_embedding(profile: UserProfile, session: AsyncSession) -> None:
    """Embed the profile's intent query and persist to profile_embedding."""
    text = build_intent_query(profile)
    vector = await embed_single(text)
    if vector is not None:
        profile.profile_embedding = vector
        await session.commit()
        logger.info("Profile embedding updated for user %s", profile.user_id)

logger = logging.getLogger(__name__)

# Default weights for cold start users (fewer than 5 feedback signals)
DEFAULT_WEIGHTS: dict[str, float] = {
    "skills_match": 0.30,
    "experience_level": 0.15,
    "salary": 0.15,
    "industry_alignment": 0.15,
    "function_type": 0.15,
    "career_trajectory": 0.10,
}

_COLD_START_GRADUATION_THRESHOLD = 5


class ProfileAgent:
    """Handles cold start initialization for new users."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def initialize_cold_start(self, user_id: str) -> None:
        """Called when a user profile is first created. Sets default weights."""
        profile = await self._get_profile(user_id)
        if profile is None:
            return
        if profile.learned_weights is None:
            profile.cold_start = True
            profile.feedback_signal_count = 0
            profile.learned_weights = None  # use defaults until signals accumulate
            await self._session.commit()
            logger.info("Cold start initialized for user %s", user_id)

    async def check_graduation(self, user_id: str, signal_count: int) -> bool:
        """Marks user as graduated from cold start once threshold is reached."""
        profile = await self._get_profile(user_id)
        if profile is None:
            return False
        if profile.cold_start and signal_count >= _COLD_START_GRADUATION_THRESHOLD:
            profile.cold_start = False
            profile.feedback_signal_count = signal_count
            await self._session.commit()
            logger.info("User %s graduated from cold start (%d signals)", user_id, signal_count)
            return True
        profile.feedback_signal_count = signal_count
        await self._session.commit()
        return False

    async def get_weights(self, user_id: str) -> dict[str, float]:
        """Return current weights for a user — defaults if cold start."""
        profile = await self._get_profile(user_id)
        if profile is None or profile.cold_start or not profile.learned_weights:
            return DEFAULT_WEIGHTS.copy()
        return profile.learned_weights

    async def _get_profile(self, user_id: str) -> UserProfile | None:
        result = await self._session.execute(
            select(UserProfile).where(UserProfile.user_id == user_id)
        )
        return result.scalar_one_or_none()
