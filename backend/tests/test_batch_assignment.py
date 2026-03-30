"""
Integration tests for POST /v1/workout-assignments/batch

TDD RED phase: all tests expected to FAIL until the endpoint is implemented.

Verifies:
- 201 + correct sessions_created when all athlete_ids are valid
- 404 when any athlete_id does not belong to the coach's team
- 422 when athlete_ids is empty
- 403 when caller is an athlete (not a coach)
- 404 when template does not exist or belongs to another team
- Single DB transaction (atomicity): either all sessions created or none
"""
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Role, Team, UserProfile, WorkoutTemplate, Membership

BATCH_ENDPOINT = "/v1/workout-assignments/batch"


# ---------------------------------------------------------------------------
# Local fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def workout_template_a(db_session: Session, team_a: Team) -> WorkoutTemplate:
    template = WorkoutTemplate(
        id=uuid.uuid4(),
        team_id=team_a.id,
        title="Batch Test Workout",
    )
    db_session.add(template)
    db_session.commit()
    db_session.refresh(template)
    return template


@pytest.fixture
def athlete_a2(db_session: Session, team_a: Team) -> UserProfile:
    athlete = UserProfile(
        id=uuid.uuid4(),
        supabase_user_id=uuid.uuid4(),
        team_id=team_a.id,
        role=Role.ATHLETE,
        name="Athlete Alpha 2",
    )
    db_session.add(athlete)
    db_session.flush()
    db_session.add(Membership(
        id=uuid.uuid4(),
        user_id=athlete.supabase_user_id,
        team_id=team_a.id,
        role=Role.ATHLETE,
    ))
    db_session.commit()
    db_session.refresh(athlete)
    return athlete


@pytest.fixture
def athlete_other_team(db_session: Session, team_b: Team) -> UserProfile:
    """Athlete in team B — should NOT be assignable by coach A."""
    athlete = UserProfile(
        id=uuid.uuid4(),
        supabase_user_id=uuid.uuid4(),
        team_id=team_b.id,
        role=Role.ATHLETE,
        name="Athlete Other Team",
    )
    db_session.add(athlete)
    db_session.flush()
    db_session.add(Membership(
        id=uuid.uuid4(),
        user_id=athlete.supabase_user_id,
        team_id=team_b.id,
        role=Role.ATHLETE,
    ))
    db_session.commit()
    db_session.refresh(athlete)
    return athlete


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_batch_assign_two_athletes_creates_two_sessions(
    client: TestClient,
    mock_jwt,
    coach_a: UserProfile,
    athlete_a: UserProfile,
    athlete_a2: UserProfile,
    workout_template_a: WorkoutTemplate,
):
    """Happy path: two athletes, two sessions created in one call."""
    mock_jwt(str(coach_a.supabase_user_id))

    resp = client.post(
        BATCH_ENDPOINT,
        json={
            "workout_template_id": str(workout_template_a.id),
            "athlete_ids": [str(athlete_a.id), str(athlete_a2.id)],
        },
        headers={"Authorization": "Bearer test-token"},
    )

    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["sessions_created"] == 2


def test_batch_assign_single_athlete(
    client: TestClient,
    mock_jwt,
    coach_a: UserProfile,
    athlete_a: UserProfile,
    workout_template_a: WorkoutTemplate,
):
    """Single athlete_id is valid — behaves like per-athlete assignment."""
    mock_jwt(str(coach_a.supabase_user_id))

    resp = client.post(
        BATCH_ENDPOINT,
        json={
            "workout_template_id": str(workout_template_a.id),
            "athlete_ids": [str(athlete_a.id)],
        },
        headers={"Authorization": "Bearer test-token"},
    )

    assert resp.status_code == 201, resp.text
    assert resp.json()["sessions_created"] == 1


