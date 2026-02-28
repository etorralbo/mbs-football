"""HTTP transport layer — Analytics router.

Exposes:
    GET /analytics/funnel
"""
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.dependencies import CurrentUser, require_coach
from app.db.session import get_db
from app.domain.analytics.service import FunnelAnalyticsService

router = APIRouter(prefix="/analytics", tags=["analytics"])


# ---------------------------------------------------------------------------
# Response schema
# ---------------------------------------------------------------------------

class FunnelOut(BaseModel):
    team_created: int
    invite_created: int
    invite_accepted: int
    template_created_ai: int
    session_completed: int


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

@router.get("/funnel", response_model=FunnelOut)
def get_funnel(
    current_user: Annotated[CurrentUser, Depends(require_coach)],
    db: Session = Depends(get_db),
) -> FunnelOut:
    """Return per-event distinct-user counts for the requesting coach's team."""
    data = FunnelAnalyticsService(db).get_team_funnel(current_user.team_id)
    return FunnelOut(**data)
