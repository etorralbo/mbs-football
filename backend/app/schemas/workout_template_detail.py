from pydantic import ConfigDict, computed_field

from app.schemas.block_exercise import BlockExerciseOut
from app.schemas.workout_block import WorkoutBlockOut
from app.schemas.workout_template import WorkoutTemplateOut


class WorkoutBlockWithItemsOut(WorkoutBlockOut):
    items: list[BlockExerciseOut]

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class WorkoutTemplateDetailOut(WorkoutTemplateOut):
    blocks: list[WorkoutBlockWithItemsOut]

    @computed_field  # type: ignore[misc]
    @property
    def is_ready(self) -> bool:
        """Derived readiness: ≥1 block with ≥1 exercise. Never persisted.

        This is the canonical server-side definition. The frontend may mirror
        it locally for instant UX feedback, but the backend is the source of
        truth — assignment is rejected if is_ready is False.
        """
        return bool(self.blocks) and any(bool(b.items) for b in self.blocks)

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)
