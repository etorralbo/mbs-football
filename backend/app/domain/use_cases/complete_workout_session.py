"""Domain use case: mark a workout session as completed."""
import uuid
from dataclasses import dataclass
from typing import Optional

from app.domain.events.models import FunnelEvent
from app.domain.events.service import AuthContext, ProductEventService
from app.domain.use_cases._session_scope import resolve_session
from app.models.user_profile import Role
from app.persistence.repositories.workout_session_repository import (
    AbstractWorkoutSessionRepository,
)


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------

class NotFoundError(Exception):
    """
    Raised when the session does not exist or the caller is not authorised to
    access it.  Treated identically to avoid leaking existence to other tenants.
    """


class SessionCancelledError(Exception):
    """Session has been cancelled and cannot be completed."""


# ---------------------------------------------------------------------------
# Command DTO
# ---------------------------------------------------------------------------

@dataclass
class CompleteWorkoutSessionCommand:
    session_id: uuid.UUID
    requesting_user_id: uuid.UUID
    requesting_role: Role
    requesting_team_id: uuid.UUID
    # Set when role == ATHLETE; None when role == COACH
    requesting_athlete_id: Optional[uuid.UUID] = None


# ---------------------------------------------------------------------------
# Use case
# ---------------------------------------------------------------------------

class CompleteWorkoutSessionUseCase:

    def __init__(
        self,
        session_repo: AbstractWorkoutSessionRepository,
        event_service: ProductEventService,
    ) -> None:
        self._session_repo = session_repo
        self._event_service = event_service

    def execute(self, command: CompleteWorkoutSessionCommand) -> None:
        """Complete the session or raise if not accessible.

        Idempotent: calling again on an already-completed session still returns
        successfully (no error, no duplicate update).
        """
        session = resolve_session(
            session_id=command.session_id,
            role=command.requesting_role,
            team_id=command.requesting_team_id,
            athlete_id=command.requesting_athlete_id,
            session_repo=self._session_repo,
        )
        if session is None:
            raise NotFoundError(f"Session {command.session_id} not found")

        # Idempotent: already completed — nothing to do, no duplicate event.
        if session.completed_at is not None:
            return

        # Guard: cancelled sessions cannot be completed.
        if session.cancelled_at is not None:
            raise SessionCancelledError("Cancelled sessions cannot be completed.")

        # Track before mark_complete so both land in the same commit.
        # team_id comes from the command: resolve_session already enforced that
        # the session belongs to requesting_team_id.
        actor = AuthContext(
            user_id=command.requesting_user_id,
            role=command.requesting_role.value,
            team_id=command.requesting_team_id,
        )
        self._event_service.track(
            event=FunnelEvent.SESSION_COMPLETED,
            actor=actor,
            team_id=command.requesting_team_id,
            metadata={"session_id": str(session.id)},
        )

        self._session_repo.mark_complete(session)
