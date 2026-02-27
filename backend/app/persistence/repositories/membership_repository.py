"""Repository for Membership aggregate."""
import uuid
from abc import ABC, abstractmethod
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.membership import Membership
from app.models.user_profile import Role


class AbstractMembershipRepository(ABC):

    @abstractmethod
    def create(self, user_id: uuid.UUID, team_id: uuid.UUID, role: Role) -> Membership:
        """Persist a new membership and return it (flushed, not committed)."""
        ...

    @abstractmethod
    def get_by_user_id(self, user_id: uuid.UUID) -> list[Membership]:
        """Return all memberships for a given Supabase user."""
        ...

    @abstractmethod
    def get_by_user_and_team(
        self, user_id: uuid.UUID, team_id: uuid.UUID
    ) -> Optional[Membership]:
        """Return the membership for a specific user+team pair, or None."""
        ...

    @abstractmethod
    def has_coach_membership(self, user_id: uuid.UUID) -> bool:
        """Return True if the user already holds a COACH role in any team."""
        ...


class SqlAlchemyMembershipRepository(AbstractMembershipRepository):

    def __init__(self, db: Session) -> None:
        self._db = db

    def create(self, user_id: uuid.UUID, team_id: uuid.UUID, role: Role) -> Membership:
        membership = Membership(id=uuid.uuid4(), user_id=user_id, team_id=team_id, role=role)
        self._db.add(membership)
        self._db.flush()
        return membership

    def get_by_user_id(self, user_id: uuid.UUID) -> list[Membership]:
        stmt = select(Membership).where(Membership.user_id == user_id)
        return list(self._db.execute(stmt).scalars().all())

    def get_by_user_and_team(
        self, user_id: uuid.UUID, team_id: uuid.UUID
    ) -> Optional[Membership]:
        stmt = select(Membership).where(
            Membership.user_id == user_id,
            Membership.team_id == team_id,
        )
        return self._db.execute(stmt).scalar_one_or_none()

    def has_coach_membership(self, user_id: uuid.UUID) -> bool:
        stmt = select(Membership).where(
            Membership.user_id == user_id,
            Membership.role == Role.COACH,
        )
        return self._db.execute(stmt).scalar_one_or_none() is not None
