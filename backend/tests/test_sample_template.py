"""
Integration tests for POST /v1/workout-templates/sample.

RED → GREEN:
    1. COACH creates sample template → 201 with an id.
    2. Template has one block with 4 exercises.
    3. ATHLETE is rejected with 403.
    4. Unauthenticated request is rejected with 401.
    5. Calling twice returns the same template (idempotent).
    6. Exercises with different casing are reused (normalised lookup).
"""
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Team, UserProfile, Role, Membership


# ---------------------------------------------------------------------------
# Shared fixture — an onboarded coach in their own team
# ---------------------------------------------------------------------------

@pytest.fixture
def sample_coach(db_session: Session, mock_jwt):
    """Fresh coach used across all sample-template tests."""
    supabase_uid = uuid.uuid4()
    team = Team(id=uuid.uuid4(), name="Sample Team", created_by_user_id=supabase_uid)
    db_session.add(team)
    db_session.flush()
    coach = UserProfile(
        id=uuid.uuid4(),
        supabase_user_id=supabase_uid,
        team_id=team.id,
        role=Role.COACH,
        name="Sample Coach",
    )
    db_session.add(coach)
    db_session.flush()
    db_session.add(Membership(
        id=uuid.uuid4(),
        user_id=coach.supabase_user_id,
        team_id=team.id,
        role=Role.COACH,
    ))
    db_session.commit()
    db_session.refresh(coach)
    mock_jwt(str(coach.supabase_user_id))
    return coach


@pytest.fixture
def sample_athlete(db_session: Session, mock_jwt):
    supabase_uid = uuid.uuid4()
    team = Team(id=uuid.uuid4(), name="Athlete Team", created_by_user_id=uuid.uuid4())
    db_session.add(team)
    db_session.flush()
    athlete = UserProfile(
        id=uuid.uuid4(),
        supabase_user_id=supabase_uid,
        team_id=team.id,
        role=Role.ATHLETE,
        name="Sample Athlete",
    )
    db_session.add(athlete)
    db_session.flush()
    db_session.add(Membership(
        id=uuid.uuid4(),
        user_id=athlete.supabase_user_id,
        team_id=team.id,
        role=Role.ATHLETE,
    ))
    db_session.commit()
    db_session.refresh(athlete)
    mock_jwt(str(athlete.supabase_user_id))
    return athlete


HEADERS = {"Authorization": "Bearer test-token"}


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestCreateSampleTemplate:

    def test_coach_creates_sample_returns_201(self, client: TestClient, sample_coach):
        resp = client.post("/v1/workout-templates/sample", headers=HEADERS)

        assert resp.status_code == 201
        body = resp.json()
        assert "id" in body
        # id must be a valid UUID
        uuid.UUID(body["id"])

    def test_sample_template_has_block_with_exercises(
        self, client: TestClient, sample_coach, db_session: Session
    ):
        from sqlalchemy import select
        from app.models.workout_template import WorkoutTemplate
        from app.models.workout_block import WorkoutBlock
        from app.models.block_exercise import BlockExercise

        resp = client.post("/v1/workout-templates/sample", headers=HEADERS)
        assert resp.status_code == 201
        template_id = uuid.UUID(resp.json()["id"])

        template = db_session.execute(
            select(WorkoutTemplate).where(WorkoutTemplate.id == template_id)
        ).scalar_one()
        assert template.title == "Full Body Strength Workout"
        assert template.team_id == sample_coach.team_id

        blocks = db_session.execute(
            select(WorkoutBlock).where(WorkoutBlock.workout_template_id == template_id)
        ).scalars().all()
        assert len(blocks) == 1
        assert blocks[0].name == "Main Circuit"

        items = db_session.execute(
            select(BlockExercise).where(BlockExercise.workout_block_id == blocks[0].id)
        ).scalars().all()
        assert len(items) == 4

    def test_athlete_is_forbidden(self, client: TestClient, sample_athlete):
        resp = client.post("/v1/workout-templates/sample", headers=HEADERS)
        assert resp.status_code == 403

    def test_unauthenticated_is_rejected(self, client: TestClient):
        resp = client.post("/v1/workout-templates/sample")
        assert resp.status_code == 401

    def test_calling_twice_returns_same_template(
        self, client: TestClient, sample_coach, db_session: Session
    ):
        """Second call is idempotent — returns existing template, no duplicate created."""
        from sqlalchemy import select
        from app.models.workout_template import WorkoutTemplate

        resp1 = client.post("/v1/workout-templates/sample", headers=HEADERS)
        resp2 = client.post("/v1/workout-templates/sample", headers=HEADERS)

        assert resp1.status_code == 201
        assert resp2.status_code == 200  # existing returned
        assert resp1.json()["id"] == resp2.json()["id"]

        # Only one template exists
        templates = db_session.execute(
            select(WorkoutTemplate).where(
                WorkoutTemplate.team_id == sample_coach.team_id
            )
        ).scalars().all()
        assert len(templates) == 1

    def test_exercises_are_reused_across_calls(
        self, client: TestClient, sample_coach, db_session: Session
    ):
        """Exercises created by first call are reused; still 4 after second call."""
        from sqlalchemy import select
        from app.models.exercise import Exercise

        client.post("/v1/workout-templates/sample", headers=HEADERS)
        client.post("/v1/workout-templates/sample", headers=HEADERS)

        exercises = db_session.execute(
            select(Exercise).where(Exercise.coach_id == sample_coach.id)
        ).scalars().all()
        assert len(exercises) == 4

    def test_exercise_reuse_is_case_insensitive(
        self, client: TestClient, sample_coach, db_session: Session
    ):
        """Pre-existing exercises with different casing are reused, not duplicated."""
        from sqlalchemy import select
        from app.models.exercise import Exercise, OwnerType

        # Pre-create exercises with different casing/whitespace
        pre_existing = [
            Exercise(
                coach_id=sample_coach.id,
                owner_type=OwnerType.COACH,
                is_editable=True,
                name="back squat",   # lowercase
                description="A foundational lower-body compound movement for strength.",
                tags=["strength"],
            ),
            Exercise(
                coach_id=sample_coach.id,
                owner_type=OwnerType.COACH,
                is_editable=True,
                name="BENCH PRESS",  # uppercase
                description="A horizontal push movement for upper-body strength.",
                tags=["strength"],
            ),
        ]
        for ex in pre_existing:
            db_session.add(ex)
        db_session.commit()

        resp = client.post("/v1/workout-templates/sample", headers=HEADERS)
        assert resp.status_code == 201

        exercises = db_session.execute(
            select(Exercise).where(Exercise.coach_id == sample_coach.id)
        ).scalars().all()
        # 2 pre-existing reused + 2 new (Romanian Deadlift + Plank Hold) = 4 total
        assert len(exercises) == 4
