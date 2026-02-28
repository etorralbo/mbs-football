"""Domain use case: session execution view (template structure + merged logs).

Merges the prescribed workout template (blocks → exercises → prescription) with
whatever the athlete has already logged, producing a ready-to-render read model.
"""
import uuid
from dataclasses import dataclass, field
from typing import Any, Optional

from app.domain.use_cases._session_scope import resolve_session
from app.models.user_profile import Role
from app.persistence.repositories.workout_session_log_repository import (
    AbstractWorkoutSessionLogRepository,
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
    """Session not found or caller not authorised — treated identically."""


# ---------------------------------------------------------------------------
# Result DTOs
# ---------------------------------------------------------------------------

@dataclass
class SetLogOut:
    set_number: int
    reps: Optional[int]
    weight: Optional[float]
    rpe: Optional[float]
    done: bool = True


@dataclass
class ExerciseExecutionOut:
    exercise_id: uuid.UUID
    exercise_name: str
    prescription: dict[str, Any]
    logs: list[SetLogOut] = field(default_factory=list)


@dataclass
class BlockExecutionOut:
    name: str
    order: int
    items: list[ExerciseExecutionOut] = field(default_factory=list)


@dataclass
class SessionExecutionResult:
    session_id: uuid.UUID
    status: str                     # "pending" | "completed"
    workout_template_id: uuid.UUID
    blocks: list[BlockExecutionOut] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Query DTO
# ---------------------------------------------------------------------------

@dataclass
class GetSessionExecutionQuery:
    session_id: uuid.UUID
    requesting_role: Role
    requesting_team_id: uuid.UUID
    requesting_athlete_id: Optional[uuid.UUID] = None


# ---------------------------------------------------------------------------
# Use case
# ---------------------------------------------------------------------------

class GetSessionExecutionViewUseCase:
    """
    Produces the execution view for a single session:
      - Template blocks and items (prescribed structure)
      - Actual sets logged so far, merged into the matching exercise slot

    Access rules mirror GetWorkoutSessionDetailUseCase:
    - ATHLETE: must own the session
    - COACH:   session must belong to a team athlete
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

    def execute(self, query: GetSessionExecutionQuery) -> SessionExecutionResult:
        # 1. Authorised session fetch
        session = resolve_session(
            session_id=query.session_id,
            role=query.requesting_role,
            team_id=query.requesting_team_id,
            athlete_id=query.requesting_athlete_id,
            session_repo=self._session_repo,
        )
        if session is None:
            raise NotFoundError(f"Session {query.session_id} not found")

        # 2. Eager-load the full template structure (team-scoped)
        template = self._template_repo.get_by_id_with_blocks(
            template_id=session.workout_template_id,
            team_id=query.requesting_team_id,
        )
        if template is None:
            raise NotFoundError(
                f"Template {session.workout_template_id} not found for this team"
            )

        # 3. All logs for this session (entries pre-loaded, ordered by set_number)
        logs = self._log_repo.list_by_session(session.id)

        # 4. Build a lookup: (block_name, exercise_id) → list[SetLogOut]
        log_index: dict[tuple[str, uuid.UUID], list[SetLogOut]] = {}
        for log in logs:
            key = (log.block_name, log.exercise_id)
            log_index[key] = [
                SetLogOut(
                    set_number=entry.set_number,
                    reps=entry.reps,
                    weight=entry.weight,
                    rpe=entry.rpe,
                    done=True,
                )
                for entry in log.entries
            ]

        # 5. Build ordered blocks → items, merging logs
        blocks = sorted(template.blocks, key=lambda b: b.order_index)
        block_results = []
        for block in blocks:
            items = sorted(block.items, key=lambda i: i.order_index)
            exercise_results = []
            for item in items:
                key = (block.name, item.exercise_id)
                exercise_results.append(
                    ExerciseExecutionOut(
                        exercise_id=item.exercise_id,
                        exercise_name=item.exercise.name,
                        prescription=item.prescription_json or {},
                        logs=log_index.get(key, []),
                    )
                )
            block_results.append(
                BlockExecutionOut(
                    name=block.name,
                    order=block.order_index,
                    items=exercise_results,
                )
            )

        return SessionExecutionResult(
            session_id=session.id,
            status="completed" if session.completed_at is not None else "pending",
            workout_template_id=session.workout_template_id,
            blocks=block_results,
        )
