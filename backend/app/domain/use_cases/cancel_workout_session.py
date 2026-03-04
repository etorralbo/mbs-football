"""Domain use case: cancel (unassign) a workout session."""
import uuid
from dataclasses import dataclass

from app.domain.events.models import FunnelEvent
from app.domain.events.service import AuthContext, ProductEventService
from app.models.user_profile import Role
from app.persistence.repositories.workout_session_repository import (
    AbstractWorkoutSessionRepository,
)


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------

class NotFoundError(Exception):
    """Session does not exist or caller has no access (same to avoid leaking)."""


class SessionHasActivityError(Exception):
    """Session is completed or has logs — cannot be cancelled."""


# ---------------------------------------------------------------------------
# Command DTO
# ---------------------------------------------------------------------------

@dataclass
class CancelWorkoutSessionCommand:
    session_id: uuid.UUID
    requesting_user_id: uuid.UUID   # supabase_user_id for event tracking
    requesting_team_id: uuid.UUID   # tenant isolation


# ---------------------------------------------------------------------------
# Use case
# ---------------------------------------------------------------------------

class CancelWorkoutSessionUseCase:

    def __init__(
        self,
        session_repo: AbstractWorkoutSessionRepository,
        event_service: ProductEventService,
    ) -> None:
        self._session_repo = session_repo
        self._event_service = event_service

    def execute(self, command: CancelWorkoutSessionCommand) -> None:
        """Cancel the session or raise if not accessible / has activity.

        Idempotent: calling again on an already-cancelled session still returns
        successfully (no error, no duplicate event).
        """
        session = self._session_repo.get_by_id_and_team(
            command.session_id,
            command.requesting_team_id,
        )
        if session is None:
            raise NotFoundError(f"Session {command.session_id} not found")

        # Idempotent: already cancelled — nothing to do, no duplicate event.
        if session.cancelled_at is not None:
            return

        if session.completed_at is not None:
            raise SessionHasActivityError(
                "Session is completed and cannot be unassigned."
            )

        if self._session_repo.has_logs(session.id):
            raise SessionHasActivityError(
                "Session has activity and cannot be unassigned."
            )

        actor = AuthContext(
            user_id=command.requesting_user_id,
            role=Role.COACH.value,
            team_id=command.requesting_team_id,
        )
        self._event_service.track(
            event=FunnelEvent.SESSION_CANCELLED,
            actor=actor,
            team_id=command.requesting_team_id,
            metadata={"session_id": str(session.id)},
        )

        self._session_repo.cancel(session)
