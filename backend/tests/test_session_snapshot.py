"""
Regression test: assigned sessions are snapshots — they must NOT change when
the coach edits the underlying template after assignment.

Domain invariant:
  "An assigned session is a snapshot — it does not change if the template changes."
"""
import uuid
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.block_exercise import BlockExercise
from app.models.exercise import Exercise
from app.models.workout_assignment import WorkoutAssignment
from app.models.workout_block import WorkoutBlock
from app.models.workout_session import WorkoutSession
from app.models.workout_template import WorkoutTemplate

HEADERS = {"Authorization": "Bearer test-token"}

PRESCRIPTION_X = {"sets": 4, "reps": "8", "weight": "80kg"}
PRESCRIPTION_Y = {"sets": 5, "reps": "3", "weight": "100kg"}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _build_snapshot(title: str, blocks: list[dict[str, Any]]) -> dict[str, Any]:
    """Build a template_snapshot dict matching the JSONB schema."""
    return {"title": title, "blocks": blocks}


def _replace_exercise(db_session, template_id, old_exercise_id, new_exercise, new_prescription):
    """Swap one exercise for another inside the template."""
    block = db_session.execute(
        select(WorkoutBlock).where(
            WorkoutBlock.workout_template_id == template_id,
        )
    ).scalar_one()

    old_item = db_session.execute(
        select(BlockExercise).where(
            BlockExercise.workout_block_id == block.id,
            BlockExercise.exercise_id == old_exercise_id,
        )
    ).scalar_one()
    db_session.delete(old_item)
    db_session.flush()

    db_session.add(BlockExercise(
        id=uuid.uuid4(), workout_block_id=block.id,
        exercise_id=new_exercise.id, order_index=0,
        prescription_json=new_prescription,
    ))
    db_session.commit()


# ---------------------------------------------------------------------------
# Local fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def exercise_a(db_session: Session, coach_a) -> Exercise:
    """Original exercise: Back Squat."""
    ex = Exercise(
        id=uuid.uuid4(), coach_id=coach_a.id, name="Back Squat",
        description="Barbell back squat for lower body strength.", tags=["strength"],
    )
    db_session.add(ex)
    db_session.flush()
    return ex


@pytest.fixture
def exercise_b(db_session: Session, coach_a) -> Exercise:
    """Replacement exercise: Front Squat."""
    ex = Exercise(
        id=uuid.uuid4(), coach_id=coach_a.id, name="Front Squat",
        description="Barbell front squat for quad-dominant strength.", tags=["strength"],
    )
    db_session.add(ex)
    db_session.flush()
    return ex


@pytest.fixture
def snapshot_template(db_session: Session, team_a, exercise_a):
    """Template with 1 block → 1 exercise (exercise A, prescription X)."""
    tpl = WorkoutTemplate(
        id=uuid.uuid4(), team_id=team_a.id, title="Snapshot Test",
        status="published",
    )
    db_session.add(tpl)
    db_session.flush()

    block = WorkoutBlock(
        id=uuid.uuid4(), workout_template_id=tpl.id,
        name="Primary Strength", order_index=0,
    )
    db_session.add(block)
    db_session.flush()

    db_session.add(BlockExercise(
        id=uuid.uuid4(), workout_block_id=block.id,
        exercise_id=exercise_a.id, order_index=0,
        prescription_json=PRESCRIPTION_X,
    ))
    db_session.commit()
    db_session.refresh(tpl)
    return tpl


