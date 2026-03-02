"""
Exercise service layer.

Contains business logic for exercise CRUD operations.
All operations are coach-scoped to prevent IDOR vulnerabilities.
"""
import uuid
from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.exercise import Exercise
from app.schemas.exercise import ExerciseCreate, ExerciseUpdate


def create_exercise(
    db: Session,
    coach_id: uuid.UUID,
    exercise_data: ExerciseCreate
) -> Exercise:
    """
    Create a new exercise for a coach.

    Args:
        db: Database session
        coach_id: Coach's UserProfile ID (from authenticated user)
        exercise_data: Exercise creation data

    Returns:
        Exercise: The created exercise

    Raises:
        IntegrityError: If exercise name already exists for this coach
    """
    exercise = Exercise(
        coach_id=coach_id,
        name=exercise_data.name,
        description=exercise_data.description,
        tags=exercise_data.tags,
    )
    db.add(exercise)
    db.commit()
    db.refresh(exercise)
    return exercise


def list_exercises(
    db: Session,
    coach_id: uuid.UUID,
    search: Optional[str] = None
) -> List[Exercise]:
    """
    List all exercises for a coach with optional search.

    Security: Only returns exercises belonging to the specified coach.

    Args:
        db: Database session
        coach_id: Coach's UserProfile ID (from authenticated user)
        search: Optional search term (case-insensitive, matches exercise name)

    Returns:
        List[Exercise]: List of exercises matching criteria
    """
    stmt = select(Exercise).where(Exercise.coach_id == coach_id)

    # Apply search filter if provided
    if search:
        stmt = stmt.where(Exercise.name.ilike(f"%{search}%"))

    # Order by name for consistent results
    stmt = stmt.order_by(Exercise.name)

    exercises = db.execute(stmt).scalars().all()
    return list(exercises)


def get_exercise_by_id(
    db: Session,
    coach_id: uuid.UUID,
    exercise_id: uuid.UUID
) -> Optional[Exercise]:
    """
    Get a single exercise by ID, scoped to coach.

    Security: Only returns exercise if it belongs to the specified coach.

    Args:
        db: Database session
        coach_id: Coach's UserProfile ID (from authenticated user)
        exercise_id: Exercise ID to retrieve

    Returns:
        Exercise if found and belongs to coach, None otherwise
    """
    stmt = select(Exercise).where(
        Exercise.id == exercise_id,
        Exercise.coach_id == coach_id
    )
    exercise = db.execute(stmt).scalar_one_or_none()
    return exercise


def update_exercise(
    db: Session,
    coach_id: uuid.UUID,
    exercise_id: uuid.UUID,
    exercise_data: ExerciseUpdate
) -> Optional[Exercise]:
    """
    Update an exercise.

    Security: Only updates exercise if it belongs to the specified coach.

    Args:
        db: Database session
        coach_id: Coach's UserProfile ID (from authenticated user)
        exercise_id: Exercise ID to update
        exercise_data: Exercise update data (only provided fields are updated)

    Returns:
        Exercise: Updated exercise if found, None if not found or wrong coach

    Raises:
        IntegrityError: If updated name conflicts with existing exercise
    """
    exercise = get_exercise_by_id(db, coach_id, exercise_id)
    if not exercise:
        return None

    # Update only provided fields
    update_data = exercise_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(exercise, field, value)

    db.commit()
    db.refresh(exercise)
    return exercise


def delete_exercise(
    db: Session,
    coach_id: uuid.UUID,
    exercise_id: uuid.UUID
) -> bool:
    """
    Delete an exercise (hard delete).

    Security: Only deletes exercise if it belongs to the specified coach.

    Args:
        db: Database session
        coach_id: Coach's UserProfile ID (from authenticated user)
        exercise_id: Exercise ID to delete

    Returns:
        bool: True if exercise was deleted, False if not found or wrong coach
    """
    exercise = get_exercise_by_id(db, coach_id, exercise_id)
    if not exercise:
        return False

    db.delete(exercise)
    db.commit()
    return True
