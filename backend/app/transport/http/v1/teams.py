"""POST /v1/teams — create a new team and become its COACH.

Reachable before onboarding completes (uses get_auth_user_id, not get_current_user).
MVP: one COACH membership per user (409 if they already have one).
"""
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.dependencies import get_auth_user_id
from app.db.session import get_db
from app.domain.use_cases.create_team import (
    CoachAlreadyHasTeamError,
    CreateTeamCommand,
    CreateTeamUseCase,
)
from app.persistence.repositories.membership_repository import SqlAlchemyMembershipRepository
from app.persistence.repositories.team_repository import SqlAlchemyTeamRepository
from app.persistence.repositories.user_profile_repository import SqlAlchemyUserProfileRepository

router = APIRouter(tags=["teams"])


class CreateTeamRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)


class CreateTeamResponse(BaseModel):
    team_id: uuid.UUID
    membership_id: uuid.UUID
    role: str


@router.post("/teams", response_model=CreateTeamResponse, status_code=201)
def create_team(
    payload: CreateTeamRequest,
    user_id: Annotated[uuid.UUID, Depends(get_auth_user_id)],
    db: Session = Depends(get_db),
) -> CreateTeamResponse:
    use_case = CreateTeamUseCase(
        team_repo=SqlAlchemyTeamRepository(db),
        membership_repo=SqlAlchemyMembershipRepository(db),
        user_profile_repo=SqlAlchemyUserProfileRepository(db),
    )
    try:
        result = use_case.execute(
            CreateTeamCommand(supabase_user_id=user_id, team_name=payload.name)
        )
    except CoachAlreadyHasTeamError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    # user_profile_repo.create() commits; if profile already existed, commit here.
    db.commit()

    return CreateTeamResponse(
        team_id=result.team_id,
        membership_id=result.membership_id,
        role=result.role.value,
    )
