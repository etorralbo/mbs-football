import uuid
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select, update
from sqlalchemy.orm import Session, selectinload

from app.models.block_exercise import BlockExercise
from app.models.exercise import Exercise, OwnerType
from app.models.workout_block import WorkoutBlock
from app.models.workout_template import WorkoutTemplate
from app.schemas.block_exercise import BlockExerciseCreate, BlockExerciseUpdate
from app.schemas.workout_block import WorkoutBlockCreate, WorkoutBlockUpdate


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------

def _get_template_for_team(
    db: Session,
    team_id: uuid.UUID,
    template_id: uuid.UUID,
) -> Optional[WorkoutTemplate]:
    return db.execute(
        select(WorkoutTemplate).where(
            WorkoutTemplate.id == template_id,
            WorkoutTemplate.team_id == team_id,
        )
    ).scalar_one_or_none()


def _get_block_for_team(
    db: Session,
    team_id: uuid.UUID,
    block_id: uuid.UUID,
) -> Optional[WorkoutBlock]:
    """Join through WorkoutTemplate to enforce team ownership."""
    return db.execute(
        select(WorkoutBlock)
        .join(WorkoutTemplate, WorkoutBlock.workout_template_id == WorkoutTemplate.id)
        .where(
            WorkoutBlock.id == block_id,
            WorkoutTemplate.team_id == team_id,
        )
    ).scalar_one_or_none()


def _get_item_for_team(
    db: Session,
    team_id: uuid.UUID,
    item_id: uuid.UUID,
) -> Optional[BlockExercise]:
    """Join through WorkoutBlock → WorkoutTemplate to enforce team ownership."""
    return db.execute(
        select(BlockExercise)
        .join(WorkoutBlock, BlockExercise.workout_block_id == WorkoutBlock.id)
        .join(WorkoutTemplate, WorkoutBlock.workout_template_id == WorkoutTemplate.id)
        .where(
            BlockExercise.id == item_id,
            WorkoutTemplate.team_id == team_id,
        )
    ).scalar_one_or_none()


def _reload_item_with_exercise(db: Session, item_id: uuid.UUID) -> BlockExercise:
    """Reload a BlockExercise with its exercise relationship eagerly loaded."""
    return db.execute(
        select(BlockExercise)
        .where(BlockExercise.id == item_id)
        .options(selectinload(BlockExercise.exercise))
    ).scalar_one()


# ---------------------------------------------------------------------------
# Block operations
# ---------------------------------------------------------------------------

def add_block(
    db: Session,
    team_id: uuid.UUID,
    template_id: uuid.UUID,
    data: WorkoutBlockCreate,
) -> Optional[WorkoutBlock]:
    if not _get_template_for_team(db, team_id, template_id):
        return None

    max_order = db.execute(
        select(func.max(WorkoutBlock.order_index)).where(
            WorkoutBlock.workout_template_id == template_id
        )
    ).scalar()

    block = WorkoutBlock(
        workout_template_id=template_id,
        order_index=(max_order + 1) if max_order is not None else 0,
        name=data.name,
        notes=data.notes,
    )
    db.add(block)
    db.commit()
    db.refresh(block)
    return block


def update_block(
    db: Session,
    team_id: uuid.UUID,
    block_id: uuid.UUID,
    data: WorkoutBlockUpdate,
) -> Optional[WorkoutBlock]:
    block = _get_block_for_team(db, team_id, block_id)
    if not block:
        return None

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(block, field, value)

    db.commit()
    db.refresh(block)
    return block


def delete_block(
    db: Session,
    team_id: uuid.UUID,
    block_id: uuid.UUID,
) -> bool:
    block = _get_block_for_team(db, team_id, block_id)
    if not block:
        return False

    db.delete(block)
    db.commit()
    return True


