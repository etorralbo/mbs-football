from pydantic import ConfigDict

from app.schemas.block_exercise import BlockExerciseOut
from app.schemas.workout_block import WorkoutBlockOut
from app.schemas.workout_template import WorkoutTemplateOut


class WorkoutBlockWithItemsOut(WorkoutBlockOut):
    items: list[BlockExerciseOut]

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class WorkoutTemplateDetailOut(WorkoutTemplateOut):
    blocks: list[WorkoutBlockWithItemsOut]

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)
