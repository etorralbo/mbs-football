"""
API v1 router.

Combines all v1 endpoints into a single router.
"""
from fastapi import APIRouter

from app.api.v1.endpoints import ai, exercises, workout_builder, workout_templates
from app.transport.http.v1 import analytics as analytics_transport
from app.transport.http.v1 import athletes as athletes_transport
from app.transport.http.v1 import invites as invites_transport
from app.transport.http.v1 import me as me_transport
from app.transport.http.v1 import onboarding as onboarding_transport
from app.transport.http.v1 import teams as teams_transport
from app.transport.http.v1 import workout_assignments as workout_assignments_transport
from app.transport.http.v1 import workout_execution as workout_execution_transport
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
# transport layer — onboarding (legacy, kept for backward compat)
api_router.include_router(onboarding_transport.router)
# transport layer — sprint 5: invite-based onboarding
api_router.include_router(me_transport.router)
api_router.include_router(teams_transport.router)
api_router.include_router(invites_transport.router)
# transport layer — analytics (coach only)
api_router.include_router(analytics_transport.router)
# transport layer — athletes roster (coach only)
api_router.include_router(athletes_transport.router)
# transport layer — workout assignments + sessions + execution logs
api_router.include_router(workout_assignments_transport.router)
api_router.include_router(workout_sessions_transport.router)
api_router.include_router(workout_execution_transport.router)
