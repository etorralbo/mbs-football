"""Abstract and concrete SQLAlchemy repository for WorkoutTemplate aggregate."""
from __future__ import annotations

import uuid
from abc import ABC, abstractmethod
from typing import TYPE_CHECKING, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.block_exercise import BlockExercise
from app.models.workout_block import WorkoutBlock
from app.models.workout_template import WorkoutTemplate

if TYPE_CHECKING:
    # Import only for type-checker; avoids circular dependency at runtime.
    from app.domain.use_cases.create_workout_template_from_ai import BlockCommand


class AbstractWorkoutTemplateRepository(ABC):

    @abstractmethod
    def get_by_id(
        self, template_id: uuid.UUID, team_id: uuid.UUID
    ) -> Optional[WorkoutTemplate]:
        """Return the template only if it belongs to the given team, else None."""
        ...

    @abstractmethod
    def get_by_id_with_blocks(
        self, template_id: uuid.UUID, team_id: uuid.UUID
    ) -> Optional[WorkoutTemplate]:
        """Return template + blocks + items + exercise (eager-loaded), team-scoped."""
        ...

    @abstractmethod
    def create_with_blocks(
        self,
        team_id: uuid.UUID,
        title: str,
        blocks: list[BlockCommand],
    ) -> uuid.UUID:
        """Persist template + ordered blocks + items atomically; return template id."""
        ...


class SqlAlchemyWorkoutTemplateRepository(AbstractWorkoutTemplateRepository):

    def __init__(self, db: Session) -> None:
        self._db = db

    def get_by_id(
        self, template_id: uuid.UUID, team_id: uuid.UUID
    ) -> Optional[WorkoutTemplate]:
        stmt = select(WorkoutTemplate).where(
            WorkoutTemplate.id == template_id,
            WorkoutTemplate.team_id == team_id,
        )
        return self._db.execute(stmt).scalar_one_or_none()

    def get_by_id_with_blocks(
        self, template_id: uuid.UUID, team_id: uuid.UUID
    ) -> Optional[WorkoutTemplate]:
        stmt = (
            select(WorkoutTemplate)
            .where(
                WorkoutTemplate.id == template_id,
                WorkoutTemplate.team_id == team_id,
            )
            .options(
                selectinload(WorkoutTemplate.blocks).selectinload(
                    WorkoutBlock.items
                ).selectinload(BlockExercise.exercise)
            )
        )
        return self._db.execute(stmt).scalar_one_or_none()

    def create_with_blocks(
        self,
        team_id: uuid.UUID,
        title: str,
        blocks: list[BlockCommand],
    ) -> uuid.UUID:
        # 1. Template
        template = WorkoutTemplate(team_id=team_id, title=title)
        self._db.add(template)
        self._db.flush()  # populate template.id without committing

        # 2. Blocks (order_index = position in the fixed BASE_BLOCKS list)
        for order_index, block_cmd in enumerate(blocks):
            block = WorkoutBlock(
                workout_template_id=template.id,
                order_index=order_index,
                name=block_cmd.name,
                notes=block_cmd.notes,
            )
            self._db.add(block)
            self._db.flush()  # populate block.id before adding items

            # 3. Items within the block
            for item_cmd in block_cmd.items:
                self._db.add(
                    BlockExercise(
                        workout_block_id=block.id,
                        exercise_id=item_cmd.exercise_id,
                        order_index=item_cmd.order,
                    )
                )

        self._db.commit()
        return template.id
