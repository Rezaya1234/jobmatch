import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_llm, get_session
from db.activity import log_event
from db.models import User, UserProfile
from llm.client import LLMClient

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/users", tags=["users"])


# ------------------------------------------------------------------
# Request / response schemas
# ------------------------------------------------------------------

class CreateUserRequest(BaseModel):
    email: EmailStr


class UserResponse(BaseModel):
    id: str
    email: str
    created_at: datetime
    is_new: bool = False


class ProfileRequest(BaseModel):
    # Hard constraints
    work_modes: list[str]   # ["remote", "hybrid", "onsite"]
    locations: list[str]    # ["New York", "San Francisco"] — empty = anywhere
    job_types: list[str]    # ["full_time"]
    preferred_companies: list[str] = []  # ["Google", "OpenAI"] — empty = any company
    excluded_companies: list[str] = []   # companies to always skip
    visa_sponsorship_required: bool = False  # skip jobs that explicitly deny sponsorship
    visa_types: list[str] | None = None     # multi-select visa status

    # Soft preferences
    seniority_level: str | None = None
    salary_min: int | None = None
    salary_max: int | None = None
    salary_currency: str = "USD"
    preferred_sectors: list[str] = []
    company_type: str | None = None
    preferred_company_sizes: list[str] = []
    role_description: str | None = None
    original_role_description: str | None = None
    title_include: list[str] = []
    title_exclude: list[str] = []
    years_experience: int | None = None
    role_type: str | None = None  # "ic", "manager", "executive", "either"
    linkedin_url: str | None = None
    avatar_url: str | None = None
    display_name: str | None = None
    profile_complete: bool | None = None  # only written on explicit "Looks good" confirmation


class ProfileResponse(ProfileRequest):
    id: str
    user_id: str
    profile_complete: bool = False
    created_at: datetime
    updated_at: datetime


class NotificationPrefsRequest(BaseModel):
    weekly_recap: bool = True
    new_matches: bool = True
    product_updates: bool = False


class NotificationPrefsResponse(BaseModel):
    weekly_recap: bool
    new_matches: bool
    product_updates: bool


# ------------------------------------------------------------------
# Routes
# ------------------------------------------------------------------

@router.post("", response_model=UserResponse, status_code=status.HTTP_200_OK)
async def create_user(
    body: CreateUserRequest,
    session: AsyncSession = Depends(get_session),
) -> UserResponse:
    result = await session.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()
    is_new = user is None
    if is_new:
        user = User(email=body.email)
        session.add(user)
        await session.commit()
        await session.refresh(user)
    return _user_response(user, is_new=is_new)


@router.get("/by-email", response_model=UserResponse)
async def get_user_by_email(
    email: str,
    session: AsyncSession = Depends(get_session),
) -> UserResponse:
    result = await session.execute(select(User).where(User.email == email.strip().lower()))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No account found for that email")
    return _user_response(user)



@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: str,
    session: AsyncSession = Depends(get_session),
) -> UserResponse:
    user = await _get_user_or_404(user_id, session)
    return _user_response(user)


