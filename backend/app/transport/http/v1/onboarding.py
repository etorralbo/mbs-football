"""HTTP transport layer — Onboarding router.

Exposes:
    POST /onboarding
"""
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import AliasChoices, BaseModel, Field
from sqlalchemy.orm import Session

from app.core import dependencies as auth_deps
from app.core.dependencies import get_bearer_token
from app.db.session import get_db
from app.domain.use_cases.onboard_user import (
    ConflictError,
    OnboardUserCommand,
    OnboardUserUseCase,
)
from app.persistence.repositories.membership_repository import SqlAlchemyMembershipRepository
from app.persistence.repositories.team_repository import SqlAlchemyTeamRepository
from app.persistence.repositories.user_profile_repository import (
    SqlAlchemyUserProfileRepository,
)

router = APIRouter(tags=["onboarding"])


# ---------------------------------------------------------------------------
# Request / Response schemas  (HTTP transport concerns only)
# ---------------------------------------------------------------------------

class OnboardingRequest(BaseModel):
    team_name: str = Field(
        ...,
        min_length=1,
        max_length=255,
        validation_alias=AliasChoices("team_name", "name"),
    )


class OnboardingResponse(BaseModel):
    id: uuid.UUID
    team_id: uuid.UUID
    role: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _build_use_case(db: Session) -> OnboardUserUseCase:
    return OnboardUserUseCase(
        team_repo=SqlAlchemyTeamRepository(db),
        user_profile_repo=SqlAlchemyUserProfileRepository(db),
        membership_repo=SqlAlchemyMembershipRepository(db),
    )


def _to_command(payload: OnboardingRequest, supabase_user_id: uuid.UUID) -> OnboardUserCommand:
    return OnboardUserCommand(
        supabase_user_id=supabase_user_id,
        team_name=payload.team_name,
        name=payload.team_name,
    )


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

@router.post(
    "/onboarding",
    response_model=OnboardingResponse,
    status_code=201,
)
def onboard_user(
    payload: OnboardingRequest,
    token: Annotated[str, Depends(get_bearer_token)],
    db: Session = Depends(get_db),
) -> OnboardingResponse:
    token_payload = auth_deps.verify_jwt_token(token)
    try:
        supabase_user_id = uuid.UUID(token_payload["sub"])
    except (KeyError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token claims",
        )

    use_case = _build_use_case(db)
    command = _to_command(payload, supabase_user_id)

    try:
        result = use_case.execute(command)
    except ConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    return OnboardingResponse(id=result.id, team_id=result.team_id, role=result.role.value)
