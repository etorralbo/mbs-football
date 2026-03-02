"""Invite management endpoints.

POST /v1/invites        — COACH creates an invite code for their team.
POST /v1/invites/accept — authenticated user (ATHLETE) accepts an invite.

Both endpoints use get_auth_user_id (lightweight JWT-only auth) so they work
before a UserProfile is created in the system.
"""
import uuid
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.dependencies import get_auth_user_id
from app.db.session import get_db
from app.domain.events.service import ProductEventService
from app.domain.use_cases.accept_invite import (
    AcceptInviteCommand,
    AcceptInviteUseCase,
    InviteAlreadyUsedError,
    InviteExpiredError,
    InviteNotFoundError,
)
from app.domain.use_cases.create_invite import (
    CreateInviteCommand,
    CreateInviteUseCase,
    NotACoachError,
)
from app.persistence.repositories.invite_repository import SqlAlchemyInviteRepository
from app.persistence.repositories.membership_repository import SqlAlchemyMembershipRepository
from app.persistence.repositories.team_repository import SqlAlchemyTeamRepository
from app.persistence.repositories.user_profile_repository import SqlAlchemyUserProfileRepository

router = APIRouter(tags=["invites"])


# ---------------------------------------------------------------------------
# POST /v1/invites
# ---------------------------------------------------------------------------

class CreateInviteRequest(BaseModel):
    team_id: uuid.UUID
    expires_in_days: Optional[int] = Field(None, ge=1, le=365)


class CreateInviteResponse(BaseModel):
    code: str
    join_url: str
    team_id: uuid.UUID


@router.post("/invites", response_model=CreateInviteResponse, status_code=201)
def create_invite(
    payload: CreateInviteRequest,
    user_id: Annotated[uuid.UUID, Depends(get_auth_user_id)],
    db: Session = Depends(get_db),
) -> CreateInviteResponse:
    settings = get_settings()
    use_case = CreateInviteUseCase(
        invite_repo=SqlAlchemyInviteRepository(db),
        membership_repo=SqlAlchemyMembershipRepository(db),
        event_service=ProductEventService(db),
    )
    try:
        result = use_case.execute(
            CreateInviteCommand(
                requesting_user_id=user_id,
                team_id=payload.team_id,
                expires_in_days=payload.expires_in_days,
            )
        )
    except NotACoachError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))

    db.commit()

    return CreateInviteResponse(
        code=result.code,
        join_url=f"{settings.FRONTEND_URL}/join?code={result.code}",
        team_id=result.team_id,
    )


# ---------------------------------------------------------------------------
# POST /v1/invites/accept
# ---------------------------------------------------------------------------

class AcceptInviteRequest(BaseModel):
    code: str = Field(..., min_length=1, max_length=64)
    display_name: str = Field("", max_length=255)


class AcceptInviteResponse(BaseModel):
    team_id: uuid.UUID
    membership_id: uuid.UUID
    role: str


@router.post("/invites/accept", response_model=AcceptInviteResponse, status_code=201)
def accept_invite(
    payload: AcceptInviteRequest,
    user_id: Annotated[uuid.UUID, Depends(get_auth_user_id)],
    db: Session = Depends(get_db),
) -> AcceptInviteResponse:
    use_case = AcceptInviteUseCase(
        invite_repo=SqlAlchemyInviteRepository(db),
        membership_repo=SqlAlchemyMembershipRepository(db),
        user_profile_repo=SqlAlchemyUserProfileRepository(db),
        event_service=ProductEventService(db),
    )
    try:
        result = use_case.execute(
            AcceptInviteCommand(supabase_user_id=user_id, code=payload.code, name=payload.display_name)
        )
    except InviteNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except InviteAlreadyUsedError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    except InviteExpiredError as exc:
        raise HTTPException(status_code=status.HTTP_410_GONE, detail=str(exc))

    # user_profile_repo.create() commits; if profile already existed, commit here.
    db.commit()

    return AcceptInviteResponse(
        team_id=result.team_id,
        membership_id=result.membership_id,
        role=result.role.value,
    )
