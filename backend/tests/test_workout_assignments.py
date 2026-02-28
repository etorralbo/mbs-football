"""
TDD RED phase — integration tests for workout assignment endpoints.

Endpoints under test:
    POST   /v1/workout-assignments
    GET    /v1/workout-sessions
    PATCH  /v1/workout-sessions/{id}/complete

All tests are expected to FAIL because the routes and models do not exist yet.
"""
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Role, Team, UserProfile, WorkoutTemplate

HEADERS = {"Authorization": "Bearer test-token"}
ASSIGN_ENDPOINT = "/v1/workout-assignments"
SESSIONS_ENDPOINT = "/v1/workout-sessions"


# ---------------------------------------------------------------------------
# Local fixtures (supplement conftest.py without modifying it)
# ---------------------------------------------------------------------------

@pytest.fixture
def workout_template_a(db_session: Session, team_a: Team) -> WorkoutTemplate:
    """WorkoutTemplate belonging to team A."""
    template = WorkoutTemplate(
        id=uuid.uuid4(),
        team_id=team_a.id,
        title="Team A Workout",
    )
    db_session.add(template)
    db_session.commit()
    db_session.refresh(template)
    return template


@pytest.fixture
def workout_template_b(db_session: Session, team_b: Team) -> WorkoutTemplate:
    """WorkoutTemplate belonging to team B (different tenant)."""
    template = WorkoutTemplate(
        id=uuid.uuid4(),
        team_id=team_b.id,
        title="Team B Workout",
    )
    db_session.add(template)
    db_session.commit()
    db_session.refresh(template)
    return template


@pytest.fixture
def athlete_b(db_session: Session, team_b: Team) -> UserProfile:
    """Athlete user belonging to team B."""
    athlete = UserProfile(
        id=uuid.uuid4(),
        supabase_user_id=uuid.uuid4(),
        team_id=team_b.id,
        role=Role.ATHLETE,
        name="Athlete Beta",
    )
    db_session.add(athlete)
    db_session.commit()
    db_session.refresh(athlete)
    return athlete


@pytest.fixture
def athlete_a2(db_session: Session, team_a: Team) -> UserProfile:
    """Second athlete in team A (needed for team-wide assignment counting)."""
    athlete = UserProfile(
        id=uuid.uuid4(),
        supabase_user_id=uuid.uuid4(),
        team_id=team_a.id,
        role=Role.ATHLETE,
        name="Athlete Alpha 2",
    )
    db_session.add(athlete)
    db_session.commit()
    db_session.refresh(athlete)
    return athlete


# ---------------------------------------------------------------------------
# A/B) Authentication & onboarding guards
# ---------------------------------------------------------------------------

class TestAssignmentAuth:
    """Authentication and onboarding guards for POST /v1/workout-assignments."""

    def test_requires_auth(
        self, client: TestClient, workout_template_a: WorkoutTemplate
    ):
        """A) Missing token → 401."""
        response = client.post(
            ASSIGN_ENDPOINT,
            json={
                "workout_template_id": str(workout_template_a.id),
                "target": {"type": "team"},
            },
        )
        assert response.status_code == 401

    def test_not_onboarded_returns_403(
        self,
        client: TestClient,
        mock_jwt,
        workout_template_a: WorkoutTemplate,
    ):
        """B) Valid token but no UserProfile (not onboarded) → 403."""
        mock_jwt(str(uuid.uuid4()))

        response = client.post(
            ASSIGN_ENDPOINT,
            headers=HEADERS,
            json={
                "workout_template_id": str(workout_template_a.id),
                "target": {"type": "team"},
            },
        )

        assert response.status_code == 403


# ---------------------------------------------------------------------------
# C) Role guard
# ---------------------------------------------------------------------------

class TestAssignmentRoleGuard:
    """Only COACHes may create assignments."""

    def test_athlete_cannot_assign(
        self,
        client: TestClient,
        mock_jwt,
        athlete_a: UserProfile,
        workout_template_a: WorkoutTemplate,
    ):
        """C) ATHLETE role → 403."""
        mock_jwt(str(athlete_a.supabase_user_id))

        response = client.post(
            ASSIGN_ENDPOINT,
            headers=HEADERS,
            json={
                "workout_template_id": str(workout_template_a.id),
                "target": {"type": "team"},
            },
        )

        assert response.status_code == 403


# ---------------------------------------------------------------------------
# D/E) Tenant isolation
# ---------------------------------------------------------------------------

