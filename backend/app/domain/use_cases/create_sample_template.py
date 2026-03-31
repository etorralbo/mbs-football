"""Domain use case: create a pre-seeded 'Full Body Strength' sample template.

Creates template + block + 4 sample exercises atomically.

Idempotency:
    If a template named SAMPLE_TEMPLATE_TITLE already exists for this team,
    the existing template id is returned without creating a duplicate.  This
    prevents accidental multi-creation when users click "Start from example"
    more than once (e.g. double-tap before the redirect fires).

Exercise normalisation:
    Lookup is case-insensitive and trims whitespace, so a coach who already has
    "back squat" or "Back Squat " will reuse that exercise rather than creating
    a duplicate entry.
"""
import uuid
from dataclasses import dataclass, field

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.block_exercise import BlockExercise
from app.models.exercise import Exercise, OwnerType
from app.models.workout_block import WorkoutBlock
from app.models.workout_template import WorkoutTemplate


# ---------------------------------------------------------------------------
# Sample data — realistic full-body structure
# ---------------------------------------------------------------------------

SAMPLE_EXERCISES = [
    {
        "name": "Back Squat",
        "description": "A foundational lower-body compound movement targeting quads, glutes and hamstrings through a full range of motion.",
        "tags": ["strength", "lower-body", "compound"],
    },
    {
        "name": "Bench Press",
        "description": "A horizontal push compound movement targeting chest, anterior deltoids and triceps for upper-body strength.",
        "tags": ["strength", "upper-body", "compound"],
    },
    {
        "name": "Romanian Deadlift",
        "description": "A hip-hinge movement targeting hamstrings, glutes and lower back to develop posterior chain strength and control.",
        "tags": ["strength", "lower-body", "compound"],
    },
    {
        "name": "Plank Hold",
        "description": "An isometric core stability exercise that trains anti-extension and improves trunk endurance for athletes.",
        "tags": ["core", "bodyweight", "stability"],
    },
]

SAMPLE_TEMPLATE_TITLE = "Full Body Strength Workout"
SAMPLE_BLOCK_NAME = "Main Circuit"


# ---------------------------------------------------------------------------
# Result DTO
# ---------------------------------------------------------------------------

@dataclass
class CreateSampleTemplateResult:
    id: uuid.UUID
    created: bool = field(default=True)
    """True when a new template was created; False when an existing one was returned."""


# ---------------------------------------------------------------------------
# Use case
# ---------------------------------------------------------------------------

class CreateSampleTemplateUseCase:
    """
    Creates a complete sample template with one block and 4 exercises.

    Idempotent: if a template named SAMPLE_TEMPLATE_TITLE already exists for
    this team, returns it immediately without writing anything new.

    Exercises are created as COACH-owned exercises for this coach if they do
    not already exist (normalised lookup: case-insensitive + trimmed).
    """

    def __init__(self, db: Session) -> None:
        self._db = db

    def execute(
        self, team_id: uuid.UUID, coach_id: uuid.UUID
    ) -> CreateSampleTemplateResult:
        # --- Idempotency guard -------------------------------------------------
        # Return the existing template rather than creating a duplicate.  This
        # protects against double-taps / rapid retries from the frontend.
        existing_template = self._db.execute(
            select(WorkoutTemplate).where(
                WorkoutTemplate.team_id == team_id,
                WorkoutTemplate.title == SAMPLE_TEMPLATE_TITLE,
            )
        ).scalar_one_or_none()

        if existing_template is not None:
            return CreateSampleTemplateResult(id=existing_template.id, created=False)

        # --- Create fresh template + exercises ---------------------------------
        exercises = self._ensure_sample_exercises(coach_id)

        template = WorkoutTemplate(
            team_id=team_id,
            title=SAMPLE_TEMPLATE_TITLE,
        )
        self._db.add(template)
        self._db.flush()

        block = WorkoutBlock(
            workout_template_id=template.id,
            order_index=0,
            name=SAMPLE_BLOCK_NAME,
        )
        self._db.add(block)
        self._db.flush()

        for order_index, exercise in enumerate(exercises):
            self._db.add(
                BlockExercise(
                    workout_block_id=block.id,
                    exercise_id=exercise.id,
                    order_index=order_index,
                )
            )

        return CreateSampleTemplateResult(id=template.id, created=True)

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _ensure_sample_exercises(self, coach_id: uuid.UUID) -> list[Exercise]:
        """Get or create each sample exercise for this coach.

        Lookup is normalised (lower + trim) so "Back Squat", "back squat", and
        " Back Squat " all resolve to the same row instead of creating duplicates.
        """
        result = []
        for spec in SAMPLE_EXERCISES:
            normalized_name = spec["name"].strip().lower()
            existing = self._db.execute(
                select(Exercise).where(
                    Exercise.coach_id == coach_id,
                    func.lower(func.trim(Exercise.name)) == normalized_name,
                )
            ).scalar_one_or_none()

            if existing:
                result.append(existing)
            else:
                exercise = Exercise(
                    coach_id=coach_id,
                    owner_type=OwnerType.COACH,
                    is_editable=True,
                    name=spec["name"],
                    description=spec["description"],
                    tags=spec["tags"],
                )
                self._db.add(exercise)
                self._db.flush()
                result.append(exercise)

        return result
