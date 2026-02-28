"""HTTP transport layer — Workout Execution router.

Exposes:
    POST  /workout-sessions/{session_id}/logs
    GET   /workout-sessions/{session_id}

PATCH /workout-sessions/{session_id}/complete is handled by workout_sessions.py.
"""
import uuid
from datetime import date
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.dependencies import CurrentUser, require_any_role, require_athlete
from app.db.session import get_db
from app.domain.events.service import ProductEventService
from app.domain.use_cases.create_workout_session_log import (
    CreateWorkoutSessionLogCommand,
    CreateWorkoutSessionLogUseCase,
    NotFoundError as LogNotFoundError,
    ValidationError as LogValidationError,
)
from app.domain.use_cases.get_workout_session_detail import (
    GetWorkoutSessionDetailQuery,
    GetWorkoutSessionDetailUseCase,
    NotFoundError as DetailNotFoundError,
    SessionLogEntryItem,
    SessionLogItem,
    WorkoutSessionDetailResult,
)
from app.domain.use_cases.get_session_execution_view import (
    BlockExecutionOut,
    ExerciseExecutionOut,
    GetSessionExecutionQuery,
    GetSessionExecutionViewUseCase,
    NotFoundError as ExecutionNotFoundError,
    SessionExecutionResult,
    SetLogOut,
)
from app.models.user_profile import Role
from app.persistence.repositories.exercise_repository import (
    SqlAlchemyExerciseRepository,
)
from app.persistence.repositories.workout_session_log_repository import (
    NewLogEntry,
    SqlAlchemyWorkoutSessionLogRepository,
)
from app.persistence.repositories.workout_session_repository import (
    SqlAlchemyWorkoutSessionRepository,
)
from app.persistence.repositories.workout_template_repository import (
    SqlAlchemyWorkoutTemplateRepository,
)

router = APIRouter(prefix="/workout-sessions", tags=["workout-execution"])


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------

class LogEntryIn(BaseModel):
    """One set as submitted by the athlete."""

    set_number: int = Field(..., ge=1)
    reps: Optional[int] = None
    weight: Optional[float] = None
    rpe: Optional[float] = None


class CreateLogIn(BaseModel):
    block_name: str
    exercise_id: uuid.UUID
    entries: list[LogEntryIn] = Field(..., min_length=1)
    notes: Optional[str] = None


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------

class CreateLogOut(BaseModel):
    log_id: uuid.UUID


class LogEntryOut(BaseModel):
    set_number: int
    reps: Optional[int]
    weight: Optional[float]
    rpe: Optional[float]


class SessionLogOut(BaseModel):
    log_id: uuid.UUID
    block_name: str
    exercise_id: uuid.UUID
    notes: Optional[str]
    entries: list[LogEntryOut]


class SessionDetailOut(BaseModel):
    id: uuid.UUID
    status: str
    workout_template_id: uuid.UUID
    template_title: str
    athlete_profile_id: uuid.UUID
    scheduled_for: Optional[date]
    logs: list[SessionLogOut]


# ---------------------------------------------------------------------------
# Private helpers (wiring + mapping — no business logic)
# ---------------------------------------------------------------------------

def _build_create_log_use_case(db: Session) -> CreateWorkoutSessionLogUseCase:
    return CreateWorkoutSessionLogUseCase(
        session_repo=SqlAlchemyWorkoutSessionRepository(db),
        log_repo=SqlAlchemyWorkoutSessionLogRepository(db),
        exercise_repo=SqlAlchemyExerciseRepository(db),
        event_service=ProductEventService(db),
    )


def _build_detail_use_case(db: Session) -> GetWorkoutSessionDetailUseCase:
    return GetWorkoutSessionDetailUseCase(
        session_repo=SqlAlchemyWorkoutSessionRepository(db),
        log_repo=SqlAlchemyWorkoutSessionLogRepository(db),
    )


def _to_create_log_command(
    payload: CreateLogIn,
    session_id: uuid.UUID,
    current_user: CurrentUser,
) -> CreateWorkoutSessionLogCommand:
    return CreateWorkoutSessionLogCommand(
        session_id=session_id,
        requesting_athlete_id=current_user.user_id,
        requesting_supabase_user_id=current_user.supabase_user_id,
        requesting_team_id=current_user.team_id,
        block_name=payload.block_name,
        exercise_id=payload.exercise_id,
        entries=[
            NewLogEntry(
                set_number=e.set_number,
                reps=e.reps,
                weight=e.weight,
                rpe=e.rpe,
            )
            for e in payload.entries
        ],
        notes=payload.notes,
    )


def _to_detail_query(
    session_id: uuid.UUID,
    current_user: CurrentUser,
) -> GetWorkoutSessionDetailQuery:
    return GetWorkoutSessionDetailQuery(
        session_id=session_id,
        requesting_role=current_user.role,
        requesting_team_id=current_user.team_id,
        requesting_athlete_id=(
            current_user.user_id if current_user.role == Role.ATHLETE else None
        ),
    )


