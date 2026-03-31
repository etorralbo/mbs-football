"""
Integration tests for session-level structure editing (COACH only).

PATCH  /v1/workout-sessions/{id}/structure/exercises/{exercise_id}
DELETE /v1/workout-sessions/{id}/structure/exercises/{exercise_id}
POST   /v1/workout-sessions/{id}/structure/exercises

RED → GREEN:
    1. COACH can update exercise prescription → 204
    2. ATHLETE is rejected → 403
    3. Unauthenticated is rejected → 401
    4. Session edit does not affect the template
    5. Session edit does not affect other sessions (isolation)
    6. COACH can remove an exercise → 204
    7. Remove exercise with existing logs → 409
    8. COACH can add an exercise to a block → 201
    9. Cross-team session access is denied → 404
"""
import copy
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.block_exercise import BlockExercise
from app.models.exercise import Exercise, OwnerType
from app.models.membership import Membership
from app.models.user_profile import Role, UserProfile
from app.models.workout_assignment import WorkoutAssignment
from app.models.workout_block import WorkoutBlock
from app.models.workout_session import WorkoutSession
from app.models.workout_session_log import WorkoutSessionLog
from app.models.workout_session_log_entry import WorkoutSessionLogEntry
from app.models.workout_template import WorkoutTemplate
from tests.conftest import Team

HEADERS = {"Authorization": "Bearer test-token"}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_snapshot(template, block_name, exercises):
    """Build a template_snapshot matching the format used by _snapshot_template()."""
    return {
        "template_id": str(template.id),
        "snapshotted_at": "2026-03-31T10:00:00Z",
        "title": template.title,
        "blocks": [
            {
                "name": block_name,
                "order": 0,
                "items": [
                    {
                        "exercise_id": str(ex.id),
                        "exercise_name": ex.name,
                        "order": idx,
                        "prescription": {"sets": [{"reps": 5, "weight": 100.0}]},
                        "video": None,
                    }
                    for idx, ex in enumerate(exercises)
                ],
            }
        ],
    }


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def ex_squat(db_session: Session, coach_a) -> Exercise:
    ex = Exercise(
        id=uuid.uuid4(),
        coach_id=coach_a.id,
        owner_type=OwnerType.COACH,
        is_editable=True,
        name="Back Squat",
        description="Foundational lower-body compound movement for strength.",
        tags=["strength"],
    )
    db_session.add(ex)
    db_session.flush()
    return ex


@pytest.fixture
def ex_deadlift(db_session: Session, coach_a) -> Exercise:
    ex = Exercise(
        id=uuid.uuid4(),
        coach_id=coach_a.id,
        owner_type=OwnerType.COACH,
        is_editable=True,
        name="Romanian Deadlift",
        description="Hip-hinge movement for posterior chain strength.",
        tags=["strength"],
    )
    db_session.add(ex)
    db_session.flush()
    return ex


@pytest.fixture
def ex_plank(db_session: Session, coach_a) -> Exercise:
    ex = Exercise(
        id=uuid.uuid4(),
        coach_id=coach_a.id,
        owner_type=OwnerType.COACH,
        is_editable=True,
        name="Plank Hold",
        description="Isometric core stability exercise for trunk endurance.",
        tags=["core"],
    )
    db_session.add(ex)
    db_session.flush()
    return ex


@pytest.fixture
def template_edit(db_session: Session, team_a, ex_squat, ex_deadlift) -> WorkoutTemplate:
    tpl = WorkoutTemplate(
        id=uuid.uuid4(), team_id=team_a.id, title="Strength Session"
    )
    db_session.add(tpl)
    db_session.flush()

    block = WorkoutBlock(
        id=uuid.uuid4(), workout_template_id=tpl.id,
        name="Main Block", order_index=0,
    )
    db_session.add(block)
    db_session.flush()

    for idx, ex in enumerate([ex_squat, ex_deadlift]):
        db_session.add(BlockExercise(
            id=uuid.uuid4(), workout_block_id=block.id,
            exercise_id=ex.id, order_index=idx,
            prescription_json={"sets": [{"reps": 5, "weight": 100.0}]},
        ))

    db_session.commit()
    db_session.refresh(tpl)
    return tpl


@pytest.fixture
def athlete_a2(db_session: Session, team_a) -> UserProfile:
    """Second athlete in team_a for isolation tests."""
    supabase_uid = uuid.uuid4()
    athlete = UserProfile(
        id=uuid.uuid4(), supabase_user_id=supabase_uid,
        team_id=team_a.id, role=Role.ATHLETE, name="Athlete Two",
    )
    db_session.add(athlete)
    db_session.flush()
    db_session.add(Membership(
        id=uuid.uuid4(), user_id=supabase_uid,
        team_id=team_a.id, role=Role.ATHLETE,
    ))
    db_session.commit()
    db_session.refresh(athlete)
    return athlete


