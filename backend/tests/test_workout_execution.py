"""
TDD RED phase — integration tests for workout session execution endpoints.

Endpoints under test:
    POST  /v1/workout-sessions/{session_id}/logs
    GET   /v1/workout-sessions/{session_id}
    PATCH /v1/workout-sessions/{session_id}/complete  (idempotency)

TestLogCreation and TestSessionDetail are expected to FAIL because neither
endpoint exists yet.  TestSessionCompleteIdempotency exercises already-
implemented behaviour so it may be green.
"""
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import (
    BlockExercise,
    Exercise,
    Role,
    Team,
    UserProfile,
    WorkoutAssignment,
    WorkoutBlock,
    WorkoutSession,
    WorkoutTemplate,
)
from app.models.workout_assignment import AssignmentTargetType

HEADERS = {"Authorization": "Bearer test-token"}
SESSIONS_ENDPOINT = "/v1/workout-sessions"

# The block name that exists in the test template fixture.
VALID_BLOCK_NAME = "Primary Strength"
# A block name that does NOT exist in any test template.
INVALID_BLOCK_NAME = "Does Not Exist Block"


# ---------------------------------------------------------------------------
# Local fixtures (supplement conftest.py without modifying it)
# ---------------------------------------------------------------------------


@pytest.fixture
def athlete_b(db_session: Session, team_b: Team) -> UserProfile:
    """Athlete belonging to team B (for cross-team isolation tests)."""
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
    """Second athlete in team A."""
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
def template_with_block(
    db_session: Session,
    team_a: Team,
    exercise_team_a: Exercise,
) -> WorkoutTemplate:
    """WorkoutTemplate with one block (VALID_BLOCK_NAME) containing one exercise."""
    template = WorkoutTemplate(
        id=uuid.uuid4(),
        team_id=team_a.id,
        title="Execution Test Workout",
    )
    db_session.add(template)
    db_session.flush()

    block = WorkoutBlock(
        id=uuid.uuid4(),
        workout_template_id=template.id,
        order_index=0,
        name=VALID_BLOCK_NAME,
    )
    db_session.add(block)
    db_session.flush()

    block_exercise = BlockExercise(
        id=uuid.uuid4(),
        workout_block_id=block.id,
        exercise_id=exercise_team_a.id,
        order_index=0,
        prescription_json={"sets": 3, "reps": 5},
    )
    db_session.add(block_exercise)
    db_session.commit()
    db_session.refresh(template)
    return template


@pytest.fixture
def session_a(
    db_session: Session,
    athlete_a: UserProfile,
    template_with_block: WorkoutTemplate,
) -> WorkoutSession:
    """Workout session assigned to athlete_a via template_with_block."""
    assignment = WorkoutAssignment(
        id=uuid.uuid4(),
        team_id=athlete_a.team_id,
        workout_template_id=template_with_block.id,
        target_type=AssignmentTargetType.ATHLETE,
        target_athlete_id=athlete_a.id,
    )
    db_session.add(assignment)
    db_session.flush()

    session = WorkoutSession(
        id=uuid.uuid4(),
        assignment_id=assignment.id,
        athlete_id=athlete_a.id,
        workout_template_id=template_with_block.id,
    )
    db_session.add(session)
    db_session.commit()
    db_session.refresh(session)
    return session


@pytest.fixture
def session_b(
    db_session: Session,
    athlete_b: UserProfile,
    team_b: Team,
    coach_b: UserProfile,
) -> WorkoutSession:
    """Workout session belonging to team B (for cross-team isolation tests)."""
    template = WorkoutTemplate(
        id=uuid.uuid4(),
        team_id=team_b.id,
        title="Team B Execution Workout",
    )
    db_session.add(template)
    db_session.flush()

    assignment = WorkoutAssignment(
        id=uuid.uuid4(),
        team_id=team_b.id,
        workout_template_id=template.id,
        target_type=AssignmentTargetType.ATHLETE,
        target_athlete_id=athlete_b.id,
    )
    db_session.add(assignment)
    db_session.flush()

    session = WorkoutSession(
        id=uuid.uuid4(),
        assignment_id=assignment.id,
        athlete_id=athlete_b.id,
        workout_template_id=template.id,
    )
    db_session.add(session)
    db_session.commit()
    db_session.refresh(session)
    return session


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------


