"""Team invite endpoints.

POST /v1/team-invites               — COACH creates an invite link for their team.
POST /v1/team-invites/{token}/accept — authenticated user accepts an invite by token.

Both endpoints use get_auth_user_id (lightweight JWT-only auth) so they work
before a UserProfile is created in the system.
"""
import uuid
from datetime import datetime
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Path, status
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
    InviteRoleConflictError,
)
from app.domain.use_cases.create_invite import (
    CreateInviteCommand,
    CreateInviteUseCase,
    NotACoachError,
)
from app.persistence.repositories.invite_repository import SqlAlchemyInviteRepository
from app.persistence.repositories.membership_repository import SqlAlchemyMembershipRepository
from app.persistence.repositories.user_profile_repository import SqlAlchemyUserProfileRepository

router = APIRouter(tags=["team-invites"])


# ---------------------------------------------------------------------------
# POST /v1/team-invites
# ---------------------------------------------------------------------------

class CreateInviteRequest(BaseModel):
    team_id: uuid.UUID
    expires_in_days: Optional[int] = Field(7, ge=1, le=365)


class CreateInviteResponse(BaseModel):
    token: str
    join_url: str
    team_id: uuid.UUID
    expires_at: Optional[datetime]


@router.post("/team-invites", response_model=CreateInviteResponse, status_code=201)
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
        token=result.token,
        join_url=f"{settings.FRONTEND_URL}/join/{result.token}",
        team_id=result.team_id,
        expires_at=result.expires_at,
    )


# ---------------------------------------------------------------------------
# POST /v1/team-invites/{token}/accept
# ---------------------------------------------------------------------------

class AcceptInviteRequest(BaseModel):
    display_name: str = Field(..., min_length=1, max_length=255)


class AcceptInviteResponse(BaseModel):
    team_id: uuid.UUID
    membership_id: uuid.UUID
    role: str


@router.post("/team-invites/{token}/accept", response_model=AcceptInviteResponse, status_code=201)
def accept_invite(
    payload: AcceptInviteRequest,
    token: Annotated[str, Path(min_length=1, max_length=64)],
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
            AcceptInviteCommand(supabase_user_id=user_id, token=token, name=payload.display_name)
        )
    except InviteNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except InviteAlreadyUsedError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    except InviteExpiredError as exc:
        raise HTTPException(status_code=status.HTTP_410_GONE, detail=str(exc))
    except InviteRoleConflictError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))

    # user_profile_repo.create() commits; if profile already existed, commit here.
    db.commit()

    return AcceptInviteResponse(
        team_id=result.team_id,
        membership_id=result.membership_id,
        role=result.role.value,
    )
