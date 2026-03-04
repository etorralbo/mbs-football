"""Abstract and concrete SQLAlchemy repository for WorkoutSession."""
import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import Optional

from sqlalchemy import exists, select
from sqlalchemy.orm import Session

from app.models.user_profile import UserProfile
from app.models.workout_session import WorkoutSession
from app.models.workout_session_log import WorkoutSessionLog
from app.models.workout_template import WorkoutTemplate


@dataclass
class WorkoutSessionRow:
    """Lightweight DTO: session fields + template title + athlete name (fetched via JOIN)."""

    id: uuid.UUID
    assignment_id: uuid.UUID
    athlete_id: uuid.UUID
    workout_template_id: uuid.UUID
    scheduled_for: Optional[date]
    completed_at: Optional[datetime]
    template_title: str
    athlete_name: str


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
    def list_by_team(self, team_id: uuid.UUID) -> list[WorkoutSessionRow]:
        """Return all sessions whose athlete belongs to the given team."""
        ...

    @abstractmethod
    def list_by_athlete(
        self,
        athlete_id: uuid.UUID,
        team_id: uuid.UUID,
    ) -> list[WorkoutSessionRow]:
        """Return all sessions assigned to *athlete_id* that also belong to *team_id*.

        Both conditions are required so that a valid athlete_id from a different
        team cannot leak sessions across tenant boundaries.
        """
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
    def get_template_title(self, template_id: uuid.UUID) -> str:
        """Return the title of the WorkoutTemplate with the given id."""
        ...

    @abstractmethod
    def mark_complete(self, session: WorkoutSession) -> None:
        """Stamp completed_at with the current UTC time and commit."""
        ...

    @abstractmethod
    def has_logs(self, session_id: uuid.UUID) -> bool:
        """Return True if the session has any log records."""
        ...

    @abstractmethod
    def cancel(self, session: WorkoutSession) -> None:
        """Stamp cancelled_at with the current UTC time and commit."""
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

    def list_by_team(self, team_id: uuid.UUID) -> list[WorkoutSessionRow]:
        stmt = (
            select(WorkoutSession, WorkoutTemplate.title, UserProfile.name)
            .join(UserProfile, WorkoutSession.athlete_id == UserProfile.id)
            .join(WorkoutTemplate, WorkoutSession.workout_template_id == WorkoutTemplate.id)
            .where(UserProfile.team_id == team_id)
            .where(WorkoutSession.cancelled_at.is_(None))
        )
        return [
            WorkoutSessionRow(
                id=row.WorkoutSession.id,
                assignment_id=row.WorkoutSession.assignment_id,
                athlete_id=row.WorkoutSession.athlete_id,
                workout_template_id=row.WorkoutSession.workout_template_id,
                scheduled_for=row.WorkoutSession.scheduled_for,
                completed_at=row.WorkoutSession.completed_at,
                template_title=row.title,
                athlete_name=row.name,
            )
            for row in self._db.execute(stmt)
        ]

    def list_by_athlete(
        self,
        athlete_id: uuid.UUID,
        team_id: uuid.UUID,
    ) -> list[WorkoutSessionRow]:
        stmt = (
            select(WorkoutSession, WorkoutTemplate.title, UserProfile.name)
            .join(UserProfile, WorkoutSession.athlete_id == UserProfile.id)
            .join(WorkoutTemplate, WorkoutSession.workout_template_id == WorkoutTemplate.id)
            .where(
                WorkoutSession.athlete_id == athlete_id,
                UserProfile.team_id == team_id,
            )
            .where(WorkoutSession.cancelled_at.is_(None))
        )
        return [
            WorkoutSessionRow(
                id=row.WorkoutSession.id,
                assignment_id=row.WorkoutSession.assignment_id,
                athlete_id=row.WorkoutSession.athlete_id,
                workout_template_id=row.WorkoutSession.workout_template_id,
                scheduled_for=row.WorkoutSession.scheduled_for,
                completed_at=row.WorkoutSession.completed_at,
                template_title=row.title,
                athlete_name=row.name,
            )
            for row in self._db.execute(stmt)
        ]

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

    def get_template_title(self, template_id: uuid.UUID) -> str:
        stmt = select(WorkoutTemplate.title).where(WorkoutTemplate.id == template_id)
        return self._db.execute(stmt).scalar_one_or_none() or ""

    def mark_complete(self, session: WorkoutSession) -> None:
        session.completed_at = datetime.now(tz=timezone.utc)
        self._db.add(session)
        self._db.commit()

    def has_logs(self, session_id: uuid.UUID) -> bool:
        stmt = select(
            exists().where(WorkoutSessionLog.session_id == session_id)
        )
        return bool(self._db.execute(stmt).scalar())

    def cancel(self, session: WorkoutSession) -> None:
        session.cancelled_at = datetime.now(tz=timezone.utc)
        self._db.add(session)
        self._db.commit()