def _log_url(session_id: uuid.UUID) -> str:
    return f"{SESSIONS_ENDPOINT}/{session_id}/logs"


def _detail_url(session_id: uuid.UUID) -> str:
    return f"{SESSIONS_ENDPOINT}/{session_id}"


def _complete_url(session_id: uuid.UUID) -> str:
    return f"{SESSIONS_ENDPOINT}/{session_id}/complete"


def _valid_log_payload(exercise_id: uuid.UUID) -> dict:
    """Minimal valid log payload matching the API contract."""
    return {
        "block_name": VALID_BLOCK_NAME,
        "exercise_id": str(exercise_id),
        "entries": [
            {"set": 1, "reps": 5, "weight": 80, "rpe": 8},
            {"set": 2, "reps": 5, "weight": 80, "rpe": 8},
        ],
        "notes": "Felt strong",
    }


# ===========================================================================
# 1) POST /v1/workout-sessions/{session_id}/logs
# ===========================================================================


class TestLogCreation:
    """POST /v1/workout-sessions/{session_id}/logs — execution log creation."""

    # ── Auth guards ────────────────────────────────────────────────────────

    def test_requires_auth(
        self,
        client: TestClient,
        session_a: WorkoutSession,
    ):
        """Missing Authorization header → 401."""
        response = client.post(
            _log_url(session_a.id),
            json=_valid_log_payload(uuid.uuid4()),
        )
        assert response.status_code == 401

    def test_not_onboarded_returns_403(
        self,
        client: TestClient,
        mock_jwt,
        session_a: WorkoutSession,
        exercise_team_a: Exercise,
    ):
        """Valid token but no UserProfile → 403."""
        mock_jwt(str(uuid.uuid4()))
        response = client.post(
            _log_url(session_a.id),
            headers=HEADERS,
            json=_valid_log_payload(exercise_team_a.id),
        )
        assert response.status_code == 403

    # ── Role guard ─────────────────────────────────────────────────────────

    def test_coach_cannot_create_log(
        self,
        client: TestClient,
        mock_jwt,
        coach_a: UserProfile,
        session_a: WorkoutSession,
        exercise_team_a: Exercise,
    ):
        """COACH role → 403 (only ATHLETEs may log execution data)."""
        mock_jwt(str(coach_a.supabase_user_id))
        response = client.post(
            _log_url(session_a.id),
            headers=HEADERS,
            json=_valid_log_payload(exercise_team_a.id),
        )
        assert response.status_code == 403

    # ── Tenant / ownership isolation ───────────────────────────────────────

    def test_cross_team_session_returns_404(
        self,
        client: TestClient,
        mock_jwt,
        athlete_a: UserProfile,
        session_b: WorkoutSession,
        exercise_team_a: Exercise,
    ):
        """Session owned by another team → 404 (existence not leaked)."""
        mock_jwt(str(athlete_a.supabase_user_id))
        response = client.post(
            _log_url(session_b.id),
            headers=HEADERS,
            json=_valid_log_payload(exercise_team_a.id),
        )
        assert response.status_code == 404

    def test_athlete_cannot_log_to_another_athletes_session(
        self,
        client: TestClient,
        mock_jwt,
        athlete_a2: UserProfile,
        session_a: WorkoutSession,
        exercise_team_a: Exercise,
    ):
        """Athlete logging to a teammate's session (same team) → 404."""
        mock_jwt(str(athlete_a2.supabase_user_id))
        response = client.post(
            _log_url(session_a.id),
            headers=HEADERS,
            json=_valid_log_payload(exercise_team_a.id),
        )
        assert response.status_code == 404

    # ── Payload validation ─────────────────────────────────────────────────

    def test_exercise_not_in_template_returns_400(
        self,
        client: TestClient,
        mock_jwt,
        athlete_a: UserProfile,
        session_a: WorkoutSession,
    ):
        """exercise_id not present in the session's template → 400."""
        mock_jwt(str(athlete_a.supabase_user_id))
        response = client.post(
            _log_url(session_a.id),
            headers=HEADERS,
            json={
                "block_name": VALID_BLOCK_NAME,
                "exercise_id": str(uuid.uuid4()),
                "entries": [{"set": 1, "reps": 5, "weight": 80, "rpe": 8}],
            },
        )
        assert response.status_code == 400

    def test_block_name_not_in_template_returns_400(
        self,
        client: TestClient,
        mock_jwt,
        athlete_a: UserProfile,
        session_a: WorkoutSession,
        exercise_team_a: Exercise,
    ):
        """block_name that does not match any block in the template → 400."""
        mock_jwt(str(athlete_a.supabase_user_id))
        response = client.post(
            _log_url(session_a.id),
            headers=HEADERS,
            json={
                "block_name": INVALID_BLOCK_NAME,
                "exercise_id": str(exercise_team_a.id),
                "entries": [{"set": 1, "reps": 5, "weight": 80, "rpe": 8}],
            },
        )
        assert response.status_code == 400

    # ── Happy path ─────────────────────────────────────────────────────────

    def test_athlete_can_log_to_own_session(
        self,
        client: TestClient,
        mock_jwt,
        athlete_a: UserProfile,
        session_a: WorkoutSession,
        exercise_team_a: Exercise,
    ):
        """ATHLETE logs to their own session → 201 with a valid log_id UUID."""
        mock_jwt(str(athlete_a.supabase_user_id))
        response = client.post(
            _log_url(session_a.id),
            headers=HEADERS,
            json=_valid_log_payload(exercise_team_a.id),
        )
        assert response.status_code == 201
        data = response.json()
        assert "log_id" in data
        uuid.UUID(data["log_id"])  # raises ValueError if not a valid UUID

    def test_log_without_optional_notes_is_accepted(
        self,
        client: TestClient,
        mock_jwt,
        athlete_a: UserProfile,
        session_a: WorkoutSession,
        exercise_team_a: Exercise,
    ):
        """notes is optional; omitting it still returns 201."""
        mock_jwt(str(athlete_a.supabase_user_id))
        response = client.post(
            _log_url(session_a.id),
            headers=HEADERS,
            json={
                "block_name": VALID_BLOCK_NAME,
                "exercise_id": str(exercise_team_a.id),
                "entries": [{"set": 1, "reps": 10, "weight": 60}],
            },
        )
        assert response.status_code == 201
        assert "log_id" in response.json()

    def test_multiple_logs_for_same_session_are_allowed(
        self,
        client: TestClient,
        mock_jwt,
        athlete_a: UserProfile,
        session_a: WorkoutSession,
        exercise_team_a: Exercise,
    ):
        """A second log call for the same session returns a distinct log_id."""
        mock_jwt(str(athlete_a.supabase_user_id))
        payload = _valid_log_payload(exercise_team_a.id)

        first = client.post(_log_url(session_a.id), headers=HEADERS, json=payload)
        second = client.post(_log_url(session_a.id), headers=HEADERS, json=payload)

        assert first.status_code == 201
        assert second.status_code == 201
        assert first.json()["log_id"] != second.json()["log_id"]