class TestAssignmentTenantIsolation:
    """Cross-tenant resource access must return 404 without leaking existence."""

    def test_template_from_other_team_returns_404(
        self,
        client: TestClient,
        mock_jwt,
        coach_a: UserProfile,
        workout_template_b: WorkoutTemplate,
    ):
        """D) workout_template_id belongs to another team → 404."""
        mock_jwt(str(coach_a.supabase_user_id))

        response = client.post(
            ASSIGN_ENDPOINT,
            headers=HEADERS,
            json={
                "workout_template_id": str(workout_template_b.id),
                "target": {"type": "team"},
            },
        )

        assert response.status_code == 404

    def test_athlete_from_other_team_returns_404(
        self,
        client: TestClient,
        mock_jwt,
        coach_a: UserProfile,
        workout_template_a: WorkoutTemplate,
        athlete_b: UserProfile,
    ):
        """E) athlete_id belongs to another team → 404."""
        mock_jwt(str(coach_a.supabase_user_id))

        response = client.post(
            ASSIGN_ENDPOINT,
            headers=HEADERS,
            json={
                "workout_template_id": str(workout_template_a.id),
                "target": {"type": "athlete", "athlete_id": str(athlete_b.id)},
            },
        )

        assert response.status_code == 404


# ---------------------------------------------------------------------------
# F/G) Session creation counts
# ---------------------------------------------------------------------------

class TestAssignmentCreate:
    """Happy-path: correct number of WorkoutSessions created."""

    def test_assign_to_athlete_creates_one_session(
        self,
        client: TestClient,
        mock_jwt,
        coach_a: UserProfile,
        workout_template_a: WorkoutTemplate,
        athlete_a: UserProfile,
    ):
        """F) Assigning to a single athlete → sessions_created == 1."""
        mock_jwt(str(coach_a.supabase_user_id))

        response = client.post(
            ASSIGN_ENDPOINT,
            headers=HEADERS,
            json={
                "workout_template_id": str(workout_template_a.id),
                "target": {"type": "athlete", "athlete_id": str(athlete_a.id)},
            },
        )

        assert response.status_code == 201
        data = response.json()
        assert "assignment_id" in data
        uuid.UUID(data["assignment_id"])  # must be a valid UUID
        assert data["sessions_created"] == 1

    def test_assign_to_team_creates_one_session_per_athlete(
        self,
        client: TestClient,
        mock_jwt,
        coach_a: UserProfile,
        workout_template_a: WorkoutTemplate,
        athlete_a: UserProfile,
        athlete_a2: UserProfile,
    ):
        """G) Assigning to team with 2 athletes → sessions_created == 2."""
        mock_jwt(str(coach_a.supabase_user_id))

        response = client.post(
            ASSIGN_ENDPOINT,
            headers=HEADERS,
            json={
                "workout_template_id": str(workout_template_a.id),
                "target": {"type": "team"},
            },
        )

        assert response.status_code == 201
        data = response.json()
        assert "assignment_id" in data
        assert data["sessions_created"] == 2

    def test_assign_with_optional_scheduled_date(
        self,
        client: TestClient,
        mock_jwt,
        coach_a: UserProfile,
        workout_template_a: WorkoutTemplate,
        athlete_a: UserProfile,
    ):
        """scheduled_for is optional; when provided it is accepted (201)."""
        mock_jwt(str(coach_a.supabase_user_id))

        response = client.post(
            ASSIGN_ENDPOINT,
            headers=HEADERS,
            json={
                "workout_template_id": str(workout_template_a.id),
                "target": {"type": "athlete", "athlete_id": str(athlete_a.id)},
                "scheduled_for": "2026-02-24",
            },
        )

        assert response.status_code == 201
        assert response.json()["sessions_created"] == 1


# ---------------------------------------------------------------------------
# H) Session listing
# ---------------------------------------------------------------------------

