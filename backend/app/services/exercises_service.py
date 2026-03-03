"""
Exercise service layer.

Visibility rules:
  - list / get_by_id: returns COMPANY exercises (visible to every coach)
    UNION the calling coach's own COACH exercises.
  - create: always inserts with owner_type=COACH, coach_id=caller.
  - update / delete: only operates on the caller's own COACH exercises.
    The router is responsible for returning 403 when a coach attempts to
    mutate a COMPANY exercise (is_editable=False).
  - toggle_favorite: inserts or deletes a row in exercise_favorites for
    any exercise the coach can see (COMPANY or own COACH).

All operations are coach-scoped to prevent IDOR vulnerabilities.

Tags are stored as JSONB arrays.  Filtering uses the PostgreSQL @>
(contains) operator via a cast to ensure the driver sends valid JSON.
"""
import uuid
from typing import List, Optional

from sqlalchemy import case, cast, func, literal, or_, select, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.exercise import Exercise, OwnerType
from app.models.exercise_favorite import ExerciseFavorite
from app.schemas.exercise import ExerciseCreate, ExerciseUpdate


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _company_or_own(coach_id: uuid.UUID):
    """SQLAlchemy WHERE clause: COMPANY exercises OR this coach's exercises."""
    return or_(
        Exercise.owner_type == OwnerType.COMPANY,
        Exercise.coach_id == coach_id,
    )


def _is_favorite_subquery(coach_id: uuid.UUID):
    """
    Scalar subquery: returns TRUE if a favourite row exists for (coach_id,
    exercise.id), FALSE otherwise.  Used to annotate list / get results
    without a JOIN that would fan out rows.
    """
    return (
        select(literal(True))
        .where(
            ExerciseFavorite.coach_id == coach_id,
            ExerciseFavorite.exercise_id == Exercise.id,
        )
        .correlate(Exercise)
        .exists()
    )


def _attach_is_favorite(exercises: list[Exercise], coach_id: uuid.UUID, db: Session) -> list[dict]:
    """
    Return a list of dicts (exercise attributes + is_favorite) suitable for
    building ExerciseOut objects via model_validate / from_orm.

    We fetch the full favorite set for this coach in one query, then
    annotate each exercise in Python — O(n) without N+1.
    """
    if not exercises:
        return []

    exercise_ids = [e.id for e in exercises]
    fav_stmt = select(ExerciseFavorite.exercise_id).where(
        ExerciseFavorite.coach_id == coach_id,
        ExerciseFavorite.exercise_id.in_(exercise_ids),
    )
    favorite_ids: set[uuid.UUID] = set(db.execute(fav_stmt).scalars().all())

    result = []
    for ex in exercises:
        # Pydantic from_attributes reads plain dicts too — build a proxy that
        # exposes all ORM attributes plus is_favorite.
        item = ex.__dict__.copy()
        item.pop("_sa_instance_state", None)
        item["is_favorite"] = ex.id in favorite_ids
        result.append(item)
    return result


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def create_exercise(
    db: Session,
    coach_id: uuid.UUID,
    exercise_data: ExerciseCreate,
) -> dict:
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
    return _attach_is_favorite([exercise], coach_id, db)[0]


def list_exercises(
    db: Session,
    coach_id: uuid.UUID,
    search: Optional[str] = None,
    tags: Optional[list[str]] = None,
) -> list[dict]:
    """
    Return exercises visible to this coach:
      - All COMPANY exercises (sorted first, alphabetically).
      - All COACH exercises owned by this coach (sorted after, alphabetically).

    Optional filters:
      - search: case-insensitive substring on name.
      - tags: list of required tags (AND containment via JSONB @> operator).
    """
    stmt = (
        select(Exercise)
        .where(_company_or_own(coach_id))
        .order_by(
            case((Exercise.owner_type == OwnerType.COMPANY, 0), else_=1),
            Exercise.name,
        )
    )

    if search:
        stmt = stmt.where(Exercise.name.ilike(f"%{search}%"))

    if tags:
        import json
        tags_json = cast(json.dumps(tags), JSONB)
        stmt = stmt.where(Exercise.tags.op("@>")(tags_json))

    exercises = list(db.execute(stmt).scalars().all())
    return _attach_is_favorite(exercises, coach_id, db)


def get_exercise_by_id(
    db: Session,
    coach_id: uuid.UUID,
    exercise_id: uuid.UUID,
) -> Optional[dict]:
    """
    Return an exercise if visible to this coach (COMPANY or own COACH).

    Returns None for exercises belonging to other coaches (IDOR prevention).
    Includes is_favorite flag.
    """
    stmt = select(Exercise).where(
        Exercise.id == exercise_id,
        _company_or_own(coach_id),
    )
    exercise = db.execute(stmt).scalar_one_or_none()
    if not exercise:
        return None
    return _attach_is_favorite([exercise], coach_id, db)[0]


def update_exercise(
    db: Session,
    coach_id: uuid.UUID,
    exercise_id: uuid.UUID,
    exercise_data: ExerciseUpdate,
) -> Optional[dict]:
    """
    Update an exercise — only if it belongs to this coach.

    COMPANY exercises are intentionally excluded (coach_id != NULL check).
    The router checks is_editable and raises 403 before calling this.

    Returns:
        Updated exercise dict (with is_favorite), or None if not found / wrong coach.
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
    return _attach_is_favorite([exercise], coach_id, db)[0]


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


def toggle_favorite(
    db: Session,
    coach_id: uuid.UUID,
    exercise_id: uuid.UUID,
) -> bool:
    """
    Toggle a favourite bookmark for an exercise.

    The exercise must be visible to the coach (COMPANY or own COACH) —
    callers should verify this before calling (the router does).

    Returns:
        True if the exercise is now a favourite, False if it was removed.
    """
    stmt = select(ExerciseFavorite).where(
        ExerciseFavorite.coach_id == coach_id,
        ExerciseFavorite.exercise_id == exercise_id,
    )
    existing = db.execute(stmt).scalar_one_or_none()

    if existing:
        db.delete(existing)
        db.commit()
        return False
    else:
        fav = ExerciseFavorite(coach_id=coach_id, exercise_id=exercise_id)
        db.add(fav)
        db.commit()
        return True


def get_tags(
    db: Session,
    coach_id: uuid.UUID,
) -> list[str]:
    """
    Return a sorted list of all distinct tags accessible to this coach
    (from COMPANY exercises + own COACH exercises).

    Used by the frontend tag autocomplete in ExerciseForm.
    """
    stmt = (
        select(func.jsonb_array_elements_text(Exercise.tags).label("tag"))
        .where(_company_or_own(coach_id))
        .distinct()
        .order_by(text("tag"))
    )
    return list(db.execute(stmt).scalars().all())
