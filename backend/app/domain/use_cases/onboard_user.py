"""Domain use case: onboard a new user (create team + profile)."""
import uuid
from dataclasses import dataclass

from app.models.user_profile import Role
from app.persistence.repositories.team_repository import AbstractTeamRepository
from app.persistence.repositories.user_profile_repository import (
    AbstractUserProfileRepository,
)


class ConflictError(Exception):
    """Raised when the resource already exists (e.g. user already onboarded)."""


# ---------------------------------------------------------------------------
# Command (input DTO — transport-layer agnostic)
# ---------------------------------------------------------------------------

@dataclass
class OnboardUserCommand:
    supabase_user_id: uuid.UUID
    team_name: str
    name: str


# ---------------------------------------------------------------------------
# Result (output DTO)
# ---------------------------------------------------------------------------

@dataclass
class OnboardUserResult:
    id: uuid.UUID
    team_id: uuid.UUID
    role: Role


# ---------------------------------------------------------------------------
# Use case
# ---------------------------------------------------------------------------

class OnboardUserUseCase:

    def __init__(
        self,
        team_repo: AbstractTeamRepository,
        user_profile_repo: AbstractUserProfileRepository,
    ) -> None:
        self._team_repo = team_repo
        self._user_profile_repo = user_profile_repo

    def execute(self, command: OnboardUserCommand) -> OnboardUserResult:
        existing = self._user_profile_repo.get_by_supabase_user_id(command.supabase_user_id)
        if existing is not None:
            raise ConflictError(f"User {command.supabase_user_id} is already onboarded.")

        team = self._team_repo.create(command.team_name)
        profile = self._user_profile_repo.create(
            supabase_user_id=command.supabase_user_id,
            team_id=team.id,
            name=command.name,
            role=Role.COACH,
        )
        return OnboardUserResult(id=profile.id, team_id=team.id, role=Role.COACH)
