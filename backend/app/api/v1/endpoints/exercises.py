"""
Exercise CRUD endpoints.

All endpoints are secured with JWT authentication.
All operations require COACH role — athletes see exercises only through
session execution (template → block → block_exercise), not directly.

Visibility:
  GET (list/single): COMPANY exercises + the calling coach's own exercises.

Mutation (PATCH/DELETE):
  - 403 if exercise.is_editable == False  (company exercises are read-only).
  - 404 if exercise is not visible to this coach.
  - Only the coach's own COACH exercises can be modified.
"""
import uuid
from typing import Annotated, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.dependencies import (
    CurrentUser,
    require_coach,
)
from app.db.session import get_db
from app.schemas.exercise import ExerciseCreate, ExerciseOut, ExerciseUpdate
from app.services import exercises_service

router = APIRouter(prefix="/exercises", tags=["exercises"])

_COMPANY_EXERCISE_DETAIL = "Company exercises cannot be modified"


@router.post(
    "",
    response_model=ExerciseOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new exercise (Coach only)",
)
def create_exercise(
    exercise_data: ExerciseCreate,
    current_user: Annotated[CurrentUser, Depends(require_coach)],
    db: Annotated[Session, Depends(get_db)],
):
    """
    Create a new exercise in the coach's library.

    Always creates owner_type=COACH — clients cannot inject owner_type.
    """
    try:
        return exercises_service.create_exercise(
            db=db,
            coach_id=current_user.user_id,
            exercise_data=exercise_data,
        )
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Exercise with name '{exercise_data.name}' already exists in your library",
        )


@router.get(
    "",
    response_model=List[ExerciseOut],
    summary="List exercises (Coach only)",
)
def list_exercises(
    current_user: Annotated[CurrentUser, Depends(require_coach)],
    db: Annotated[Session, Depends(get_db)],
    search: Optional[str] = Query(None, description="Search by name (case-insensitive)"),
):
    """
    List all exercises visible to this coach.

    Returns company exercises first (alphabetically), then the coach's own
    exercises (alphabetically). Optional search filters both groups.
    """
    return exercises_service.list_exercises(
        db=db,
        coach_id=current_user.user_id,
        search=search,
    )


@router.get(
    "/{exercise_id}",
    response_model=ExerciseOut,
    summary="Get exercise by ID (Coach only)",
)
def get_exercise(
    exercise_id: uuid.UUID,
    current_user: Annotated[CurrentUser, Depends(require_coach)],
    db: Annotated[Session, Depends(get_db)],
):
    """
    Get a single exercise by ID.

    Returns company exercises and the coach's own exercises.
    404 for other coaches' exercises (IDOR prevention).
    """
    exercise = exercises_service.get_exercise_by_id(
        db=db,
        coach_id=current_user.user_id,
        exercise_id=exercise_id,
    )
    if not exercise:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exercise not found")
    return exercise


@router.patch(
    "/{exercise_id}",
    response_model=ExerciseOut,
    summary="Update exercise (Coach only)",
)
def update_exercise(
    exercise_id: uuid.UUID,
    exercise_data: ExerciseUpdate,
    current_user: Annotated[CurrentUser, Depends(require_coach)],
    db: Annotated[Session, Depends(get_db)],
):
    """
    Update an existing exercise.

    403 if exercise is a company exercise (is_editable=False).
    404 if not found or belongs to another coach.
    """
    exercise = exercises_service.get_exercise_by_id(
        db=db,
        coach_id=current_user.user_id,
        exercise_id=exercise_id,
    )
    if not exercise:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exercise not found")
    if not exercise.is_editable:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=_COMPANY_EXERCISE_DETAIL,
        )
    try:
        updated = exercises_service.update_exercise(
            db=db,
            coach_id=current_user.user_id,
            exercise_id=exercise_id,
            exercise_data=exercise_data,
        )
        if not updated:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exercise not found")
        return updated
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Exercise with name '{exercise_data.name}' already exists in your library",
        )


@router.delete(
    "/{exercise_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete exercise (Coach only)",
)
def delete_exercise(
    exercise_id: uuid.UUID,
    current_user: Annotated[CurrentUser, Depends(require_coach)],
    db: Annotated[Session, Depends(get_db)],
):
    """
    Delete an exercise.

    403 if exercise is a company exercise (is_editable=False).
    404 if not found or belongs to another coach.
    """
    exercise = exercises_service.get_exercise_by_id(
        db=db,
        coach_id=current_user.user_id,
        exercise_id=exercise_id,
    )
    if not exercise:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exercise not found")
    if not exercise.is_editable:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=_COMPANY_EXERCISE_DETAIL,
        )
    deleted = exercises_service.delete_exercise(
        db=db,
        coach_id=current_user.user_id,
        exercise_id=exercise_id,
    )
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exercise not found")
    return None
