"""
Unit tests for FilterAgent constraint logic.
No database or LLM required — all methods under test are synchronous.
"""

from unittest.mock import MagicMock

import pytest

from agents.filter_agent import FilterAgent
from tests.conftest import make_job, make_profile


@pytest.fixture
def agent() -> FilterAgent:
    return FilterAgent(session=MagicMock())


# ------------------------------------------------------------------
# job_type constraint
# ------------------------------------------------------------------

class TestJobType:
    def test_passes_when_type_in_accepted_list(self, agent):
        result = agent._check_job_type(
            make_job(job_type="full_time"),
            make_profile(job_types=["full_time"]),
        )
        assert result.passed

    def test_fails_when_type_not_accepted(self, agent):
        result = agent._check_job_type(
            make_job(job_type="contract"),
            make_profile(job_types=["full_time"]),
        )
        assert not result.passed
        assert "contract" in result.reason

    def test_passes_when_job_type_missing(self, agent):
        """Missing data gets benefit of the doubt."""
        result = agent._check_job_type(
            make_job(job_type=None),
            make_profile(job_types=["full_time"]),
        )
        assert result.passed

    def test_passes_when_no_constraint_set(self, agent):
        result = agent._check_job_type(
            make_job(job_type="internship"),
            make_profile(job_types=[]),
        )
        assert result.passed

    def test_multiple_accepted_types(self, agent):
        result = agent._check_job_type(
            make_job(job_type="contract"),
            make_profile(job_types=["full_time", "contract"]),
        )
        assert result.passed


# ------------------------------------------------------------------
# work_mode constraint
# ------------------------------------------------------------------

class TestWorkMode:
    def test_passes_when_mode_matches(self, agent):
        result = agent._check_work_mode(
            make_job(work_mode="remote"),
            make_profile(work_modes=["remote"]),
        )
        assert result.passed

    def test_fails_when_mode_not_accepted(self, agent):
        result = agent._check_work_mode(
            make_job(work_mode="onsite"),
            make_profile(work_modes=["remote"]),
        )
        assert not result.passed
        assert "onsite" in result.reason

    def test_passes_when_work_mode_missing(self, agent):
        result = agent._check_work_mode(
            make_job(work_mode=None),
            make_profile(work_modes=["remote"]),
        )
        assert result.passed

    def test_passes_when_no_constraint_set(self, agent):
        result = agent._check_work_mode(
            make_job(work_mode="onsite"),
            make_profile(work_modes=[]),
        )
        assert result.passed

    def test_hybrid_accepted_alongside_remote(self, agent):
        result = agent._check_work_mode(
            make_job(work_mode="hybrid"),
            make_profile(work_modes=["remote", "hybrid"]),
        )
        assert result.passed


# ------------------------------------------------------------------
# location constraint
# ------------------------------------------------------------------

class TestLocation:
    def test_passes_when_city_substring_matches(self, agent):
        result = agent._check_location(
            make_job(location_raw="New York, NY"),
            make_profile(locations=["New York"]),
        )
        assert result.passed

    def test_matching_is_case_insensitive(self, agent):
        result = agent._check_location(
            make_job(location_raw="new york, ny"),
            make_profile(locations=["New York"]),
        )
        assert result.passed

    def test_fails_when_no_location_matches(self, agent):
        result = agent._check_location(
            make_job(location_raw="San Francisco, CA"),
            make_profile(locations=["New York"]),
        )
        assert not result.passed

    def test_remote_job_auto_passes_when_user_accepts_remote(self, agent):
        result = agent._check_location(
            make_job(work_mode="remote", location_raw="San Francisco, CA"),
            make_profile(locations=["New York"], work_modes=["remote"]),
        )
        assert result.passed

    def test_remote_keyword_in_location_auto_passes(self, agent):
        result = agent._check_location(
            make_job(work_mode=None, location_raw="Remote"),
            make_profile(locations=["New York"], work_modes=["remote"]),
        )
        assert result.passed

    def test_passes_when_no_location_constraint(self, agent):
        result = agent._check_location(
            make_job(location_raw="Anywhere"),
            make_profile(locations=[]),
        )
        assert result.passed

    def test_passes_when_job_location_is_missing(self, agent):
        result = agent._check_location(
            make_job(location_raw=None),
            make_profile(locations=["New York"]),
        )
        assert result.passed


# ------------------------------------------------------------------
# apply_constraints — full pipeline
# ------------------------------------------------------------------

class TestApplyConstraints:
    def test_all_constraints_pass(self, agent):
        result = agent._apply_constraints(make_job(), make_profile())
        assert result.passed
        assert result.reason is None

    def test_fails_on_wrong_job_type(self, agent):
        result = agent._apply_constraints(
            make_job(job_type="internship"),
            make_profile(job_types=["full_time"]),
        )
        assert not result.passed

    def test_fails_on_wrong_work_mode(self, agent):
        result = agent._apply_constraints(
            make_job(work_mode="onsite"),
            make_profile(work_modes=["remote"]),
        )
        assert not result.passed

    def test_fails_on_wrong_location(self, agent):
        result = agent._apply_constraints(
            make_job(location_raw="London, UK", work_mode="onsite"),
            make_profile(locations=["New York"], work_modes=["remote", "onsite"]),
        )
        assert not result.passed

    def test_short_circuits_on_first_failure(self, agent):
        """job_type fails first — reason must mention job_type, not location."""
        result = agent._apply_constraints(
            make_job(job_type="internship", location_raw="London"),
            make_profile(job_types=["full_time"], locations=["New York"]),
        )
        assert not result.passed
        assert "internship" in result.reason