def _entry_to_out(entry: SessionLogEntryItem) -> LogEntryOut:
    return LogEntryOut(
        set_number=entry.set_number,
        reps=entry.reps,
        weight=entry.weight,
        rpe=entry.rpe,
    )


def _log_to_out(log: SessionLogItem) -> SessionLogOut:
    return SessionLogOut(
        log_id=log.log_id,
        block_name=log.block_name,
        exercise_id=log.exercise_id,
        notes=log.notes,
        entries=[_entry_to_out(e) for e in log.entries],
    )


def _detail_to_out(result: WorkoutSessionDetailResult) -> SessionDetailOut:
    return SessionDetailOut(
        id=result.id,
        status=result.status,
        workout_template_id=result.workout_template_id,
        template_title=result.template_title,
        athlete_profile_id=result.athlete_profile_id,
        scheduled_for=result.scheduled_for,
        logs=[_log_to_out(log) for log in result.logs],
    )


# ---------------------------------------------------------------------------
# Execution view response schemas
# ---------------------------------------------------------------------------

class SetLogOutSchema(BaseModel):
    set_number: int  # 1-based: 1 = first set
    reps: Optional[int]
    weight: Optional[float]
    rpe: Optional[float]
    done: bool


class ExerciseExecutionOutSchema(BaseModel):
    exercise_id: uuid.UUID
    exercise_name: str
    prescription: dict
    logs: list[SetLogOutSchema]


class BlockExecutionOutSchema(BaseModel):
    name: str
    key: str   # slugified stable identifier, e.g. "PRIMARY_STRENGTH"
    order: int
    items: list[ExerciseExecutionOutSchema]


class WorkoutSessionExecutionOut(BaseModel):
    session_id: uuid.UUID
    status: str
    workout_template_id: uuid.UUID
    blocks: list[BlockExecutionOutSchema]


# ---------------------------------------------------------------------------
# Execution view wiring helpers
# ---------------------------------------------------------------------------

def _build_execution_use_case(db: Session) -> GetSessionExecutionViewUseCase:
    return GetSessionExecutionViewUseCase(
        session_repo=SqlAlchemyWorkoutSessionRepository(db),
        template_repo=SqlAlchemyWorkoutTemplateRepository(db),
        log_repo=SqlAlchemyWorkoutSessionLogRepository(db),
    )


def _to_execution_query(
    session_id: uuid.UUID,
    current_user: CurrentUser,
) -> GetSessionExecutionQuery:
    return GetSessionExecutionQuery(
        session_id=session_id,
        requesting_role=current_user.role,
        requesting_team_id=current_user.team_id,
        requesting_athlete_id=(
            current_user.user_id if current_user.role == Role.ATHLETE else None
        ),
    )


def _execution_result_to_out(result: SessionExecutionResult) -> WorkoutSessionExecutionOut:
    return WorkoutSessionExecutionOut(
        session_id=result.session_id,
        status=result.status,
        workout_template_id=result.workout_template_id,
        blocks=[
            BlockExecutionOutSchema(
                name=block.name,
                key=block.key,
                order=block.order,
                items=[
                    ExerciseExecutionOutSchema(
                        exercise_id=item.exercise_id,
                        exercise_name=item.exercise_name,
                        prescription=item.prescription,
                        logs=[
                            SetLogOutSchema(
                                set_number=s.set_number,
                                reps=s.reps,
                                weight=s.weight,
                                rpe=s.rpe,
                                done=s.done,
                            )
                            for s in item.logs
                        ],
                    )
                    for item in block.items
                ],
            )
            for block in result.blocks
        ],
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post(
    "/{session_id}/logs",
    response_model=CreateLogOut,
    status_code=status.HTTP_201_CREATED,
)
def create_log(
    session_id: uuid.UUID,
    payload: CreateLogIn,
    current_user: Annotated[CurrentUser, Depends(require_athlete)],
    db: Session = Depends(get_db),
) -> CreateLogOut:
    use_case = _build_create_log_use_case(db)
    command = _to_create_log_command(payload, session_id, current_user)

    try:
        result = use_case.execute(command)
    except LogNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except LogValidationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    return CreateLogOut(log_id=result.log_id)


@router.get("/{session_id}", response_model=SessionDetailOut)
def get_session_detail(
    session_id: uuid.UUID,
    current_user: Annotated[CurrentUser, Depends(require_any_role)],
    db: Session = Depends(get_db),
) -> SessionDetailOut:
    use_case = _build_detail_use_case(db)
    query = _to_detail_query(session_id, current_user)

    try:
        result = use_case.execute(query)
    except DetailNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))

    return _detail_to_out(result)


@router.get("/{session_id}/execution", response_model=WorkoutSessionExecutionOut)
def get_session_execution(
    session_id: uuid.UUID,
    current_user: Annotated[CurrentUser, Depends(require_any_role)],
    db: Session = Depends(get_db),
) -> WorkoutSessionExecutionOut:
    use_case = _build_execution_use_case(db)
    query = _to_execution_query(session_id, current_user)

    try:
        result = use_case.execute(query)
    except ExecutionNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))

    return _execution_result_to_out(result)
