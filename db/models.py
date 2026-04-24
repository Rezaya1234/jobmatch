import enum
import uuid

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.sql import func


class Base(DeclarativeBase):
    pass


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class WorkMode(str, enum.Enum):
    remote = "remote"
    onsite = "onsite"
    hybrid = "hybrid"


class JobType(str, enum.Enum):
    full_time = "full_time"
    part_time = "part_time"
    contract = "contract"
    internship = "internship"


class CompanyType(str, enum.Enum):
    public = "public"
    private = "private"
    unknown = "unknown"


class CompanySize(str, enum.Enum):
    startup = "startup"    # 1–50
    small = "small"        # 51–200
    medium = "medium"      # 201–1 000
    large = "large"        # 1 001+
    unknown = "unknown"


class SeniorityLevel(str, enum.Enum):
    junior = "junior"
    mid = "mid"
    senior = "senior"
    staff = "staff"
    principal = "principal"
    unknown = "unknown"


class FeedbackRating(str, enum.Enum):
    thumbs_up = "thumbs_up"
    thumbs_down = "thumbs_down"


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    profile: Mapped["UserProfile"] = relationship(back_populates="user", uselist=False)
    matches: Mapped[list["JobMatch"]] = relationship(back_populates="user")
    feedbacks: Mapped[list["Feedback"]] = relationship(back_populates="user")
    signals: Mapped[list["FeedbackSignal"]] = relationship(back_populates="user")


class UserProfile(Base):
    """Stores both hard constraints and soft preferences for a user."""

    __tablename__ = "user_profiles"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False
    )

    # --- Hard constraints (filtering agent uses these) ---
    work_modes: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, default=list)
    locations: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, default=list)
    job_types: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, default=list)
    visa_sponsorship_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    excluded_companies: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, default=list, server_default="{}")

    # --- Soft preferences ---
    seniority_level: Mapped[str | None] = mapped_column(String(50), nullable=True)
    salary_min: Mapped[int | None] = mapped_column(Integer, nullable=True)
    salary_max: Mapped[int | None] = mapped_column(Integer, nullable=True)
    salary_currency: Mapped[str] = mapped_column(String(10), nullable=False, default="USD")
    preferred_sectors: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, default=list)
    company_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    preferred_company_sizes: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, default=list)
    preferred_companies: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, default=list)
    role_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    original_role_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    years_experience: Mapped[int | None] = mapped_column(Integer, nullable=True)
    role_type: Mapped[str | None] = mapped_column(String(20), nullable=True)  # ic/manager/executive/either

    # Title keyword filters (hard constraints)
    title_include: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, default=list)
    title_exclude: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, default=list)

    # LinkedIn integration
    linkedin_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    display_name: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Cold start + adaptive weight management
    cold_start: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    feedback_signal_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    learned_weights: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # Engagement tracking
    last_engaged_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_emailed_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    user: Mapped["User"] = relationship(back_populates="profile")