@pytest.fixture
def session_with_snapshot(
    db_session: Session, team_a, coach_a, athlete_a, template_edit, ex_squat, ex_deadlift, mock_jwt
) -> WorkoutSession:
    """A session for athlete_a with a template_snapshot on the assignment."""
    mock_jwt(str(coach_a.supabase_user_id))
    snapshot = _make_snapshot(template_edit, "Main Block", [ex_squat, ex_deadlift])
    assignment = WorkoutAssignment(
        id=uuid.uuid4(), team_id=team_a.id,
        workout_template_id=template_edit.id,
        target_type="athlete", target_athlete_id=athlete_a.id,
        template_snapshot=snapshot,
    )
    db_session.add(assignment)
    db_session.flush()

    session = WorkoutSession(
        id=uuid.uuid4(), assignment_id=assignment.id,
        athlete_id=athlete_a.id, workout_template_id=template_edit.id,
    )
    db_session.add(session)
    db_session.commit()
    db_session.refresh(session)
    return session


@pytest.fixture
def session_athlete_b(
    db_session: Session, team_a, athlete_a2, template_edit, ex_squat, ex_deadlift
) -> WorkoutSession:
    """Separate session for athlete_a2 from the same template."""
    snapshot = _make_snapshot(template_edit, "Main Block", [ex_squat, ex_deadlift])
    assignment = WorkoutAssignment(
        id=uuid.uuid4(), team_id=team_a.id,
        workout_template_id=template_edit.id,
        target_type="athlete", target_athlete_id=athlete_a2.id,
        template_snapshot=snapshot,
    )
    db_session.add(assignment)
    db_session.flush()

    session = WorkoutSession(
        id=uuid.uuid4(), assignment_id=assignment.id,
        athlete_id=athlete_a2.id, workout_template_id=template_edit.id,
    )
    db_session.add(session)
    db_session.commit()
    db_session.refresh(session)
    return session


# ---------------------------------------------------------------------------
# Tests — Update prescription
# ---------------------------------------------------------------------------

