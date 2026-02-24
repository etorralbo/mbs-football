"""Abstract and concrete SQLAlchemy repository for WorkoutAssignment."""
import uuid
from abc import ABC, abstractmethod
from datetime import date
from typing import Optional

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
    ) -> WorkoutAssignment:
        """Persist a new WorkoutAssignment (flush only) and return the instance."""
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
    ) -> WorkoutAssignment:
        assignment = WorkoutAssignment(
            id=uuid.uuid4(),
            team_id=team_id,
            workout_template_id=workout_template_id,
            target_type=target_type,
            target_athlete_id=target_athlete_id,
            scheduled_for=scheduled_for,
        )
        self._db.add(assignment)
        self._db.flush()  # populate .id without committing the transaction
        return assignment
