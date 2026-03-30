"""HTTP transport layer — Workout Assignments router.

Exposes:
    POST /workout-assignments          — single assignment (team or one athlete)
    POST /workout-assignments/batch    — assign to multiple athletes at once
"""
import uuid
from datetime import date
from typing import Annotated, Literal, Optional, Union

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from app.core.dependencies import CurrentUser, require_coach
from app.db.session import get_db
from app.domain.events.service import ProductEventService
from app.domain.use_cases.create_workout_assignment import (
    AthleteTarget,
    CreateWorkoutAssignmentCommand,
    CreateWorkoutAssignmentUseCase,
    NotFoundError,
    TeamTarget,
)
from app.domain.use_cases.batch_create_workout_assignment import (
    BatchCreateWorkoutAssignmentCommand,
    BatchCreateWorkoutAssignmentUseCase,
    NotFoundError as BatchNotFoundError,
)
from app.persistence.repositories.athlete_query_repository import (
    SqlAlchemyAthleteQueryRepository,
)
from app.persistence.repositories.workout_assignment_repository import (
    SqlAlchemyWorkoutAssignmentRepository,
)
from app.persistence.repositories.workout_session_repository import (
    SqlAlchemyWorkoutSessionRepository,
)
from app.persistence.repositories.workout_template_repository import (
    SqlAlchemyWorkoutTemplateRepository,
)

router = APIRouter(prefix="/workout-assignments", tags=["workout-assignments"])


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------

class TeamTargetIn(BaseModel):
    type: Literal["team"]


class AthleteTargetIn(BaseModel):
    type: Literal["athlete"]
    athlete_id: uuid.UUID


class AssignWorkoutIn(BaseModel):
    workout_template_id: uuid.UUID
    target: Union[TeamTargetIn, AthleteTargetIn] = Field(..., discriminator="type")
    scheduled_for: Optional[date] = None


class AssignWorkoutOut(BaseModel):
    assignment_id: uuid.UUID
    sessions_created: int


# ---------------------------------------------------------------------------
# Private helpers (wiring + mapping — no business logic)
# ---------------------------------------------------------------------------

def _build_use_case(db: Session) -> CreateWorkoutAssignmentUseCase:
    return CreateWorkoutAssignmentUseCase(
        template_repo=SqlAlchemyWorkoutTemplateRepository(db),
        assignment_repo=SqlAlchemyWorkoutAssignmentRepository(db),
        session_repo=SqlAlchemyWorkoutSessionRepository(db),
        athlete_query_repo=SqlAlchemyAthleteQueryRepository(db),
        event_service=ProductEventService(db),
    )


def _to_command(
    payload: AssignWorkoutIn,
    current_user: CurrentUser,
) -> CreateWorkoutAssignmentCommand:
    if isinstance(payload.target, TeamTargetIn):
        target: Union[TeamTarget, AthleteTarget] = TeamTarget()
    else:
        target = AthleteTarget(athlete_id=payload.target.athlete_id)

    return CreateWorkoutAssignmentCommand(
        requesting_user_id=current_user.supabase_user_id,
        requesting_team_id=current_user.team_id,
        workout_template_id=payload.workout_template_id,
        target=target,
        scheduled_for=payload.scheduled_for,
    )


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

@router.post("", response_model=AssignWorkoutOut, status_code=status.HTTP_201_CREATED)
def create_assignment(
    payload: AssignWorkoutIn,
    current_user: Annotated[CurrentUser, Depends(require_coach)],
    db: Session = Depends(get_db),
) -> AssignWorkoutOut:
    use_case = _build_use_case(db)
    command = _to_command(payload, current_user)

    try:
        result = use_case.execute(command)
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))

    return AssignWorkoutOut(
        assignment_id=result.assignment_id,
        sessions_created=result.sessions_created,
    )


# ---------------------------------------------------------------------------
# Batch assignment — assign to multiple athletes in one transaction
# ---------------------------------------------------------------------------

class BatchAssignWorkoutIn(BaseModel):
    workout_template_id: uuid.UUID
    athlete_ids: list[uuid.UUID] = Field(..., min_length=1)
    scheduled_for: Optional[date] = None

    @field_validator("athlete_ids")
    @classmethod
    def no_duplicate_athlete_ids(cls, v: list[uuid.UUID]) -> list[uuid.UUID]:
        if len(v) != len(set(v)):
            raise ValueError("athlete_ids must not contain duplicates")
        return v


class BatchAssignWorkoutOut(BaseModel):
    sessions_created: int


@router.post("/batch", response_model=BatchAssignWorkoutOut, status_code=status.HTTP_201_CREATED)
def create_batch_assignment(
    payload: BatchAssignWorkoutIn,
    current_user: Annotated[CurrentUser, Depends(require_coach)],
    db: Session = Depends(get_db),
) -> BatchAssignWorkoutOut:
    """Assign a workout template to multiple athletes in a single transaction.

    All athlete_ids must belong to the coach's team; any unknown or cross-team
    ID returns 404 to prevent IDOR leakage.
    """
    use_case = BatchCreateWorkoutAssignmentUseCase(
        template_repo=SqlAlchemyWorkoutTemplateRepository(db),
        assignment_repo=SqlAlchemyWorkoutAssignmentRepository(db),
        session_repo=SqlAlchemyWorkoutSessionRepository(db),
        athlete_query_repo=SqlAlchemyAthleteQueryRepository(db),
        event_service=ProductEventService(db),
    )

    command = BatchCreateWorkoutAssignmentCommand(
        requesting_user_id=current_user.supabase_user_id,
        requesting_team_id=current_user.team_id,
        workout_template_id=payload.workout_template_id,
        athlete_ids=payload.athlete_ids,
        scheduled_for=payload.scheduled_for,
    )

    try:
        result = use_case.execute(command)
    except BatchNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))

    return BatchAssignWorkoutOut(sessions_created=result.sessions_created)