class TestUpdateExercisePrescription:

    def test_coach_can_update_prescription(
        self, client: TestClient, session_with_snapshot, ex_squat,
    ):
        resp = client.patch(
            f"/v1/workout-sessions/{session_with_snapshot.id}"
            f"/structure/exercises/{ex_squat.id}",
            json={"sets": [{"reps": 3, "weight": 120.0}]},
            headers=HEADERS,
        )
        assert resp.status_code == 204

    def test_athlete_cannot_update_prescription(
        self, client: TestClient, mock_jwt, athlete_a, session_with_snapshot, ex_squat,
    ):
        mock_jwt(str(athlete_a.supabase_user_id))
        resp = client.patch(
            f"/v1/workout-sessions/{session_with_snapshot.id}"
            f"/structure/exercises/{ex_squat.id}",
            json={"sets": [{"reps": 3}]},
            headers=HEADERS,
        )
        assert resp.status_code == 403

    def test_unauthenticated_is_rejected(
        self, client: TestClient, session_with_snapshot, ex_squat,
    ):
        resp = client.patch(
            f"/v1/workout-sessions/{session_with_snapshot.id}"
            f"/structure/exercises/{ex_squat.id}",
            json={"sets": [{"reps": 3}]},
        )
        assert resp.status_code == 401

    def test_update_does_not_affect_template(
        self,
        client: TestClient,
        session_with_snapshot,
        ex_squat,
        template_edit,
        db_session: Session,
    ):
        """Editing session prescription leaves template block_exercise unchanged."""
        from sqlalchemy import select

        client.patch(
            f"/v1/workout-sessions/{session_with_snapshot.id}"
            f"/structure/exercises/{ex_squat.id}",
            json={"sets": [{"reps": 1, "weight": 999.0}]},
            headers=HEADERS,
        )

        original = db_session.execute(
            select(BlockExercise).where(BlockExercise.exercise_id == ex_squat.id)
        ).scalar_one()
        assert original.prescription_json == {"sets": [{"reps": 5, "weight": 100.0}]}

    def test_update_does_not_affect_other_sessions(
        self,
        client: TestClient,
        session_with_snapshot,
        session_athlete_b,
        ex_squat,
        athlete_a2,
        mock_jwt,
        coach_a,
    ):
        """Editing session A leaves session B's prescription unchanged."""
        # Edit session A
        mock_jwt(str(coach_a.supabase_user_id))
        client.patch(
            f"/v1/workout-sessions/{session_with_snapshot.id}"
            f"/structure/exercises/{ex_squat.id}",
            json={"sets": [{"reps": 1, "weight": 999.0}]},
            headers=HEADERS,
        )

        # Fetch session B's execution view
        resp_b = client.get(
            f"/v1/workout-sessions/{session_athlete_b.id}/execution",
            headers=HEADERS,
        )
        assert resp_b.status_code == 200
        squat_item = next(
            item
            for block in resp_b.json()["blocks"]
            for item in block["items"]
            if item["exercise_id"] == str(ex_squat.id)
        )
        # Session B still has the original prescription
        assert squat_item["prescription"] == {"sets": [{"reps": 5, "weight": 100.0}]}

    def test_updated_prescription_appears_in_execution_view(
        self,
        client: TestClient,
        session_with_snapshot,
        ex_squat,
        coach_a,
        mock_jwt,
    ):
        """After PATCH, GET /execution reflects the new prescription."""
        mock_jwt(str(coach_a.supabase_user_id))
        client.patch(
            f"/v1/workout-sessions/{session_with_snapshot.id}"
            f"/structure/exercises/{ex_squat.id}",
            json={"sets": [{"reps": 3, "weight": 120.0}]},
            headers=HEADERS,
        )

        resp = client.get(
            f"/v1/workout-sessions/{session_with_snapshot.id}/execution",
            headers=HEADERS,
        )
        assert resp.status_code == 200
        squat_item = next(
            item
            for block in resp.json()["blocks"]
            for item in block["items"]
            if item["exercise_id"] == str(ex_squat.id)
        )
        assert squat_item["prescription"]["sets"] == [{"reps": 3, "weight": 120.0}]

    def test_cross_team_session_returns_404(
        self,
        client: TestClient,
        mock_jwt,
        coach_b,
        session_with_snapshot,
        ex_squat,
    ):
        mock_jwt(str(coach_b.supabase_user_id))
        resp = client.patch(
            f"/v1/workout-sessions/{session_with_snapshot.id}"
            f"/structure/exercises/{ex_squat.id}",
            json={"sets": [{"reps": 3}]},
            headers=HEADERS,
        )
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Tests — Remove exercise
# ---------------------------------------------------------------------------

class TestRemoveExercise:

    def test_coach_can_remove_exercise(
        self, client: TestClient, session_with_snapshot, ex_deadlift, coach_a, mock_jwt,
    ):
        mock_jwt(str(coach_a.supabase_user_id))
        resp = client.delete(
            f"/v1/workout-sessions/{session_with_snapshot.id}"
            f"/structure/exercises/{ex_deadlift.id}",
            headers=HEADERS,
        )
        assert resp.status_code == 204

    def test_removed_exercise_absent_from_execution_view(
        self,
        client: TestClient,
        session_with_snapshot,
        ex_deadlift,
        coach_a,
        mock_jwt,
    ):
        mock_jwt(str(coach_a.supabase_user_id))
        client.delete(
            f"/v1/workout-sessions/{session_with_snapshot.id}"
            f"/structure/exercises/{ex_deadlift.id}",
            headers=HEADERS,
        )

        resp = client.get(
            f"/v1/workout-sessions/{session_with_snapshot.id}/execution",
            headers=HEADERS,
        )
        assert resp.status_code == 200
        all_exercise_ids = [
            item["exercise_id"]
            for block in resp.json()["blocks"]
            for item in block["items"]
        ]
        assert str(ex_deadlift.id) not in all_exercise_ids

    def test_remove_exercise_with_logs_returns_409(
        self,
        client: TestClient,
        db_session: Session,
        session_with_snapshot,
        ex_squat,
        athlete_a,
        team_a,
        coach_a,
        mock_jwt,
    ):
        """Cannot remove an exercise that the athlete has already logged."""
        # Log a set for ex_squat
        log = WorkoutSessionLog(
            id=uuid.uuid4(), team_id=team_a.id,
            session_id=session_with_snapshot.id,
            block_name="Main Block", exercise_id=ex_squat.id,
            created_by_profile_id=athlete_a.id,
        )
        db_session.add(log)
        db_session.flush()
        db_session.add(WorkoutSessionLogEntry(
            id=uuid.uuid4(), log_id=log.id, set_number=1, reps=5, weight=100.0,
        ))
        db_session.commit()

        mock_jwt(str(coach_a.supabase_user_id))
        resp = client.delete(
            f"/v1/workout-sessions/{session_with_snapshot.id}"
            f"/structure/exercises/{ex_squat.id}",
            headers=HEADERS,
        )
        assert resp.status_code == 409

    def test_athlete_cannot_remove_exercise(
        self,
        client: TestClient,
        mock_jwt,
        athlete_a,
        session_with_snapshot,
        ex_deadlift,
    ):
        mock_jwt(str(athlete_a.supabase_user_id))
        resp = client.delete(
            f"/v1/workout-sessions/{session_with_snapshot.id}"
            f"/structure/exercises/{ex_deadlift.id}",
            headers=HEADERS,
        )
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Tests — Add exercise
# ---------------------------------------------------------------------------

