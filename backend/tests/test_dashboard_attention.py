"""
Integration tests for GET /v1/dashboard/attention

TDD RED phase: all tests expected to FAIL until the endpoint is implemented.

Classification rules:
- overdue:   scheduled_for < today AND not completed AND not cancelled
- due_today: scheduled_for == today AND not completed AND not cancelled
             AND no logs yet (exercises_logged_count == 0)
- stale:     not completed AND not cancelled AND has logs (exercises_logged_count > 0)
             AND last log was created > 48h ago AND not overdue (not in past)

Security:
- Requires COACH role (403 for ATHLETE)
- Requires auth (401)
- Scoped to coach's team (other-team sessions never appear)
"""
import uuid
from datetime import date, datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import (
    BlockExercise,
    Exercise,
    Membership,
    Role,
    Team,
    UserProfile,
    WorkoutBlock,
    WorkoutTemplate,
)
from app.models.workout_assignment import WorkoutAssignment
from app.models.workout_session import WorkoutSession
from app.models.workout_session_log import WorkoutSessionLog

ENDPOINT = "/v1/dashboard/attention"
HEADERS = {"Authorization": "Bearer test-token"}

# ---------------------------------------------------------------------------
# Local fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def template_a(db_session: Session, team_a: Team, coach_a: UserProfile) -> WorkoutTemplate:
    """Template with one block+exercise so sessions can have logs."""
    tpl = WorkoutTemplate(id=uuid.uuid4(), team_id=team_a.id, title="Attention Test Workout")
    db_session.add(tpl)
    db_session.flush()

    block = WorkoutBlock(
        id=uuid.uuid4(), workout_template_id=tpl.id, order_index=0, name="Main"
    )
    db_session.add(block)
    db_session.flush()

    exercise = Exercise(
        id=uuid.uuid4(),
        coach_id=coach_a.id,
        name="Attention Test Exercise",
        description="Exercise created for attention queue tests",
        tags=[],
    )
    db_session.add(exercise)
    db_session.flush()

    db_session.add(
        BlockExercise(
            id=uuid.uuid4(),
            workout_block_id=block.id,
            exercise_id=exercise.id,
            order_index=0,
        )
    )
    db_session.commit()
    db_session.refresh(tpl)
    return tpl


def _make_session(
    db_session: Session,
    athlete: UserProfile,
    template: WorkoutTemplate,
    scheduled_for: date | None = None,
    completed_at: datetime | None = None,
    cancelled_at: datetime | None = None,
) -> WorkoutSession:
    """Helper: create a WorkoutAssignment + WorkoutSession in the test DB."""
    assignment = WorkoutAssignment(
        id=uuid.uuid4(),
        workout_template_id=template.id,
        team_id=athlete.team_id,
        target_type="team",
        scheduled_for=scheduled_for,
    )
    db_session.add(assignment)
    db_session.flush()

    session = WorkoutSession(
        id=uuid.uuid4(),
        assignment_id=assignment.id,
        athlete_id=athlete.id,
        workout_template_id=template.id,
        scheduled_for=scheduled_for,
        completed_at=completed_at,
        cancelled_at=cancelled_at,
    )
    db_session.add(session)
    db_session.commit()
    db_session.refresh(session)
    return session


def _add_log(
    db_session: Session,
    session: WorkoutSession,
    exercise_id: uuid.UUID,
    team_id: uuid.UUID,
    created_at_override: datetime | None = None,
) -> WorkoutSessionLog:
    """Add a log entry to a session; optionally backdate created_at for stale tests."""
    log = WorkoutSessionLog(
        id=uuid.uuid4(),
        team_id=team_id,
        session_id=session.id,
        block_name="Main",
        exercise_id=exercise_id,
        notes=None,
    )
    db_session.add(log)
    db_session.flush()
    if created_at_override:
        # Bypass ORM to set an exact created_at value
        db_session.execute(
            __import__("sqlalchemy").text(
                "UPDATE workout_session_logs SET created_at = :ts WHERE id = :id"
            ),
            {"ts": created_at_override, "id": str(log.id)},
        )
    db_session.commit()
    db_session.refresh(log)
    return log


# ---------------------------------------------------------------------------
# Auth & RBAC tests
# ---------------------------------------------------------------------------


def test_attention_requires_auth(client: TestClient, template_a: WorkoutTemplate):
    resp = client.get(ENDPOINT)
    assert resp.status_code == 401


def test_attention_requires_coach_role(
    client: TestClient, mock_jwt, athlete_a: UserProfile
):
    mock_jwt(str(athlete_a.supabase_user_id))
    resp = client.get(ENDPOINT, headers=HEADERS)
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Empty state
# ---------------------------------------------------------------------------


