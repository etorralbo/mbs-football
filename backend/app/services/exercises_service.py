"""
Exercise service layer.

Visibility rules:
  - list / get_by_id: returns COMPANY exercises (visible to every coach)
    UNION the calling coach's own COACH exercises.
  - create: always inserts with owner_type=COACH, coach_id=caller.
  - update / delete: only operates on the caller's own COACH exercises.
    The router is responsible for returning 403 when a coach attempts to
    mutate a COMPANY exercise (is_editable=False).

All operations are coach-scoped to prevent IDOR vulnerabilities.
"""
import uuid
from typing import List, Optional

from sqlalchemy import case, or_, select
from sqlalchemy.orm import Session

from app.models.exercise import Exercise, OwnerType
from app.schemas.exercise import ExerciseCreate, ExerciseUpdate


def _company_or_own(coach_id: uuid.UUID):
    """SQLAlchemy WHERE clause: COMPANY exercises OR this coach's exercises."""
    return or_(
        Exercise.owner_type == OwnerType.COMPANY,
        Exercise.coach_id == coach_id,
    )


def create_exercise(
    db: Session,
    coach_id: uuid.UUID,
    exercise_data: ExerciseCreate,
) -> Exercise:
    """
    Create a new exercise in the coach's personal library.

    Always creates owner_type=COACH. Clients cannot inject owner_type.

    Raises:
        IntegrityError: if name already exists for this coach.
    """
    exercise = Exercise(
        coach_id=coach_id,
        owner_type=OwnerType.COACH,
        is_editable=True,
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
    search: Optional[str] = None,
) -> List[Exercise]:
    """
    Return exercises visible to this coach:
      - All COMPANY exercises (sorted first, alphabetically).
      - All COACH exercises owned by this coach (sorted after, alphabetically).

    Optional case-insensitive search filters both groups by name.
    """
    stmt = (
        select(Exercise)
        .where(_company_or_own(coach_id))
        .order_by(
            # COMPANY → 0, COACH → 1 keeps company exercises at the top.
            case((Exercise.owner_type == OwnerType.COMPANY, 0), else_=1),
            Exercise.name,
        )
    )

    if search:
        stmt = stmt.where(Exercise.name.ilike(f"%{search}%"))

    return list(db.execute(stmt).scalars().all())


def get_exercise_by_id(
    db: Session,
    coach_id: uuid.UUID,
    exercise_id: uuid.UUID,
) -> Optional[Exercise]:
    """
    Return an exercise if visible to this coach (COMPANY or own COACH).

    Returns None for exercises belonging to other coaches (IDOR prevention).
    """
    stmt = select(Exercise).where(
        Exercise.id == exercise_id,
        _company_or_own(coach_id),
    )
    return db.execute(stmt).scalar_one_or_none()


def update_exercise(
    db: Session,
    coach_id: uuid.UUID,
    exercise_id: uuid.UUID,
    exercise_data: ExerciseUpdate,
) -> Optional[Exercise]:
    """
    Update an exercise — only if it belongs to this coach.

    COMPANY exercises are intentionally excluded (coach_id != NULL check).
    The router checks is_editable and raises 403 before calling this.

    Returns:
        Updated Exercise, or None if not found / wrong coach.
    Raises:
        IntegrityError: if the new name conflicts with an existing exercise.
    """
    stmt = select(Exercise).where(
        Exercise.id == exercise_id,
        Exercise.owner_type == OwnerType.COACH,
        Exercise.coach_id == coach_id,
    )
    exercise = db.execute(stmt).scalar_one_or_none()
    if not exercise:
        return None

    update_data = exercise_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(exercise, field, value)

    db.commit()
    db.refresh(exercise)
    return exercise


def delete_exercise(
    db: Session,
    coach_id: uuid.UUID,
    exercise_id: uuid.UUID,
) -> bool:
    """
    Hard-delete an exercise — only if it belongs to this coach.

    COMPANY exercises are intentionally excluded.
    The router checks is_editable and raises 403 before calling this.

    Returns:
        True if deleted, False if not found / wrong coach.
    """
    stmt = select(Exercise).where(
        Exercise.id == exercise_id,
        Exercise.owner_type == OwnerType.COACH,
        Exercise.coach_id == coach_id,
    )
    exercise = db.execute(stmt).scalar_one_or_none()
    if not exercise:
        return False

    db.delete(exercise)
    db.commit()
    return True
