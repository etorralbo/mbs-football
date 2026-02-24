"""Abstract and concrete SQLAlchemy repository for WorkoutSession."""
import uuid
from abc import ABC, abstractmethod
from datetime import date, datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.user_profile import UserProfile
from app.models.workout_session import WorkoutSession


class AbstractWorkoutSessionRepository(ABC):

    @abstractmethod
    def create_bulk(
        self,
        assignment_id: uuid.UUID,
        athlete_ids: list[uuid.UUID],
        workout_template_id: uuid.UUID,
        scheduled_for: Optional[date],
    ) -> list[WorkoutSession]:
        """Persist one WorkoutSession per athlete_id and commit the transaction.

        The preceding assignment row (flushed but not yet committed) is also
        committed atomically here.
        """
        ...

    @abstractmethod
    def list_by_team(self, team_id: uuid.UUID) -> list[WorkoutSession]:
        """Return all sessions whose athlete belongs to the given team."""
        ...

    @abstractmethod
    def list_by_athlete(self, athlete_id: uuid.UUID) -> list[WorkoutSession]:
        """Return all sessions assigned to a specific athlete."""
        ...

    @abstractmethod
    def get_by_id_and_team(
        self,
        session_id: uuid.UUID,
        team_id: uuid.UUID,
    ) -> Optional[WorkoutSession]:
        """Return the session only if the athlete belongs to the given team, else None."""
        ...

    @abstractmethod
    def get_by_id_and_athlete(
        self,
        session_id: uuid.UUID,
        athlete_id: uuid.UUID,
    ) -> Optional[WorkoutSession]:
        """Return the session only if it is assigned to the given athlete, else None."""
        ...

    @abstractmethod
    def mark_complete(self, session: WorkoutSession) -> None:
        """Stamp completed_at with the current UTC time and commit."""
        ...


class SqlAlchemyWorkoutSessionRepository(AbstractWorkoutSessionRepository):

    def __init__(self, db: Session) -> None:
        self._db = db

    def create_bulk(
        self,
        assignment_id: uuid.UUID,
        athlete_ids: list[uuid.UUID],
        workout_template_id: uuid.UUID,
        scheduled_for: Optional[date],
    ) -> list[WorkoutSession]:
        sessions = [
            WorkoutSession(
                id=uuid.uuid4(),
                assignment_id=assignment_id,
                athlete_id=athlete_id,
                workout_template_id=workout_template_id,
                scheduled_for=scheduled_for,
            )
            for athlete_id in athlete_ids
        ]
        self._db.add_all(sessions)
        self._db.commit()
        for s in sessions:
            self._db.refresh(s)
        return sessions

    def list_by_team(self, team_id: uuid.UUID) -> list[WorkoutSession]:
        stmt = (
            select(WorkoutSession)
            .join(UserProfile, WorkoutSession.athlete_id == UserProfile.id)
            .where(UserProfile.team_id == team_id)
        )
        return list(self._db.execute(stmt).scalars())

    def list_by_athlete(self, athlete_id: uuid.UUID) -> list[WorkoutSession]:
        stmt = select(WorkoutSession).where(WorkoutSession.athlete_id == athlete_id)
        return list(self._db.execute(stmt).scalars())

    def get_by_id_and_team(
        self,
        session_id: uuid.UUID,
        team_id: uuid.UUID,
    ) -> Optional[WorkoutSession]:
        stmt = (
            select(WorkoutSession)
            .join(UserProfile, WorkoutSession.athlete_id == UserProfile.id)
            .where(
                WorkoutSession.id == session_id,
                UserProfile.team_id == team_id,
            )
        )
        return self._db.execute(stmt).scalar_one_or_none()

    def get_by_id_and_athlete(
        self,
        session_id: uuid.UUID,
        athlete_id: uuid.UUID,
    ) -> Optional[WorkoutSession]:
        stmt = select(WorkoutSession).where(
            WorkoutSession.id == session_id,
            WorkoutSession.athlete_id == athlete_id,
        )
        return self._db.execute(stmt).scalar_one_or_none()

    def mark_complete(self, session: WorkoutSession) -> None:
        session.completed_at = datetime.now(tz=timezone.utc)
        self._db.add(session)
        self._db.commit()