class Job(Base):
    """Raw job posting scraped from the web. Deduplicated by URL."""

    __tablename__ = "jobs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    url: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    company: Mapped[str] = mapped_column(String(255), nullable=False)
    location_raw: Mapped[str | None] = mapped_column(String(255), nullable=True)
    work_mode: Mapped[str | None] = mapped_column(String(50), nullable=True)
    job_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    salary_min: Mapped[int | None] = mapped_column(Integer, nullable=True)
    salary_max: Mapped[int | None] = mapped_column(Integer, nullable=True)
    salary_currency: Mapped[str | None] = mapped_column(String(10), nullable=True)
    sector: Mapped[str | None] = mapped_column(String(255), nullable=True)
    company_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    company_size: Mapped[str | None] = mapped_column(String(50), nullable=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    source: Mapped[str] = mapped_column(String(100), nullable=False)
    source_company: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    posted_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    scraped_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    matches: Mapped[list["JobMatch"]] = relationship(back_populates="job")
    feedbacks: Mapped[list["Feedback"]] = relationship(back_populates="job")
    signals: Mapped[list["FeedbackSignal"]] = relationship(back_populates="job")


class JobMatch(Base):
    """Result of the matching pipeline for a specific user + job pair."""

    __tablename__ = "job_matches"
    __table_args__ = (UniqueConstraint("user_id", "job_id", name="uq_user_job_match"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    job_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False
    )

    # Filter agent output
    passed_hard_filter: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    hard_filter_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Pre-LLM scoring (search agent layer)
    heuristic_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    embedding_score: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Multi-head LLM scoring (match agent output)
    dimension_scores: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    weights_used: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    weighted_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    normalized_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    score: Mapped[float | None] = mapped_column(Float, nullable=True)  # = normalized_score, kept for backward compat
    reasoning: Mapped[str | None] = mapped_column(Text, nullable=True)
    low_confidence: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")

    # Delivery + recap tracking (shown memory — permanent, never cleared)
    shown_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    delivered_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    emailed_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    recap_sent_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user: Mapped["User"] = relationship(back_populates="matches")
    job: Mapped["Job"] = relationship(back_populates="matches")
    feedback: Mapped["Feedback | None"] = relationship(back_populates="match")


class Feedback(Base):
    """Thumbs up/down + optional comment from a user on a job."""

    __tablename__ = "feedback"
    __table_args__ = (UniqueConstraint("user_id", "job_id", name="uq_user_job_feedback"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    job_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False
    )
    match_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("job_matches.id", ondelete="SET NULL"), nullable=True
    )
    rating: Mapped[str] = mapped_column(String(20), nullable=False)  # thumbs_up | thumbs_down
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    weight: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 1=passive click, 2=explicit button

    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user: Mapped["User"] = relationship(back_populates="feedbacks")
    job: Mapped["Job"] = relationship(back_populates="feedbacks")
    match: Mapped["JobMatch | None"] = relationship(back_populates="feedback")


class FeedbackSignal(Base):
    """High-value engagement signals: click, applied, interview.
    Separate from Feedback to avoid conflicting with the thumbs unique constraint."""

    __tablename__ = "feedback_signals"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    job_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False
    )
    signal_type: Mapped[str] = mapped_column(String(20), nullable=False)  # click | applied | interview
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user: Mapped["User"] = relationship(back_populates="signals")
    job: Mapped["Job"] = relationship(back_populates="signals")


class ActivityLog(Base):
    """Audit log for every user action and system event."""

    __tablename__ = "activity_log"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    event_type: Mapped[str] = mapped_column(String(50), nullable=False)
    meta: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class CompanyInsight(Base):
    """Pre-computed weekly hiring intelligence per company."""

    __tablename__ = "company_insights"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    slug: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    company_name: Mapped[str] = mapped_column(String(255), nullable=False)

    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    hiring_outlook: Mapped[str | None] = mapped_column(String(20), nullable=True)
    hiring_outlook_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    interview_difficulty: Mapped[int | None] = mapped_column(Integer, nullable=True)
    response_rate: Mapped[str | None] = mapped_column(String(20), nullable=True)
    time_to_hire: Mapped[str | None] = mapped_column(String(50), nullable=True)
    hiring_trend: Mapped[str | None] = mapped_column(String(10), nullable=True)
    overall_rating: Mapped[float | None] = mapped_column(Float, nullable=True)
    rating_source: Mapped[str | None] = mapped_column(String(100), nullable=True)
    pros: Mapped[list | None] = mapped_column(JSON, nullable=True)
    cons: Mapped[list | None] = mapped_column(JSON, nullable=True)
    signals: Mapped[list | None] = mapped_column(JSON, nullable=True)
    hiring_areas: Mapped[list | None] = mapped_column(JSON, nullable=True)
    risks: Mapped[list | None] = mapped_column(JSON, nullable=True)

    active_job_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    logo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    website: Mapped[str | None] = mapped_column(String(500), nullable=True)
    hq_location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    company_size: Mapped[str | None] = mapped_column(String(50), nullable=True)
    company_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    sector: Mapped[str | None] = mapped_column(String(255), nullable=True)

    generated_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
