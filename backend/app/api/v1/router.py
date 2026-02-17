"""
API v1 router.

Combines all v1 endpoints into a single router.
"""
from fastapi import APIRouter

from app.api.v1.endpoints import exercises

# Create v1 router
api_router = APIRouter(prefix="/v1")

# Include all endpoint routers
api_router.include_router(exercises.router)