class TestSessionList:
    """GET /v1/workout-sessions — tenant and role-based filtering."""

    def test_athlete_sees_only_own_sessions(
        self,
        client: TestClient,
        mock_jwt,
        coach_a: UserProfile,
        workout_template_a: WorkoutTemplate,
        athlete_a: UserProfile,
        athlete_a2: UserProfile,
    ):
        """H) After a team-wide assignment, an athlete only sees their own session."""
        # Coach assigns the template to the whole team (both athletes receive a session)
        mock_jwt(str(coach_a.supabase_user_id))
        assign_response = client.post(
            ASSIGN_ENDPOINT,
            headers=HEADERS,
            json={
                "workout_template_id": str(workout_template_a.id),
                "target": {"type": "team"},
            },
        )
        assert assign_response.status_code == 201
        assert assign_response.json()["sessions_created"] == 2

        # athlete_a queries their sessions — must only see 1 (their own)
        mock_jwt(str(athlete_a.supabase_user_id))
        response = client.get(SESSIONS_ENDPOINT, headers=HEADERS)

        assert response.status_code == 200
        sessions = response.json()
        assert isinstance(sessions, list)
        assert len(sessions) == 1
        assert sessions[0]["athlete_id"] == str(athlete_a.id)

    def test_coach_sees_all_team_sessions(
        self,
        client: TestClient,
        mock_jwt,
        coach_a: UserProfile,
        workout_template_a: WorkoutTemplate,
        athlete_a: UserProfile,
        athlete_a2: UserProfile,
    ):
        """COACH fetching sessions sees all sessions for their team."""
        mock_jwt(str(coach_a.supabase_user_id))
        client.post(
            ASSIGN_ENDPOINT,
            headers=HEADERS,
            json={
                "workout_template_id": str(workout_template_a.id),
                "target": {"type": "team"},
            },
        )

        response = client.get(SESSIONS_ENDPOINT, headers=HEADERS)

        assert response.status_code == 200
        assert len(response.json()) == 2


# ---------------------------------------------------------------------------
# I) Session completion
# ---------------------------------------------------------------------------

class TestSessionComplete:
    """PATCH /v1/workout-sessions/{id}/complete — completion rules."""

    def _assign_and_get_session_id(
        self,
        client: TestClient,
        mock_jwt,
        coach: UserProfile,
        template: WorkoutTemplate,
        athlete: UserProfile,
    ) -> str:
        """Helper: assign template to one athlete; return the session ID as coach."""
        mock_jwt(str(coach.supabase_user_id))
        r = client.post(
            ASSIGN_ENDPOINT,
            headers=HEADERS,
            json={
                "workout_template_id": str(template.id),
                "target": {"type": "athlete", "athlete_id": str(athlete.id)},
            },
        )
        assert r.status_code == 201

        sessions_r = client.get(SESSIONS_ENDPOINT, headers=HEADERS)
        assert sessions_r.status_code == 200
        sessions = sessions_r.json()
        assert len(sessions) == 1
        return sessions[0]["id"]

    def test_athlete_can_complete_own_session(
        self,
        client: TestClient,
        mock_jwt,
        coach_a: UserProfile,
        workout_template_a: WorkoutTemplate,
        athlete_a: UserProfile,
        exercise_team_a,
    ):
        """I) Athlete completing their own session (with at least one log) → 204."""
        session_id = self._assign_and_get_session_id(
            client, mock_jwt, coach_a, workout_template_a, athlete_a
        )

        mock_jwt(str(athlete_a.supabase_user_id))
        # Seed a log (server now requires at least one logged set to complete)
        client.put(
            f"{SESSIONS_ENDPOINT}/{session_id}/logs",
            headers=HEADERS,
            json={
                "exercise_id": str(exercise_team_a.id),
                "entries": [{"set_number": 1, "reps": 5}],
            },
        )
        response = client.patch(
            f"{SESSIONS_ENDPOINT}/{session_id}/complete",
            headers=HEADERS,
        )

        assert response.status_code == 204

    def test_athlete_cannot_complete_other_athletes_session(
        self,
        client: TestClient,
        mock_jwt,
        coach_a: UserProfile,
        workout_template_a: WorkoutTemplate,
        athlete_a: UserProfile,
        athlete_a2: UserProfile,
    ):
        """I) Athlete trying to complete someone else's session → 404."""
        session_id = self._assign_and_get_session_id(
            client, mock_jwt, coach_a, workout_template_a, athlete_a2
        )

        mock_jwt(str(athlete_a.supabase_user_id))
        response = client.patch(
            f"{SESSIONS_ENDPOINT}/{session_id}/complete",
            headers=HEADERS,
        )

        assert response.status_code == 404

    def test_coach_can_complete_session_within_team(
        self,
        client: TestClient,
        mock_jwt,
        coach_a: UserProfile,
        workout_template_a: WorkoutTemplate,
        athlete_a: UserProfile,
        exercise_team_a,
    ):
        """COACH can complete any session within their team (with logs) → 204."""
        session_id = self._assign_and_get_session_id(
            client, mock_jwt, coach_a, workout_template_a, athlete_a
        )

        # Seed log as athlete first
        mock_jwt(str(athlete_a.supabase_user_id))
        client.put(
            f"{SESSIONS_ENDPOINT}/{session_id}/logs",
            headers=HEADERS,
            json={
                "exercise_id": str(exercise_team_a.id),
                "entries": [{"set_number": 1, "reps": 5}],
            },
        )

        mock_jwt(str(coach_a.supabase_user_id))
        response = client.patch(
            f"{SESSIONS_ENDPOINT}/{session_id}/complete",
            headers=HEADERS,
        )

        assert response.status_code == 204

    def test_coach_cannot_complete_session_of_other_team(
        self,
        client: TestClient,
        mock_jwt,
        coach_a: UserProfile,
        coach_b: UserProfile,
        workout_template_a: WorkoutTemplate,
        workout_template_b: WorkoutTemplate,
        athlete_a: UserProfile,
        athlete_b: UserProfile,
    ):
        """COACH cannot complete a session belonging to another team's athlete → 404."""
        # Create a session assigned to team B's athlete via coach_b
        session_id = self._assign_and_get_session_id(
            client, mock_jwt, coach_b, workout_template_b, athlete_b
        )

        # coach_a (team A) tries to complete a session that belongs to team B → 404
        mock_jwt(str(coach_a.supabase_user_id))
        response = client.patch(
            f"{SESSIONS_ENDPOINT}/{session_id}/complete",
            headers=HEADERS,
        )

        assert response.status_code == 404


