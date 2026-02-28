"""
TDD tests for PUT /v1/workout-sessions/{session_id}/logs.

Idempotent upsert: replaces all entries for (session_id, exercise_id).
Body: { exercise_id, entries: [{set_number, reps?, weight?, rpe?}] }

Behavioural contract:
- 200 with confirmed entries on success
- Upsert: second PUT same exercise replaces first, no duplicate log records
- First PUT fires SESSION_FIRST_LOG_ADDED (second does not)
- ATHLETE only (COACH returns 403)
- Tenant isolation: cross-team session → 404, peer session → 404
- Exercise not in team → 404
- set_number < 1 → 422; empty entries → 422
"""
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
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
from app.models.workout_session_log import WorkoutSessionLog

HEADERS = {"Authorization": "Bearer test-token"}
SESSIONS_ENDPOINT = "/v1/workout-sessions"


# ---------------------------------------------------------------------------
# Local fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def athlete_b(db_session: Session, team_b: Team) -> UserProfile:
    from app.models.membership import Membership
    athlete = UserProfile(
        id=uuid.uuid4(), supabase_user_id=uuid.uuid4(),
        team_id=team_b.id, role=Role.ATHLETE, name="Athlete Beta",
    )
    db_session.add(athlete)
    db_session.flush()
    db_session.add(Membership(
        id=uuid.uuid4(), user_id=athlete.supabase_user_id,
        team_id=team_b.id, role=Role.ATHLETE,
    ))
    db_session.commit()
    db_session.refresh(athlete)
    return athlete


@pytest.fixture
def athlete_a2(db_session: Session, team_a: Team) -> UserProfile:
    from app.models.membership import Membership
    athlete = UserProfile(
        id=uuid.uuid4(), supabase_user_id=uuid.uuid4(),
        team_id=team_a.id, role=Role.ATHLETE, name="Athlete Alpha 2",
    )
    db_session.add(athlete)
    db_session.flush()
    db_session.add(Membership(
        id=uuid.uuid4(), user_id=athlete.supabase_user_id,
        team_id=team_a.id, role=Role.ATHLETE,
    ))
    db_session.commit()
    db_session.refresh(athlete)
    return athlete


@pytest.fixture
def template_and_block(
    db_session: Session, team_a: Team, exercise_team_a: Exercise,
) -> tuple[WorkoutTemplate, WorkoutBlock]:
    tpl = WorkoutTemplate(id=uuid.uuid4(), team_id=team_a.id, title="Sprint Power")
    db_session.add(tpl)
    db_session.flush()
    block = WorkoutBlock(
        id=uuid.uuid4(), workout_template_id=tpl.id,
        name="Primary Strength", order_index=0,
    )
    db_session.add(block)
    db_session.flush()
    from app.models.block_exercise import BlockExercise
    db_session.add(BlockExercise(
        id=uuid.uuid4(), workout_block_id=block.id,
        exercise_id=exercise_team_a.id, order_index=0,
        prescription_json={"sets": 3, "reps": 5},
    ))
    db_session.commit()
    db_session.refresh(tpl)
    return tpl, block


@pytest.fixture
def session_a(db_session: Session, athlete_a: UserProfile, template_and_block):
    tpl, _ = template_and_block
    assignment = WorkoutAssignment(
        id=uuid.uuid4(), team_id=athlete_a.team_id,
        workout_template_id=tpl.id,
        target_type=AssignmentTargetType.ATHLETE,
        target_athlete_id=athlete_a.id,
    )
    db_session.add(assignment)
    db_session.flush()
    sess = WorkoutSession(
        id=uuid.uuid4(), assignment_id=assignment.id,
        athlete_id=athlete_a.id, workout_template_id=tpl.id,
    )
    db_session.add(sess)
    db_session.commit()
    db_session.refresh(sess)
    return sess


@pytest.fixture
def session_b(db_session: Session, athlete_b: UserProfile, team_b: Team):
    tpl = WorkoutTemplate(id=uuid.uuid4(), team_id=team_b.id, title="B Workout")
    db_session.add(tpl)
    db_session.flush()
    assignment = WorkoutAssignment(
        id=uuid.uuid4(), team_id=team_b.id, workout_template_id=tpl.id,
        target_type=AssignmentTargetType.ATHLETE, target_athlete_id=athlete_b.id,
    )
    db_session.add(assignment)
    db_session.flush()
    sess = WorkoutSession(
        id=uuid.uuid4(), assignment_id=assignment.id,
        athlete_id=athlete_b.id, workout_template_id=tpl.id,
    )
    db_session.add(sess)
    db_session.commit()
    db_session.refresh(sess)
    return sess


