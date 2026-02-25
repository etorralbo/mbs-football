"""Domain use case: log exercise performance for a workout session."""
import uuid
from dataclasses import dataclass, field
from typing import Optional

from app.persistence.repositories.workout_session_log_repository import (
    AbstractWorkoutSessionLogRepository,
    NewLogEntry,
)
from app.persistence.repositories.workout_session_repository import (
    AbstractWorkoutSessionRepository,
)
from app.persistence.repositories.workout_template_repository import (
    AbstractWorkoutTemplateRepository,
)


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------

class NotFoundError(Exception):
    """Session not found or the caller is not the assigned athlete."""


class ValidationError(Exception):
    """block_name or exercise_id is not valid for this session's template."""


# ---------------------------------------------------------------------------
# Command / Result DTOs
# ---------------------------------------------------------------------------

@dataclass
class CreateWorkoutSessionLogCommand:
    session_id: uuid.UUID
    # Only ATHLETEs may create logs; transport enforces the role guard before
    # the use case is called, but the athlete_id is still required for the
    # ownership check inside the use case.
    requesting_athlete_id: uuid.UUID
    requesting_team_id: uuid.UUID
    block_name: str
    exercise_id: uuid.UUID
    # Re-exported so callers only need to import from this module.
    entries: list[NewLogEntry] = field(default_factory=list)
    notes: Optional[str] = None


@dataclass
class CreateWorkoutSessionLogResult:
    log_id: uuid.UUID


# ---------------------------------------------------------------------------
# Use case
# ---------------------------------------------------------------------------

class CreateWorkoutSessionLogUseCase:
    """
    Validates ownership, checks block_name and exercise_id against the
    session's template, then persists the log with its entries.

    Validation rules:
    - session must be owned by requesting_athlete_id → NotFoundError otherwise
    - block_name must match a WorkoutBlock.name in the session's template
      → ValidationError otherwise
    - exercise_id must be referenced by a BlockExercise in the template
      → ValidationError otherwise
    """

    def __init__(
        self,
        session_repo: AbstractWorkoutSessionRepository,
        template_repo: AbstractWorkoutTemplateRepository,
        log_repo: AbstractWorkoutSessionLogRepository,
    ) -> None:
        self._session_repo = session_repo
        self._template_repo = template_repo
        self._log_repo = log_repo

    def execute(
        self,
        command: CreateWorkoutSessionLogCommand,
    ) -> CreateWorkoutSessionLogResult:
        # 1. Ownership check: session must belong to the requesting athlete
        session = self._session_repo.get_by_id_and_athlete(
            command.session_id, command.requesting_athlete_id
        )
        if session is None:
            raise NotFoundError(
                f"Session {command.session_id} not found"
            )

        # 2. Load template for validation (scoped to caller's team)
        template = self._template_repo.get_by_id(
            session.workout_template_id, command.requesting_team_id
        )
        if template is None:
            raise NotFoundError(
                f"Template for session {command.session_id} not found"
            )

        # 3. Validate block_name against the template's actual block names
        valid_block_names = {block.name for block in template.blocks}
        if command.block_name not in valid_block_names:
            raise ValidationError(
                f"'{command.block_name}' is not a valid block for this template. "
                f"Valid blocks: {sorted(valid_block_names)}"
            )

        # 4. Validate exercise_id: must appear in at least one block of the template
        template_exercise_ids = {
            be.exercise_id
            for block in template.blocks
            for be in block.items
        }
        if command.exercise_id not in template_exercise_ids:
            raise ValidationError(
                f"Exercise {command.exercise_id} is not part of this template"
            )

        # 5. Persist log + entries atomically
        log = self._log_repo.create(
            team_id=command.requesting_team_id,
            session_id=command.session_id,
            block_name=command.block_name,
            exercise_id=command.exercise_id,
            entries=command.entries,
            created_by_profile_id=command.requesting_athlete_id,
            notes=command.notes,
        )

        return CreateWorkoutSessionLogResult(log_id=log.id)