# ---------------------------------------------------------------------------
# Funnel event tracking
# ---------------------------------------------------------------------------

class TestAssignmentCreatedEvent:
    """ASSIGNMENT_CREATED funnel event is inserted on successful assignment."""

    def test_assignment_created_event_inserted(
        self,
        client: TestClient,
        db_session: Session,
        mock_jwt,
        coach_a: UserProfile,
        workout_template_a: WorkoutTemplate,
        athlete_a: UserProfile,
    ) -> None:
        """Successful assignment fires exactly one ASSIGNMENT_CREATED event."""
        from sqlalchemy import select
        from app.domain.events.models import FunnelEvent, ProductEvent

        mock_jwt(str(coach_a.supabase_user_id))
        resp = client.post(
            ASSIGN_ENDPOINT,
            headers=HEADERS,
            json={
                "workout_template_id": str(workout_template_a.id),
                "target": {"type": "athlete", "athlete_id": str(athlete_a.id)},
            },
        )
        assert resp.status_code == 201

        events = db_session.execute(
            select(ProductEvent)
            .where(ProductEvent.event_name == FunnelEvent.ASSIGNMENT_CREATED)
            .where(ProductEvent.team_id == coach_a.team_id)
        ).scalars().all()
        assert len(events) == 1
        ev = events[0]
        assert ev.user_id == coach_a.supabase_user_id
        assert ev.role == "COACH"
        assert "assignment_id" in ev.event_metadata

    def test_assignment_created_event_scoped_to_team(
        self,
        client: TestClient,
        db_session: Session,
        mock_jwt,
        coach_a: UserProfile,
        workout_template_a: WorkoutTemplate,
        athlete_a: UserProfile,
        team_b: Team,
    ) -> None:
        """ASSIGNMENT_CREATED event is stored under team A; team B has zero events."""
        from sqlalchemy import select
        from app.domain.events.models import FunnelEvent, ProductEvent

        mock_jwt(str(coach_a.supabase_user_id))
        resp = client.post(
            ASSIGN_ENDPOINT,
            headers=HEADERS,
            json={
                "workout_template_id": str(workout_template_a.id),
                "target": {"type": "athlete", "athlete_id": str(athlete_a.id)},
            },
        )
        assert resp.status_code == 201

        team_a_events = db_session.execute(
            select(ProductEvent)
            .where(ProductEvent.event_name == FunnelEvent.ASSIGNMENT_CREATED)
            .where(ProductEvent.team_id == coach_a.team_id)
        ).scalars().all()
        assert len(team_a_events) == 1

        team_b_events = db_session.execute(
            select(ProductEvent)
            .where(ProductEvent.event_name == FunnelEvent.ASSIGNMENT_CREATED)
            .where(ProductEvent.team_id == team_b.id)
        ).scalars().all()
        assert len(team_b_events) == 0
