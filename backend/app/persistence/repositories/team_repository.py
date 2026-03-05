"""Abstract repository interface for Team aggregate."""
import uuid
from abc import ABC, abstractmethod
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.team import Team


class AbstractTeamRepository(ABC):

    @abstractmethod
    def create(self, name: str, created_by_user_id: uuid.UUID) -> Team:
        """Persist a new team with the given name and return the created instance."""
        ...

    @abstractmethod
    def get_by_id(self, team_id: uuid.UUID) -> Optional[Team]:
        """Return the team with the given id, or None if not found."""
        ...


class SqlAlchemyTeamRepository(AbstractTeamRepository):

    def __init__(self, db: Session) -> None:
        self._db = db

    def create(self, name: str, created_by_user_id: uuid.UUID) -> Team:
        team = Team(id=uuid.uuid4(), name=name, created_by_user_id=created_by_user_id)
        self._db.add(team)
        self._db.flush()
        return team

    def get_by_id(self, team_id: uuid.UUID) -> Optional[Team]:
        stmt = select(Team).where(Team.id == team_id)
        return self._db.execute(stmt).scalar_one_or_none()
