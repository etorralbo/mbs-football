"""
API v1 router.

Combines all v1 endpoints into a single router.
"""
from fastapi import APIRouter

from app.api.v1.endpoints import ai, exercises, workout_builder, workout_templates
from app.transport.http.v1 import onboarding as onboarding_transport
from app.transport.http.v1 import workout_assignments as workout_assignments_transport
from app.transport.http.v1 import workout_sessions as workout_sessions_transport
from app.transport.http.v1 import workout_templates as workout_templates_transport

# Create v1 router
api_router = APIRouter(prefix="/v1")

# Include all endpoint routers
api_router.include_router(exercises.router)
# workout_templates.router carries its own /workout-templates prefix
api_router.include_router(workout_templates.router)
# workout_builder.router has no prefix; full paths are in its decorators
api_router.include_router(workout_builder.router)
# ai.router carries its own /ai prefix
api_router.include_router(ai.router)
# transport layer — new clean-architecture endpoints under /workout-templates
api_router.include_router(workout_templates_transport.router)
# transport layer — onboarding
api_router.include_router(onboarding_transport.router)
# transport layer — workout assignments + sessions
api_router.include_router(workout_assignments_transport.router)
api_router.include_router(workout_sessions_transport.router)
