"""
Exercise service layer.

Contains business logic for exercise CRUD operations.
All operations are team-scoped to prevent IDOR vulnerabilities.
"""
import uuid
from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.exercise import Exercise
from app.schemas.exercise import ExerciseCreate, ExerciseUpdate


def create_exercise(
    db: Session,
    team_id: uuid.UUID,
    exercise_data: ExerciseCreate
) -> Exercise:
    """
    Create a new exercise for a team.

    Args:
        db: Database session
        team_id: Team ID (from authenticated user)
        exercise_data: Exercise creation data

    Returns:
        Exercise: The created exercise

    Raises:
        IntegrityError: If exercise name already exists for this team
    """
    exercise = Exercise(
        team_id=team_id,
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
    team_id: uuid.UUID,
    search: Optional[str] = None
) -> List[Exercise]:
    """
    List all exercises for a team with optional search.

    Security: Only returns exercises belonging to the specified team.

    Args:
        db: Database session
        team_id: Team ID (from authenticated user)
        search: Optional search term (case-insensitive, matches exercise name)

    Returns:
        List[Exercise]: List of exercises matching criteria
    """
    stmt = select(Exercise).where(Exercise.team_id == team_id)

    # Apply search filter if provided
    if search:
        stmt = stmt.where(Exercise.name.ilike(f"%{search}%"))

    # Order by name for consistent results
    stmt = stmt.order_by(Exercise.name)

    exercises = db.execute(stmt).scalars().all()
    return list(exercises)


def get_exercise_by_id(
    db: Session,
    team_id: uuid.UUID,
    exercise_id: uuid.UUID
) -> Optional[Exercise]:
    """
    Get a single exercise by ID, scoped to team.

    Security: Only returns exercise if it belongs to the specified team.

    Args:
        db: Database session
        team_id: Team ID (from authenticated user)
        exercise_id: Exercise ID to retrieve

    Returns:
        Exercise if found and belongs to team, None otherwise
    """
    stmt = select(Exercise).where(
        Exercise.id == exercise_id,
        Exercise.team_id == team_id
    )
    exercise = db.execute(stmt).scalar_one_or_none()
    return exercise


def update_exercise(
    db: Session,
    team_id: uuid.UUID,
    exercise_id: uuid.UUID,
    exercise_data: ExerciseUpdate
) -> Optional[Exercise]:
    """
    Update an exercise.

    Security: Only updates exercise if it belongs to the specified team.

    Args:
        db: Database session
        team_id: Team ID (from authenticated user)
        exercise_id: Exercise ID to update
        exercise_data: Exercise update data (only provided fields are updated)

    Returns:
        Exercise: Updated exercise if found, None if not found or wrong team

    Raises:
        IntegrityError: If updated name conflicts with existing exercise
    """
    exercise = get_exercise_by_id(db, team_id, exercise_id)
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
    team_id: uuid.UUID,
    exercise_id: uuid.UUID
) -> bool:
    """
    Delete an exercise (hard delete).

    Security: Only deletes exercise if it belongs to the specified team.

    Args:
        db: Database session
        team_id: Team ID (from authenticated user)
        exercise_id: Exercise ID to delete

    Returns:
        bool: True if exercise was deleted, False if not found or wrong team
    """
    exercise = get_exercise_by_id(db, team_id, exercise_id)
    if not exercise:
        return False

    db.delete(exercise)
    db.commit()
    return True
