"""
RBAC regression matrix — Audit Step 3.

Endpoint × Role matrix
======================

| Endpoint                                    | no-auth | ATHLETE | COACH  | cross-tenant |
|---------------------------------------------|---------|---------|--------|--------------|
| GET  /v1/workout-templates                  | 401 ✓   | 200 ✓   | 200    | (empty list) |
| GET  /v1/workout-templates/{id}             | 401 ✓   | 200     | 200    | 404 ✓        |
| POST /v1/workout-templates                  | 401 ✓   | 403 ✓   | 201    |              |
| PATCH /v1/workout-templates/{id}            | 401 ✓   | 403 ✓   | 200    | 404 ✓        |
| DELETE /v1/workout-templates/{id}           | 401 ✓   | 403 ✓   | 204    |              |
| POST /v1/workout-templates/{id}/blocks      | 401 ✓   | 403 ✓   | 201    |              |
| GET  /v1/workout-sessions                   | 401 ✓   | (own)   | (all)  |              |
| PATCH /v1/workout-sessions/{id}/complete    | 401 ✓   | (own)   | (team) |              |

Endpoints NOT covered here (already covered in dedicated test files):
  - /v1/exercises                 → test_exercises_auth.py
  - /v1/workout-assignments       → test_workout_assignments.py
  - /v1/workout-sessions/{id}/logs → test_workout_execution.py
  - /v1/workout-sessions/{id}     → test_workout_execution.py
  - /v1/workout-templates/from-ai → test_workout_templates_from_ai.py
  - GET /workout-sessions cross-tenant → test_session_list_tenant_isolation.py
"""
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Exercise, Role, Team, UserProfile, WorkoutTemplate
from app.models.workout_assignment import AssignmentTargetType
from app.models import WorkoutAssignment, WorkoutSession

HEADERS = {"Authorization": "Bearer test-token"}
TEMPLATES_ENDPOINT = "/v1/workout-templates"
SESSIONS_ENDPOINT = "/v1/workout-sessions"


# ---------------------------------------------------------------------------
# Local fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def template_a(db_session: Session, team_a: Team) -> WorkoutTemplate:
    """Workout template belonging to team A."""
    t = WorkoutTemplate(id=uuid.uuid4(), team_id=team_a.id, title="Team A Template")
    db_session.add(t)
    db_session.commit()
    db_session.refresh(t)
    return t


@pytest.fixture
def athlete_a2(db_session: Session, team_a: Team) -> UserProfile:
    """Second athlete in team A (same-team peer)."""
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


@pytest.fixture
def session_a(
    db_session: Session,
    athlete_a: UserProfile,
    template_a: WorkoutTemplate,
) -> WorkoutSession:
    """Workout session assigned directly to athlete_a."""
    assignment = WorkoutAssignment(
        id=uuid.uuid4(),
        team_id=athlete_a.team_id,
        workout_template_id=template_a.id,
        target_type=AssignmentTargetType.ATHLETE,
        target_athlete_id=athlete_a.id,
    )
    db_session.add(assignment)
    db_session.flush()

    session = WorkoutSession(
        id=uuid.uuid4(),
        assignment_id=assignment.id,
        athlete_id=athlete_a.id,
        workout_template_id=template_a.id,
    )
    db_session.add(session)
    db_session.commit()
    db_session.refresh(session)
    return session


# ===========================================================================
# 1) Workout Templates — authentication guards (no-auth → 401)
# ===========================================================================


class TestWorkoutTemplatesNoAuth:
    """Every templates endpoint must reject requests without a Bearer token."""

    def test_list_templates_requires_auth(self, client: TestClient):
        """GET /workout-templates without token → 401."""
        response = client.get(TEMPLATES_ENDPOINT)
        assert response.status_code == 401

    def test_create_template_requires_auth(self, client: TestClient):
        """POST /workout-templates without token → 401."""
        response = client.post(TEMPLATES_ENDPOINT, json={"title": "No Auth Template"})
        assert response.status_code == 401

    def test_get_template_requires_auth(self, client: TestClient, template_a: WorkoutTemplate):
        """GET /workout-templates/{id} without token → 401."""
        response = client.get(f"{TEMPLATES_ENDPOINT}/{template_a.id}")
        assert response.status_code == 401

    def test_update_template_requires_auth(
        self, client: TestClient, template_a: WorkoutTemplate
    ):
        """PATCH /workout-templates/{id} without token → 401."""
        response = client.patch(
            f"{TEMPLATES_ENDPOINT}/{template_a.id}", json={"title": "Renamed"}
        )
        assert response.status_code == 401

    def test_delete_template_requires_auth(
        self, client: TestClient, template_a: WorkoutTemplate
    ):
        """DELETE /workout-templates/{id} without token → 401."""
        response = client.delete(f"{TEMPLATES_ENDPOINT}/{template_a.id}")
        assert response.status_code == 401

    def test_add_block_requires_auth(
        self, client: TestClient, template_a: WorkoutTemplate
    ):
        """POST /workout-templates/{id}/blocks without token → 401."""
        response = client.post(
            f"{TEMPLATES_ENDPOINT}/{template_a.id}/blocks",
            json={"name": "New Block"},
        )
        assert response.status_code == 401


# ===========================================================================
# 2) Workout Templates — ATHLETE role is forbidden on write operations
# ===========================================================================


