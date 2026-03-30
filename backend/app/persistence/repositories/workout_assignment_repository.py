"""Abstract and concrete SQLAlchemy repository for WorkoutAssignment."""
import uuid
from abc import ABC, abstractmethod
from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.workout_assignment import AssignmentTargetType, WorkoutAssignment


class AbstractWorkoutAssignmentRepository(ABC):

    @abstractmethod
    def create(
        self,
        team_id: uuid.UUID,
        workout_template_id: uuid.UUID,
        target_type: AssignmentTargetType,
        target_athlete_id: Optional[uuid.UUID],
        scheduled_for: Optional[date],
        template_snapshot: Optional[dict[str, Any]] = None,
    ) -> WorkoutAssignment:
        """Persist a new WorkoutAssignment (flush only) and return the instance."""
        ...

    @abstractmethod
    def exists_recent_athlete_assignment(
        self,
        team_id: uuid.UUID,
        template_id: uuid.UUID,
        athlete_ids: list[uuid.UUID],
        within_seconds: int = 10,
    ) -> bool:
        """Return True if any ATHLETE assignment for this template + athletes was
        created within the last *within_seconds* seconds.

        Used by the batch assignment workflow to detect rapid duplicate submits
        (e.g. accidental double-click). The window is intentionally short so that
        legitimate back-to-back reassignments (>10 s apart) are still allowed.
        This is a soft guard, not strict idempotency — a proper idempotency-key
        mechanism should replace this in a future sprint if needed.
        """
        ...


class SqlAlchemyWorkoutAssignmentRepository(AbstractWorkoutAssignmentRepository):

    def __init__(self, db: Session) -> None:
        self._db = db

    def create(
        self,
        team_id: uuid.UUID,
        workout_template_id: uuid.UUID,
        target_type: AssignmentTargetType,
        target_athlete_id: Optional[uuid.UUID],
        scheduled_for: Optional[date],
        template_snapshot: Optional[dict[str, Any]] = None,
    ) -> WorkoutAssignment:
        assignment = WorkoutAssignment(
            id=uuid.uuid4(),
            team_id=team_id,
            workout_template_id=workout_template_id,
            target_type=target_type,
            target_athlete_id=target_athlete_id,
            scheduled_for=scheduled_for,
            template_snapshot=template_snapshot,
        )
        self._db.add(assignment)
        self._db.flush()  # populate .id without committing the transaction
        return assignment

    def exists_recent_athlete_assignment(
        self,
        team_id: uuid.UUID,
        template_id: uuid.UUID,
        athlete_ids: list[uuid.UUID],
        within_seconds: int = 10,
    ) -> bool:
        """Check for a recent duplicate batch assignment (deduplication window)."""
        since = datetime.now(tz=timezone.utc) - timedelta(seconds=within_seconds)
        stmt = (
            select(WorkoutAssignment.id)
            .where(
                WorkoutAssignment.team_id == team_id,
                WorkoutAssignment.workout_template_id == template_id,
                WorkoutAssignment.target_athlete_id.in_(athlete_ids),
                WorkoutAssignment.created_at >= since,
            )
            .limit(1)
        )
        return self._db.execute(stmt).scalar_one_or_none() is not None
