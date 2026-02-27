"""Domain use case: retrieve a single workout session with its execution logs."""
import uuid
from dataclasses import dataclass, field
from datetime import date
from typing import Optional

from app.domain.use_cases._session_scope import resolve_session
from app.models.user_profile import Role
from app.persistence.repositories.workout_session_log_repository import (
    AbstractWorkoutSessionLogRepository,
)
from app.persistence.repositories.workout_session_repository import (
    AbstractWorkoutSessionRepository,
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
    status: str                          # "pending" | "completed"
    workout_template_id: uuid.UUID       # denormalized from session
    template_title: str                  # human-readable workout name
    athlete_profile_id: uuid.UUID        # the athlete who owns the session
    scheduled_for: Optional[date]        # nullable; set when assignment has a date
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
    Fetches a single session with its grouped logs.

    Access rules:
    - ATHLETE: session must be assigned to requesting_athlete_id → NotFoundError otherwise
    - COACH:   session must belong to a team athlete of requesting_team_id → NotFoundError otherwise
    """

    def __init__(
        self,
        session_repo: AbstractWorkoutSessionRepository,
        log_repo: AbstractWorkoutSessionLogRepository,
    ) -> None:
        self._session_repo = session_repo
        self._log_repo = log_repo

    def execute(
        self,
        query: GetWorkoutSessionDetailQuery,
    ) -> WorkoutSessionDetailResult:
        # 1. Access-scoped fetch
        session = resolve_session(
            session_id=query.session_id,
            role=query.requesting_role,
            team_id=query.requesting_team_id,
            athlete_id=query.requesting_athlete_id,
            session_repo=self._session_repo,
        )
        if session is None:
            raise NotFoundError(f"Session {query.session_id} not found")

        # 2. Logs with their entries
        logs = self._log_repo.list_by_session(session.id)

        # 3. Fetch template title for display
        template_title = self._session_repo.get_template_title(session.workout_template_id)

        # 4. Build result — workout_template_id and scheduled_for are on the session row
        return WorkoutSessionDetailResult(
            id=session.id,
            status="completed" if session.completed_at is not None else "pending",
            workout_template_id=session.workout_template_id,
            template_title=template_title,
            athlete_profile_id=session.athlete_id,
            scheduled_for=session.scheduled_for,
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
