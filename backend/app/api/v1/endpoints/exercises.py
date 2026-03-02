"""
Exercise CRUD endpoints.

All endpoints are secured with JWT authentication.
All operations require COACH role — athletes see exercises only through
session execution (template → block → block_exercise), not directly.
All operations are coach-scoped to prevent IDOR.
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


@router.post(
    "",
    response_model=ExerciseOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new exercise (Coach only)"
)
def create_exercise(
    exercise_data: ExerciseCreate,
    current_user: Annotated[CurrentUser, Depends(require_coach)],
    db: Annotated[Session, Depends(get_db)],
):
    """
    Create a new exercise in the coach's library.

    **Authorization**: Coach only

    **Security**: Exercise is automatically associated with the calling coach.
    """
    try:
        exercise = exercises_service.create_exercise(
            db=db,
            coach_id=current_user.user_id,
            exercise_data=exercise_data
        )
        return exercise
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Exercise with name '{exercise_data.name}' already exists in your library"
        )


@router.get(
    "",
    response_model=List[ExerciseOut],
    summary="List exercises (Coach only)"
)
def list_exercises(
    current_user: Annotated[CurrentUser, Depends(require_coach)],
    db: Annotated[Session, Depends(get_db)],
    search: Optional[str] = Query(None, description="Search exercises by name (case-insensitive)")
):
    """
    List all exercises in the coach's library.

    **Authorization**: Coach only

    **Security**: Only returns exercises belonging to the calling coach.

    **Search**: Optional query parameter to filter exercises by name.
    """
    exercises = exercises_service.list_exercises(
        db=db,
        coach_id=current_user.user_id,
        search=search
    )
    return exercises


@router.get(
    "/{exercise_id}",
    response_model=ExerciseOut,
    summary="Get exercise by ID (Coach only)"
)
def get_exercise(
    exercise_id: uuid.UUID,
    current_user: Annotated[CurrentUser, Depends(require_coach)],
    db: Annotated[Session, Depends(get_db)],
):
    """
    Get a single exercise by ID.

    **Authorization**: Coach only

    **Security**: Only returns exercise if it belongs to the calling coach.
    """
    exercise = exercises_service.get_exercise_by_id(
        db=db,
        coach_id=current_user.user_id,
        exercise_id=exercise_id
    )
    if not exercise:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Exercise not found"
        )
    return exercise


@router.patch(
    "/{exercise_id}",
    response_model=ExerciseOut,
    summary="Update exercise (Coach only)"
)
def update_exercise(
    exercise_id: uuid.UUID,
    exercise_data: ExerciseUpdate,
    current_user: Annotated[CurrentUser, Depends(require_coach)],
    db: Annotated[Session, Depends(get_db)],
):
    """
    Update an existing exercise.

    **Authorization**: Coach only

    **Security**: Only updates exercise if it belongs to the calling coach.
    """
    try:
        exercise = exercises_service.update_exercise(
            db=db,
            coach_id=current_user.user_id,
            exercise_id=exercise_id,
            exercise_data=exercise_data
        )
        if not exercise:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Exercise not found"
            )
        return exercise
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Exercise with name '{exercise_data.name}' already exists in your library"
        )


@router.delete(
    "/{exercise_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete exercise (Coach only)"
)
def delete_exercise(
    exercise_id: uuid.UUID,
    current_user: Annotated[CurrentUser, Depends(require_coach)],
    db: Annotated[Session, Depends(get_db)],
):
    """
    Delete an exercise.

    **Authorization**: Coach only

    **Security**: Only deletes exercise if it belongs to the calling coach.
    """
    deleted = exercises_service.delete_exercise(
        db=db,
        coach_id=current_user.user_id,
        exercise_id=exercise_id
    )
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Exercise not found"
        )
    return None