# ===========================================================================
# 2) GET /v1/workout-sessions/{session_id}
# ===========================================================================


class TestSessionDetail:
    """GET /v1/workout-sessions/{session_id} — per-session detail with logs."""

    # ── Auth guards ────────────────────────────────────────────────────────

    def test_requires_auth(
        self,
        client: TestClient,
        session_a: WorkoutSession,
    ):
        """Missing Authorization header → 401."""
        response = client.get(_detail_url(session_a.id))
        assert response.status_code == 401

    # ── Tenant / ownership isolation ───────────────────────────────────────

    def test_athlete_cannot_see_other_teams_session(
        self,
        client: TestClient,
        mock_jwt,
        athlete_a: UserProfile,
        session_b: WorkoutSession,
    ):
        """Athlete requesting a session from another team → 404."""
        mock_jwt(str(athlete_a.supabase_user_id))
        response = client.get(_detail_url(session_b.id), headers=HEADERS)
        assert response.status_code == 404

    def test_coach_cannot_see_other_teams_session(
        self,
        client: TestClient,
        mock_jwt,
        coach_a: UserProfile,
        session_b: WorkoutSession,
    ):
        """Coach requesting a session from another team → 404."""
        mock_jwt(str(coach_a.supabase_user_id))
        response = client.get(_detail_url(session_b.id), headers=HEADERS)
        assert response.status_code == 404

    def test_athlete_cannot_see_same_team_peers_session(
        self,
        client: TestClient,
        mock_jwt,
        athlete_a2: UserProfile,
        session_a: WorkoutSession,
    ):
        """Athlete requesting a session that belongs to a teammate → 404."""
        mock_jwt(str(athlete_a2.supabase_user_id))
        response = client.get(_detail_url(session_a.id), headers=HEADERS)
        assert response.status_code == 404

    # ── Happy path: response shape ─────────────────────────────────────────

    def test_athlete_sees_own_session_detail(
        self,
        client: TestClient,
        mock_jwt,
        athlete_a: UserProfile,
        session_a: WorkoutSession,
        template_with_block: WorkoutTemplate,
    ):
        """ATHLETE fetching their own session → 200 with required top-level fields."""
        mock_jwt(str(athlete_a.supabase_user_id))
        response = client.get(_detail_url(session_a.id), headers=HEADERS)

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == str(session_a.id)
        assert "status" in data
        assert data["template_title"] == template_with_block.title
        assert "logs" in data
        assert isinstance(data["logs"], list)

    def test_coach_sees_session_in_own_team(
        self,
        client: TestClient,
        mock_jwt,
        coach_a: UserProfile,
        session_a: WorkoutSession,
        template_with_block: WorkoutTemplate,
    ):
        """COACH fetching a session in their team → 200 with required fields."""
        mock_jwt(str(coach_a.supabase_user_id))
        response = client.get(_detail_url(session_a.id), headers=HEADERS)

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == str(session_a.id)
        assert data["template_title"] == template_with_block.title
        assert "logs" in data

    def test_session_detail_shows_logs_after_logging(
        self,
        client: TestClient,
        mock_jwt,
        athlete_a: UserProfile,
        session_a: WorkoutSession,
        exercise_team_a: Exercise,
    ):
        """After a POST /logs call, GET detail includes the newly created log."""
        mock_jwt(str(athlete_a.supabase_user_id))

        log_resp = client.post(
            _log_url(session_a.id),
            headers=HEADERS,
            json=_valid_log_payload(exercise_team_a.id),
        )
        assert log_resp.status_code == 201

        detail_resp = client.get(_detail_url(session_a.id), headers=HEADERS)
        assert detail_resp.status_code == 200
        data = detail_resp.json()
        assert len(data["logs"]) >= 1

    def test_session_status_is_pending_before_completion(
        self,
        client: TestClient,
        mock_jwt,
        athlete_a: UserProfile,
        session_a: WorkoutSession,
    ):
        """A newly created session reports a non-completed status."""
        mock_jwt(str(athlete_a.supabase_user_id))
        response = client.get(_detail_url(session_a.id), headers=HEADERS)

        assert response.status_code == 200
        # Status must not indicate completion on a fresh session
        assert response.json()["status"] != "completed"

    def test_session_status_is_completed_after_patch(
        self,
        client: TestClient,
        mock_jwt,
        athlete_a: UserProfile,
        session_a: WorkoutSession,
    ):
        """Status field reflects completed after PATCH /complete."""
        mock_jwt(str(athlete_a.supabase_user_id))
        patch_resp = client.patch(_complete_url(session_a.id), headers=HEADERS)
        assert patch_resp.status_code == 204

        detail_resp = client.get(_detail_url(session_a.id), headers=HEADERS)
        assert detail_resp.status_code == 200
        assert detail_resp.json()["status"] == "completed"


# ===========================================================================
# 3) PATCH /v1/workout-sessions/{session_id}/complete — idempotency
# ===========================================================================


class TestSessionCompleteIdempotency:
    """PATCH complete endpoint — idempotency guarantee.

    Ownership and cross-team coverage lives in test_workout_assignments.py.
    This class verifies only that repeated completion calls are safe.
    """

    def test_complete_is_idempotent(
        self,
        client: TestClient,
        mock_jwt,
        athlete_a: UserProfile,
        session_a: WorkoutSession,
    ):
        """Completing an already-completed session still returns 204."""
        mock_jwt(str(athlete_a.supabase_user_id))
        url = _complete_url(session_a.id)

        first = client.patch(url, headers=HEADERS)
        assert first.status_code == 204

        second = client.patch(url, headers=HEADERS)
        assert second.status_code == 204
