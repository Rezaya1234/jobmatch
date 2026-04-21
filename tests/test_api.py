"""
API smoke tests — mocked DB session, no real database required.
"""

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from api.deps import get_session
from main import app
from tests.conftest import make_mock_session


@pytest.fixture
def client():
    mock_session = make_mock_session()

    async def override_session():
        yield mock_session

    app.dependency_overrides[get_session] = override_session

    # Prevent the scheduler from starting/stopping during tests
    with patch("main.scheduler.start"), patch("main.scheduler.stop"):
        with TestClient(app) as c:
            yield c

    app.dependency_overrides.clear()


# ------------------------------------------------------------------
# Health
# ------------------------------------------------------------------

def test_health_check(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


# ------------------------------------------------------------------
# Users
# ------------------------------------------------------------------

def test_create_user_valid_email(client):
    response = client.post("/users", json={"email": "test@example.com"})
    assert response.status_code == 201

def test_create_user_invalid_email_returns_422(client):
    response = client.post("/users", json={"email": "not-an-email"})
    assert response.status_code == 422

def test_create_user_missing_email_returns_422(client):
    response = client.post("/users", json={})
    assert response.status_code == 422

def test_get_user_not_found(client):
    response = client.get("/users/00000000-0000-0000-0000-000000000000")
    assert response.status_code == 404

def test_get_profile_not_found(client):
    response = client.get("/users/00000000-0000-0000-0000-000000000000/profile")
    assert response.status_code == 404


# ------------------------------------------------------------------
# Matches
# ------------------------------------------------------------------

def test_list_matches_returns_200(client):
    response = client.get("/users/00000000-0000-0000-0000-000000000000/matches")
    assert response.status_code == 200
    assert response.json() == []

def test_list_matches_min_score_too_high_returns_422(client):
    response = client.get("/users/some-id/matches?min_score=1.5")
    assert response.status_code == 422

def test_list_matches_negative_score_returns_422(client):
    response = client.get("/users/some-id/matches?min_score=-0.1")
    assert response.status_code == 422


# ------------------------------------------------------------------
# Feedback
# ------------------------------------------------------------------

def test_submit_feedback_invalid_rating_returns_422(client):
    response = client.post(
        "/users/some-id/feedback",
        json={"job_id": "some-job-id", "rating": "maybe"},
    )
    assert response.status_code == 422

def test_submit_feedback_missing_job_id_returns_422(client):
    response = client.post(
        "/users/some-id/feedback",
        json={"rating": "thumbs_up"},
    )
    assert response.status_code == 422

def test_list_feedback_returns_200(client):
    response = client.get("/users/00000000-0000-0000-0000-000000000000/feedback")
    assert response.status_code == 200
    assert response.json() == []


# ------------------------------------------------------------------
# Pipeline
# ------------------------------------------------------------------

def test_trigger_daily_pipeline_returns_202(client):
    response = client.post("/pipeline/daily")
    assert response.status_code == 202
    assert response.json()["status"] == "accepted"

def test_trigger_feedback_pipeline_returns_202(client):
    response = client.post("/pipeline/feedback/00000000-0000-0000-0000-000000000000")
    assert response.status_code == 202
    assert response.json()["status"] == "accepted"
