"""Domain use case: retrieve a single workout session with its execution logs."""
import uuid
from dataclasses import dataclass, field
from typing import Optional

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
    """
    Session does not exist or the caller is not authorised to see it.
    Treated identically to avoid leaking existence to other tenants.
    """


# ---------------------------------------------------------------------------
# Result DTOs
# ---------------------------------------------------------------------------

@dataclass
class SessionLogEntryItem:
    """One set row within a log."""

    set_number: int
    reps: Optional[int]
    weight: Optional[float]
    rpe: Optional[float]


@dataclass
class SessionLogItem:
    """One exercise log within a session, including all its set entries."""

    log_id: uuid.UUID
    block_name: str
    exercise_id: uuid.UUID
    notes: Optional[str]
    entries: list[SessionLogEntryItem] = field(default_factory=list)


@dataclass
class WorkoutSessionDetailResult:
    id: uuid.UUID
    # "pending" until completed_at is set, then "completed"
    status: str
    template_title: str
    athlete_id: uuid.UUID
    logs: list[SessionLogItem] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Query DTO
# ---------------------------------------------------------------------------

@dataclass
class GetWorkoutSessionDetailQuery:
    session_id: uuid.UUID
    requesting_role: Role
    requesting_team_id: uuid.UUID
    # Set when role == ATHLETE; None means coach-level access (team-scoped)
    requesting_athlete_id: Optional[uuid.UUID] = None


# ---------------------------------------------------------------------------
# Use case
# ---------------------------------------------------------------------------

class GetWorkoutSessionDetailUseCase:
    """
    Fetches a single session with its template title and grouped logs.

    Access rules (identical to the existing list/complete use cases):
    - ATHLETE: session must be assigned to requesting_athlete_id → NotFoundError otherwise
    - COACH:   session must belong to a team athlete of requesting_team_id → NotFoundError otherwise
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
        query: GetWorkoutSessionDetailQuery,
    ) -> WorkoutSessionDetailResult:
        # 1. Access-scoped fetch — mirrors the rules in CompleteWorkoutSessionUseCase
        if query.requesting_role == Role.ATHLETE:
            session = self._session_repo.get_by_id_and_athlete(
                query.session_id, query.requesting_athlete_id
            )
        else:
            session = self._session_repo.get_by_id_and_team(
                query.session_id, query.requesting_team_id
            )

        if session is None:
            raise NotFoundError(f"Session {query.session_id} not found")

        # 2. Template title (scoped to the same team for safety)
        template = self._template_repo.get_by_id(
            session.workout_template_id, query.requesting_team_id
        )
        template_title = template.title if template is not None else ""

        # 3. Logs with their entries
        logs = self._log_repo.list_by_session(session.id)

        # 4. Build result
        return WorkoutSessionDetailResult(
            id=session.id,
            status="completed" if session.completed_at is not None else "pending",
            template_title=template_title,
            athlete_id=session.athlete_id,
            logs=[
                SessionLogItem(
                    log_id=log.id,
                    block_name=log.block_name,
                    exercise_id=log.exercise_id,
                    notes=log.notes,
                    entries=[
                        SessionLogEntryItem(
                            set_number=entry.set_number,
                            reps=entry.reps,
                            weight=entry.weight,
                            rpe=entry.rpe,
                        )
                        for entry in log.entries
                    ],
                )
                for log in logs
            ],
        )
