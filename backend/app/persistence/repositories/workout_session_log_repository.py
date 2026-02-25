"""Abstract and concrete SQLAlchemy repository for WorkoutSessionLog."""
import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.workout_session_log import WorkoutSessionLog
from app.models.workout_session_log_entry import WorkoutSessionLogEntry


# ---------------------------------------------------------------------------
# Input value object (persistence-layer DTO, no domain dependency)
# ---------------------------------------------------------------------------

@dataclass
class NewLogEntry:
    """Raw data for a single set row; used only when creating a log."""

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
    def list_by_session(
        self,
        session_id: uuid.UUID,
    ) -> list[WorkoutSessionLog]:
        """Return all logs for the session ordered by created_at, entries pre-loaded."""
        ...


# ---------------------------------------------------------------------------
# Concrete SQLAlchemy implementation
# ---------------------------------------------------------------------------

class SqlAlchemyWorkoutSessionLogRepository(AbstractWorkoutSessionLogRepository):

    def __init__(self, db: Session) -> None:
        self._db = db

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
