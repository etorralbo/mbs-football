"""Domain use case: full replace of exercise logs for a session.

PUT /v1/workout-sessions/{session_id}/logs atomically replaces *all* entries
for one exercise in one DB transaction: existing entries are deleted, then
the supplied entries are inserted.  The payload must represent the complete
desired state — any previously saved set absent from the request is gone.
Calling it multiple times with the same payload is safe (idempotent).
"""
import uuid
from dataclasses import dataclass, field
from typing import Optional

from app.domain.events.models import FunnelEvent
from app.domain.events.service import AuthContext, ProductEventService
from app.domain.use_cases._session_scope import resolve_session
from app.models.user_profile import Role
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
from app.persistence.repositories.workout_template_repository import (
    AbstractWorkoutTemplateRepository,
)

MAX_ENTRIES_PER_LOG = 50


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------

class NotFoundError(Exception):
    """Session or exercise not found / caller not authorised."""


class ValidationError(Exception):
    """Entries limit exceeded or other business-rule violation."""


# ---------------------------------------------------------------------------
# Command / Result DTOs
# ---------------------------------------------------------------------------

@dataclass
class UpsertEntryItem:
    set_number: int   # 1-based
    reps: Optional[int] = None
    weight: Optional[float] = None
    rpe: Optional[float] = None


@dataclass
class UpsertSessionExerciseLogCommand:
    session_id: uuid.UUID
    exercise_id: uuid.UUID
    entries: list[UpsertEntryItem] = field(default_factory=list)
    # Caller identity — ATHLETE only (ownership enforced below)
    requesting_athlete_id: uuid.UUID = field(default_factory=uuid.uuid4)
    requesting_supabase_user_id: uuid.UUID = field(default_factory=uuid.uuid4)
    requesting_team_id: uuid.UUID = field(default_factory=uuid.uuid4)


@dataclass
class UpsertEntryOut:
    set_number: int
    reps: Optional[int]
    weight: Optional[float]
    rpe: Optional[float]


@dataclass
class UpsertSessionExerciseLogResult:
    exercise_id: uuid.UUID
    entries: list[UpsertEntryOut]


# ---------------------------------------------------------------------------
# Use case
# ---------------------------------------------------------------------------

class UpsertSessionExerciseLogUseCase:
    """
    Validates ownership + exercise membership, then atomically replaces all
    entries for (session_id, exercise_id).

    Validation rules:
    1. Session owned by requesting_athlete_id                → NotFoundError
    2. exercise_id belongs to the team                       → NotFoundError
    3. len(entries) <= MAX_ENTRIES_PER_LOG                   → ValidationError
    """

    def __init__(
        self,
        session_repo: AbstractWorkoutSessionRepository,
        template_repo: AbstractWorkoutTemplateRepository,
        log_repo: AbstractWorkoutSessionLogRepository,
        exercise_repo: AbstractExerciseRepository,
        event_service: ProductEventService,
    ) -> None:
        self._session_repo = session_repo
        self._template_repo = template_repo
        self._log_repo = log_repo
        self._exercise_repo = exercise_repo
        self._event_service = event_service

    def execute(
        self,
        command: UpsertSessionExerciseLogCommand,
    ) -> UpsertSessionExerciseLogResult:
        # 1. Ownership: ATHLETE must own the session
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

        # 3. Guard against oversized entry lists
        if len(command.entries) > MAX_ENTRIES_PER_LOG:
            raise ValidationError(
                f"A log may contain at most {MAX_ENTRIES_PER_LOG} entries "
                f"(received {len(command.entries)})"
            )

        # 4. Derive block_name from the template so the client need not send it.
        #    Falls back to "Unknown" only if the exercise is not found in
        #    any block (should not happen in a consistent dataset).
        block_name = self._derive_block_name(
            session.workout_template_id,
            command.exercise_id,
            command.requesting_team_id,
        )

        # 5. Check first-log event before upserting (count before any change).
        is_first_log = self._log_repo.count_by_session(command.session_id) == 0

        if is_first_log:
            self._event_service.track(
                event=FunnelEvent.SESSION_FIRST_LOG_ADDED,
                actor=AuthContext(
                    user_id=command.requesting_supabase_user_id,
                    role=Role.ATHLETE.value,
                    team_id=command.requesting_team_id,
                ),
                team_id=command.requesting_team_id,
                metadata={"session_id": str(command.session_id)},
            )

        # 6. Upsert entries atomically.
        log = self._log_repo.upsert_for_exercise(
            team_id=command.requesting_team_id,
            session_id=command.session_id,
            exercise_id=command.exercise_id,
            block_name=block_name,
            entries=[
                NewLogEntry(
                    set_number=e.set_number,
                    reps=e.reps,
                    weight=e.weight,
                    rpe=e.rpe,
                )
                for e in command.entries
            ],
            created_by_profile_id=command.requesting_athlete_id,
        )

        return UpsertSessionExerciseLogResult(
            exercise_id=log.exercise_id,
            entries=[
                UpsertEntryOut(
                    set_number=entry.set_number,
                    reps=entry.reps,
                    weight=entry.weight,
                    rpe=entry.rpe,
                )
                for entry in sorted(log.entries, key=lambda e: e.set_number)
            ],
        )

    def _derive_block_name(
        self,
        template_id: uuid.UUID,
        exercise_id: uuid.UUID,
        team_id: uuid.UUID,
    ) -> str:
        template = self._template_repo.get_by_id_with_blocks(template_id, team_id)
        if template is None:
            return "Unknown"
        for block in template.blocks:
            for item in block.items:
                if item.exercise_id == exercise_id:
                    return block.name
        return "Unknown"