@router.post(
    "/{user_id}/profile",
    response_model=ProfileResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upsert_profile(
    user_id: str,
    body: ProfileRequest,
    session: AsyncSession = Depends(get_session),
) -> ProfileResponse:
    await _get_user_or_404(user_id, session)

    result = await session.execute(
        select(UserProfile).where(UserProfile.user_id == user_id)
    )
    profile = result.scalar_one_or_none()

    if profile is None:
        profile = UserProfile(user_id=user_id)
        session.add(profile)
    else:
        profile.profile_version = (profile.profile_version or 1) + 1

    update_data = body.model_dump()
    if update_data.get('profile_complete') is None:
        update_data.pop('profile_complete', None)
    for field, value in update_data.items():
        setattr(profile, field, value)

    await session.commit()
    await session.refresh(profile)
    return _profile_response(profile)


@router.get("/{user_id}/profile", response_model=ProfileResponse)
async def get_profile(
    user_id: str,
    session: AsyncSession = Depends(get_session),
) -> ProfileResponse:
    await _get_user_or_404(user_id, session)
    result = await session.execute(
        select(UserProfile).where(UserProfile.user_id == user_id)
    )
    profile = result.scalar_one_or_none()
    if profile is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Profile not found")
    return _profile_response(profile)


@router.post("/{user_id}/profile/parse", response_model=ProfileRequest)
async def parse_profile_from_text(
    user_id: str,
    text: str = Form(default=""),
    resume: UploadFile | None = File(default=None),
    llm: LLMClient = Depends(get_llm),
    session: AsyncSession = Depends(get_session),
) -> ProfileRequest:
    """Use Claude to extract structured profile fields from free text and/or a PDF resume."""
    await _get_user_or_404(user_id, session)

    combined = text.strip()

    if resume and resume.filename:
        try:
            from pypdf import PdfReader
            import io
            pdf_bytes = await resume.read(10 * 1024 * 1024)  # 10 MB limit
            if len(pdf_bytes) >= 10 * 1024 * 1024:
                raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Resume must be under 10 MB.")
            reader = PdfReader(io.BytesIO(pdf_bytes))
            resume_text = "\n".join(page.extract_text() or "" for page in reader.pages)
            if resume_text.strip():
                combined = combined + "\n\n--- RESUME ---\n" + resume_text
        except Exception as e:
            logger.warning("Failed to parse PDF: %s", e)

    if not combined:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Provide text or a resume file.")

    prompt = f"""Extract job search preferences from the text below and return ONLY a JSON object.

Text:
{combined}

Return a JSON object with exactly these keys (use null if unknown):
{{
  "work_modes": ["remote"|"hybrid"|"onsite"],
  "job_types": ["full_time"|"part_time"|"contract"|"internship"],
  "locations": ["country or city strings, e.g. United States"],
  "seniority_level": "junior"|"mid"|"senior"|"staff"|"principal"|null,
  "salary_min": integer or null,
  "salary_max": integer or null,
  "salary_currency": "USD",
  "preferred_sectors": ["e.g. Technology", "Finance"],
  "company_type": "public"|"private"|null,
  "preferred_company_sizes": ["startup"|"small"|"medium"|"large"],
  "preferred_companies": ["exact company names if mentioned, e.g. Google, OpenAI, Anthropic"],
  "role_description": "2-3 sentence summary covering: their professional background and key skills, years/level of experience, and what kind of role/company they want next. This will be used to match them to jobs, so be specific about their skills and background."
}}

Rules:
- work_modes default to ["remote"] if not specified
- job_types default to ["full_time"] if not specified
- locations default to ["United States"] if not specified
- Extract skills, titles, and interests to determine preferred_sectors
- "large corporation" or "enterprise" → preferred_company_sizes: ["large"]
- "startup" → preferred_company_sizes: ["startup"]
- Return ONLY the JSON, no explanation."""

    from llm.client import Message, ModelTier
    response = await llm.complete(
        [Message(role="user", content=prompt)],
        tier=ModelTier.FAST,
        max_tokens=800,
    )
    raw = response.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    try:
        data = json.loads(raw)
    except Exception:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, detail="AI returned invalid JSON.")

    # Fetch existing profile to preserve original_role_description
    existing = await session.execute(select(UserProfile).where(UserProfile.user_id == user_id))
    existing_profile = existing.scalar_one_or_none()
    role_desc = data.get("role_description")

    return ProfileRequest(
        work_modes=data.get("work_modes") or ["remote"],
        job_types=data.get("job_types") or ["full_time"],
        locations=data.get("locations") or ["United States"],
        seniority_level=data.get("seniority_level"),
        salary_min=data.get("salary_min"),
        salary_max=data.get("salary_max"),
        salary_currency=data.get("salary_currency") or "USD",
        preferred_sectors=data.get("preferred_sectors") or [],
        company_type=data.get("company_type"),
        preferred_company_sizes=data.get("preferred_company_sizes") or [],
        preferred_companies=data.get("preferred_companies") or [],
        role_description=role_desc,
        # Lock in original only if it hasn't been set before
        original_role_description=role_desc if (
            existing_profile is None or not existing_profile.original_role_description
        ) else existing_profile.original_role_description,
    )


