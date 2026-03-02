"""
Pydantic schemas for Exercise CRUD operations.

All schemas use Pydantic v2 syntax with ConfigDict.
"""
import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


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

    All fields are optional - only provided fields will be updated.
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
    """
    Schema for exercise responses.

    Returns complete exercise data including system fields.
    """

    id: uuid.UUID = Field(..., description="Exercise unique identifier")
    coach_id: uuid.UUID = Field(..., description="Coach (UserProfile) who owns this exercise")
    name: str = Field(..., description="Exercise name")
    description: Optional[str] = Field(None, description="Exercise description")
    tags: Optional[str] = Field(None, description="Exercise tags")
    video_asset_id: Optional[uuid.UUID] = Field(None, description="Associated video asset ID")
    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")

    model_config = ConfigDict(
        from_attributes=True,  # Pydantic v2 way to enable ORM mode
        json_schema_extra={
            "example": {
                "id": "123e4567-e89b-12d3-a456-426614174000",
                "coach_id": "123e4567-e89b-12d3-a456-426614174001",
                "name": "Squats",
                "description": "Standard bodyweight squats",
                "tags": "strength, legs, bodyweight",
                "video_asset_id": "123e4567-e89b-12d3-a456-426614174002",
                "created_at": "2024-01-15T10:30:00Z",
                "updated_at": "2024-01-15T10:30:00Z"
            }
        }
    )