def test_attention_empty_when_no_sessions(
    client: TestClient, mock_jwt, coach_a: UserProfile
):
    mock_jwt(str(coach_a.supabase_user_id))
    resp = client.get(ENDPOINT, headers=HEADERS)
    assert resp.status_code == 200
    data = resp.json()
    assert data["overdue"] == []
    assert data["due_today"] == []
    assert data["stale"] == []
    assert data["summary"]["total_overdue"] == 0
    assert data["summary"]["total_due_today"] == 0
    assert data["summary"]["total_stale"] == 0


# ---------------------------------------------------------------------------
# Overdue classification
# ---------------------------------------------------------------------------


def test_overdue_session_appears_in_overdue(
    client: TestClient,
    mock_jwt,
    coach_a: UserProfile,
    athlete_a: UserProfile,
    template_a: WorkoutTemplate,
    db_session: Session,
):
    yesterday = date.today() - timedelta(days=1)
    _make_session(db_session, athlete_a, template_a, scheduled_for=yesterday)

    mock_jwt(str(coach_a.supabase_user_id))
    resp = client.get(ENDPOINT, headers=HEADERS)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["overdue"]) == 1
    item = data["overdue"][0]
    assert item["athlete_name"] == athlete_a.name
    assert item["template_title"] == template_a.title
    assert data["summary"]["total_overdue"] == 1


def test_completed_session_not_in_overdue(
    client: TestClient,
    mock_jwt,
    coach_a: UserProfile,
    athlete_a: UserProfile,
    template_a: WorkoutTemplate,
    db_session: Session,
):
    yesterday = date.today() - timedelta(days=1)
    _make_session(
        db_session,
        athlete_a,
        template_a,
        scheduled_for=yesterday,
        completed_at=datetime.now(tz=timezone.utc),
    )

    mock_jwt(str(coach_a.supabase_user_id))
    resp = client.get(ENDPOINT, headers=HEADERS)
    assert resp.status_code == 200
    assert resp.json()["overdue"] == []


# ---------------------------------------------------------------------------
# Due-today classification
# ---------------------------------------------------------------------------


def test_due_today_not_started_appears_in_due_today(
    client: TestClient,
    mock_jwt,
    coach_a: UserProfile,
    athlete_a: UserProfile,
    template_a: WorkoutTemplate,
    db_session: Session,
):
    today = date.today()
    _make_session(db_session, athlete_a, template_a, scheduled_for=today)

    mock_jwt(str(coach_a.supabase_user_id))
    resp = client.get(ENDPOINT, headers=HEADERS)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["due_today"]) == 1
    assert data["due_today"][0]["athlete_name"] == athlete_a.name
    assert data["summary"]["total_due_today"] == 1


def test_due_today_started_not_in_due_today(
    client: TestClient,
    mock_jwt,
    coach_a: UserProfile,
    athlete_a: UserProfile,
    template_a: WorkoutTemplate,
    db_session: Session,
):
    """A session due today that has been started should not appear in due_today."""
    today = date.today()
    session = _make_session(db_session, athlete_a, template_a, scheduled_for=today)

    # Add a recent log (not stale yet)
    exercise_id = (
        db_session.query(BlockExercise)
        .join(WorkoutBlock, BlockExercise.workout_block_id == WorkoutBlock.id)
        .filter(WorkoutBlock.workout_template_id == template_a.id)
        .first()
        .exercise_id
    )
    _add_log(db_session, session, exercise_id, athlete_a.team_id)

    mock_jwt(str(coach_a.supabase_user_id))
    resp = client.get(ENDPOINT, headers=HEADERS)
    assert resp.status_code == 200
    # Not in due_today (has been started)
    assert resp.json()["due_today"] == []


# ---------------------------------------------------------------------------
# Stale classification
# ---------------------------------------------------------------------------


def test_stale_session_appears_in_stale(
    client: TestClient,
    mock_jwt,
    coach_a: UserProfile,
    athlete_a: UserProfile,
    template_a: WorkoutTemplate,
    db_session: Session,
):
    """Session with logs from > 48h ago, not overdue, should appear in stale."""
    # Scheduled for tomorrow — not overdue
    tomorrow = date.today() + timedelta(days=1)
    session = _make_session(db_session, athlete_a, template_a, scheduled_for=tomorrow)

    exercise_id = (
        db_session.query(BlockExercise)
        .join(WorkoutBlock, BlockExercise.workout_block_id == WorkoutBlock.id)
        .filter(WorkoutBlock.workout_template_id == template_a.id)
        .first()
        .exercise_id
    )
    old_ts = datetime.utcnow() - timedelta(hours=72)
    _add_log(db_session, session, exercise_id, athlete_a.team_id, created_at_override=old_ts)

    mock_jwt(str(coach_a.supabase_user_id))
    resp = client.get(ENDPOINT, headers=HEADERS)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["stale"]) == 1
    assert data["stale"][0]["athlete_name"] == athlete_a.name
    assert data["summary"]["total_stale"] == 1


