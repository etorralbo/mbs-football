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

# Sprint 3: Workout assignment models (import order: assignment before session)
from app.models.workout_assignment import WorkoutAssignment
from app.models.workout_session import WorkoutSession

# Sprint 5: Invite-based onboarding models
from app.models.membership import Membership
from app.models.invite import Invite

# Sprint 4: Workout execution log models (log before entries)
from app.models.workout_session_log import WorkoutSessionLog
from app.models.workout_session_log_entry import WorkoutSessionLogEntry

__all__ = [
    # Base models
    "Team",
    "UserProfile",
    "Role",
    # Sprint 5 models
    "Membership",
    "Invite",
    # Sprint 2 models
    "MediaAsset",
    "MediaAssetType",
    "Exercise",
    "WorkoutTemplate",
    "WorkoutBlock",
    "BlockExercise",
    # Sprint 3 models
    "WorkoutAssignment",
    "WorkoutSession",
    # Sprint 4 models
    "WorkoutSessionLog",
    "WorkoutSessionLogEntry",
]
