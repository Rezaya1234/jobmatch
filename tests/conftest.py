from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest

from db.models import Job, UserProfile


# ------------------------------------------------------------------
# Model factories — create SQLAlchemy model instances without a DB
# ------------------------------------------------------------------

def make_profile(**kwargs) -> UserProfile:
    defaults = dict(
        work_modes=["remote"],
        locations=["New York"],
        job_types=["full_time"],
        seniority_level="senior",
        salary_min=100_000,
        salary_max=200_000,
        salary_currency="USD",
        preferred_sectors=["fintech"],
        company_type="private",
        preferred_company_sizes=["startup", "small"],
    )
    defaults.update(kwargs)
    return UserProfile(**defaults)


def make_job(**kwargs) -> Job:
    defaults = dict(
        url="https://example.com/job/1",
        title="Senior Backend Engineer",
        company="Acme Corp",
        work_mode="remote",
        job_type="full_time",
        location_raw="New York, NY",
        salary_min=120_000,
        salary_max=180_000,
        salary_currency="USD",
        sector="fintech",
        company_type="private",
        company_size="startup",
        description="We are hiring a senior backend engineer.",
        source="web_search",
    )
    defaults.update(kwargs)
    return Job(**defaults)


# ------------------------------------------------------------------
# Mock DB session
# ------------------------------------------------------------------

def make_mock_session() -> AsyncMock:
    """Return an AsyncMock that behaves like an AsyncSession."""
    session = AsyncMock()

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_result.scalars.return_value.all.return_value = []
    mock_result.all.return_value = []
    session.execute = AsyncMock(return_value=mock_result)
    session.commit = AsyncMock()
    session.add = MagicMock()

    # refresh sets timestamps so Pydantic response models don't fail
    async def _refresh(obj):
        now = datetime.now(timezone.utc)
        for attr in ("created_at", "updated_at"):
            if getattr(obj, attr, None) is None:
                setattr(obj, attr, now)

    session.refresh = _refresh
    return session


@pytest.fixture
def mock_session() -> AsyncMock:
    return make_mock_session()