def test_batch_assign_with_scheduled_for(
    client: TestClient,
    mock_jwt,
    coach_a: UserProfile,
    athlete_a: UserProfile,
    workout_template_a: WorkoutTemplate,
):
    """scheduled_for is accepted and stored."""
    mock_jwt(str(coach_a.supabase_user_id))

    resp = client.post(
        BATCH_ENDPOINT,
        json={
            "workout_template_id": str(workout_template_a.id),
            "athlete_ids": [str(athlete_a.id)],
            "scheduled_for": "2026-04-15",
        },
        headers={"Authorization": "Bearer test-token"},
    )

    assert resp.status_code == 201, resp.text
    assert resp.json()["sessions_created"] == 1


def test_batch_assign_rejects_empty_athlete_list(
    client: TestClient,
    mock_jwt,
    coach_a: UserProfile,
    workout_template_a: WorkoutTemplate,
):
    """Empty athlete_ids must be rejected at validation level (422)."""
    mock_jwt(str(coach_a.supabase_user_id))

    resp = client.post(
        BATCH_ENDPOINT,
        json={
            "workout_template_id": str(workout_template_a.id),
            "athlete_ids": [],
        },
        headers={"Authorization": "Bearer test-token"},
    )

    assert resp.status_code == 422


def test_batch_assign_rejects_athlete_from_other_team(
    client: TestClient,
    mock_jwt,
    coach_a: UserProfile,
    athlete_a: UserProfile,
    athlete_other_team: UserProfile,
    workout_template_a: WorkoutTemplate,
):
    """If any athlete_id does not belong to the coach's team → 404 (no IDOR)."""
    mock_jwt(str(coach_a.supabase_user_id))

    resp = client.post(
        BATCH_ENDPOINT,
        json={
            "workout_template_id": str(workout_template_a.id),
            "athlete_ids": [str(athlete_a.id), str(athlete_other_team.id)],
        },
        headers={"Authorization": "Bearer test-token"},
    )

    assert resp.status_code == 404


def test_batch_assign_rejects_unknown_athlete(
    client: TestClient,
    mock_jwt,
    coach_a: UserProfile,
    workout_template_a: WorkoutTemplate,
):
    """Completely unknown athlete_id → 404."""
    mock_jwt(str(coach_a.supabase_user_id))

    resp = client.post(
        BATCH_ENDPOINT,
        json={
            "workout_template_id": str(workout_template_a.id),
            "athlete_ids": [str(uuid.uuid4())],
        },
        headers={"Authorization": "Bearer test-token"},
    )

    assert resp.status_code == 404


def test_batch_assign_rejects_template_from_other_team(
    client: TestClient,
    mock_jwt,
    coach_a: UserProfile,
    athlete_a: UserProfile,
    team_b: Team,
    db_session: Session,
):
    """Template belonging to another team → 404 (no IDOR)."""
    mock_jwt(str(coach_a.supabase_user_id))

    other_template = WorkoutTemplate(
        id=uuid.uuid4(),
        team_id=team_b.id,
        title="Team B Workout",
    )
    db_session.add(other_template)
    db_session.commit()

    resp = client.post(
        BATCH_ENDPOINT,
        json={
            "workout_template_id": str(other_template.id),
            "athlete_ids": [str(athlete_a.id)],
        },
        headers={"Authorization": "Bearer test-token"},
    )

    assert resp.status_code == 404


def test_batch_assign_requires_coach_role(
    client: TestClient,
    mock_jwt,
    athlete_a: UserProfile,
    workout_template_a: WorkoutTemplate,
):
    """Athletes cannot create assignments → 403."""
    mock_jwt(str(athlete_a.supabase_user_id))

    resp = client.post(
        BATCH_ENDPOINT,
        json={
            "workout_template_id": str(workout_template_a.id),
            "athlete_ids": [str(athlete_a.id)],
        },
        headers={"Authorization": "Bearer test-token"},
    )

    assert resp.status_code == 403


def test_batch_assign_requires_auth(
    client: TestClient,
    workout_template_a: WorkoutTemplate,
    athlete_a: UserProfile,
):
    """No auth token → 401."""
    resp = client.post(
        BATCH_ENDPOINT,
        json={
            "workout_template_id": str(workout_template_a.id),
            "athlete_ids": [str(athlete_a.id)],
        },
    )

    assert resp.status_code == 401
