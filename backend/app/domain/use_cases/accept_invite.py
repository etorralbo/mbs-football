"""Domain use case: accept an invite token and join a team as ATHLETE."""
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

from app.domain.events.models import FunnelEvent
from app.domain.events.service import AuthContext, ProductEventService
from app.models.user_profile import Role
from app.persistence.repositories.invite_repository import AbstractInviteRepository
from app.persistence.repositories.membership_repository import AbstractMembershipRepository
from app.persistence.repositories.user_profile_repository import AbstractUserProfileRepository


class InviteNotFoundError(Exception):
    """Raised when the invite token does not exist."""


class InviteAlreadyUsedError(Exception):
    """Raised when the invite has already been consumed by another user."""


class InviteExpiredError(Exception):
    """Raised when the invite has passed its expiry date."""


class InviteRoleConflictError(Exception):
    """Raised when a COACH user (on a different team) tries to accept an ATHLETE invite."""


class InviteEmailMismatchError(Exception):
    """Raised when the accepting user's email does not match the invite email."""


# ---------------------------------------------------------------------------
# Command / Result DTOs
# ---------------------------------------------------------------------------

@dataclass
class AcceptInviteCommand:
    supabase_user_id: uuid.UUID
    token: str
    name: str = ""
    email: str = ""


@dataclass
class AcceptInviteResult:
    status: str                         # "joined" | "already_member" | "not_eligible"
    team_id: uuid.UUID
    membership_id: Optional[uuid.UUID] = field(default=None)
    role: Optional[Role] = field(default=None)


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
        # 1. Token must exist.
        invite = self._invite_repo.get_by_token(command.token)
        if invite is None:
            raise InviteNotFoundError("Invite not found.")

        # 2. Check expiry before anything else.
        if invite.expires_at is not None:
            now = datetime.now(timezone.utc)
            expires = invite.expires_at
            if expires.tzinfo is None:
                expires = expires.replace(tzinfo=timezone.utc)
            if now > expires:
                raise InviteExpiredError("This invite has expired.")

        # 3. Email must match (if the invite was bound to an email).
        if invite.email and command.email:
            if invite.email.lower() != command.email.lower():
                raise InviteEmailMismatchError(
                    f"This invitation was sent to {invite.email}. "
                    "Please sign in with that account."
                )

        # 4. If the user is already a member of the invite's team, return
        #    "already_member" immediately - do NOT consume the invite.
        existing = self._membership_repo.get_by_user_and_team(
            user_id=command.supabase_user_id,
            team_id=invite.team_id,
        )
        if existing is not None:
            return AcceptInviteResult(
                status="already_member",
                team_id=existing.team_id,
                membership_id=existing.id,
                role=existing.role,
            )

        # 5. Invite must not have been consumed by another user.
        if invite.used_at is not None:
            raise InviteAlreadyUsedError("This invite has already been used.")

        # 6. Coaches on OTHER teams are not eligible to join as athletes.
        if self._membership_repo.has_coach_membership(command.supabase_user_id):
            return AcceptInviteResult(
                status="not_eligible",
                team_id=invite.team_id,
            )

        # 7. Create membership, mark invite used, bootstrap UserProfile.
        membership = self._membership_repo.create(
            user_id=command.supabase_user_id,
            team_id=invite.team_id,
            role=invite.role,
        )
        self._invite_repo.mark_used(invite)

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

        assert invite.team_id is not None, "invite.team_id must be set"
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
            status="joined",
            team_id=invite.team_id,
            membership_id=membership.id,
            role=invite.role,
        )
