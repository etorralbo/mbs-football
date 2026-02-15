"""
Models package.

Exports all models and enums for Alembic autogenerate support.
Import order matters to avoid circular dependencies.
"""
# Base models (no dependencies)
from app.models.team import Team
from app.models.user_profile import Role, UserProfile

# Sprint 2: Workout models
from app.models.media_asset import MediaAsset, MediaAssetType
from app.models.exercise import Exercise
from app.models.workout_template import WorkoutTemplate
from app.models.workout_block import WorkoutBlock
from app.models.block_exercise import BlockExercise

__all__ = [
    # Base models
    "Team",
    "UserProfile",
    "Role",
    # Sprint 2 models
    "MediaAsset",
    "MediaAssetType",
    "Exercise",
    "WorkoutTemplate",
    "WorkoutBlock",
    "BlockExercise",
]
