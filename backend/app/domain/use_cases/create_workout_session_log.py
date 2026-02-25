"""Domain use case: log exercise performance for a workout session."""
import uuid
from dataclasses import dataclass, field
from typing import Optional

from app.persistence.repositories.exercise_repository import (
    AbstractExerciseRepository,
)
from app.persistence.repositories.workout_session_log_repository import (
    AbstractWorkoutSessionLogRepository,
    NewLogEntry,
)
from app.persistence.repositories.workout_session_repository import (
    AbstractWorkoutSessionRepository,
)


# ---------------------------------------------------------------------------
# Domain constants
# ---------------------------------------------------------------------------

VALID_BLOCK_NAMES: frozenset[str] = frozenset({
    "Preparation to Movement",
    "Plyometrics",
    "Primary Strength",
    "Secondary Strength",
    "Auxiliary Strength",
    "Recovery",
})

MAX_ENTRIES_PER_LOG = 50


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------

class NotFoundError(Exception):
    """Session or exercise not found / caller not authorised."""


class ValidationError(Exception):
    """block_name is not in the allowed list, or entries limit exceeded."""


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
    Validates ownership, exercise team membership, block_name, and entries
    count, then persists the log with its entries in a single transaction.

    Validation rules (in order):
    1. session owned by requesting_athlete_id          → NotFoundError
    2. exercise_id belongs to team                     → NotFoundError
    3. block_name in VALID_BLOCK_NAMES                 → ValidationError
    4. len(entries) <= MAX_ENTRIES_PER_LOG             → ValidationError
    """

    def __init__(
        self,
        session_repo: AbstractWorkoutSessionRepository,
        log_repo: AbstractWorkoutSessionLogRepository,
        exercise_repo: AbstractExerciseRepository,
    ) -> None:
        self._session_repo = session_repo
        self._log_repo = log_repo
        self._exercise_repo = exercise_repo

    def execute(
        self,
        command: CreateWorkoutSessionLogCommand,
    ) -> CreateWorkoutSessionLogResult:
        # 1. Ownership check: session must belong to the requesting athlete
        session = self._session_repo.get_by_id_and_athlete(
            command.session_id, command.requesting_athlete_id
        )
        if session is None:
            raise NotFoundError(f"Session {command.session_id} not found")

        # 2. Exercise must belong to the team
        exercise = self._exercise_repo.get_by_id(
            command.exercise_id, command.requesting_team_id
        )
        if exercise is None:
            raise NotFoundError(
                f"Exercise {command.exercise_id} not found in team"
            )

        # 3. block_name must be in the canonical fixed list
        if command.block_name not in VALID_BLOCK_NAMES:
            raise ValidationError(
                f"'{command.block_name}' is not a valid block name. "
                f"Valid names: {sorted(VALID_BLOCK_NAMES)}"
            )

        # 4. Guard against oversized entry lists
        if len(command.entries) > MAX_ENTRIES_PER_LOG:
            raise ValidationError(
                f"A log may contain at most {MAX_ENTRIES_PER_LOG} entries "
                f"(received {len(command.entries)})"
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