@pytest.fixture
def assigned_session(db_session: Session, snapshot_template, exercise_a, athlete_a, team_a):
    """Assignment + session created while template has exercise A.

    Stores a template_snapshot capturing the state at assignment time — the same
    thing CreateWorkoutAssignmentUseCase now does.
    """
    snapshot = _build_snapshot(
        title=snapshot_template.title,
        blocks=[{
            "name": "Primary Strength",
            "order": 0,
            "items": [{
                "exercise_id": str(exercise_a.id),
                "exercise_name": "Back Squat",
                "order": 0,
                "prescription": PRESCRIPTION_X,
            }],
        }],
    )

    assignment = WorkoutAssignment(
        id=uuid.uuid4(), team_id=team_a.id,
        workout_template_id=snapshot_template.id, target_type="athlete",
        target_athlete_id=athlete_a.id,
        template_snapshot=snapshot,
    )
    db_session.add(assignment)
    db_session.flush()

    session = WorkoutSession(
        id=uuid.uuid4(), assignment_id=assignment.id,
        athlete_id=athlete_a.id, workout_template_id=snapshot_template.id,
    )
    db_session.add(session)
    db_session.commit()
    return session


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestSessionSnapshot:
    """
    Invariant: "An assigned session is a snapshot — it does not change if the
    template changes."
    """

    def test_session_shows_original_exercise_after_template_edit(
        self, client: TestClient, mock_jwt, db_session: Session,
        athlete_a, exercise_a, exercise_b,
        snapshot_template, assigned_session,
    ):
        """
        Steps:
          1. Template has exercise A (Back Squat) + prescription X → session assigned
          2. Coach replaces exercise A with exercise B (Front Squat) + prescription Y
          3. Athlete fetches session → MUST still see exercise A + prescription X
        """
        # Step 2: edit template after assignment
        _replace_exercise(
            db_session, snapshot_template.id,
            old_exercise_id=exercise_a.id,
            new_exercise=exercise_b,
            new_prescription=PRESCRIPTION_Y,
        )

        # Step 3: athlete opens the session
        mock_jwt(str(athlete_a.supabase_user_id))
        resp = client.get(
            f"/v1/workout-sessions/{assigned_session.id}/execution",
            headers=HEADERS,
        )
        assert resp.status_code == 200
        data = resp.json()

        exercise_ids = {
            item["exercise_id"]
            for b in data["blocks"]
            for item in b["items"]
        }
        exercise_names = {
            item["exercise_name"]
            for b in data["blocks"]
            for item in b["items"]
        }

        # Session must still show the ORIGINAL exercise A
        assert str(exercise_a.id) in exercise_ids, \
            "Snapshot violated: session must show original exercise (Back Squat)"
        assert "Back Squat" in exercise_names

        # Session must NOT show the replacement exercise B
        assert str(exercise_b.id) not in exercise_ids, \
            "Snapshot violated: session must NOT show replacement exercise (Front Squat)"

        # Prescription must be the original
        block = data["blocks"][0]
        assert block["items"][0]["prescription"] == PRESCRIPTION_X, \
            "Snapshot violated: session must show original prescription"

    def test_new_assignment_after_edit_sees_updated_template(
        self, client: TestClient, mock_jwt, db_session: Session,
        athlete_a, team_a, exercise_a, exercise_b,
        snapshot_template, assigned_session,
    ):
        """
        After template edit, a NEW assignment (with its own snapshot) must see
        the updated content.
        """
        # Edit template
        _replace_exercise(
            db_session, snapshot_template.id,
            old_exercise_id=exercise_a.id,
            new_exercise=exercise_b,
            new_prescription=PRESCRIPTION_Y,
        )

        # Create a NEW assignment + session with snapshot of the updated template
        new_snapshot = _build_snapshot(
            title=snapshot_template.title,
            blocks=[{
                "name": "Primary Strength",
                "order": 0,
                "items": [{
                    "exercise_id": str(exercise_b.id),
                    "exercise_name": "Front Squat",
                    "order": 0,
                    "prescription": PRESCRIPTION_Y,
                }],
            }],
        )

        new_assignment = WorkoutAssignment(
            id=uuid.uuid4(), team_id=team_a.id,
            workout_template_id=snapshot_template.id, target_type="athlete",
            target_athlete_id=athlete_a.id,
            template_snapshot=new_snapshot,
        )
        db_session.add(new_assignment)
        db_session.flush()
        new_session = WorkoutSession(
            id=uuid.uuid4(), assignment_id=new_assignment.id,
            athlete_id=athlete_a.id, workout_template_id=snapshot_template.id,
        )
        db_session.add(new_session)
        db_session.commit()

        # Fetch execution view for the new session
        mock_jwt(str(athlete_a.supabase_user_id))
        resp = client.get(
            f"/v1/workout-sessions/{new_session.id}/execution",
            headers=HEADERS,
        )
        assert resp.status_code == 200
        data = resp.json()

        exercise_ids = {
            item["exercise_id"]
            for b in data["blocks"]
            for item in b["items"]
        }

        # New session must see the UPDATED exercise B
        assert str(exercise_b.id) in exercise_ids, \
            "New assignment after edit must see updated exercise (Front Squat)"

        # Updated prescription
        block = data["blocks"][0]
        assert block["items"][0]["prescription"] == PRESCRIPTION_Y, \
            "New assignment must see updated prescription"
