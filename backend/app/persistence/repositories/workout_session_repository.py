"""Abstract and concrete SQLAlchemy repository for WorkoutSession."""
import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import Optional

from sqlalchemy import exists, func, select
from sqlalchemy.orm import Session

from app.models.block_exercise import BlockExercise
from app.models.user_profile import UserProfile
from app.models.workout_block import WorkoutBlock
from app.models.workout_session import WorkoutSession
from app.models.workout_session_log import WorkoutSessionLog
from app.models.workout_template import WorkoutTemplate


@dataclass
class AttentionSessionRow:
    """Lightweight DTO for the attention-queue endpoint."""

    id: uuid.UUID
    athlete_id: uuid.UUID
    workout_template_id: uuid.UUID
    scheduled_for: Optional[date]
    template_title: str
    athlete_name: str
    exercise_count: int
    exercises_logged_count: int
    last_log_at: Optional[datetime]  # MAX(log.created_at) — None if no logs yet


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
    exercise_count: int
    exercises_logged_count: int


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

    @abstractmethod
    def get_pending_by_team(self, team_id: uuid.UUID) -> list[AttentionSessionRow]:
        """Return all non-completed, non-cancelled sessions for the team,
        enriched with exercise counts and last-log timestamp for attention queue."""
        ...

    @abstractmethod
    def create_sessions_for_batch(
        self,
        items: list[tuple[uuid.UUID, uuid.UUID]],
        workout_template_id: uuid.UUID,
        scheduled_for: Optional[date],
    ) -> list[WorkoutSession]:
        """Flush one WorkoutSession per (assignment_id, athlete_id) pair.

        Does NOT commit — transaction ownership belongs to
        BatchCreateWorkoutAssignmentUseCase via AbstractUnitOfWork.
        """
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

    def _exercise_count_subquery(self):
        return (
            select(func.count(BlockExercise.id))
            .join(WorkoutBlock, BlockExercise.workout_block_id == WorkoutBlock.id)
            .where(WorkoutBlock.workout_template_id == WorkoutSession.workout_template_id)
            .correlate(WorkoutSession)
            .scalar_subquery()
            .label("exercise_count")
        )

    def _exercises_logged_subquery(self):
        return (
            select(func.count(func.distinct(WorkoutSessionLog.exercise_id)))
            .where(WorkoutSessionLog.session_id == WorkoutSession.id)
            .correlate(WorkoutSession)
            .scalar_subquery()
            .label("exercises_logged_count")
        )

    def _build_list_stmt(self):
        ex_count = self._exercise_count_subquery()
        logged_count = self._exercises_logged_subquery()
        return (
            select(WorkoutSession, WorkoutTemplate.title, UserProfile.name, ex_count, logged_count)
            .join(UserProfile, WorkoutSession.athlete_id == UserProfile.id)
            .join(WorkoutTemplate, WorkoutSession.workout_template_id == WorkoutTemplate.id)
        )

    def _row_from_result(self, row) -> WorkoutSessionRow:
        return WorkoutSessionRow(
            id=row.WorkoutSession.id,
            assignment_id=row.WorkoutSession.assignment_id,
            athlete_id=row.WorkoutSession.athlete_id,
            workout_template_id=row.WorkoutSession.workout_template_id,
            scheduled_for=row.WorkoutSession.scheduled_for,
            completed_at=row.WorkoutSession.completed_at,
            template_title=row.title,
            athlete_name=row.name,
            exercise_count=row.exercise_count or 0,
            exercises_logged_count=row.exercises_logged_count or 0,
        )

    def list_by_team(self, team_id: uuid.UUID) -> list[WorkoutSessionRow]:
        stmt = (
            self._build_list_stmt()
            .where(UserProfile.team_id == team_id)
            .where(WorkoutSession.cancelled_at.is_(None))
        )
        return [self._row_from_result(row) for row in self._db.execute(stmt)]

    def list_by_athlete(
        self,
        athlete_id: uuid.UUID,
        team_id: uuid.UUID,
    ) -> list[WorkoutSessionRow]:
        stmt = (
            self._build_list_stmt()
            .where(
                WorkoutSession.athlete_id == athlete_id,
                UserProfile.team_id == team_id,
            )
            .where(WorkoutSession.cancelled_at.is_(None))
        )
        return [self._row_from_result(row) for row in self._db.execute(stmt)]

    def _last_log_at_subquery(self):
        return (
            select(func.max(WorkoutSessionLog.created_at))
            .where(WorkoutSessionLog.session_id == WorkoutSession.id)
            .correlate(WorkoutSession)
            .scalar_subquery()
            .label("last_log_at")
        )

    def get_pending_by_team(self, team_id: uuid.UUID) -> list[AttentionSessionRow]:
        ex_count = self._exercise_count_subquery()
        logged_count = self._exercises_logged_subquery()
        last_log = self._last_log_at_subquery()
        stmt = (
            select(
                WorkoutSession,
                WorkoutTemplate.title,
                UserProfile.name,
                ex_count,
                logged_count,
                last_log,
            )
            .join(UserProfile, WorkoutSession.athlete_id == UserProfile.id)
            .join(WorkoutTemplate, WorkoutSession.workout_template_id == WorkoutTemplate.id)
            .where(UserProfile.team_id == team_id)
            .where(WorkoutTemplate.team_id == team_id)
            .where(WorkoutSession.completed_at.is_(None))
            .where(WorkoutSession.cancelled_at.is_(None))
        )
        return [
            AttentionSessionRow(
                id=row.WorkoutSession.id,
                athlete_id=row.WorkoutSession.athlete_id,
                workout_template_id=row.WorkoutSession.workout_template_id,
                scheduled_for=row.WorkoutSession.scheduled_for,
                template_title=row.title,
                athlete_name=row.name,
                exercise_count=row.exercise_count or 0,
                exercises_logged_count=row.exercises_logged_count or 0,
                last_log_at=row.last_log_at,
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

    def create_sessions_for_batch(
        self,
        items: list[tuple[uuid.UUID, uuid.UUID]],
        workout_template_id: uuid.UUID,
        scheduled_for: Optional[date],
    ) -> list[WorkoutSession]:
        """Flush sessions for multiple (assignment_id, athlete_id) pairs.

        Flush only — BatchCreateWorkoutAssignmentUseCase owns the commit via
        AbstractUnitOfWork, so the entire batch (assignments + sessions + audit
        event) commits or rolls back atomically.
        """
        sessions = [
            WorkoutSession(
                id=uuid.uuid4(),
                assignment_id=assignment_id,
                athlete_id=athlete_id,
                workout_template_id=workout_template_id,
                scheduled_for=scheduled_for,
            )
            for assignment_id, athlete_id in items
        ]
        self._db.add_all(sessions)
        self._db.flush()  # IDs populated via RETURNING; no commit yet
        return sessions
