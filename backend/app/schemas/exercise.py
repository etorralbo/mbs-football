"""
Pydantic schemas for Exercise CRUD operations.

All schemas use Pydantic v2 syntax with ConfigDict.
"""
import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from app.models.exercise import OwnerType


class ExerciseCreate(BaseModel):
    """Schema for creating a new exercise."""

    name: str = Field(..., min_length=1, max_length=255, description="Exercise name")
    description: Optional[str] = Field(None, description="Detailed exercise description")
    tags: Optional[str] = Field(None, description="Comma-separated tags for categorization")

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "name": "Squats",
                "description": "Standard bodyweight squats with proper form",
                "tags": "strength, legs, bodyweight"
            }
        }
    )


class ExerciseUpdate(BaseModel):
    """
    Schema for updating an existing exercise.

    All fields are optional — only provided fields will be updated.
    Client cannot modify owner_type or is_editable.
    """

    name: Optional[str] = Field(None, min_length=1, max_length=255, description="Exercise name")
    description: Optional[str] = Field(None, description="Detailed exercise description")
    tags: Optional[str] = Field(None, description="Comma-separated tags for categorization")
    video_asset_id: Optional[uuid.UUID] = Field(None, description="ID of associated video asset")

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "name": "Jump Squats",
                "description": "Explosive squat variation with jump",
                "tags": "strength, legs, plyometric"
            }
        }
    )


class ExerciseOut(BaseModel):
    """Schema for exercise responses."""

    id: uuid.UUID = Field(..., description="Exercise unique identifier")
    # Null for COMPANY exercises.
    coach_id: Optional[uuid.UUID] = Field(None, description="Owning coach's UserProfile ID (null for company exercises)")
    owner_type: OwnerType = Field(..., description="COMPANY (official) or COACH (custom)")
    is_editable: bool = Field(..., description="False for company exercises — they cannot be modified")
    name: str = Field(..., description="Exercise name")
    description: Optional[str] = Field(None, description="Exercise description")
    tags: Optional[str] = Field(None, description="Exercise tags")
    video_asset_id: Optional[uuid.UUID] = Field(None, description="Associated video asset ID")
    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")

    model_config = ConfigDict(from_attributes=True)
