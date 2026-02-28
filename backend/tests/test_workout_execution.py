"""
TDD RED phase — integration tests for workout session execution endpoints.

Endpoints under test:
    POST  /v1/workout-sessions/{session_id}/logs
    GET   /v1/workout-sessions/{session_id}
    PATCH /v1/workout-sessions/{session_id}/complete

TARGET API CONTRACT (tests are RED until implementation matches):
  - POST entries use "set_number" (not "set")
  - GET response returns workout_template_id (UUID), athlete_profile_id, scheduled_for
  - Exercise not belonging to the team -> 404
  - PATCH /complete: ATHLETE owns session, COACH scoped to team, both idempotent
"""
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domain.events.models import FunnelEvent, ProductEvent
from app.models import (
    BlockExercise,
    Exercise,
    Membership,
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

VALID_BLOCK_NAME = "Primary Strength"
INVALID_BLOCK_NAME = "Does Not Exist Block"


# ---------------------------------------------------------------------------
# Local fixtures (supplement conftest.py without modifying it)
# ---------------------------------------------------------------------------


@pytest.fixture
def athlete_b(db_session: Session, team_b: Team) -> UserProfile:
    """Athlete belonging to team B (cross-team isolation)."""
    athlete = UserProfile(
        id=uuid.uuid4(),
        supabase_user_id=uuid.uuid4(),
        team_id=team_b.id,
        role=Role.ATHLETE,
        name="Athlete Beta",
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


@pytest.fixture
def athlete_a2(db_session: Session, team_a: Team) -> UserProfile:
    """Second athlete in team A (same-team peer isolation)."""
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

    db_session.add(
        BlockExercise(
            id=uuid.uuid4(),
            workout_block_id=block.id,
            exercise_id=exercise_team_a.id,
            order_index=0,
            prescription_json={"sets": 3, "reps": 5},
        )
    )
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
    """Workout session belonging to team B (cross-team isolation)."""
    template = WorkoutTemplate(
        id=uuid.uuid4(),
        team_id=team_b.id,
        title="Team B Workout",
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
# Helpers
# ---------------------------------------------------------------------------


def _log_url(session_id: uuid.UUID) -> str:
    return f"{SESSIONS_ENDPOINT}/{session_id}/logs"


def _detail_url(session_id: uuid.UUID) -> str:
    return f"{SESSIONS_ENDPOINT}/{session_id}"


def _complete_url(session_id: uuid.UUID) -> str:
    return f"{SESSIONS_ENDPOINT}/{session_id}/complete"


def _valid_log_payload(exercise_id: uuid.UUID) -> dict:
    """Minimal valid payload using the target API contract (set_number)."""
    return {
        "block_name": VALID_BLOCK_NAME,
        "exercise_id": str(exercise_id),
        "entries": [
            {"set_number": 1, "reps": 5, "weight": 80.0, "rpe": 8.0},
            {"set_number": 2, "reps": 5, "weight": 80.0, "rpe": 8.0},
        ],
        "notes": "Felt strong",
    }


# ===========================================================================
# 1) POST /v1/workout-sessions/{session_id}/logs
# ===========================================================================


class TestLogCreation:
    """POST /{session_id}/logs — execution log creation."""

    # ── Auth guards ────────────────────────────────────────────────────────

    def test_requires_auth(self, client: TestClient, session_a: WorkoutSession):
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
        """Athlete logging to a same-team peer's session → 404."""
        mock_jwt(str(athlete_a2.supabase_user_id))
        response = client.post(
            _log_url(session_a.id),
            headers=HEADERS,
            json=_valid_log_payload(exercise_team_a.id),
        )
        assert response.status_code == 404

    # ── Payload validation ─────────────────────────────────────────────────

    def test_exercise_not_in_team_returns_404(
        self,
        client: TestClient,
        mock_jwt,
        athlete_a: UserProfile,
        session_a: WorkoutSession,
    ):
        """exercise_id not belonging to the team → 404."""
        mock_jwt(str(athlete_a.supabase_user_id))
        response = client.post(
            _log_url(session_a.id),
            headers=HEADERS,
            json={
                "block_name": VALID_BLOCK_NAME,
                "exercise_id": str(uuid.uuid4()),  # random — not in any team
                "entries": [{"set_number": 1, "reps": 5, "weight": 80.0}],
            },
        )
        assert response.status_code == 404

    def test_block_name_not_in_template_returns_400(
        self,
        client: TestClient,
        mock_jwt,
        athlete_a: UserProfile,
        session_a: WorkoutSession,
        exercise_team_a: Exercise,
    ):
        """block_name not matching any block in the template → 400."""
        mock_jwt(str(athlete_a.supabase_user_id))
        response = client.post(
            _log_url(session_a.id),
            headers=HEADERS,
            json={
                "block_name": INVALID_BLOCK_NAME,
                "exercise_id": str(exercise_team_a.id),
                "entries": [{"set_number": 1, "reps": 5, "weight": 80.0}],
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

    def test_log_without_optional_fields_is_accepted(
        self,
        client: TestClient,
        mock_jwt,
        athlete_a: UserProfile,
        session_a: WorkoutSession,
        exercise_team_a: Exercise,
    ):
        """notes, rpe, weight are optional; omitting them still returns 201."""
        mock_jwt(str(athlete_a.supabase_user_id))
        response = client.post(
            _log_url(session_a.id),
            headers=HEADERS,
            json={
                "block_name": VALID_BLOCK_NAME,
                "exercise_id": str(exercise_team_a.id),
                "entries": [{"set_number": 1, "reps": 10}],
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
        """Two POST calls for the same session return distinct log_id values."""
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
    """GET /{session_id} — per-session detail with logs."""

    # ── Auth guards ────────────────────────────────────────────────────────

    def test_requires_auth(self, client: TestClient, session_a: WorkoutSession):
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
        """Athlete requesting a session belonging to a teammate → 404."""
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
        """ATHLETE fetching their own session → 200 with all required fields."""
        mock_jwt(str(athlete_a.supabase_user_id))
        response = client.get(_detail_url(session_a.id), headers=HEADERS)

        assert response.status_code == 200
        data = response.json()

        assert data["id"] == str(session_a.id)
        assert "status" in data
        assert data["workout_template_id"] == str(template_with_block.id)
        assert data["athlete_profile_id"] == str(athlete_a.id)
        assert "scheduled_for" in data  # nullable date field
        assert "logs" in data
        assert isinstance(data["logs"], list)

    def test_coach_sees_session_in_own_team(
        self,
        client: TestClient,
        mock_jwt,
        coach_a: UserProfile,
        session_a: WorkoutSession,
        template_with_block: WorkoutTemplate,
        athlete_a: UserProfile,
    ):
        """COACH fetching a session in their team → 200 with all required fields."""
        mock_jwt(str(coach_a.supabase_user_id))
        response = client.get(_detail_url(session_a.id), headers=HEADERS)

        assert response.status_code == 200
        data = response.json()

        assert data["id"] == str(session_a.id)
        assert data["workout_template_id"] == str(template_with_block.id)
        assert data["athlete_profile_id"] == str(athlete_a.id)
        assert "scheduled_for" in data
        assert "logs" in data

    def test_session_detail_logs_are_empty_initially(
        self,
        client: TestClient,
        mock_jwt,
        athlete_a: UserProfile,
        session_a: WorkoutSession,
    ):
        """A fresh session returns an empty logs list."""
        mock_jwt(str(athlete_a.supabase_user_id))
        response = client.get(_detail_url(session_a.id), headers=HEADERS)

        assert response.status_code == 200
        assert response.json()["logs"] == []

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
        assert len(detail_resp.json()["logs"]) >= 1

    def test_session_status_is_pending_before_completion(
        self,
        client: TestClient,
        mock_jwt,
        athlete_a: UserProfile,
        session_a: WorkoutSession,
    ):
        """A fresh session reports a non-completed status."""
        mock_jwt(str(athlete_a.supabase_user_id))
        response = client.get(_detail_url(session_a.id), headers=HEADERS)

        assert response.status_code == 200
        assert response.json()["status"] != "completed"

    def test_session_status_is_completed_after_patch(
        self,
        client: TestClient,
        mock_jwt,
        athlete_a: UserProfile,
        session_a: WorkoutSession,
    ):
        """Status reflects 'completed' after PATCH /complete."""
        mock_jwt(str(athlete_a.supabase_user_id))

        patch_resp = client.patch(_complete_url(session_a.id), headers=HEADERS)
        assert patch_resp.status_code == 204

        detail_resp = client.get(_detail_url(session_a.id), headers=HEADERS)
        assert detail_resp.status_code == 200
        assert detail_resp.json()["status"] == "completed"


# ===========================================================================
# 3) PATCH /v1/workout-sessions/{session_id}/complete
# ===========================================================================


class TestSessionComplete:
    """PATCH /{session_id}/complete — completion + COACH admin access."""

    def test_athlete_can_complete_own_session(
        self,
        client: TestClient,
        mock_jwt,
        athlete_a: UserProfile,
        session_a: WorkoutSession,
    ):
        """ATHLETE completing their own session → 204."""
        mock_jwt(str(athlete_a.supabase_user_id))
        response = client.patch(_complete_url(session_a.id), headers=HEADERS)
        assert response.status_code == 204

    def test_athlete_cannot_complete_another_athletes_session(
        self,
        client: TestClient,
        mock_jwt,
        athlete_a2: UserProfile,
        session_a: WorkoutSession,
    ):
        """ATHLETE completing a teammate's session → 404."""
        mock_jwt(str(athlete_a2.supabase_user_id))
        response = client.patch(_complete_url(session_a.id), headers=HEADERS)
        assert response.status_code == 404

    def test_coach_can_complete_session_in_own_team(
        self,
        client: TestClient,
        mock_jwt,
        coach_a: UserProfile,
        session_a: WorkoutSession,
    ):
        """COACH completing a session in their team → 204 (admin use case)."""
        mock_jwt(str(coach_a.supabase_user_id))
        response = client.patch(_complete_url(session_a.id), headers=HEADERS)
        assert response.status_code == 204

    def test_coach_cannot_complete_session_in_other_team(
        self,
        client: TestClient,
        mock_jwt,
        coach_a: UserProfile,
        session_b: WorkoutSession,
    ):
        """COACH completing a session in another team → 404."""
        mock_jwt(str(coach_a.supabase_user_id))
        response = client.patch(_complete_url(session_b.id), headers=HEADERS)
        assert response.status_code == 404

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

        assert client.patch(url, headers=HEADERS).status_code == 204
        assert client.patch(url, headers=HEADERS).status_code == 204


# ===========================================================================
# 4) SESSION_COMPLETED product event tracking
# ===========================================================================


class TestSessionCompletedEvent:
    """Completing a session must write exactly one SESSION_COMPLETED product event."""

    def test_completing_session_tracks_one_event(
        self,
        client: TestClient,
        mock_jwt,
        athlete_a: UserProfile,
        session_a: WorkoutSession,
        db_session: Session,
    ):
        """First completion → exactly one SESSION_COMPLETED row."""
        mock_jwt(str(athlete_a.supabase_user_id))
        response = client.patch(_complete_url(session_a.id), headers=HEADERS)
        assert response.status_code == 204

        events = db_session.execute(
            select(ProductEvent).where(
                ProductEvent.event_name == FunnelEvent.SESSION_COMPLETED,
                ProductEvent.user_id == athlete_a.supabase_user_id,
            )
        ).scalars().all()

        assert len(events) == 1
        assert events[0].team_id == athlete_a.team_id
        assert events[0].role == "ATHLETE"
        assert events[0].event_metadata == {"session_id": str(session_a.id)}

    def test_completing_session_twice_tracks_one_event(
        self,
        client: TestClient,
        mock_jwt,
        athlete_a: UserProfile,
        session_a: WorkoutSession,
        db_session: Session,
    ):
        """Second completion is a no-op — event count stays at 1."""
        mock_jwt(str(athlete_a.supabase_user_id))
        url = _complete_url(session_a.id)

        client.patch(url, headers=HEADERS)
        client.patch(url, headers=HEADERS)

        events = db_session.execute(
            select(ProductEvent).where(
                ProductEvent.event_name == FunnelEvent.SESSION_COMPLETED,
                ProductEvent.user_id == athlete_a.supabase_user_id,
            )
        ).scalars().all()

        assert len(events) == 1


# ===========================================================================
# 5) SESSION_FIRST_LOG_ADDED funnel event
# ===========================================================================


class TestSessionFirstLogAddedEvent:
    """SESSION_FIRST_LOG_ADDED is tracked once per session on the first log."""

    def test_first_log_entry_inserts_event(
        self,
        client: TestClient,
        mock_jwt,
        athlete_a: UserProfile,
        session_a: WorkoutSession,
        exercise_team_a: Exercise,
        db_session: Session,
    ) -> None:
        """First log for a session fires exactly one SESSION_FIRST_LOG_ADDED event."""
        mock_jwt(str(athlete_a.supabase_user_id))
        resp = client.post(
            _log_url(session_a.id),
            headers=HEADERS,
            json=_valid_log_payload(exercise_team_a.id),
        )
        assert resp.status_code == 201

        events = db_session.execute(
            select(ProductEvent).where(
                ProductEvent.event_name == FunnelEvent.SESSION_FIRST_LOG_ADDED,
                ProductEvent.team_id == athlete_a.team_id,
            )
        ).scalars().all()
        assert len(events) == 1
        ev = events[0]
        assert ev.user_id == athlete_a.supabase_user_id
        assert ev.role == "ATHLETE"
        assert ev.event_metadata == {"session_id": str(session_a.id)}

    def test_second_log_does_not_duplicate_event(
        self,
        client: TestClient,
        mock_jwt,
        athlete_a: UserProfile,
        session_a: WorkoutSession,
        exercise_team_a: Exercise,
        db_session: Session,
    ) -> None:
        """A second log on the same session does not add another event."""
        mock_jwt(str(athlete_a.supabase_user_id))
        url = _log_url(session_a.id)
        payload = _valid_log_payload(exercise_team_a.id)

        client.post(url, headers=HEADERS, json=payload)
        client.post(url, headers=HEADERS, json=payload)

        events = db_session.execute(
            select(ProductEvent).where(
                ProductEvent.event_name == FunnelEvent.SESSION_FIRST_LOG_ADDED,
                ProductEvent.team_id == athlete_a.team_id,
            )
        ).scalars().all()
        assert len(events) == 1

    def test_first_log_event_scoped_to_team(
        self,
        client: TestClient,
        mock_jwt,
        athlete_a: UserProfile,
        session_a: WorkoutSession,
        exercise_team_a: Exercise,
        team_b: Team,
        db_session: Session,
    ) -> None:
        """SESSION_FIRST_LOG_ADDED is stored under athlete's team; team B has zero."""
        mock_jwt(str(athlete_a.supabase_user_id))
        resp = client.post(
            _log_url(session_a.id),
            headers=HEADERS,
            json=_valid_log_payload(exercise_team_a.id),
        )
        assert resp.status_code == 201

        team_a_events = db_session.execute(
            select(ProductEvent).where(
                ProductEvent.event_name == FunnelEvent.SESSION_FIRST_LOG_ADDED,
                ProductEvent.team_id == athlete_a.team_id,
            )
        ).scalars().all()
        assert len(team_a_events) == 1

        team_b_events = db_session.execute(
            select(ProductEvent).where(
                ProductEvent.event_name == FunnelEvent.SESSION_FIRST_LOG_ADDED,
                ProductEvent.team_id == team_b.id,
            )
        ).scalars().all()
        assert len(team_b_events) == 0
