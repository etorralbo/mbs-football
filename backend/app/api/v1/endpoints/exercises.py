"""
Exercise CRUD endpoints — FROZEN (see ADR-001).
Do not add new endpoints here; use app/transport/http/v1/ instead.

All endpoints are secured with JWT authentication.
All operations require COACH role — athletes see exercises only through
session execution (template → block → block_exercise), not directly.

Visibility:
  GET (list/single): COMPANY exercises + the calling coach's own exercises.

Mutation (PATCH/DELETE):
  - 403 if exercise.is_editable == False  (company exercises are read-only).
  - 404 if exercise is not visible to this coach.
  - Only the coach's own COACH exercises can be modified.

New in this revision:
  - GET  /exercises?tags=strength&tags=lower-body  — tag-based filtering
  - GET  /exercises/tags                           — autocomplete list
  - POST /exercises/{id}/favorite                  — toggle bookmark
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
from app.schemas.exercise import ExerciseCreate, ExerciseFavoriteToggleOut, ExerciseOut, ExerciseUpdate
from app.services import exercises_service
from app.services.exercises_service import ExerciseInUseError

router = APIRouter(prefix="/exercises", tags=["exercises"])

_COMPANY_EXERCISE_DETAIL = "Company exercises cannot be modified"


# ---------------------------------------------------------------------------
# NOTE: /exercises/tags must be declared BEFORE /exercises/{exercise_id}
# so FastAPI does not interpret "tags" as a UUID path parameter.
# ---------------------------------------------------------------------------

@router.get(
    "/tags",
    response_model=List[str],
    summary="List all distinct exercise tags visible to this coach",
)
def list_tags(
    current_user: Annotated[CurrentUser, Depends(require_coach)],
    db: Annotated[Session, Depends(get_db)],
):
    """
    Return a sorted list of all distinct tags from exercises visible to this
    coach (COMPANY + own COACH exercises).  Used by the frontend tag
    autocomplete in the exercise creation / edit form.
    """
    return exercises_service.get_tags(db=db, coach_id=current_user.user_id)


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
    Requires name (3–80 chars), description (min 20 chars), and at least
    one tag.
    """
    try:
        result = exercises_service.create_exercise(
            db=db,
            coach_id=current_user.user_id,
            exercise_data=exercise_data,
        )
        return ExerciseOut.model_validate(result)
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
    tags: Optional[List[str]] = Query(None, description="Filter by tags (AND containment)"),
):
    """
    List all exercises visible to this coach.

    Returns COMPANY exercises first (alphabetically), then the coach's own
    exercises (alphabetically).

    Supports:
      - ?search=squat           — case-insensitive name search
      - ?tags=strength          — single-tag filter
      - ?tags=strength&tags=lower-body — multi-tag AND filter
    """
    results = exercises_service.list_exercises(
        db=db,
        coach_id=current_user.user_id,
        search=search,
        tags=tags,
    )
    return [ExerciseOut.model_validate(r) for r in results]


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

    Returns COMPANY exercises and the coach's own exercises.
    404 for other coaches' exercises (IDOR prevention).
    """
    result = exercises_service.get_exercise_by_id(
        db=db,
        coach_id=current_user.user_id,
        exercise_id=exercise_id,
    )
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exercise not found")
    return ExerciseOut.model_validate(result)


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

    403 if exercise is a COMPANY exercise (is_editable=False).
    404 if not found or belongs to another coach.
    """
    existing = exercises_service.get_exercise_by_id(
        db=db,
        coach_id=current_user.user_id,
        exercise_id=exercise_id,
    )
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exercise not found")
    if not existing["is_editable"]:
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
        return ExerciseOut.model_validate(updated)
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

    403 if exercise is a COMPANY exercise (is_editable=False).
    404 if not found or belongs to another coach.
    """
    existing = exercises_service.get_exercise_by_id(
        db=db,
        coach_id=current_user.user_id,
        exercise_id=exercise_id,
    )
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exercise not found")
    if not existing["is_editable"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=_COMPANY_EXERCISE_DETAIL,
        )
    try:
        deleted = exercises_service.delete_exercise(
            db=db,
            coach_id=current_user.user_id,
            exercise_id=exercise_id,
        )
    except ExerciseInUseError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Exercise is in use by one or more workout templates and cannot be deleted.",
        )
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exercise not found")
    return None


@router.post(
    "/{exercise_id}/favorite",
    response_model=ExerciseFavoriteToggleOut,
    summary="Toggle exercise favourite (Coach only)",
)
def toggle_favorite(
    exercise_id: uuid.UUID,
    current_user: Annotated[CurrentUser, Depends(require_coach)],
    db: Annotated[Session, Depends(get_db)],
):
    """
    Toggle a favourite bookmark on an exercise.

    The exercise must be visible to the coach (COMPANY or own COACH).
    Returns the new is_favorite state.

    Idempotent in both directions:
      - POST when already favourited → removes bookmark, returns is_favorite=false
      - POST when not favourited     → adds bookmark, returns is_favorite=true
    """
    existing = exercises_service.get_exercise_by_id(
        db=db,
        coach_id=current_user.user_id,
        exercise_id=exercise_id,
    )
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exercise not found")

    is_favorite = exercises_service.toggle_favorite(
        db=db,
        coach_id=current_user.user_id,
        exercise_id=exercise_id,
    )
    return ExerciseFavoriteToggleOut(exercise_id=exercise_id, is_favorite=is_favorite)
