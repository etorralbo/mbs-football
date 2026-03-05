"""Domain use case: delete a team (hard delete with safety guards)."""
import logging
import uuid
from dataclasses import dataclass

from app.persistence.repositories.team_repository import AbstractTeamRepository

logger = logging.getLogger(__name__)


class TeamNotFoundError(Exception):
    pass


class NotTeamOwnerError(Exception):
    pass


class TeamHasAthletesError(Exception):
    pass


class TeamHasSessionsError(Exception):
    pass


class TeamHasCoachExercisesError(Exception):
    pass


@dataclass
class DeleteTeamCommand:
    team_id: uuid.UUID
    supabase_user_id: uuid.UUID
    caller_team_id: uuid.UUID  # active team from membership resolution


class DeleteTeamUseCase:

    def __init__(self, team_repo: AbstractTeamRepository) -> None:
        self._team_repo = team_repo

    def execute(self, command: DeleteTeamCommand) -> None:
        team = self._team_repo.get_by_id(command.team_id)
        if team is None:
            raise TeamNotFoundError()

        # Cross-team access → 404 (anti-enumeration: never confirm existence)
        if command.caller_team_id != command.team_id:
            raise TeamNotFoundError()

        # Same-team but not creator → 403 (they can see the team)
        if team.created_by_user_id != command.supabase_user_id:
            raise NotTeamOwnerError()

        # Safety guards — refuse to delete if team has dependents that
        # would be silently lost via CASCADE.
        if self._team_repo.has_athletes(command.team_id):
            raise TeamHasAthletesError(
                "Cannot delete team: remove all athletes first."
            )

        if self._team_repo.has_sessions(command.team_id):
            raise TeamHasSessionsError(
                "Cannot delete team: archive or delete all workout sessions first."
            )

        if self._team_repo.has_coach_exercises(command.team_id):
            raise TeamHasCoachExercisesError(
                "Cannot delete team right now. Please remove coach-owned resources first."
            )

        self._team_repo.delete(team)

        logger.info(
            "team_deleted",
            extra={
                "team_id": str(command.team_id),
                "team_name": team.name,
                "deleted_by": str(command.supabase_user_id),
            },
        )
