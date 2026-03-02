"""Abstract and concrete SQLAlchemy repository for Exercise lookups."""
import uuid
from abc import ABC, abstractmethod
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.exercise import Exercise
from app.models.membership import Membership
from app.models.user_profile import Role, UserProfile


class AbstractExerciseRepository(ABC):

    @abstractmethod
    def get_by_id(self, exercise_id: uuid.UUID, coach_id: uuid.UUID) -> Optional[Exercise]:
        """Return the exercise only if it belongs to the given coach, else None."""
        ...

    @abstractmethod
    def get_by_id_for_team(self, exercise_id: uuid.UUID, team_id: uuid.UUID) -> Optional[Exercise]:
        """Return the exercise if its coach is an active COACH member of team_id, else None."""
        ...

    @abstractmethod
    def get_existing_ids(
        self, exercise_ids: set[uuid.UUID], coach_id: uuid.UUID
    ) -> set[uuid.UUID]:
        """Return the subset of exercise_ids that belong to the given coach (single IN query)."""
        ...

    @abstractmethod
    def get_all_by_coach(self, coach_id: uuid.UUID) -> list[Exercise]:
        """Return all exercises owned by the given coach."""
        ...


class SqlAlchemyExerciseRepository(AbstractExerciseRepository):

    def __init__(self, db: Session) -> None:
        self._db = db

    def get_by_id(self, exercise_id: uuid.UUID, coach_id: uuid.UUID) -> Optional[Exercise]:
        stmt = select(Exercise).where(
            Exercise.id == exercise_id,
            Exercise.coach_id == coach_id,
        )
        return self._db.execute(stmt).scalar_one_or_none()

    def get_by_id_for_team(self, exercise_id: uuid.UUID, team_id: uuid.UUID) -> Optional[Exercise]:
        """Return exercise if its coach is currently a COACH member of team_id."""
        stmt = (
            select(Exercise)
            .join(UserProfile, Exercise.coach_id == UserProfile.id)
            .join(Membership, Membership.user_id == UserProfile.supabase_user_id)
            .where(
                Exercise.id == exercise_id,
                Membership.team_id == team_id,
                Membership.role == Role.COACH,
            )
        )
        return self._db.execute(stmt).scalar_one_or_none()

    def get_existing_ids(
        self, exercise_ids: set[uuid.UUID], coach_id: uuid.UUID
    ) -> set[uuid.UUID]:
        if not exercise_ids:
            return set()
        stmt = select(Exercise.id).where(
            Exercise.id.in_(exercise_ids),
            Exercise.coach_id == coach_id,
        )
        return set(self._db.execute(stmt).scalars())

    def get_all_by_coach(self, coach_id: uuid.UUID) -> list[Exercise]:
        stmt = select(Exercise).where(Exercise.coach_id == coach_id)
        return list(self._db.execute(stmt).scalars())
