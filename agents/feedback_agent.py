"""
Feedback Agent — converts user signals into learned dimension weights + profile updates.
Weight updates are rule-based (no LLM cost). Profile text updates use LLM.
"""
import json
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from agents.match_agent import ALLOWED_DIMENSIONS
from agents.profile_agent import DEFAULT_WEIGHTS
from db.models import Feedback, FeedbackSignal, Job, JobMatch, UserProfile
from llm.client import LLMClient, Message, ModelTier

logger = logging.getLogger(__name__)

_MIN_FEEDBACK = 3
_RETRAINING_THRESHOLD = 5
_IMMEDIATE_SIGNAL_TYPES = {"applied", "interview"}
_WEIGHT_MIN = 0.05
_WEIGHT_MAX = 0.50

# Signal values for weight adjustment strength
SIGNAL_VALUES: dict[str, int] = {
    "thumbs_up": 2,
    "thumbs_down": -2,
    "click": 1,
    "applied": 3,
    "interview": 4,
}

_PROFILE_UPDATE_SYSTEM = """\
You are a job preference analyst. Analyze feedback patterns and return ONLY a JSON object — no prose, no markdown.

Fields you may update (omit any where feedback gives no clear signal):
  preferred_sectors       (array of strings)
  company_type            ("public", "private", or null)
  preferred_company_sizes (array of: "startup", "small", "medium", "large")
  seniority_level         ("junior", "mid", "senior", "staff", "principal", or null)
  salary_min              (integer or null)
  salary_max              (integer or null)
  role_description        (string) — rewrite to reflect what the candidate ACTUALLY wants based on patterns
  reasoning               (string) — brief summary of signals observed

Rules:
- thumbs_up = liked; thumbs_down = disliked. Comments carry extra weight.
- weight=2 = explicit button press (strong signal); weight=1 = passive click (weak).
- Only update fields with 2+ clear data points.
- role_description: synthesize patterns from liked AND disliked jobs. Be concrete.
- Return {} if signals are mixed or insufficient."""


