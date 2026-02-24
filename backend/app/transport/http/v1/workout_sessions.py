"""HTTP transport layer — Workout Sessions router.

Exposes:
    GET   /workout-sessions
    PATCH /workout-sessions/{session_id}/complete
"""
import uuid
from datetime import date, datetime
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.dependencies import CurrentUser, require_any_role
from app.db.session import get_db
from app.domain.use_cases.complete_workout_session import (
    CompleteWorkoutSessionCommand,
    CompleteWorkoutSessionUseCase,
    NotFoundError,
)
from app.domain.use_cases.list_workout_sessions import (
    ListWorkoutSessionsQuery,
    ListWorkoutSessionsUseCase,
    WorkoutSessionItem,
)
from app.models.user_profile import Role
from app.persistence.repositories.workout_session_repository import (
    SqlAlchemyWorkoutSessionRepository,
)

router = APIRouter(prefix="/workout-sessions", tags=["workout-sessions"])


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------

class WorkoutSessionOut(BaseModel):
    id: uuid.UUID
    assignment_id: uuid.UUID
    athlete_id: uuid.UUID
    workout_template_id: uuid.UUID
    scheduled_for: Optional[date]
    completed_at: Optional[datetime]


# ---------------------------------------------------------------------------
# Private helpers (wiring + mapping — no business logic)
# ---------------------------------------------------------------------------

def _build_list_use_case(db: Session) -> ListWorkoutSessionsUseCase:
    return ListWorkoutSessionsUseCase(
        session_repo=SqlAlchemyWorkoutSessionRepository(db)
    )


def _build_complete_use_case(db: Session) -> CompleteWorkoutSessionUseCase:
    return CompleteWorkoutSessionUseCase(
        session_repo=SqlAlchemyWorkoutSessionRepository(db)
    )


def _to_list_query(current_user: CurrentUser) -> ListWorkoutSessionsQuery:
    return ListWorkoutSessionsQuery(
        team_id=current_user.team_id,
        role=current_user.role,
        athlete_id=current_user.user_id if current_user.role == Role.ATHLETE else None,
    )


def _to_complete_command(
    session_id: uuid.UUID,
    current_user: CurrentUser,
) -> CompleteWorkoutSessionCommand:
    return CompleteWorkoutSessionCommand(
        session_id=session_id,
        requesting_role=current_user.role,
        requesting_team_id=current_user.team_id,
        requesting_athlete_id=(
            current_user.user_id if current_user.role == Role.ATHLETE else None
        ),
    )


def _to_out(item: WorkoutSessionItem) -> WorkoutSessionOut:
    return WorkoutSessionOut(
        id=item.id,
        assignment_id=item.assignment_id,
        athlete_id=item.athlete_id,
        workout_template_id=item.workout_template_id,
        scheduled_for=item.scheduled_for,
        completed_at=item.completed_at,
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("", response_model=list[WorkoutSessionOut])
def list_sessions(
    current_user: Annotated[CurrentUser, Depends(require_any_role)],
    db: Session = Depends(get_db),
) -> list[WorkoutSessionOut]:
    use_case = _build_list_use_case(db)
    result = use_case.execute(_to_list_query(current_user))
    return [_to_out(item) for item in result.sessions]


@router.patch("/{session_id}/complete", status_code=status.HTTP_204_NO_CONTENT)
def complete_session(
    session_id: uuid.UUID,
    current_user: Annotated[CurrentUser, Depends(require_any_role)],
    db: Session = Depends(get_db),
) -> None:
    use_case = _build_complete_use_case(db)
    command = _to_complete_command(session_id, current_user)

    try:
        use_case.execute(command)
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