class TestWorkoutTemplatesAthleteRoleGuard:
    """
    Athletes may read templates but must not create or mutate them.
    Ensures require_coach guard is active on every write endpoint.
    """

    def test_athlete_cannot_create_template(
        self,
        client: TestClient,
        mock_jwt,
        athlete_a: UserProfile,
    ):
        """POST /workout-templates as ATHLETE → 403."""
        mock_jwt(str(athlete_a.supabase_user_id))
        response = client.post(
            TEMPLATES_ENDPOINT,
            headers=HEADERS,
            json={"title": "Athlete Trying to Create"},
        )
        assert response.status_code == 403
        assert "Access denied" in response.json()["detail"]

    def test_athlete_cannot_update_template(
        self,
        client: TestClient,
        mock_jwt,
        athlete_a: UserProfile,
        template_a: WorkoutTemplate,
    ):
        """PATCH /workout-templates/{id} as ATHLETE → 403."""
        mock_jwt(str(athlete_a.supabase_user_id))
        response = client.patch(
            f"{TEMPLATES_ENDPOINT}/{template_a.id}",
            headers=HEADERS,
            json={"title": "Athlete Rename Attempt"},
        )
        assert response.status_code == 403

    def test_athlete_cannot_delete_template(
        self,
        client: TestClient,
        mock_jwt,
        athlete_a: UserProfile,
        template_a: WorkoutTemplate,
    ):
        """DELETE /workout-templates/{id} as ATHLETE → 403."""
        mock_jwt(str(athlete_a.supabase_user_id))
        response = client.delete(
            f"{TEMPLATES_ENDPOINT}/{template_a.id}", headers=HEADERS
        )
        assert response.status_code == 403

    def test_athlete_cannot_add_block_to_template(
        self,
        client: TestClient,
        mock_jwt,
        athlete_a: UserProfile,
        template_a: WorkoutTemplate,
    ):
        """POST /workout-templates/{id}/blocks as ATHLETE → 403."""
        mock_jwt(str(athlete_a.supabase_user_id))
        response = client.post(
            f"{TEMPLATES_ENDPOINT}/{template_a.id}/blocks",
            headers=HEADERS,
            json={"name": "Sneaky Block"},
        )
        assert response.status_code == 403

    def test_athlete_can_read_templates(
        self,
        client: TestClient,
        mock_jwt,
        athlete_a: UserProfile,
        template_a: WorkoutTemplate,
    ):
        """GET /workout-templates as ATHLETE → 200 (athletes need to read their workouts)."""
        mock_jwt(str(athlete_a.supabase_user_id))
        response = client.get(TEMPLATES_ENDPOINT, headers=HEADERS)
        assert response.status_code == 200
        assert isinstance(response.json(), list)


# ===========================================================================
# 3) Workout Templates — cross-tenant IDOR prevention
# ===========================================================================


class TestWorkoutTemplatesTenantIsolation:
    """
    A user from team B must not be able to read or modify a template
    that belongs to team A, even when they know the ID (IDOR).
    """

    def test_coach_b_cannot_get_team_a_template(
        self,
        client: TestClient,
        mock_jwt,
        coach_b: UserProfile,
        template_a: WorkoutTemplate,
    ):
        """GET /workout-templates/{id} — coach from another team → 404."""
        mock_jwt(str(coach_b.supabase_user_id))
        response = client.get(
            f"{TEMPLATES_ENDPOINT}/{template_a.id}", headers=HEADERS
        )
        assert response.status_code == 404

    def test_coach_b_cannot_update_team_a_template(
        self,
        client: TestClient,
        mock_jwt,
        coach_b: UserProfile,
        template_a: WorkoutTemplate,
    ):
        """PATCH /workout-templates/{id} — coach from another team → 404."""
        mock_jwt(str(coach_b.supabase_user_id))
        response = client.patch(
            f"{TEMPLATES_ENDPOINT}/{template_a.id}",
            headers=HEADERS,
            json={"title": "Hijacked Title"},
        )
        assert response.status_code == 404

    def test_list_templates_is_tenant_scoped(
        self,
        client: TestClient,
        mock_jwt,
        coach_a: UserProfile,
        coach_b: UserProfile,
        template_a: WorkoutTemplate,
    ):
        """GET /workout-templates returns only the requesting team's templates."""
        # team A coach sees template_a
        mock_jwt(str(coach_a.supabase_user_id))
        resp_a = client.get(TEMPLATES_ENDPOINT, headers=HEADERS)
        assert resp_a.status_code == 200
        ids_a = [t["id"] for t in resp_a.json()]
        assert str(template_a.id) in ids_a

        # team B coach does NOT see template_a
        mock_jwt(str(coach_b.supabase_user_id))
        resp_b = client.get(TEMPLATES_ENDPOINT, headers=HEADERS)
        assert resp_b.status_code == 200
        ids_b = [t["id"] for t in resp_b.json()]
        assert str(template_a.id) not in ids_b


# ===========================================================================
# 4) Workout Sessions — authentication guards (no-auth → 401)
# ===========================================================================


class TestWorkoutSessionsNoAuth:
    """Session list and complete endpoints must reject unauthenticated requests."""

    def test_list_sessions_requires_auth(self, client: TestClient):
        """GET /workout-sessions without token → 401."""
        response = client.get(SESSIONS_ENDPOINT)
        assert response.status_code == 401

    def test_complete_session_requires_auth(
        self, client: TestClient, session_a: WorkoutSession
    ):
        """PATCH /workout-sessions/{id}/complete without token → 401."""
        response = client.patch(f"{SESSIONS_ENDPOINT}/{session_a.id}/complete")
        assert response.status_code == 401
