"""Team invite endpoints.

POST /v1/team-invites               — COACH creates an invite link for their team.
GET  /v1/invites/preview/{token}    — public preview of an invite (no auth).
POST /v1/team-invites/{token}/accept — authenticated user accepts an invite by token.

Both mutating endpoints use get_auth_user_id (lightweight JWT-only auth) so they
work before a UserProfile is created in the system.
"""
import uuid
from urllib.parse import quote
from datetime import datetime, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Path, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.dependencies import AuthIdentity, get_auth_identity, get_auth_user_id
from app.db.session import get_db
from app.domain.events.service import ProductEventService
from app.domain.use_cases.accept_invite import (
    AcceptInviteCommand,
    AcceptInviteUseCase,
    InviteAlreadyUsedError,
    InviteEmailMismatchError,
    InviteExpiredError,
    InviteNotFoundError,
)
from app.domain.use_cases.create_invite import (
    CreateInviteCommand,
    CreateInviteUseCase,
    NotACoachError,
)
from app.models import Team, UserProfile
from app.persistence.repositories.invite_repository import SqlAlchemyInviteRepository
from app.persistence.repositories.membership_repository import SqlAlchemyMembershipRepository
from app.persistence.repositories.user_profile_repository import SqlAlchemyUserProfileRepository

router = APIRouter(tags=["team-invites"])


# ---------------------------------------------------------------------------
# POST /v1/team-invites
# ---------------------------------------------------------------------------

class CreateInviteRequest(BaseModel):
    team_id: uuid.UUID
    email: str = Field(..., min_length=3, max_length=255)
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
                email=payload.email,
                expires_in_days=payload.expires_in_days,
            )
        )
    except NotACoachError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))

    db.commit()

    return CreateInviteResponse(
        token=result.token,
        join_url=f"{settings.FRONTEND_URL}/join/{quote(result.token, safe='')}",
        team_id=result.team_id,
        expires_at=result.expires_at,
    )


# ---------------------------------------------------------------------------
# GET /v1/invites/preview/{token}
# ---------------------------------------------------------------------------

class InvitePreviewResponse(BaseModel):
    team_name: str
    coach_name: str
    role: str
    email: Optional[str]
    expires_at: Optional[datetime]


@router.get("/invites/preview/{token}", response_model=InvitePreviewResponse, status_code=200)
def preview_invite(
    token: Annotated[str, Path(min_length=1, max_length=64)],
    db: Session = Depends(get_db),
) -> InvitePreviewResponse:
    invite_repo = SqlAlchemyInviteRepository(db)
    invite = invite_repo.get_by_token(token)
    if invite is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invite not found.")

    if invite.expires_at and invite.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Invite has expired.")

    if invite.used_at is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Invite has already been used.")

    team = db.get(Team, invite.team_id)
    team_name = team.name if team else ""

    coach_profile = db.execute(
        select(UserProfile).where(UserProfile.supabase_user_id == invite.created_by_user_id)
    ).scalar_one_or_none()
    coach_name = coach_profile.name if coach_profile else ""

    return InvitePreviewResponse(
        team_name=team_name,
        coach_name=coach_name,
        role=invite.role.value,
        email=invite.email,
        expires_at=invite.expires_at,
    )


# ---------------------------------------------------------------------------
# POST /v1/team-invites/{token}/accept
# ---------------------------------------------------------------------------

class AcceptInviteRequest(BaseModel):
    display_name: str = Field("", max_length=255)


class AcceptInviteResponse(BaseModel):
    status: str        # "joined" | "already_member" | "not_eligible"
    team_id: uuid.UUID
    team_name: str


@router.post("/team-invites/{token}/accept", response_model=AcceptInviteResponse, status_code=200)
def accept_invite(
    payload: AcceptInviteRequest,
    token: Annotated[str, Path(min_length=1, max_length=64)],
    identity: Annotated[AuthIdentity, Depends(get_auth_identity)],
    db: Session = Depends(get_db),
    response: Response = None,  # type: ignore[assignment]
) -> AcceptInviteResponse:
    # Prevent CDN/proxy caching of this mutating endpoint.
    if response is not None:
        response.headers["Cache-Control"] = "no-store"

    use_case = AcceptInviteUseCase(
        invite_repo=SqlAlchemyInviteRepository(db),
        membership_repo=SqlAlchemyMembershipRepository(db),
        user_profile_repo=SqlAlchemyUserProfileRepository(db),
        event_service=ProductEventService(db),
    )
    try:
        result = use_case.execute(
            AcceptInviteCommand(
                supabase_user_id=identity.user_id,
                token=token,
                name=payload.display_name,
                email=identity.email,
            )
        )
    except InviteNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except InviteAlreadyUsedError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    except InviteExpiredError as exc:
        raise HTTPException(status_code=status.HTTP_410_GONE, detail=str(exc))
    except InviteEmailMismatchError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))

    db.commit()

    team = db.get(Team, result.team_id)
    return AcceptInviteResponse(
        status=result.status,
        team_id=result.team_id,
        team_name=team.name if team else "",
    )