# ------------------------------------------------------------------
# Notification preferences
# ------------------------------------------------------------------

@router.get("/{user_id}/notification-prefs", response_model=NotificationPrefsResponse)
async def get_notification_prefs(
    user_id: str,
    session: AsyncSession = Depends(get_session),
) -> NotificationPrefsResponse:
    user = await _get_user_or_404(user_id, session)
    prefs = user.notification_prefs or {}
    return NotificationPrefsResponse(
        weekly_recap=prefs.get("weekly_recap", True),
        new_matches=prefs.get("new_matches", True),
        product_updates=prefs.get("product_updates", False),
    )


@router.patch("/{user_id}/notification-prefs", response_model=NotificationPrefsResponse)
async def update_notification_prefs(
    user_id: str,
    body: NotificationPrefsRequest,
    session: AsyncSession = Depends(get_session),
) -> NotificationPrefsResponse:
    user = await _get_user_or_404(user_id, session)
    user.notification_prefs = {
        "weekly_recap": body.weekly_recap,
        "new_matches": body.new_matches,
        "product_updates": body.product_updates,
    }
    await session.commit()
    return NotificationPrefsResponse(**user.notification_prefs)


# ------------------------------------------------------------------
# Engagement tracking
# ------------------------------------------------------------------

@router.post("/{user_id}/engage", status_code=204, include_in_schema=False)
async def record_engagement(
    user_id: str,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
    llm: LLMClient = Depends(get_llm),
) -> None:
    """Called by the frontend on Dashboard mount. Records engagement and triggers on-demand matching."""
    result = await session.execute(select(UserProfile).where(UserProfile.user_id == user_id))
    profile = result.scalar_one_or_none()
    if profile is not None:
        now = datetime.now(timezone.utc)
        last = profile.last_engaged_at
        profile.last_engaged_at = now
        await log_event(session, user_id, "dashboard_visit")
        await session.commit()
        # Only run on-demand matching once per day.
        from datetime import timedelta
        if last is None or (now - last) > timedelta(hours=24):
            background_tasks.add_task(_run_on_demand_matching, user_id, llm)


async def _run_on_demand_matching(user_id: str, llm: LLMClient) -> None:
    from db.database import AsyncSessionLocal
    from agents.orchestrator import OrchestratorAgent
    async with AsyncSessionLocal() as session:
        try:
            await OrchestratorAgent(session, llm).run_user_on_demand(user_id)
        except Exception:
            logger.exception("On-demand matching failed for user %s", user_id)


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------

async def _get_user_or_404(user_id: str, session: AsyncSession) -> User:
    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


def _user_response(user: User, is_new: bool = False) -> UserResponse:
    return UserResponse(id=str(user.id), email=user.email, created_at=user.created_at, is_new=is_new)


def _profile_response(profile: UserProfile) -> ProfileResponse:
    return ProfileResponse(
        id=str(profile.id),
        user_id=str(profile.user_id),
        work_modes=profile.work_modes or [],
        locations=profile.locations or [],
        job_types=profile.job_types or [],
        seniority_level=profile.seniority_level,
        salary_min=profile.salary_min,
        salary_max=profile.salary_max,
        salary_currency=profile.salary_currency,
        preferred_sectors=profile.preferred_sectors or [],
        company_type=profile.company_type,
        preferred_company_sizes=profile.preferred_company_sizes or [],
        preferred_companies=profile.preferred_companies or [],
        excluded_companies=profile.excluded_companies or [],
        visa_sponsorship_required=profile.visa_sponsorship_required or False,
        visa_types=profile.visa_types,
        role_description=profile.role_description,
        original_role_description=profile.original_role_description,
        title_include=profile.title_include or [],
        title_exclude=profile.title_exclude or [],
        years_experience=getattr(profile, "years_experience", None),
        role_type=getattr(profile, "role_type", None),
        linkedin_url=getattr(profile, "linkedin_url", None),
        avatar_url=getattr(profile, "avatar_url", None),
        display_name=getattr(profile, "display_name", None),
        profile_complete=profile.profile_complete or False,
        created_at=profile.created_at,
        updated_at=profile.updated_at,
    )