def _put_url(session_id: uuid.UUID) -> str:
    return f"{SESSIONS_ENDPOINT}/{session_id}/logs"


def _valid_payload(exercise_id: uuid.UUID) -> dict:
    return {
        "exercise_id": str(exercise_id),
        "entries": [
            {"set_number": 1, "reps": 5, "weight": 100.0, "rpe": 8.0},
            {"set_number": 2, "reps": 5, "weight": 100.0, "rpe": 8.5},
        ],
    }


# ---------------------------------------------------------------------------
# Auth / RBAC
# ---------------------------------------------------------------------------


class TestPutLogsAuth:

    def test_requires_auth(self, client: TestClient, session_a: WorkoutSession):
        resp = client.put(_put_url(session_a.id), json=_valid_payload(uuid.uuid4()))
        assert resp.status_code == 401

    def test_not_onboarded_returns_403(
        self, client: TestClient, mock_jwt, session_a: WorkoutSession,
        exercise_team_a: Exercise,
    ):
        mock_jwt(str(uuid.uuid4()))
        resp = client.put(
            _put_url(session_a.id), headers=HEADERS,
            json=_valid_payload(exercise_team_a.id),
        )
        assert resp.status_code == 403

    def test_coach_cannot_put_logs(
        self, client: TestClient, mock_jwt, coach_a: UserProfile,
        session_a: WorkoutSession, exercise_team_a: Exercise,
    ):
        mock_jwt(str(coach_a.supabase_user_id))
        resp = client.put(
            _put_url(session_a.id), headers=HEADERS,
            json=_valid_payload(exercise_team_a.id),
        )
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Tenant / ownership isolation
# ---------------------------------------------------------------------------


class TestPutLogsIsolation:

    def test_cross_team_session_returns_404(
        self, client: TestClient, mock_jwt, athlete_a: UserProfile,
        session_b: WorkoutSession, exercise_team_a: Exercise,
    ):
        mock_jwt(str(athlete_a.supabase_user_id))
        resp = client.put(
            _put_url(session_b.id), headers=HEADERS,
            json=_valid_payload(exercise_team_a.id),
        )
        assert resp.status_code == 404

    def test_peer_athletes_session_returns_404(
        self, client: TestClient, mock_jwt, athlete_a2: UserProfile,
        session_a: WorkoutSession, exercise_team_a: Exercise,
    ):
        mock_jwt(str(athlete_a2.supabase_user_id))
        resp = client.put(
            _put_url(session_a.id), headers=HEADERS,
            json=_valid_payload(exercise_team_a.id),
        )
        assert resp.status_code == 404

    def test_exercise_not_in_team_returns_404(
        self, client: TestClient, mock_jwt, athlete_a: UserProfile,
        session_a: WorkoutSession,
    ):
        mock_jwt(str(athlete_a.supabase_user_id))
        resp = client.put(
            _put_url(session_a.id), headers=HEADERS,
            json=_valid_payload(uuid.uuid4()),  # random exercise
        )
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Payload validation
# ---------------------------------------------------------------------------


class TestPutLogsValidation:

    def test_set_number_zero_returns_422(
        self, client: TestClient, mock_jwt, athlete_a: UserProfile,
        session_a: WorkoutSession, exercise_team_a: Exercise,
    ):
        mock_jwt(str(athlete_a.supabase_user_id))
        resp = client.put(
            _put_url(session_a.id), headers=HEADERS,
            json={
                "exercise_id": str(exercise_team_a.id),
                "entries": [{"set_number": 0, "reps": 5}],
            },
        )
        assert resp.status_code == 422

    def test_empty_entries_returns_422(
        self, client: TestClient, mock_jwt, athlete_a: UserProfile,
        session_a: WorkoutSession, exercise_team_a: Exercise,
    ):
        mock_jwt(str(athlete_a.supabase_user_id))
        resp = client.put(
            _put_url(session_a.id), headers=HEADERS,
            json={
                "exercise_id": str(exercise_team_a.id),
                "entries": [],
            },
        )
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------


