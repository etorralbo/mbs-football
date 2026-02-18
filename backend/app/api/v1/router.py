"""
API v1 router.

Combines all v1 endpoints into a single router.
"""
from fastapi import APIRouter

from app.api.v1.endpoints import exercises, workout_builder, workout_templates

# Create v1 router
api_router = APIRouter(prefix="/v1")

# Include all endpoint routers
api_router.include_router(exercises.router)
# workout_templates.router carries its own /workout-templates prefix
api_router.include_router(workout_templates.router)
# workout_builder.router has no prefix; full paths are in its decorators
api_router.include_router(workout_builder.router)
