"""Abstract repository interface for UserProfile aggregate."""
import uuid
from abc import ABC, abstractmethod
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.user_profile import Role, UserProfile


class AbstractUserProfileRepository(ABC):

    @abstractmethod
    def get_by_supabase_user_id(self, supabase_user_id: uuid.UUID) -> Optional[UserProfile]:
        """Return the profile linked to the given Supabase user id, or None."""
        ...

    @abstractmethod
    def create(
        self,
        supabase_user_id: uuid.UUID,
        team_id: uuid.UUID,
        name: str,
        role: Role,
    ) -> UserProfile:
        """Persist a new UserProfile and return the created instance."""
        ...


class SqlAlchemyUserProfileRepository(AbstractUserProfileRepository):

    def __init__(self, db: Session) -> None:
        self._db = db

    def get_by_supabase_user_id(self, supabase_user_id: uuid.UUID) -> Optional[UserProfile]:
        stmt = select(UserProfile).where(UserProfile.supabase_user_id == supabase_user_id)
        return self._db.execute(stmt).scalar_one_or_none()

    def create(
        self,
        supabase_user_id: uuid.UUID,
        team_id: uuid.UUID,
        name: str,
        role: Role,
    ) -> UserProfile:
        profile = UserProfile(
            id=uuid.uuid4(),
            supabase_user_id=supabase_user_id,
            team_id=team_id,
            name=name,
            role=role,
        )
        self._db.add(profile)
        self._db.commit()
        self._db.refresh(profile)
        return profile
