import uuid
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.block_exercise import BlockExercise
from app.models.workout_block import WorkoutBlock
from app.models.workout_template import WorkoutTemplate
from app.schemas.workout_template import WorkoutTemplateCreate, WorkoutTemplateUpdate


def create_template(
    db: Session,
    team_id: uuid.UUID,
    data: WorkoutTemplateCreate,
) -> WorkoutTemplate:
    template = WorkoutTemplate(
        team_id=team_id,
        title=data.title,
        description=data.description,
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    return template


def list_templates(
    db: Session,
    team_id: uuid.UUID,
) -> list[WorkoutTemplate]:
    stmt = (
        select(WorkoutTemplate)
        .where(WorkoutTemplate.team_id == team_id)
        .order_by(WorkoutTemplate.created_at.desc())
    )
    return list(db.execute(stmt).scalars())


def get_template_detail(
    db: Session,
    team_id: uuid.UUID,
    template_id: uuid.UUID,
) -> Optional[WorkoutTemplate]:
    """
    Return template with fully-loaded blocks → items → exercise.

    selectinload avoids N+1:
      1 query for the template
      1 query for all blocks
      1 query for all items across those blocks
      1 query for all exercises across those items
    Ordering is defined on the relationships (order_index).
    """
    stmt = (
        select(WorkoutTemplate)
        .where(
            WorkoutTemplate.id == template_id,
            WorkoutTemplate.team_id == team_id,
        )
        .options(
            selectinload(WorkoutTemplate.blocks)
            .selectinload(WorkoutBlock.items)
            .selectinload(BlockExercise.exercise)
        )
    )
    return db.execute(stmt).scalar_one_or_none()


def update_template(
    db: Session,
    team_id: uuid.UUID,
    template_id: uuid.UUID,
    data: WorkoutTemplateUpdate,
) -> Optional[WorkoutTemplate]:
    stmt = select(WorkoutTemplate).where(
        WorkoutTemplate.id == template_id,
        WorkoutTemplate.team_id == team_id,
    )
    template = db.execute(stmt).scalar_one_or_none()
    if not template:
        return None

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(template, field, value)

    db.commit()
    db.refresh(template)
    return template


def delete_template(
    db: Session,
    team_id: uuid.UUID,
    template_id: uuid.UUID,
) -> bool:
    stmt = select(WorkoutTemplate).where(
        WorkoutTemplate.id == template_id,
        WorkoutTemplate.team_id == team_id,
    )
    template = db.execute(stmt).scalar_one_or_none()
    if not template:
        return False

    db.delete(template)
    db.commit()
    return True
