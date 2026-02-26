"""Domain use case: list workout sessions scoped by the caller's role."""
import uuid
from dataclasses import dataclass
from datetime import date, datetime
from typing import Optional

from app.models.user_profile import Role
from app.persistence.repositories.workout_session_repository import (
    AbstractWorkoutSessionRepository,
)


# ---------------------------------------------------------------------------
# Query / Result DTOs
# ---------------------------------------------------------------------------

@dataclass
class ListWorkoutSessionsQuery:
    team_id: uuid.UUID
    role: Role
    # Populated when role == ATHLETE; None means "all sessions in the team" (COACH view)
    athlete_id: Optional[uuid.UUID] = None


@dataclass
class WorkoutSessionItem:
    id: uuid.UUID
    assignment_id: uuid.UUID
    athlete_id: uuid.UUID
    workout_template_id: uuid.UUID
    scheduled_for: Optional[date]
    completed_at: Optional[datetime]


@dataclass
class ListWorkoutSessionsResult:
    sessions: list[WorkoutSessionItem]


# ---------------------------------------------------------------------------
# Use case
# ---------------------------------------------------------------------------

class ListWorkoutSessionsUseCase:

    def __init__(self, session_repo: AbstractWorkoutSessionRepository) -> None:
        self._session_repo = session_repo

    def execute(self, query: ListWorkoutSessionsQuery) -> ListWorkoutSessionsResult:
        if query.role == Role.ATHLETE:
            rows = self._session_repo.list_by_athlete(query.athlete_id, query.team_id)
        else:
            rows = self._session_repo.list_by_team(query.team_id)

        return ListWorkoutSessionsResult(
            sessions=[
                WorkoutSessionItem(
                    id=row.id,
                    assignment_id=row.assignment_id,
                    athlete_id=row.athlete_id,
                    workout_template_id=row.workout_template_id,
                    scheduled_for=row.scheduled_for,
                    completed_at=row.completed_at,
                )
                for row in rows
            ]
        )
