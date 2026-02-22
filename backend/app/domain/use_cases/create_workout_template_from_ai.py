"""Domain use case: persist a confirmed AI workout-template draft."""
import uuid
from dataclasses import dataclass, field
from typing import Optional

from app.persistence.repositories.exercise_repository import AbstractExerciseRepository
from app.persistence.repositories.workout_template_repository import (
    AbstractWorkoutTemplateRepository,
)

BASE_BLOCKS: list[str] = [
    "Preparation to Movement",
    "Plyometrics",
    "Primary Strength",
    "Secondary Strength",
    "Auxiliary Strength",
    "Recovery",
]


# ---------------------------------------------------------------------------
# Command (input DTO — transport-layer agnostic)
# ---------------------------------------------------------------------------

@dataclass
class BlockItemCommand:
    exercise_id: uuid.UUID
    order: int


@dataclass
class BlockCommand:
    name: str
    notes: Optional[str]
    items: list[BlockItemCommand] = field(default_factory=list)


@dataclass
class CreateWorkoutTemplateFromAiCommand:
    team_id: uuid.UUID
    title: str
    blocks: list[BlockCommand]


# ---------------------------------------------------------------------------
# Result (output DTO)
# ---------------------------------------------------------------------------

@dataclass
class WorkoutTemplateCreatedResult:
    id: uuid.UUID


# ---------------------------------------------------------------------------
# Use case
# ---------------------------------------------------------------------------

class CreateWorkoutTemplateFromAiUseCase:

    def __init__(
        self,
        workout_template_repo: AbstractWorkoutTemplateRepository,
        exercise_repo: AbstractExerciseRepository,
    ) -> None:
        self._workout_template_repo = workout_template_repo
        self._exercise_repo = exercise_repo

    def execute(
        self, command: CreateWorkoutTemplateFromAiCommand
    ) -> WorkoutTemplateCreatedResult:
        self._validate_block_structure(command.blocks)
        self._validate_item_orders(command.blocks)
        self._validate_exercise_ownership(command.blocks, command.team_id)

        template_id = self._workout_template_repo.create_with_blocks(
            team_id=command.team_id,
            title=command.title,
            blocks=command.blocks,
        )
        return WorkoutTemplateCreatedResult(id=template_id)

    # ------------------------------------------------------------------
    # Private validation helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _validate_block_structure(blocks: list[BlockCommand]) -> None:
        """Blocks must match BASE_BLOCKS exactly: same names, same order."""
        received = [b.name for b in blocks]
        if received != BASE_BLOCKS:
            raise ValueError(
                f"Blocks must be exactly {BASE_BLOCKS} in that order; got {received}"
            )

    @staticmethod
    def _validate_item_orders(blocks: list[BlockCommand]) -> None:
        """Each block's item orders must form a contiguous sequence 0..n-1."""
        for block in blocks:
            orders = sorted(item.order for item in block.items)
            if orders != list(range(len(block.items))):
                raise ValueError(
                    f"Block '{block.name}' item orders must be contiguous 0..n-1; "
                    f"got {orders}"
                )

    def _validate_exercise_ownership(
        self, blocks: list[BlockCommand], team_id: uuid.UUID
    ) -> None:
        """All referenced exercises must belong to the team (single IN query)."""
        all_ids = {item.exercise_id for block in blocks for item in block.items}
        if not all_ids:
            return
        found_ids = self._exercise_repo.get_existing_ids(all_ids, team_id)
        missing = all_ids - found_ids
        if missing:
            raise LookupError(f"Exercise {next(iter(missing))} not found in this team")
