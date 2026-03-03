"""
Pydantic schemas for Exercise CRUD operations.

All schemas use Pydantic v2 syntax with ConfigDict.

Validation rules (enforced at application layer, mirrored by DB constraints):
  - name:        3–80 chars
  - description: required, min 20 chars
  - tags:        list[str], min 1 item; each tag stripped, lowercased,
                 max 30 chars; duplicates removed; whitespace-only entries
                 rejected.
"""
import uuid
from datetime import datetime
from typing import Annotated, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.exercise import OwnerType


# ---------------------------------------------------------------------------
# Shared tag validator — reused by Create and Update schemas
# ---------------------------------------------------------------------------

def _clean_tags(raw: list[str]) -> list[str]:
    """
    Strip whitespace, lowercase, deduplicate, and validate each tag.

    Raises ValueError if:
      - any tag exceeds 30 chars after stripping
      - the cleaned list is empty
    """
    seen: dict[str, None] = {}
    for raw_tag in raw:
        tag = raw_tag.strip().lower()
        if not tag:
            continue
        if len(tag) > 30:
            raise ValueError(f'Tag "{tag}" exceeds the 30-character limit')
        seen[tag] = None

    cleaned = list(seen)
    if not cleaned:
        raise ValueError("At least one tag is required")
    return cleaned


# ---------------------------------------------------------------------------
# ExerciseCreate
# ---------------------------------------------------------------------------

class ExerciseCreate(BaseModel):
    """Schema for creating a new exercise (COACH only)."""

    name: str = Field(..., min_length=3, max_length=80, description="Exercise name (3–80 chars)")
    description: str = Field(
        ...,
        min_length=20,
        description="Detailed exercise description (min 20 chars)",
    )
    tags: list[str] = Field(
        ...,
        min_length=1,
        description="At least one tag, e.g. ['strength', 'lower-body']",
    )

    @field_validator("tags")
    @classmethod
    def validate_tags(cls, v: list[str]) -> list[str]:
        return _clean_tags(v)

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "name": "Goblet Squat",
                "description": "Squat pattern holding a dumbbell or kettlebell at chest height. Great for quad development and core stability.",
                "tags": ["strength", "lower-body"],
            }
        }
    )


# ---------------------------------------------------------------------------
# ExerciseUpdate
# ---------------------------------------------------------------------------

class ExerciseUpdate(BaseModel):
    """
    Schema for partially updating an existing exercise.

    All fields are optional — only provided fields will be updated.
    Clients cannot modify owner_type, is_editable, or coach_id.
    """

    name: Optional[str] = Field(None, min_length=3, max_length=80)
    description: Optional[str] = Field(None, min_length=20)
    tags: Optional[list[str]] = Field(None, min_length=1)
    video_asset_id: Optional[uuid.UUID] = Field(None)

    @field_validator("tags")
    @classmethod
    def validate_tags(cls, v: Optional[list[str]]) -> Optional[list[str]]:
        if v is None:
            return v
        return _clean_tags(v)

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "name": "Goblet Squat",
                "description": "Updated description with more detail about technique and cues.",
                "tags": ["strength", "lower-body", "core"],
            }
        }
    )


# ---------------------------------------------------------------------------
# ExerciseOut
# ---------------------------------------------------------------------------

class ExerciseOut(BaseModel):
    """Schema for exercise responses."""

    id: uuid.UUID = Field(..., description="Exercise unique identifier")
    # Null for COMPANY exercises.
    coach_id: Optional[uuid.UUID] = Field(None, description="Owning coach's UserProfile ID (null for COMPANY)")
    owner_type: OwnerType = Field(..., description="COMPANY (official) or COACH (custom)")
    is_editable: bool = Field(..., description="False for COMPANY exercises — they cannot be modified")
    name: str = Field(..., description="Exercise name")
    description: str = Field(..., description="Exercise description")
    tags: list[str] = Field(..., description="Categorisation tags, e.g. ['strength', 'lower-body']")
    is_favorite: bool = Field(False, description="True if the requesting coach has bookmarked this exercise")
    video_asset_id: Optional[uuid.UUID] = Field(None, description="Associated video asset ID")
    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# FavoriteToggleOut
# ---------------------------------------------------------------------------

class ExerciseFavoriteToggleOut(BaseModel):
    """Response for the POST /exercises/{id}/favorite endpoint."""

    exercise_id: uuid.UUID
    is_favorite: bool