class TestPutLogsHappyPath:

    def test_athlete_puts_to_own_session_returns_200(
        self, client: TestClient, mock_jwt, athlete_a: UserProfile,
        session_a: WorkoutSession, exercise_team_a: Exercise,
    ):
        mock_jwt(str(athlete_a.supabase_user_id))
        resp = client.put(
            _put_url(session_a.id), headers=HEADERS,
            json=_valid_payload(exercise_team_a.id),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["exercise_id"] == str(exercise_team_a.id)
        assert len(data["entries"]) == 2
        assert data["entries"][0]["set_number"] == 1

    def test_optional_fields_can_be_omitted(
        self, client: TestClient, mock_jwt, athlete_a: UserProfile,
        session_a: WorkoutSession, exercise_team_a: Exercise,
    ):
        mock_jwt(str(athlete_a.supabase_user_id))
        resp = client.put(
            _put_url(session_a.id), headers=HEADERS,
            json={
                "exercise_id": str(exercise_team_a.id),
                "entries": [{"set_number": 1, "reps": 10}],
            },
        )
        assert resp.status_code == 200

    def test_put_is_idempotent_no_duplicate_logs(
        self, client: TestClient, mock_jwt, athlete_a: UserProfile,
        session_a: WorkoutSession, exercise_team_a: Exercise,
        db_session: Session,
    ):
        """Two PUTs for the same exercise → exactly one WorkoutSessionLog row."""
        mock_jwt(str(athlete_a.supabase_user_id))
        payload = _valid_payload(exercise_team_a.id)

        r1 = client.put(_put_url(session_a.id), headers=HEADERS, json=payload)
        r2 = client.put(_put_url(session_a.id), headers=HEADERS, json=payload)

        assert r1.status_code == 200
        assert r2.status_code == 200

        count = db_session.execute(
            select(func.count()).select_from(WorkoutSessionLog).where(
                WorkoutSessionLog.session_id == session_a.id,
                WorkoutSessionLog.exercise_id == exercise_team_a.id,
            )
        ).scalar_one()
        assert count == 1

    def test_second_put_replaces_entries(
        self, client: TestClient, mock_jwt, athlete_a: UserProfile,
        session_a: WorkoutSession, exercise_team_a: Exercise,
    ):
        """Second PUT with different entries replaces all previous entries."""
        mock_jwt(str(athlete_a.supabase_user_id))
        url = _put_url(session_a.id)

        client.put(url, headers=HEADERS, json={
            "exercise_id": str(exercise_team_a.id),
            "entries": [{"set_number": 1, "reps": 5, "weight": 80.0}],
        })
        r2 = client.put(url, headers=HEADERS, json={
            "exercise_id": str(exercise_team_a.id),
            "entries": [
                {"set_number": 1, "reps": 8, "weight": 90.0},
                {"set_number": 2, "reps": 8, "weight": 90.0},
            ],
        })

        assert r2.status_code == 200
        data = r2.json()
        assert len(data["entries"]) == 2
        assert data["entries"][0]["reps"] == 8
        assert data["entries"][0]["weight"] == 90.0


# ---------------------------------------------------------------------------
# Funnel event: SESSION_FIRST_LOG_ADDED
# ---------------------------------------------------------------------------


class TestPutLogsFirstLogEvent:
    """First PUT fires SESSION_FIRST_LOG_ADDED; subsequent PUTs do not."""

    def test_first_put_fires_event(
        self, client: TestClient, mock_jwt, athlete_a: UserProfile,
        session_a: WorkoutSession, exercise_team_a: Exercise,
        db_session: Session,
    ):
        from app.domain.events.models import FunnelEvent, ProductEvent

        mock_jwt(str(athlete_a.supabase_user_id))
        resp = client.put(
            _put_url(session_a.id), headers=HEADERS,
            json=_valid_payload(exercise_team_a.id),
        )
        assert resp.status_code == 200

        events = db_session.execute(
            select(ProductEvent).where(
                ProductEvent.event_name == FunnelEvent.SESSION_FIRST_LOG_ADDED,
                ProductEvent.team_id == athlete_a.team_id,
            )
        ).scalars().all()
        assert len(events) == 1
        assert events[0].user_id == athlete_a.supabase_user_id

    def test_second_put_does_not_duplicate_event(
        self, client: TestClient, mock_jwt, athlete_a: UserProfile,
        session_a: WorkoutSession, exercise_team_a: Exercise,
        db_session: Session,
    ):
        from app.domain.events.models import FunnelEvent, ProductEvent

        mock_jwt(str(athlete_a.supabase_user_id))
        url = _put_url(session_a.id)
        payload = _valid_payload(exercise_team_a.id)

        client.put(url, headers=HEADERS, json=payload)
        client.put(url, headers=HEADERS, json=payload)

        events = db_session.execute(
            select(ProductEvent).where(
                ProductEvent.event_name == FunnelEvent.SESSION_FIRST_LOG_ADDED,
                ProductEvent.team_id == athlete_a.team_id,
            )
        ).scalars().all()
        assert len(events) == 1
