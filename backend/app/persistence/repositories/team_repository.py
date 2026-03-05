"""Abstract repository interface for Team aggregate."""
import uuid
from abc import ABC, abstractmethod
from typing import Optional

from sqlalchemy import exists, select
from sqlalchemy.orm import Session

from app.models.exercise import Exercise
from app.models.membership import Membership
from app.models.team import Team
from app.models.user_profile import Role, UserProfile
from app.models.workout_session import WorkoutSession
from app.models.workout_assignment import WorkoutAssignment


class AbstractTeamRepository(ABC):

    @abstractmethod
    def create(self, name: str, created_by_user_id: uuid.UUID) -> Team:
        """Persist a new team with the given name and return the created instance."""
        ...

    @abstractmethod
    def get_by_id(self, team_id: uuid.UUID) -> Optional[Team]:
        """Return the team with the given id, or None if not found."""
        ...

    @abstractmethod
    def has_athletes(self, team_id: uuid.UUID) -> bool:
        """Return True if the team has any ATHLETE memberships."""
        ...

    @abstractmethod
    def has_sessions(self, team_id: uuid.UUID) -> bool:
        """Return True if the team has any workout sessions (via assignments)."""
        ...

    @abstractmethod
    def has_coach_exercises(self, team_id: uuid.UUID) -> bool:
        """Return True if any user_profile in this team owns coach-scoped exercises."""
        ...

    @abstractmethod
    def delete(self, team: Team) -> None:
        """Hard-delete the team (DB cascades handle dependents)."""
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

    def has_athletes(self, team_id: uuid.UUID) -> bool:
        stmt = select(
            exists().where(
                Membership.team_id == team_id,
                Membership.role == Role.ATHLETE,
            )
        )
        return self._db.execute(stmt).scalar()  # type: ignore[return-value]

    def has_sessions(self, team_id: uuid.UUID) -> bool:
        stmt = select(
            exists().where(
                WorkoutAssignment.team_id == team_id,
                WorkoutSession.assignment_id == WorkoutAssignment.id,
            )
        )
        return self._db.execute(stmt).scalar()  # type: ignore[return-value]

    def has_coach_exercises(self, team_id: uuid.UUID) -> bool:
        stmt = select(
            exists().where(
                UserProfile.team_id == team_id,
                Exercise.coach_id == UserProfile.id,
            )
        )
        return self._db.execute(stmt).scalar()  # type: ignore[return-value]

    def delete(self, team: Team) -> None:
        self._db.delete(team)
        self._db.flush()
