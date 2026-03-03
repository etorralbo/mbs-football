"""Abstract and concrete SQLAlchemy repository for Exercise lookups."""
import uuid
from abc import ABC, abstractmethod
from typing import Optional

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models.exercise import Exercise, OwnerType
from app.models.membership import Membership
from app.models.user_profile import Role, UserProfile


def _company_or_own(coach_id: uuid.UUID):
    """WHERE clause: COMPANY exercises OR exercises owned by this coach."""
    return or_(
        Exercise.owner_type == OwnerType.COMPANY,
        Exercise.coach_id == coach_id,
    )


class AbstractExerciseRepository(ABC):

    @abstractmethod
    def get_by_id(self, exercise_id: uuid.UUID, coach_id: uuid.UUID) -> Optional[Exercise]:
        """Return the exercise if visible to this coach (COMPANY or own), else None."""
        ...

    @abstractmethod
    def get_by_id_for_team(self, exercise_id: uuid.UUID, team_id: uuid.UUID) -> Optional[Exercise]:
        """
        Return the exercise if accessible for session execution in team_id.

        Accessible means:
        - owner_type = COMPANY (globally available), OR
        - owner_type = COACH and coach_id belongs to an active COACH member of team_id.
        """
        ...

    @abstractmethod
    def get_existing_ids(
        self, exercise_ids: set[uuid.UUID], coach_id: uuid.UUID
    ) -> set[uuid.UUID]:
        """Return the subset of exercise_ids visible to this coach (single query)."""
        ...

    @abstractmethod
    def get_all_by_coach(self, coach_id: uuid.UUID) -> list[Exercise]:
        """Return all exercises visible to this coach (COMPANY + own)."""
        ...


class SqlAlchemyExerciseRepository(AbstractExerciseRepository):

    def __init__(self, db: Session) -> None:
        self._db = db

    def get_by_id(self, exercise_id: uuid.UUID, coach_id: uuid.UUID) -> Optional[Exercise]:
        stmt = select(Exercise).where(
            Exercise.id == exercise_id,
            _company_or_own(coach_id),
        )
        return self._db.execute(stmt).scalar_one_or_none()

    def get_by_id_for_team(self, exercise_id: uuid.UUID, team_id: uuid.UUID) -> Optional[Exercise]:
        """
        Return exercise for session execution.

        Uses a subquery to collect all coach UserProfile IDs that are active
        COACH members of team_id, then checks against that set.
        COMPANY exercises bypass the team membership check entirely.
        """
        team_coach_ids = (
            select(UserProfile.id)
            .join(Membership, Membership.user_id == UserProfile.supabase_user_id)
            .where(
                Membership.team_id == team_id,
                Membership.role == Role.COACH,
            )
            .scalar_subquery()
        )
        stmt = select(Exercise).where(
            Exercise.id == exercise_id,
            or_(
                Exercise.owner_type == OwnerType.COMPANY,
                Exercise.coach_id.in_(team_coach_ids),
            ),
        )
        return self._db.execute(stmt).scalar_one_or_none()

    def get_existing_ids(
        self, exercise_ids: set[uuid.UUID], coach_id: uuid.UUID
    ) -> set[uuid.UUID]:
        if not exercise_ids:
            return set()
        stmt = select(Exercise.id).where(
            Exercise.id.in_(exercise_ids),
            _company_or_own(coach_id),
        )
        return set(self._db.execute(stmt).scalars())

    def get_all_by_coach(self, coach_id: uuid.UUID) -> list[Exercise]:
        stmt = select(Exercise).where(_company_or_own(coach_id))
        return list(self._db.execute(stmt).scalars())