class TestAddExercise:

    def test_coach_can_add_exercise(
        self,
        client: TestClient,
        session_with_snapshot,
        ex_plank,
        coach_a,
        mock_jwt,
    ):
        mock_jwt(str(coach_a.supabase_user_id))
        resp = client.post(
            f"/v1/workout-sessions/{session_with_snapshot.id}/structure/exercises",
            json={
                "exercise_id": str(ex_plank.id),
                "block_index": 0,
                "sets": [{"reps": None, "duration": "60s"}],
            },
            headers=HEADERS,
        )
        assert resp.status_code == 201

    def test_added_exercise_appears_in_execution_view(
        self,
        client: TestClient,
        session_with_snapshot,
        ex_plank,
        coach_a,
        mock_jwt,
    ):
        mock_jwt(str(coach_a.supabase_user_id))
        client.post(
            f"/v1/workout-sessions/{session_with_snapshot.id}/structure/exercises",
            json={
                "exercise_id": str(ex_plank.id),
                "block_index": 0,
                "sets": [{"reps": None, "duration": "60s"}],
            },
            headers=HEADERS,
        )

        resp = client.get(
            f"/v1/workout-sessions/{session_with_snapshot.id}/execution",
            headers=HEADERS,
        )
        assert resp.status_code == 200
        all_exercise_ids = [
            item["exercise_id"]
            for block in resp.json()["blocks"]
            for item in block["items"]
        ]
        assert str(ex_plank.id) in all_exercise_ids

    def test_add_exercise_does_not_affect_template(
        self,
        client: TestClient,
        db_session: Session,
        session_with_snapshot,
        ex_plank,
        template_edit,
        coach_a,
        mock_jwt,
    ):
        from sqlalchemy import select

        mock_jwt(str(coach_a.supabase_user_id))
        client.post(
            f"/v1/workout-sessions/{session_with_snapshot.id}/structure/exercises",
            json={"exercise_id": str(ex_plank.id), "block_index": 0, "sets": []},
            headers=HEADERS,
        )

        # Template should still have exactly 2 exercises (squat + deadlift)
        blocks = db_session.execute(
            select(WorkoutBlock).where(
                WorkoutBlock.workout_template_id == template_edit.id
            )
        ).scalars().all()
        items = db_session.execute(
            select(BlockExercise).where(
                BlockExercise.workout_block_id == blocks[0].id
            )
        ).scalars().all()
        assert len(items) == 2

    def test_add_unknown_exercise_returns_404(
        self,
        client: TestClient,
        session_with_snapshot,
        coach_a,
        mock_jwt,
    ):
        mock_jwt(str(coach_a.supabase_user_id))
        resp = client.post(
            f"/v1/workout-sessions/{session_with_snapshot.id}/structure/exercises",
            json={
                "exercise_id": str(uuid.uuid4()),
                "block_index": 0,
                "sets": [],
            },
            headers=HEADERS,
        )
        assert resp.status_code == 404

    def test_add_out_of_range_block_returns_404(
        self,
        client: TestClient,
        session_with_snapshot,
        ex_plank,
        coach_a,
        mock_jwt,
    ):
        mock_jwt(str(coach_a.supabase_user_id))
        resp = client.post(
            f"/v1/workout-sessions/{session_with_snapshot.id}/structure/exercises",
            json={
                "exercise_id": str(ex_plank.id),
                "block_index": 99,
                "sets": [],
            },
            headers=HEADERS,
        )
        assert resp.status_code == 404

    def test_athlete_cannot_add_exercise(
        self,
        client: TestClient,
        mock_jwt,
        athlete_a,
        session_with_snapshot,
        ex_plank,
    ):
        mock_jwt(str(athlete_a.supabase_user_id))
        resp = client.post(
            f"/v1/workout-sessions/{session_with_snapshot.id}/structure/exercises",
            json={"exercise_id": str(ex_plank.id), "block_index": 0, "sets": []},
            headers=HEADERS,
        )
        assert resp.status_code == 403
