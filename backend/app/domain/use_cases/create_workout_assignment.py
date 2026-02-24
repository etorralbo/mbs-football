"""Domain use case: assign a WorkoutTemplate to a team or a single athlete."""
import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import date
from typing import Optional, Union

from app.models.user_profile import UserProfile
from app.models.workout_assignment import AssignmentTargetType
from app.persistence.repositories.workout_assignment_repository import (
    AbstractWorkoutAssignmentRepository,
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
    """Raised when a referenced resource does not exist in the caller's tenant."""


# ---------------------------------------------------------------------------
# Narrow query interface — avoids modifying the existing user_profile_repository
# ---------------------------------------------------------------------------

class AbstractAthleteQueryRepository(ABC):
    """Read-only interface for querying athletes within a team."""

    @abstractmethod
    def list_athletes_by_team(self, team_id: uuid.UUID) -> list[UserProfile]:
        """Return all UserProfiles with role=ATHLETE for the given team."""
        ...

    @abstractmethod
    def get_athlete_by_id_and_team(
        self,
        athlete_id: uuid.UUID,
        team_id: uuid.UUID,
    ) -> Optional[UserProfile]:
        """Return the athlete only if they belong to the given team, else None."""
        ...


# ---------------------------------------------------------------------------
# Target variants (sum type)
# ---------------------------------------------------------------------------

@dataclass
class TeamTarget:
    """Assign to every athlete in the coach's team."""


@dataclass
class AthleteTarget:
    """Assign to a single, named athlete."""

    athlete_id: uuid.UUID


# ---------------------------------------------------------------------------
# Command / Result DTOs
# ---------------------------------------------------------------------------

@dataclass
class CreateWorkoutAssignmentCommand:
    requesting_team_id: uuid.UUID
    workout_template_id: uuid.UUID
    target: Union[TeamTarget, AthleteTarget]
    scheduled_for: Optional[date] = None


@dataclass
class CreateWorkoutAssignmentResult:
    assignment_id: uuid.UUID
    sessions_created: int


# ---------------------------------------------------------------------------
# Use case
# ---------------------------------------------------------------------------

class CreateWorkoutAssignmentUseCase:

    def __init__(
        self,
        template_repo: AbstractWorkoutTemplateRepository,
        assignment_repo: AbstractWorkoutAssignmentRepository,
        session_repo: AbstractWorkoutSessionRepository,
        athlete_query_repo: AbstractAthleteQueryRepository,
    ) -> None:
        self._template_repo = template_repo
        self._assignment_repo = assignment_repo
        self._session_repo = session_repo
        self._athlete_query_repo = athlete_query_repo

    def execute(
        self, command: CreateWorkoutAssignmentCommand
    ) -> CreateWorkoutAssignmentResult:
        # 1. Verify template belongs to the requesting team
        template = self._template_repo.get_by_id(
            command.workout_template_id, command.requesting_team_id
        )
        if template is None:
            raise NotFoundError(
                f"WorkoutTemplate {command.workout_template_id} not found"
            )

        # 2. Resolve target athlete IDs and assignment metadata
        if isinstance(command.target, TeamTarget):
            athletes = self._athlete_query_repo.list_athletes_by_team(
                command.requesting_team_id
            )
            athlete_ids = [a.id for a in athletes]
            target_type = AssignmentTargetType.TEAM
            target_athlete_id = None
        else:
            athlete = self._athlete_query_repo.get_athlete_by_id_and_team(
                command.target.athlete_id, command.requesting_team_id
            )
            if athlete is None:
                raise NotFoundError(
                    f"Athlete {command.target.athlete_id} not found in this team"
                )
            athlete_ids = [athlete.id]
            target_type = AssignmentTargetType.ATHLETE
            target_athlete_id = athlete.id

        # 3. Persist assignment (flush) then sessions (commit) — single transaction
        assignment = self._assignment_repo.create(
            team_id=command.requesting_team_id,
            workout_template_id=command.workout_template_id,
            target_type=target_type,
            target_athlete_id=target_athlete_id,
            scheduled_for=command.scheduled_for,
        )
        sessions = self._session_repo.create_bulk(
            assignment_id=assignment.id,
            athlete_ids=athlete_ids,
            workout_template_id=command.workout_template_id,
            scheduled_for=command.scheduled_for,
        )

        return CreateWorkoutAssignmentResult(
            assignment_id=assignment.id,
            sessions_created=len(sessions),
        )
