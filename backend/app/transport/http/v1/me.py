"""GET /v1/me — returns the current user's memberships.

This endpoint is reachable before onboarding completes (no UserProfile needed).
The frontend uses it to decide whether to show the onboarding flow or the app.
"""
import uuid
from typing import Annotated, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.dependencies import get_auth_user_id
from app.db.session import get_db
from app.models.membership import Membership
from app.models.team import Team

router = APIRouter(tags=["me"])


class MembershipOut(BaseModel):
    team_id: uuid.UUID
    team_name: str
    role: str


class MeResponse(BaseModel):
    user_id: uuid.UUID
    memberships: list[MembershipOut]
    active_team_id: Optional[uuid.UUID]


@router.get("/me", response_model=MeResponse)
def get_me(
    user_id: Annotated[uuid.UUID, Depends(get_auth_user_id)],
    db: Session = Depends(get_db),
) -> MeResponse:
    stmt = (
        select(Membership, Team)
        .join(Team, Team.id == Membership.team_id)
        .where(Membership.user_id == user_id)
        .order_by(Membership.created_at)
    )
    rows = db.execute(stmt).all()

    memberships = [
        MembershipOut(team_id=m.team_id, team_name=t.name, role=m.role.value)
        for m, t in rows
    ]

    active_team_id: Optional[uuid.UUID] = (
        memberships[0].team_id if len(memberships) == 1 else None
    )

    return MeResponse(
        user_id=user_id,
        memberships=memberships,
        active_team_id=active_team_id,
    )
