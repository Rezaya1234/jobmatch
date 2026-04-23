import enum
import uuid

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
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
    # Stored as string arrays; values must match enum members
    work_modes: Mapped[list[str]] = mapped_column(
        ARRAY(String), nullable=False, default=list
    )
    locations: Mapped[list[str]] = mapped_column(
        ARRAY(String), nullable=False, default=list
    )
    job_types: Mapped[list[str]] = mapped_column(
        ARRAY(String), nullable=False, default=list
    )

    # --- Soft preferences (matching agent uses these for LLM ranking) ---
    seniority_level: Mapped[str | None] = mapped_column(String(50), nullable=True)
    salary_min: Mapped[int | None] = mapped_column(Integer, nullable=True)
    salary_max: Mapped[int | None] = mapped_column(Integer, nullable=True)
    salary_currency: Mapped[str] = mapped_column(String(10), nullable=False, default="USD")
    preferred_sectors: Mapped[list[str]] = mapped_column(
        ARRAY(String), nullable=False, default=list
    )
    company_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    preferred_company_sizes: Mapped[list[str]] = mapped_column(
        ARRAY(String), nullable=False, default=list
    )
    preferred_companies: Mapped[list[str]] = mapped_column(
        ARRAY(String), nullable=False, default=list
    )
    role_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    original_role_description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Title keyword filters (hard constraints)
    title_include: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, default=list)
    title_exclude: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, default=list)

    # Engagement tracking — used to determine email send frequency
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

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    url: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    company: Mapped[str] = mapped_column(String(255), nullable=False)

    # Raw location string from the posting (e.g. "New York, NY" or "Remote")
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
    scraped_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    matches: Mapped[list["JobMatch"]] = relationship(back_populates="job")
    feedbacks: Mapped[list["Feedback"]] = relationship(back_populates="job")


class JobMatch(Base):
    """Result of the matching agent for a specific user + job pair."""

    __tablename__ = "job_matches"
    __table_args__ = (UniqueConstraint("user_id", "job_id", name="uq_user_job_match"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    job_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False
    )

    # Filtering agent output
    passed_hard_filter: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    hard_filter_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Matching agent output
    score: Mapped[float | None] = mapped_column(Float, nullable=True)  # 0.0–1.0
    reasoning: Mapped[str | None] = mapped_column(Text, nullable=True)

    emailed_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    user: Mapped["User"] = relationship(back_populates="matches")
    job: Mapped["Job"] = relationship(back_populates="matches")
    feedback: Mapped["Feedback | None"] = relationship(back_populates="match")


class Feedback(Base):
    """Thumbs up/down + optional comment from a user on a job."""

    __tablename__ = "feedback"
    __table_args__ = (UniqueConstraint("user_id", "job_id", name="uq_user_job_feedback"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
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
    weight: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 1 = passive click, 2 = explicit button

    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    user: Mapped["User"] = relationship(back_populates="feedbacks")
    job: Mapped["Job"] = relationship(back_populates="feedbacks")
    match: Mapped["JobMatch | None"] = relationship(back_populates="feedback")
