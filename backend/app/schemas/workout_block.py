import uuid
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class WorkoutBlockCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    notes: Optional[str] = None


class WorkoutBlockUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    notes: Optional[str] = None


class WorkoutBlockOut(BaseModel):
    id: uuid.UUID
    workout_template_id: uuid.UUID
    # The ORM attribute is order_index; the API field is order
    order: int = Field(validation_alias="order_index")
    name: str
    notes: Optional[str]

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)
