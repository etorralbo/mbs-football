"""Domain use case: COACH generates an invite code for their team."""
import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional

from app.domain.events.models import FunnelEvent
from app.domain.events.service import AuthContext, ProductEventService
from app.models.user_profile import Role
from app.persistence.repositories.invite_repository import AbstractInviteRepository
from app.persistence.repositories.membership_repository import AbstractMembershipRepository


class NotACoachError(Exception):
    """Raised when the requesting user is not a COACH for the given team."""


# ---------------------------------------------------------------------------
# Command / Result DTOs
# ---------------------------------------------------------------------------

@dataclass
class CreateInviteCommand:
    requesting_user_id: uuid.UUID
    team_id: uuid.UUID
    email: str
    expires_in_days: Optional[int] = None


@dataclass
class CreateInviteResult:
    token: str
    team_id: uuid.UUID
    expires_at: Optional[datetime]


# ---------------------------------------------------------------------------
# Use case
# ---------------------------------------------------------------------------

class CreateInviteUseCase:

    def __init__(
        self,
        invite_repo: AbstractInviteRepository,
        membership_repo: AbstractMembershipRepository,
        event_service: ProductEventService,
    ) -> None:
        self._invite_repo = invite_repo
        self._membership_repo = membership_repo
        self._event_service = event_service

    def execute(self, command: CreateInviteCommand) -> CreateInviteResult:
        # Authorization: user must be COACH for this specific team.
        membership = self._membership_repo.get_by_user_and_team(
            user_id=command.requesting_user_id,
            team_id=command.team_id,
        )
        if membership is None or membership.role != Role.COACH:
            raise NotACoachError(
                "Only coaches can create invite codes for their team."
            )

        expires_at: Optional[datetime] = None
        if command.expires_in_days is not None:
            expires_at = datetime.now(timezone.utc) + timedelta(days=command.expires_in_days)

        # 32 bytes → 43 chars of base64url (cryptographically secure, unguessable)
        token = secrets.token_urlsafe(32)

        invite = self._invite_repo.create(
            team_id=command.team_id,
            token=token,
            role=Role.ATHLETE,
            created_by_user_id=command.requesting_user_id,
            expires_at=expires_at,
            email=command.email.lower().strip(),
        )

        # Funnel event — post-validation, post-write, same transaction.
        self._event_service.track(
            event=FunnelEvent.INVITE_CREATED,
            actor=AuthContext(
                user_id=command.requesting_user_id,
                role=membership.role.value,
                team_id=command.team_id,
            ),
            team_id=command.team_id,
            metadata={"invite_id": str(invite.id)},
        )

        return CreateInviteResult(
            token=invite.token,
            team_id=invite.team_id,
            expires_at=invite.expires_at,
        )
