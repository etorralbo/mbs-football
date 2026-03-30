"""SQLAlchemy implementation of AbstractAthleteQueryRepository.

Kept in a separate module to avoid a circular import between the domain use
case (which owns the abstract interface) and the workout-assignment repository.
"""
import uuid
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domain.use_cases.create_workout_assignment import AbstractAthleteQueryRepository
from app.models.user_profile import Role, UserProfile


class SqlAlchemyAthleteQueryRepository(AbstractAthleteQueryRepository):

    def __init__(self, db: Session) -> None:
        self._db = db

    def list_athletes_by_team(self, team_id: uuid.UUID) -> list[UserProfile]:
        """Single query — no N+1."""
        stmt = select(UserProfile).where(
            UserProfile.team_id == team_id,
            UserProfile.role == Role.ATHLETE,
        )
        return list(self._db.execute(stmt).scalars())

    def get_athlete_by_id_and_team(
        self,
        athlete_id: uuid.UUID,
        team_id: uuid.UUID,
    ) -> Optional[UserProfile]:
        stmt = select(UserProfile).where(
            UserProfile.id == athlete_id,
            UserProfile.team_id == team_id,
            UserProfile.role == Role.ATHLETE,
        )
        return self._db.execute(stmt).scalar_one_or_none()

    def get_athletes_by_ids_and_team(
        self,
        athlete_ids: list[uuid.UUID],
        team_id: uuid.UUID,
    ) -> list[UserProfile]:
        """Batch validation: single query for multiple athlete IDs within team."""
        if not athlete_ids:
            return []
        stmt = select(UserProfile).where(
            UserProfile.id.in_(athlete_ids),
            UserProfile.team_id == team_id,
            UserProfile.role == Role.ATHLETE,
        )
        return list(self._db.execute(stmt).scalars())
