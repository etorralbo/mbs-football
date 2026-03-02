"""Domain use case: create a team and become its COACH."""
import uuid
from dataclasses import dataclass

from app.domain.events.models import FunnelEvent
from app.domain.events.service import AuthContext, ProductEventService
from app.models.user_profile import Role
from app.persistence.repositories.membership_repository import AbstractMembershipRepository
from app.persistence.repositories.team_repository import AbstractTeamRepository
from app.persistence.repositories.user_profile_repository import AbstractUserProfileRepository


# ---------------------------------------------------------------------------
# Command / Result DTOs
# ---------------------------------------------------------------------------

@dataclass
class CreateTeamCommand:
    supabase_user_id: uuid.UUID
    team_name: str
    name: str = ""


@dataclass
class CreateTeamResult:
    team_id: uuid.UUID
    membership_id: uuid.UUID
    role: Role


# ---------------------------------------------------------------------------
# Use case
# ---------------------------------------------------------------------------

class CreateTeamUseCase:

    def __init__(
        self,
        team_repo: AbstractTeamRepository,
        membership_repo: AbstractMembershipRepository,
        user_profile_repo: AbstractUserProfileRepository,
        event_service: ProductEventService,
    ) -> None:
        self._team_repo = team_repo
        self._membership_repo = membership_repo
        self._user_profile_repo = user_profile_repo
        self._event_service = event_service

    def execute(self, command: CreateTeamCommand) -> CreateTeamResult:
        team = self._team_repo.create(command.team_name)
        membership = self._membership_repo.create(
            user_id=command.supabase_user_id,
            team_id=team.id,
            role=Role.COACH,
        )

        # Create UserProfile for backward compat with existing endpoints.
        # Skip if the user already has one (e.g. from the old /v1/onboarding flow).
        existing = self._user_profile_repo.get_by_supabase_user_id(command.supabase_user_id)
        if existing is None:
            self._user_profile_repo.create(
                supabase_user_id=command.supabase_user_id,
                team_id=team.id,
                name=command.name,
                role=Role.COACH,
            )

        # Funnel event — post-write, same transaction as the team/membership rows.
        # team.id must always be available at this point; assert to catch regressions.
        assert team.id is not None, "team.id must be set before tracking TEAM_CREATED"
        self._event_service.track(
            event=FunnelEvent.TEAM_CREATED,
            actor=AuthContext(
                user_id=command.supabase_user_id,
                role=Role.COACH.value,
                team_id=None,
            ),
            team_id=team.id,
            metadata={"source": "ui"},
        )

        return CreateTeamResult(
            team_id=team.id,
            membership_id=membership.id,
            role=Role.COACH,
        )
