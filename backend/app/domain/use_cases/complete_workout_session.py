"""Domain use case: mark a workout session as completed."""
import uuid
from dataclasses import dataclass
from typing import Optional

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


# ---------------------------------------------------------------------------
# Command DTO
# ---------------------------------------------------------------------------

@dataclass
class CompleteWorkoutSessionCommand:
    session_id: uuid.UUID
    requesting_role: Role
    requesting_team_id: uuid.UUID
    # Set when role == ATHLETE; None when role == COACH
    requesting_athlete_id: Optional[uuid.UUID] = None


# ---------------------------------------------------------------------------
# Use case
# ---------------------------------------------------------------------------

class CompleteWorkoutSessionUseCase:

    def __init__(self, session_repo: AbstractWorkoutSessionRepository) -> None:
        self._session_repo = session_repo

    def execute(self, command: CompleteWorkoutSessionCommand) -> None:
        """Complete the session or raise NotFoundError if not accessible.

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

        # Idempotent: already completed — nothing to do
        if session.completed_at is not None:
            return

        self._session_repo.mark_complete(session)
