import uuid
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.exercise import ExerciseOut


class BlockExerciseCreate(BaseModel):
    exercise_id: uuid.UUID
    prescription_json: dict[str, Any] = Field(default_factory=dict)


class BlockExerciseUpdate(BaseModel):
    prescription_json: Optional[dict[str, Any]] = None


class BlockExerciseOut(BaseModel):
    id: uuid.UUID
    workout_block_id: uuid.UUID
    # The ORM attribute is order_index; the API field is order
    order: int = Field(validation_alias="order_index")
    prescription_json: dict[str, Any]
    exercise: ExerciseOut

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)
