"""Abstract and concrete SQLAlchemy repository for WorkoutSessionLog."""
import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional

from sqlalchemy import delete, exists, func, select
from sqlalchemy.orm import Session, selectinload

from app.models.workout_session_log import WorkoutSessionLog
from app.models.workout_session_log_entry import WorkoutSessionLogEntry


# ---------------------------------------------------------------------------
# Input value object (persistence-layer DTO, no domain dependency)
# ---------------------------------------------------------------------------

@dataclass
class NewLogEntry:
    """Raw data for a single set row; used when creating or upserting a log."""

    set_number: int
    reps: Optional[int] = None
    weight: Optional[float] = None
    rpe: Optional[float] = None


# ---------------------------------------------------------------------------
# Abstract interface
# ---------------------------------------------------------------------------

class AbstractWorkoutSessionLogRepository(ABC):

    @abstractmethod
    def create(
        self,
        team_id: uuid.UUID,
        session_id: uuid.UUID,
        block_name: str,
        exercise_id: uuid.UUID,
        entries: list[NewLogEntry],
        created_by_profile_id: uuid.UUID,
        notes: Optional[str] = None,
    ) -> WorkoutSessionLog:
        """Persist log + entries in a single flush; return the populated log."""
        ...

    @abstractmethod
    def upsert_for_exercise(
        self,
        team_id: uuid.UUID,
        session_id: uuid.UUID,
        exercise_id: uuid.UUID,
        block_name: str,
        entries: list[NewLogEntry],
        created_by_profile_id: uuid.UUID,
    ) -> WorkoutSessionLog:
        """True replace of all entries for (session_id, exercise_id).

        Atomically deletes every existing WorkoutSessionLogEntry for this
        exercise in this session, then inserts the supplied entries.  The log
        record itself is reused if one already exists; otherwise a new one is
        created.  The caller must supply the *complete* desired state — any
        previously saved entry absent from `entries` is permanently removed.

        Returns the refreshed log with entries ordered by set_number.
        """
        ...

    @abstractmethod
    def count_by_session(self, session_id: uuid.UUID) -> int:
        """Return the number of logs already persisted for the given session."""
        ...

    @abstractmethod
    def list_by_session(
        self,
        session_id: uuid.UUID,
    ) -> list[WorkoutSessionLog]:
        """Return all logs for the session ordered by created_at, entries pre-loaded."""
        ...

    @abstractmethod
    def has_logs_for_exercise(
        self,
        session_id: uuid.UUID,
        exercise_id: uuid.UUID,
    ) -> bool:
        """True if any log row exists for this (session, exercise) pair."""
        ...


# ---------------------------------------------------------------------------
# Concrete SQLAlchemy implementation
# ---------------------------------------------------------------------------

class SqlAlchemyWorkoutSessionLogRepository(AbstractWorkoutSessionLogRepository):

    def __init__(self, db: Session) -> None:
        self._db = db

    def count_by_session(self, session_id: uuid.UUID) -> int:
        stmt = select(func.count()).select_from(WorkoutSessionLog).where(
            WorkoutSessionLog.session_id == session_id
        )
        return self._db.execute(stmt).scalar_one()

    def create(
        self,
        team_id: uuid.UUID,
        session_id: uuid.UUID,
        block_name: str,
        exercise_id: uuid.UUID,
        entries: list[NewLogEntry],
        created_by_profile_id: uuid.UUID,
        notes: Optional[str] = None,
    ) -> WorkoutSessionLog:
        log = WorkoutSessionLog(
            id=uuid.uuid4(),
            team_id=team_id,
            session_id=session_id,
            block_name=block_name,
            exercise_id=exercise_id,
            notes=notes,
            created_by_profile_id=created_by_profile_id,
        )
        self._db.add(log)
        self._db.flush()  # populate log.id before creating child entries

        for entry_data in entries:
            self._db.add(
                WorkoutSessionLogEntry(
                    id=uuid.uuid4(),
                    log_id=log.id,
                    set_number=entry_data.set_number,
                    reps=entry_data.reps,
                    weight=entry_data.weight,
                    rpe=entry_data.rpe,
                )
            )

        self._db.commit()
        self._db.refresh(log)
        return log

    def upsert_for_exercise(
        self,
        team_id: uuid.UUID,
        session_id: uuid.UUID,
        exercise_id: uuid.UUID,
        block_name: str,
        entries: list[NewLogEntry],
        created_by_profile_id: uuid.UUID,
    ) -> WorkoutSessionLog:
        # Find existing log for this exercise in this session (take first if
        # multiple exist — pathological edge case from old POST behaviour).
        existing = self._db.execute(
            select(WorkoutSessionLog)
            .where(
                WorkoutSessionLog.session_id == session_id,
                WorkoutSessionLog.exercise_id == exercise_id,
            )
            .limit(1)
        ).scalar_one_or_none()

        if existing is not None:
            # True replace: delete every previous entry so only the new payload survives.
            self._db.execute(
                delete(WorkoutSessionLogEntry).where(
                    WorkoutSessionLogEntry.log_id == existing.id
                )
            )
            log = existing
        else:
            log = WorkoutSessionLog(
                id=uuid.uuid4(),
                team_id=team_id,
                session_id=session_id,
                block_name=block_name,
                exercise_id=exercise_id,
                created_by_profile_id=created_by_profile_id,
            )
            self._db.add(log)
            self._db.flush()

        for entry_data in entries:
            self._db.add(
                WorkoutSessionLogEntry(
                    id=uuid.uuid4(),
                    log_id=log.id,
                    set_number=entry_data.set_number,
                    reps=entry_data.reps,
                    weight=entry_data.weight,
                    rpe=entry_data.rpe,
                )
            )

        self._db.commit()
        self._db.refresh(log)
        return log

    def list_by_session(
        self,
        session_id: uuid.UUID,
    ) -> list[WorkoutSessionLog]:
        stmt = (
            select(WorkoutSessionLog)
            .where(WorkoutSessionLog.session_id == session_id)
            .options(selectinload(WorkoutSessionLog.entries))
            .order_by(WorkoutSessionLog.created_at)
        )
        return list(self._db.execute(stmt).scalars())

    def has_logs_for_exercise(
        self,
        session_id: uuid.UUID,
        exercise_id: uuid.UUID,
    ) -> bool:
        stmt = select(
            exists().where(
                WorkoutSessionLog.session_id == session_id,
                WorkoutSessionLog.exercise_id == exercise_id,
            )
        )
        return bool(self._db.execute(stmt).scalar())