class FeedbackAgent:
    def __init__(self, session: AsyncSession, llm: LLMClient) -> None:
        self._session = session
        self._llm = llm

    async def run(self, user_id: str, signal_type: str | None = None) -> bool:
        """
        Process feedback and update weights + profile.
        signal_type: if 'applied' or 'interview', triggers immediately regardless of count.
        Returns True if any update was made.
        """
        feedback_rows = await self._get_all_feedback(user_id)
        total_signals = len(feedback_rows)

        immediate = signal_type in _IMMEDIATE_SIGNAL_TYPES
        enough = total_signals >= _RETRAINING_THRESHOLD

        if not immediate and not enough:
            logger.info("User %s: %d signals, below threshold %d — skipping",
                        user_id, total_signals, _RETRAINING_THRESHOLD)
            return False

        if total_signals < _MIN_FEEDBACK:
            logger.info("User %s: only %d feedback items (min %d) — skipping",
                        user_id, total_signals, _MIN_FEEDBACK)
            return False

        profile = await self._get_profile(user_id)
        if profile is None:
            logger.warning("No profile for user %s — skipping feedback agent", user_id)
            return False

        # Update dimension weights (rule-based, no LLM cost)
        new_weights = _update_weights(profile, feedback_rows)

        # Update profile text (LLM)
        profile_updates: dict = {}
        try:
            profile_updates = await self._extract_profile_signals(feedback_rows, profile)
        except Exception:
            logger.exception("LLM profile extraction failed for user %s", user_id)

        # Apply changes
        changed = False
        from db.activity import log_event

        old_weights = dict(profile.learned_weights or DEFAULT_WEIGHTS)
        if new_weights != old_weights:
            profile.learned_weights = new_weights
            profile.weights_version = (profile.weights_version or 0) + 1
            changed = True
            await log_event(
                self._session, user_id, "weights_updated",
                weights=new_weights,
                weights_before=old_weights,
                signal_count=total_signals,
                weights_version=profile.weights_version,
                cold_start=profile.cold_start,
            )

        if profile_updates:
            changes = _apply_profile_updates(profile, profile_updates)
            if changes:
                changed = True
                await log_event(
                    self._session, user_id, "profile_updated",
                    changes=changes,
                    reasoning=profile_updates.get("reasoning", ""),
                    snapshot=_format_profile(profile),
                )

        # Update signal count and graduate from cold start
        profile.feedback_signal_count = total_signals
        if profile.cold_start and total_signals >= 5:
            profile.cold_start = False
            logger.info("User %s graduated from cold start (%d signals)", user_id, total_signals)
            changed = True
            await log_event(
                self._session, user_id, "cold_start_graduated",
                signal_count=total_signals,
            )

        if changed:
            await self._session.commit()

        return changed

    # ------------------------------------------------------------------
    # LLM profile text update (keeps existing behavior)
    # ------------------------------------------------------------------

    async def _extract_profile_signals(
        self, feedback_rows: list[dict], profile: UserProfile
    ) -> dict:
        current = _format_profile(profile)
        prompt = (
            f"Current soft preferences:\n{json.dumps(current, indent=2)}\n\n"
            f"Feedback history ({len(feedback_rows)} items):\n"
            + json.dumps(feedback_rows, indent=2)
        )
        response = await self._llm.complete(
            messages=[Message(role="user", content=prompt)],
            system=_PROFILE_UPDATE_SYSTEM,
            tier=ModelTier.STANDARD,
        )
        return _parse_json_object(response)

    # ------------------------------------------------------------------
    # DB helpers
    # ------------------------------------------------------------------

    async def _get_all_feedback(self, user_id: str) -> list[dict]:
        """Combine thumbs feedback + high-value signals for weight calculation."""
        rows: list[dict] = []

        # Explicit thumbs up/down
        result = await self._session.execute(
            select(Feedback, Job)
            .join(Job, Feedback.job_id == Job.id)
            .where(Feedback.user_id == user_id)
            .order_by(Feedback.created_at.desc())
        )
        for fb, job in result.all():
            match_result = await self._session.execute(
                select(JobMatch).where(
                    JobMatch.user_id == user_id,
                    JobMatch.job_id == job.id,
                )
            )
            match = match_result.scalar_one_or_none()
            rows.append({
                "rating": fb.rating,
                "weight": fb.weight or 2,
                "comment": fb.comment,
                "job_title": job.title,
                "company": job.company,
                "sector": job.sector,
                "company_type": job.company_type,
                "company_size": job.company_size,
                "salary_min": job.salary_min,
                "salary_max": job.salary_max,
                "work_mode": job.work_mode,
                "description_snippet": (job.description or "")[:300],
                "dimension_scores": match.dimension_scores if match else None,
            })

        # High-value signals (click, applied, interview)
        sig_result = await self._session.execute(
            select(FeedbackSignal, Job)
            .join(Job, FeedbackSignal.job_id == Job.id)
            .where(FeedbackSignal.user_id == user_id)
            .order_by(FeedbackSignal.created_at.desc())
        )
        for sig, job in sig_result.all():
            match_result = await self._session.execute(
                select(JobMatch).where(
                    JobMatch.user_id == user_id,
                    JobMatch.job_id == job.id,
                )
            )
            match = match_result.scalar_one_or_none()
            rows.append({
                "rating": sig.signal_type,
                "weight": SIGNAL_VALUES.get(sig.signal_type, 1),
                "comment": None,
                "job_title": job.title,
                "company": job.company,
                "sector": job.sector,
                "company_type": job.company_type,
                "company_size": job.company_size,
                "salary_min": job.salary_min,
                "salary_max": job.salary_max,
                "work_mode": job.work_mode,
                "description_snippet": (job.description or "")[:300],
                "dimension_scores": match.dimension_scores if match else None,
            })

        return rows

    async def _get_profile(self, user_id: str) -> UserProfile | None:
        result = await self._session.execute(
            select(UserProfile).where(UserProfile.user_id == user_id)
        )
        return result.scalar_one_or_none()


