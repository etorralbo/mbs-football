import uuid
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.exercise import ExerciseOut


class SetIn(BaseModel):
    order:  int             = Field(ge=0)
    reps:   Optional[int]   = Field(None, ge=1,  le=999)
    weight: Optional[float] = Field(None, ge=0,  le=9999)
    rpe:    Optional[float] = Field(None, ge=0,  le=10)


class SetOut(BaseModel):
    order:  int
    reps:   Optional[int]   = None
    weight: Optional[float] = None
    rpe:    Optional[float] = None

    model_config = ConfigDict(from_attributes=True)


class BlockExerciseCreate(BaseModel):
    exercise_id: uuid.UUID
    # Default three empty sets; callers may omit `sets` entirely
    sets: list[SetIn] = Field(
        default_factory=lambda: [SetIn(order=0), SetIn(order=1), SetIn(order=2)]
    )


class BlockExerciseUpdate(BaseModel):
    sets: list[SetIn] = Field(min_length=1, max_length=20)


class BlockExerciseOut(BaseModel):
    id: uuid.UUID
    workout_block_id: uuid.UUID
    # The ORM attribute is order_index; the API field is order
    order: int = Field(validation_alias="order_index")
    sets: list[SetOut]  # populated via BlockExercise.sets property
    exercise: ExerciseOut

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)
