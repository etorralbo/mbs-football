"""Shared session-access helper for use cases that branch on caller role.

Centralises the ATHLETE-vs-COACH fetch pattern so it is defined once and
tested implicitly through every use case that relies on it.
"""
import uuid
from typing import Optional

from app.models.user_profile import Role
from app.models.workout_session import WorkoutSession
from app.persistence.repositories.workout_session_repository import (
    AbstractWorkoutSessionRepository,
)


def resolve_session(
    *,
    session_id: uuid.UUID,
    role: Role,
    team_id: uuid.UUID,
    athlete_id: Optional[uuid.UUID],
    session_repo: AbstractWorkoutSessionRepository,
) -> Optional[WorkoutSession]:
    """Return the session if it is accessible under the caller's role, else None.

    - ATHLETE: session must be directly assigned to athlete_id.
    - COACH (or any non-ATHLETE role): session must belong to a team athlete
      within team_id.
    """
    if role == Role.ATHLETE:
        return session_repo.get_by_id_and_athlete(session_id, athlete_id)
    return session_repo.get_by_id_and_team(session_id, team_id)
