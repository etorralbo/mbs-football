"""
Exercise CRUD endpoints.

All endpoints are secured with JWT authentication.
Write operations (POST, PATCH, DELETE) require COACH role.
Read operations (GET) are available to all authenticated users.
All operations are team-scoped to prevent IDOR.
"""
import uuid
from typing import Annotated, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.dependencies import (
    CurrentUser,
    get_current_user,
    require_coach,
    require_any_role,
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
    Create a new exercise for the current user's team.

    **Authorization**: Coach only

    **Security**: Exercise is automatically associated with the coach's team.
    """
    try:
        exercise = exercises_service.create_exercise(
            db=db,
            team_id=current_user.team_id,
            exercise_data=exercise_data
        )
        return exercise
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Exercise with name '{exercise_data.name}' already exists for your team"
        )


@router.get(
    "",
    response_model=List[ExerciseOut],
    summary="List exercises"
)
def list_exercises(
    current_user: Annotated[CurrentUser, Depends(require_any_role)],
    db: Annotated[Session, Depends(get_db)],
    search: Optional[str] = Query(None, description="Search exercises by name (case-insensitive)")
):
    """
    List all exercises for the current user's team.

    **Authorization**: Coach or Athlete

    **Security**: Only returns exercises belonging to the user's team.

    **Search**: Optional query parameter to filter exercises by name.
    """
    exercises = exercises_service.list_exercises(
        db=db,
        team_id=current_user.team_id,
        search=search
    )
    return exercises


@router.get(
    "/{exercise_id}",
    response_model=ExerciseOut,
    summary="Get exercise by ID"
)
def get_exercise(
    exercise_id: uuid.UUID,
    current_user: Annotated[CurrentUser, Depends(require_any_role)],
    db: Annotated[Session, Depends(get_db)],
):
    """
    Get a single exercise by ID.

    **Authorization**: Coach or Athlete

    **Security**: Only returns exercise if it belongs to the user's team.
    """
    exercise = exercises_service.get_exercise_by_id(
        db=db,
        team_id=current_user.team_id,
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

    **Security**: Only updates exercise if it belongs to the user's team.
    """
    try:
        exercise = exercises_service.update_exercise(
            db=db,
            team_id=current_user.team_id,
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
            detail=f"Exercise with name '{exercise_data.name}' already exists for your team"
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

    **Security**: Only deletes exercise if it belongs to the user's team.
    """
    deleted = exercises_service.delete_exercise(
        db=db,
        team_id=current_user.team_id,
        exercise_id=exercise_id
    )
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Exercise not found"
        )
    return None
