"""HTTP transport layer — Workout Templates router.

Exposes:
    POST /workout-templates/from-ai
"""
import uuid
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.dependencies import CurrentUser, require_coach
from app.db.session import get_db
from app.domain.events.service import ProductEventService
from app.domain.use_cases.create_workout_template_from_ai import (
    BlockCommand,
    BlockItemCommand,
    CreateWorkoutTemplateFromAiCommand,
    CreateWorkoutTemplateFromAiUseCase,
)
from app.persistence.repositories.exercise_repository import SqlAlchemyExerciseRepository
from app.persistence.repositories.workout_template_repository import (
    SqlAlchemyWorkoutTemplateRepository,
)

router = APIRouter(prefix="/workout-templates", tags=["workout-templates"])


# ---------------------------------------------------------------------------
# Request / Response schemas  (HTTP transport concerns only)
# ---------------------------------------------------------------------------

class FromAiBlockItemIn(BaseModel):
    exercise_id: uuid.UUID
    order: int = Field(..., ge=0)


class FromAiBlockIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    notes: Optional[str] = None
    items: list[FromAiBlockItemIn] = Field(default_factory=list)


class FromAiTemplateIn(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    blocks: list[FromAiBlockIn]

    @field_validator("title")
    @classmethod
    def strip_title(cls, v: str) -> str:
        return v.strip()


class WorkoutTemplateCreatedOut(BaseModel):
    id: uuid.UUID


# ---------------------------------------------------------------------------
# Private helpers (wiring + mapping — no business logic)
# ---------------------------------------------------------------------------

def _build_use_case(db: Session) -> CreateWorkoutTemplateFromAiUseCase:
    return CreateWorkoutTemplateFromAiUseCase(
        workout_template_repo=SqlAlchemyWorkoutTemplateRepository(db),
        exercise_repo=SqlAlchemyExerciseRepository(db),
        event_service=ProductEventService(db),
    )


def _to_command(
    payload: FromAiTemplateIn, current_user: CurrentUser
) -> CreateWorkoutTemplateFromAiCommand:
    return CreateWorkoutTemplateFromAiCommand(
        requesting_user_id=current_user.supabase_user_id,
        team_id=current_user.team_id,
        coach_id=current_user.user_id,
        title=payload.title,
        blocks=[
            BlockCommand(
                name=b.name,
                notes=b.notes,
                items=[
                    BlockItemCommand(exercise_id=i.exercise_id, order=i.order)
                    for i in b.items
                ],
            )
            for b in payload.blocks
        ],
    )


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

@router.post(
    "/from-ai",
    response_model=WorkoutTemplateCreatedOut,
    status_code=status.HTTP_201_CREATED,
)
def create_from_ai(
    payload: FromAiTemplateIn,
    current_user: Annotated[CurrentUser, Depends(require_coach)],
    db: Session = Depends(get_db),
) -> WorkoutTemplateCreatedOut:
    use_case = _build_use_case(db)
    command = _to_command(payload, current_user)

    try:
        result = use_case.execute(command)
        db.commit()
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except IntegrityError as exc:
        db.rollback()
        if exc.orig and "uix_templates_team_title" in str(exc.orig):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"A template named '{payload.title[:100]}' already exists in this team.",
            )
        raise

    return WorkoutTemplateCreatedOut(id=result.id)
