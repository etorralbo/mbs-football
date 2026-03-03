"""Domain use case: accept an invite code and join a team as ATHLETE."""
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone

from app.domain.events.models import FunnelEvent
from app.domain.events.service import AuthContext, ProductEventService
from app.models.user_profile import Role
from app.persistence.repositories.invite_repository import AbstractInviteRepository
from app.persistence.repositories.membership_repository import AbstractMembershipRepository
from app.persistence.repositories.user_profile_repository import AbstractUserProfileRepository


class InviteNotFoundError(Exception):
    """Raised when the invite code does not exist."""


class InviteAlreadyUsedError(Exception):
    """Raised when the invite has already been consumed."""


class InviteExpiredError(Exception):
    """Raised when the invite has passed its expiry date."""


class InviteRoleConflictError(Exception):
    """Raised when a COACH user tries to accept an ATHLETE invite."""


# ---------------------------------------------------------------------------
# Command / Result DTOs
# ---------------------------------------------------------------------------

@dataclass
class AcceptInviteCommand:
    supabase_user_id: uuid.UUID
    token: str
    name: str = ""


@dataclass
class AcceptInviteResult:
    team_id: uuid.UUID
    membership_id: uuid.UUID
    role: Role


# ---------------------------------------------------------------------------
# Use case
# ---------------------------------------------------------------------------

class AcceptInviteUseCase:

    def __init__(
        self,
        invite_repo: AbstractInviteRepository,
        membership_repo: AbstractMembershipRepository,
        user_profile_repo: AbstractUserProfileRepository,
        event_service: ProductEventService,
    ) -> None:
        self._invite_repo = invite_repo
        self._membership_repo = membership_repo
        self._user_profile_repo = user_profile_repo
        self._event_service = event_service

    def execute(self, command: AcceptInviteCommand) -> AcceptInviteResult:
        invite = self._invite_repo.get_by_token(command.token)
        if invite is None:
            raise InviteNotFoundError("Invite not found.")

        if invite.used_at is not None:
            raise InviteAlreadyUsedError("This invite has already been used.")

        if invite.expires_at is not None:
            now = datetime.now(timezone.utc)
            expires = invite.expires_at
            # Normalise naive datetime stored by older DB drivers
            if expires.tzinfo is None:
                expires = expires.replace(tzinfo=timezone.utc)
            if now > expires:
                raise InviteExpiredError("This invite has expired.")

        # Coaches must not be added as athletes via invite links.
        if self._membership_repo.has_coach_membership(command.supabase_user_id):
            raise InviteRoleConflictError(
                "Coaches cannot join teams via athlete invite links."
            )

        # Idempotent: if the membership already exists return it without error.
        # No event is tracked on the idempotent path — the join already happened.
        existing = self._membership_repo.get_by_user_and_team(
            user_id=command.supabase_user_id,
            team_id=invite.team_id,
        )
        if existing is not None:
            self._invite_repo.mark_used(invite)
            return AcceptInviteResult(
                team_id=existing.team_id,
                membership_id=existing.id,
                role=existing.role,
            )

        membership = self._membership_repo.create(
            user_id=command.supabase_user_id,
            team_id=invite.team_id,
            role=invite.role,
        )
        self._invite_repo.mark_used(invite)

        # Create UserProfile for backward compat with existing endpoints.
        existing_profile = self._user_profile_repo.get_by_supabase_user_id(
            command.supabase_user_id
        )
        if existing_profile is None:
            self._user_profile_repo.create(
                supabase_user_id=command.supabase_user_id,
                team_id=invite.team_id,
                name=command.name,
                role=invite.role,
            )

        # Funnel event — post-validation, post-write, same transaction.
        # invite.team_id must always be set by this point; assert to catch regressions.
        assert invite.team_id is not None, "invite.team_id must be set before tracking INVITE_ACCEPTED"
        self._event_service.track(
            event=FunnelEvent.INVITE_ACCEPTED,
            actor=AuthContext(
                user_id=command.supabase_user_id,
                role=invite.role.value,
                team_id=invite.team_id,
            ),
            team_id=invite.team_id,
            metadata={"invite_id": str(invite.id)},
        )

        return AcceptInviteResult(
            team_id=invite.team_id,
            membership_id=membership.id,
            role=invite.role,
        )
