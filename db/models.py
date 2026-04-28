import enum
import uuid
from datetime import date

from sqlalchemy import (
    Boolean,
    Date,
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
    is_admin: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
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
    visa_types: Mapped[list | None] = mapped_column(JSON, nullable=True)
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

    # Profile completion gate
    profile_complete: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")

    # Cold start + adaptive weight management
    cold_start: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    feedback_signal_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    learned_weights: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    profile_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    weights_version: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")

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

    # Phase C — description versioning
    description_hash: Mapped[str | None] = mapped_column(String(32), nullable=True)
    description_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    description_last_changed_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)

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
    is_fallback: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")

    # Pipeline run tracking
    match_run_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)

    # Call 2 — deep per-job analysis (Sonnet, active users only)
    call2_content: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    call2_generated_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    call2_profile_version: Mapped[int | None] = mapped_column(Integer, nullable=True)
    call2_weights_snapshot: Mapped[dict | None] = mapped_column(JSON, nullable=True)

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


class FeedbackEvent(Base):
    """Immutable append-only log of every user feedback signal. Never modified after insert."""

    __tablename__ = "feedback_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    feedback_event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), unique=True, nullable=False, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    job_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False
    )
    signal_type: Mapped[str] = mapped_column(String(30), nullable=False)
    signal_value: Mapped[int] = mapped_column(Integer, nullable=False)
    interaction_source: Mapped[str] = mapped_column(
        String(30), nullable=False, default="dashboard", server_default="dashboard"
    )
    commentary: Mapped[str | None] = mapped_column(Text, nullable=True)
    timestamp: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    user: Mapped["User"] = relationship(back_populates="feedback_events")
    job: Mapped["Job"] = relationship(back_populates="feedback_events")


class JobUserState(Base):
    """Current interaction state for a user-job pair. Updated on each interaction — not immutable."""

    __tablename__ = "job_user_state"
    __table_args__ = (UniqueConstraint("user_id", "job_id", name="uq_job_user_state"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    job_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False
    )
    current_status: Mapped[str] = mapped_column(String(30), nullable=False)
    shown_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_interaction_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    interaction_type: Mapped[str] = mapped_column(String(30), nullable=False)

    user: Mapped["User"] = relationship(back_populates="job_states")
    job: Mapped["Job"] = relationship(back_populates="job_states")


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


class SourceTrustScore(Base):
    """Per-source reliability tracking — updated on every scrape run."""

    __tablename__ = "source_trust_scores"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source_slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    jobs_returned_last: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    jobs_returned_prev: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    parse_success_count: Mapped[float] = mapped_column(Float, nullable=False, default=0.0, server_default="0")
    parse_fail_count: Mapped[float] = mapped_column(Float, nullable=False, default=0.0, server_default="0")
    dead_link_count: Mapped[float] = mapped_column(Float, nullable=False, default=0.0, server_default="0")
    rolling_trust_score: Mapped[float] = mapped_column(Float, nullable=False, default=1.0, server_default="1.0")
    last_scrape_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


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


class CompanyHiringSnapshot(Base):
    """One row per source per day — long-term hiring volume intelligence."""

    __tablename__ = "company_hiring_snapshots"
    __table_args__ = (
        UniqueConstraint("source_slug", "snapshot_date", name="uq_company_snapshot_date"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source_slug: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    snapshot_date: Mapped[date] = mapped_column(Date, nullable=False)
    active_job_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    new_jobs_since_yesterday: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    removed_jobs_since_yesterday: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    jobs_by_department: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    jobs_by_seniority: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    jobs_by_location: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class JobDescriptionHistory(Base):
    """Append-only log of job description changes. New row only when MD5 hash differs."""

    __tablename__ = "job_description_history"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    job_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    description_text: Mapped[str] = mapped_column(Text, nullable=False)
    description_hash: Mapped[str] = mapped_column(String(32), nullable=False)
    version_number: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    valid_from: Mapped[DateTime] = mapped_column(DateTime(timezone=True), nullable=False)
    valid_to: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


# ---------------------------------------------------------------------------
# Admin Dashboard models
# ---------------------------------------------------------------------------

class AgentLog(Base):
    """Append-only log of all agent activity. Feeds the Admin Dashboard activity log."""

    __tablename__ = "agent_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    agent_name: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    log_level: Mapped[str] = mapped_column(String(20), nullable=False, default="INFO")
    message: Mapped[str] = mapped_column(Text, nullable=False)
    details: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    run_id: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    timestamp: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )


class AdminAlert(Base):
    """Active and historical alerts for the admin dashboard."""

    __tablename__ = "admin_alerts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    severity: Mapped[str] = mapped_column(String(20), nullable=False)  # INFO / WARNING / CRITICAL
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    metric_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    metric_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    threshold_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    baseline_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    baseline_comparison: Mapped[str | None] = mapped_column(Text, nullable=True)
    failure_type: Mapped[str | None] = mapped_column(String(20), nullable=True)  # data / model / infra
    triggered_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    dismissed_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    dismissed_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    suppressed_until: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class TestAgentMetrics(Base):
    """Daily snapshot of evaluation metrics with baselines and drift flags."""

    __tablename__ = "test_agent_metrics"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    run_date: Mapped[date] = mapped_column(Date, nullable=False, unique=True, index=True)
    precision_at_50: Mapped[float | None] = mapped_column(Float, nullable=True)
    precision_at_15: Mapped[float | None] = mapped_column(Float, nullable=True)
    recall_at_50: Mapped[float | None] = mapped_column(Float, nullable=True)
    ndcg: Mapped[float | None] = mapped_column(Float, nullable=True)
    coverage: Mapped[float | None] = mapped_column(Float, nullable=True)
    false_positive_rate: Mapped[float | None] = mapped_column(Float, nullable=True)
    sample_size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    confidence_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    drift_flags: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    baseline_7day: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    label_sources: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class AlertThresholds(Base):
    """Editable per-metric alert thresholds. Defaults hard-coded as fallback if table empty."""

    __tablename__ = "alert_thresholds"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    metric_name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    warning_threshold: Mapped[float | None] = mapped_column(Float, nullable=True)
    critical_threshold: Mapped[float | None] = mapped_column(Float, nullable=True)
    updated_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class EvaluatedJob(Base):
    """Ground truth labels for pipeline evaluation. Three sources: LLM, user feedback, human audit."""

    __tablename__ = "evaluated_jobs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    run_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    job_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    label_source: Mapped[str] = mapped_column(String(20), nullable=False)  # LLM / user / human
    relevance_label: Mapped[str] = mapped_column(String(20), nullable=False)  # relevant / not_relevant
    confidence_weight: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    rejection_stage: Mapped[str | None] = mapped_column(String(100), nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    dimension_scores: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    near_miss: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class OrchestrationLog(Base):
    """One row per user per pipeline run. Tracks jobs evaluated, delivered, LLM cost, and fallback depth."""

    __tablename__ = "orchestration_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    match_run_id: Mapped[str] = mapped_column(String(36), nullable=False, unique=True, index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    run_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    jobs_evaluated: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    jobs_delivered: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    llm_calls_made: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    llm_cost_usd: Mapped[float] = mapped_column(Float, nullable=False, default=0.0, server_default="0")
    fallback_triggered: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    fallback_steps_used: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