def reorder_blocks(
    db: Session,
    team_id: uuid.UUID,
    template_id: uuid.UUID,
    block_ids: list[uuid.UUID],
) -> bool:
    if not _get_template_for_team(db, team_id, template_id):
        return False

    existing_ids = set(
        db.execute(
            select(WorkoutBlock.id).where(
                WorkoutBlock.workout_template_id == template_id
            )
        ).scalars()
    )

    if set(block_ids) != existing_ids:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="block_ids must be exactly the set of blocks belonging to this template",
        )

    # WorkoutBlock has no unique constraint on (template_id, order_index),
    # so a single-phase update is safe.
    for i, block_id in enumerate(block_ids):
        db.execute(
            update(WorkoutBlock)
            .where(WorkoutBlock.id == block_id)
            .values(order_index=i)
        )

    db.commit()
    return True


# ---------------------------------------------------------------------------
# Item operations
# ---------------------------------------------------------------------------

def add_item(
    db: Session,
    team_id: uuid.UUID,
    coach_id: uuid.UUID,
    block_id: uuid.UUID,
    data: BlockExerciseCreate,
) -> Optional[BlockExercise]:
    if not _get_block_for_team(db, team_id, block_id):
        return None

    # Validate exercise is visible to this coach: COMPANY (global) or own COACH exercise.
    # Cross-coach exercises → 404 (not 403) to avoid information leakage.
    exercise = db.execute(
        select(Exercise).where(
            Exercise.id == data.exercise_id,
            or_(
                Exercise.owner_type == OwnerType.COMPANY,
                Exercise.coach_id == coach_id,
            ),
        )
    ).scalar_one_or_none()

    if not exercise:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Exercise not found",
        )

    max_order = db.execute(
        select(func.max(BlockExercise.order_index)).where(
            BlockExercise.workout_block_id == block_id
        )
    ).scalar()

    item = BlockExercise(
        workout_block_id=block_id,
        exercise_id=data.exercise_id,
        order_index=(max_order + 1) if max_order is not None else 0,
        prescription_json=data.prescription_json,
    )
    db.add(item)
    db.commit()

    return _reload_item_with_exercise(db, item.id)


def update_item(
    db: Session,
    team_id: uuid.UUID,
    item_id: uuid.UUID,
    data: BlockExerciseUpdate,
) -> Optional[BlockExercise]:
    item = _get_item_for_team(db, team_id, item_id)
    if not item:
        return None

    if data.prescription_json is not None:
        item.prescription_json = data.prescription_json

    db.commit()

    return _reload_item_with_exercise(db, item.id)


def delete_item(
    db: Session,
    team_id: uuid.UUID,
    item_id: uuid.UUID,
) -> bool:
    item = _get_item_for_team(db, team_id, item_id)
    if not item:
        return False

    db.delete(item)
    db.commit()
    return True


def reorder_items(
    db: Session,
    team_id: uuid.UUID,
    block_id: uuid.UUID,
    item_ids: list[uuid.UUID],
) -> bool:
    if not _get_block_for_team(db, team_id, block_id):
        return False

    existing_ids = set(
        db.execute(
            select(BlockExercise.id).where(
                BlockExercise.workout_block_id == block_id
            )
        ).scalars()
    )

    if set(item_ids) != existing_ids:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="item_ids must be exactly the set of items belonging to this block",
        )

    n = len(item_ids)

    # Two-phase update to avoid the unique constraint on (workout_block_id, order).
    # Phase 1: move every row to a safe range [n, 2n-1] that won't clash with [0, n-1].
    for i, item_id in enumerate(item_ids):
        db.execute(
            update(BlockExercise)
            .where(BlockExercise.id == item_id)
            .values(order_index=n + i)
        )

    # Phase 2: set the final order [0, n-1].
    for i, item_id in enumerate(item_ids):
        db.execute(
            update(BlockExercise)
            .where(BlockExercise.id == item_id)
            .values(order_index=i)
        )

    db.commit()
    return True
