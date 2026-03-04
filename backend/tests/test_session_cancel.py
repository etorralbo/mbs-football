"""
Integration tests for PATCH /v1/workout-sessions/{session_id}/cancel.

Covers:
 - RBAC: COACH-only, athlete → 403, unauthenticated → 401
 - Business rules: completed → 409, has logs → 409
 - Idempotency: cancelling twice → 204 both times
 - Listing exclusion: cancelled sessions hidden from both coach and athlete
 - Tenant isolation: cross-team cancel → 404
"""
import uuid
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Exercise, Membership, Role, Team, UserProfile, WorkoutTemplate
from app.models.workout_assignment import AssignmentTargetType, WorkoutAssignment
from app.models.workout_session import WorkoutSession
from app.models.workout_session_log import WorkoutSessionLog

HEADERS = {"Authorization": "Bearer test-token"}
SESSIONS_ENDPOINT = "/v1/workout-sessions"


# ---------------------------------------------------------------------------
# Local fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def template_a(db_session: Session, team_a: Team) -> WorkoutTemplate:
    t = WorkoutTemplate(id=uuid.uuid4(), team_id=team_a.id, title="Cancel Test Tpl")
    db_session.add(t)
    db_session.commit()
    db_session.refresh(t)
    return t


@pytest.fixture
def assignment_a(
    db_session: Session, team_a: Team, template_a: WorkoutTemplate, coach_a: UserProfile,
) -> WorkoutAssignment:
    a = WorkoutAssignment(
        id=uuid.uuid4(),
        team_id=team_a.id,
        workout_template_id=template_a.id,
        target_type=AssignmentTargetType.TEAM,
    )
    db_session.add(a)
    db_session.commit()
    db_session.refresh(a)
    return a


@pytest.fixture
def session_a(
    db_session: Session,
    assignment_a: WorkoutAssignment,
    athlete_a: UserProfile,
    template_a: WorkoutTemplate,
) -> WorkoutSession:
    s = WorkoutSession(
        id=uuid.uuid4(),
        assignment_id=assignment_a.id,
        athlete_id=athlete_a.id,
        workout_template_id=template_a.id,
    )
    db_session.add(s)
    db_session.commit()
    db_session.refresh(s)
    return s


@pytest.fixture
def coach_b_user(db_session: Session, team_b: Team) -> UserProfile:
    coach = UserProfile(
        id=uuid.uuid4(),
        supabase_user_id=uuid.uuid4(),
        team_id=team_b.id,
        role=Role.COACH,
        name="Coach Beta",
    )
    db_session.add(coach)
    db_session.flush()
    db_session.add(Membership(
        id=uuid.uuid4(),
        user_id=coach.supabase_user_id,
        team_id=team_b.id,
        role=Role.COACH,
    ))
    db_session.commit()
    db_session.refresh(coach)
    return coach


def _cancel_url(session_id: uuid.UUID) -> str:
    return f"{SESSIONS_ENDPOINT}/{session_id}/cancel"


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestCancelSessionAuth:
    """RBAC and authentication tests."""

    def test_unauthenticated_cannot_cancel(
        self, client: TestClient, session_a: WorkoutSession,
    ):
        r = client.patch(_cancel_url(session_a.id))
        assert r.status_code == 401

    def test_athlete_cannot_cancel(
        self, client: TestClient, mock_jwt, session_a: WorkoutSession,
        athlete_a: UserProfile,
    ):
        mock_jwt(str(athlete_a.supabase_user_id))
        r = client.patch(_cancel_url(session_a.id), headers=HEADERS)
        assert r.status_code == 403


class TestCancelSessionHappyPath:
    """Coach can cancel a not-started session."""

    def test_coach_can_cancel_not_started_session(
        self, client: TestClient, mock_jwt, coach_a: UserProfile,
        session_a: WorkoutSession,
    ):
        mock_jwt(str(coach_a.supabase_user_id))
        r = client.patch(_cancel_url(session_a.id), headers=HEADERS)
        assert r.status_code == 204

    def test_cancel_is_idempotent(
        self, client: TestClient, mock_jwt, coach_a: UserProfile,
        session_a: WorkoutSession,
    ):
        mock_jwt(str(coach_a.supabase_user_id))
        r1 = client.patch(_cancel_url(session_a.id), headers=HEADERS)
        r2 = client.patch(_cancel_url(session_a.id), headers=HEADERS)
        assert r1.status_code == 204
        assert r2.status_code == 204


class TestCancelSessionGuards:
    """Cannot cancel sessions with activity."""

    def test_cannot_cancel_completed_session(
        self, client: TestClient, mock_jwt, db_session: Session,
        coach_a: UserProfile, session_a: WorkoutSession,
    ):
        session_a.completed_at = datetime.now(tz=timezone.utc)
        db_session.add(session_a)
        db_session.commit()

        mock_jwt(str(coach_a.supabase_user_id))
        r = client.patch(_cancel_url(session_a.id), headers=HEADERS)
        assert r.status_code == 409
        assert "completed" in r.json()["detail"].lower()

    def test_cannot_cancel_session_with_logs(
        self, client: TestClient, mock_jwt, db_session: Session,
        coach_a: UserProfile, session_a: WorkoutSession,
        exercise_team_a: Exercise, team_a: Team,
    ):
        log = WorkoutSessionLog(
            id=uuid.uuid4(),
            session_id=session_a.id,
            team_id=team_a.id,
            block_name="Primary Strength",
            exercise_id=exercise_team_a.id,
        )
        db_session.add(log)
        db_session.commit()

        mock_jwt(str(coach_a.supabase_user_id))
        r = client.patch(_cancel_url(session_a.id), headers=HEADERS)
        assert r.status_code == 409
        assert "activity" in r.json()["detail"].lower()


class TestCancelSessionListExclusion:
    """Cancelled sessions must be hidden from listings."""

    def test_cancelled_session_excluded_from_coach_list(
        self, client: TestClient, mock_jwt, coach_a: UserProfile,
        session_a: WorkoutSession,
    ):
        mock_jwt(str(coach_a.supabase_user_id))

        # Before cancel — visible
        r1 = client.get(SESSIONS_ENDPOINT, headers=HEADERS)
        assert len(r1.json()) == 1

        # Cancel
        client.patch(_cancel_url(session_a.id), headers=HEADERS)

        # After cancel — hidden
        r2 = client.get(SESSIONS_ENDPOINT, headers=HEADERS)
        assert r2.json() == []

    def test_cancelled_session_excluded_from_athlete_list(
        self, client: TestClient, mock_jwt, coach_a: UserProfile,
        athlete_a: UserProfile, session_a: WorkoutSession,
    ):
        # Coach cancels
        mock_jwt(str(coach_a.supabase_user_id))
        client.patch(_cancel_url(session_a.id), headers=HEADERS)

        # Athlete lists — empty
        mock_jwt(str(athlete_a.supabase_user_id))
        r = client.get(SESSIONS_ENDPOINT, headers=HEADERS)
        assert r.json() == []


class TestCancelSessionTenantIsolation:
    """Cross-tenant cancel must return 404."""

    def test_cross_tenant_cancel_returns_404(
        self, client: TestClient, mock_jwt, session_a: WorkoutSession,
        coach_b_user: UserProfile,
    ):
        mock_jwt(str(coach_b_user.supabase_user_id))
        r = client.patch(_cancel_url(session_a.id), headers=HEADERS)
        assert r.status_code == 404