def test_recent_logs_not_stale(
    client: TestClient,
    mock_jwt,
    coach_a: UserProfile,
    athlete_a: UserProfile,
    template_a: WorkoutTemplate,
    db_session: Session,
):
    """Session with a recent log (< 48h) should NOT appear in stale."""
    tomorrow = date.today() + timedelta(days=1)
    session = _make_session(db_session, athlete_a, template_a, scheduled_for=tomorrow)

    exercise_id = (
        db_session.query(BlockExercise)
        .join(WorkoutBlock, BlockExercise.workout_block_id == WorkoutBlock.id)
        .filter(WorkoutBlock.workout_template_id == template_a.id)
        .first()
        .exercise_id
    )
    # Recent log — NOT stale
    _add_log(db_session, session, exercise_id, athlete_a.team_id)

    mock_jwt(str(coach_a.supabase_user_id))
    resp = client.get(ENDPOINT, headers=HEADERS)
    assert resp.status_code == 200
    assert resp.json()["stale"] == []


def test_overdue_with_stale_logs_only_in_overdue(
    client: TestClient,
    mock_jwt,
    coach_a: UserProfile,
    athlete_a: UserProfile,
    template_a: WorkoutTemplate,
    db_session: Session,
):
    """Overdue sessions with old logs should appear in overdue only, not stale."""
    yesterday = date.today() - timedelta(days=1)
    session = _make_session(db_session, athlete_a, template_a, scheduled_for=yesterday)

    exercise_id = (
        db_session.query(BlockExercise)
        .join(WorkoutBlock, BlockExercise.workout_block_id == WorkoutBlock.id)
        .filter(WorkoutBlock.workout_template_id == template_a.id)
        .first()
        .exercise_id
    )
    old_ts = datetime.utcnow() - timedelta(hours=72)
    _add_log(db_session, session, exercise_id, athlete_a.team_id, created_at_override=old_ts)

    mock_jwt(str(coach_a.supabase_user_id))
    resp = client.get(ENDPOINT, headers=HEADERS)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["overdue"]) == 1
    assert data["stale"] == []


# ---------------------------------------------------------------------------
# Tenant isolation
# ---------------------------------------------------------------------------


def test_other_team_sessions_not_visible(
    client: TestClient,
    mock_jwt,
    coach_a: UserProfile,
    team_b: Team,
    db_session: Session,
):
    """Sessions from team_b must never appear in coach_a's attention queue."""
    # Create a coach + athlete + template in team_b
    coach_b = UserProfile(
        id=uuid.uuid4(),
        supabase_user_id=uuid.uuid4(),
        team_id=team_b.id,
        role=Role.COACH,
        name="Coach B",
    )
    athlete_b = UserProfile(
        id=uuid.uuid4(),
        supabase_user_id=uuid.uuid4(),
        team_id=team_b.id,
        role=Role.ATHLETE,
        name="Athlete B",
    )
    db_session.add_all([coach_b, athlete_b])
    db_session.flush()

    tpl_b = WorkoutTemplate(
        id=uuid.uuid4(), team_id=team_b.id, title="Team B Workout"
    )
    db_session.add(tpl_b)
    db_session.flush()

    yesterday = date.today() - timedelta(days=1)
    _make_session(db_session, athlete_b, tpl_b, scheduled_for=yesterday)

    mock_jwt(str(coach_a.supabase_user_id))
    resp = client.get(ENDPOINT, headers=HEADERS)
    assert resp.status_code == 200
    data = resp.json()
    assert data["overdue"] == []
    assert data["due_today"] == []
    assert data["stale"] == []


# ---------------------------------------------------------------------------
# Response shape
# ---------------------------------------------------------------------------


def test_attention_item_has_required_fields(
    client: TestClient,
    mock_jwt,
    coach_a: UserProfile,
    athlete_a: UserProfile,
    template_a: WorkoutTemplate,
    db_session: Session,
):
    yesterday = date.today() - timedelta(days=1)
    _make_session(db_session, athlete_a, template_a, scheduled_for=yesterday)

    mock_jwt(str(coach_a.supabase_user_id))
    resp = client.get(ENDPOINT, headers=HEADERS)
    item = resp.json()["overdue"][0]

    assert "id" in item
    assert "athlete_id" in item
    assert "workout_template_id" in item
    assert "scheduled_for" in item
    assert "template_title" in item
    assert "athlete_name" in item
    assert "exercise_count" in item
    assert "exercises_logged_count" in item