# ---------------------------------------------------------------------------
# Rule-based weight management
# ---------------------------------------------------------------------------

def _extract_dim_score(v) -> float | None:
    """Handle both new {score, ...} format and legacy float values."""
    if isinstance(v, dict):
        return v.get("score")
    if isinstance(v, (int, float)):
        return float(v)
    return None


def _update_weights(profile: UserProfile, feedback_rows: list[dict]) -> dict:
    current = dict(profile.learned_weights or DEFAULT_WEIGHTS)
    for d in ALLOWED_DIMENSIONS:
        if d not in current:
            current[d] = DEFAULT_WEIGHTS[d]

    adjustments = {d: 0.0 for d in ALLOWED_DIMENSIONS}

    for row in feedback_rows:
        signal_val = SIGNAL_VALUES.get(row["rating"], 0)
        if signal_val == 0:
            continue

        # Applied/interview: boost weights of highest-scoring dimensions proportionally
        if row["rating"] in _IMMEDIATE_SIGNAL_TYPES:
            dim_scores: dict = row.get("dimension_scores") or {}
            if dim_scores:
                sorted_dims = sorted(
                    [
                        (d, _extract_dim_score(v))
                        for d, v in dim_scores.items()
                        if d in ALLOWED_DIMENSIONS and _extract_dim_score(v) is not None
                    ],
                    key=lambda x: x[1],
                    reverse=True,
                )
                boost_factor = abs(signal_val) / 4.0
                for rank, (dim, _) in enumerate(sorted_dims[:3]):
                    adjustments[dim] += 0.03 * (3 - rank) * boost_factor

        # Comment-based adjustments
        comment = (row.get("comment") or "").lower()
        if any(k in comment for k in ("too senior", "over-qualified", "senior")):
            adjustments["experience_level"] -= 0.02 * abs(signal_val)
        if any(k in comment for k in ("salary", "pay", "compensation", "low pay")):
            adjustments["salary"] += 0.02 * abs(signal_val) if signal_val > 0 else -0.01
        if any(k in comment for k in ("wrong function", "function", "role type")):
            adjustments["function_type"] += 0.015 * abs(signal_val)
        if any(k in comment for k in ("trajectory", "growth", "career path")):
            adjustments["career_trajectory"] += 0.015 * abs(signal_val)
        if any(k in comment for k in ("industry", "sector", "domain")):
            adjustments["industry_alignment"] += 0.015 * abs(signal_val)

        # Thumbs up/down: general skills signal
        if row["rating"] == "thumbs_up":
            adjustments["skills_match"] += 0.01
        elif row["rating"] == "thumbs_down":
            adjustments["skills_match"] -= 0.005

    # Apply adjustments, enforce drift bounds, normalize
    new_weights = {d: max(_WEIGHT_MIN, min(_WEIGHT_MAX, current[d] + adjustments[d])) for d in ALLOWED_DIMENSIONS}
    return _normalize_weights(new_weights)


def _normalize_weights(weights: dict) -> dict:
    total = sum(weights.values())
    if total <= 0:
        return DEFAULT_WEIGHTS.copy()
    return {d: round(v / total, 4) for d, v in weights.items()}


# ---------------------------------------------------------------------------
# Profile update helpers
# ---------------------------------------------------------------------------

def _apply_profile_updates(profile: UserProfile, updates: dict) -> dict:
    changes = {}
    for field in ("preferred_sectors", "company_type", "preferred_company_sizes",
                  "seniority_level", "salary_min", "salary_max", "role_description"):
        if field in updates:
            before = getattr(profile, field)
            after = updates[field]
            if before != after:
                changes[field] = {"before": before, "after": after}
            setattr(profile, field, after)
    return changes


def _format_profile(profile: UserProfile) -> dict:
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
        return {}
    try:
        data = json.loads(text[start: end + 1])
        return data if isinstance(data, dict) else {}
    except json.JSONDecodeError:
        return {}
