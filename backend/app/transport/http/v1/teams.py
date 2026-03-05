"""Team endpoints — create and delete teams.

POST /v1/teams — create a new team and become its COACH.
DELETE /v1/teams/{team_id} — delete a team (owner only, with safety guards).
"""
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.dependencies import CurrentUser, get_auth_user_id, get_current_user, require_coach
from app.db.session import get_db
from app.domain.events.service import ProductEventService
from app.domain.use_cases.create_team import (
    CreateTeamCommand,
    CreateTeamUseCase,
)
from app.domain.use_cases.delete_team import (
    DeleteTeamCommand,
    DeleteTeamUseCase,
    NotTeamOwnerError,
    TeamHasAthletesError,
    TeamHasCoachExercisesError,
    TeamHasSessionsError,
    TeamNotFoundError,
)
from app.persistence.repositories.membership_repository import SqlAlchemyMembershipRepository
from app.persistence.repositories.team_repository import SqlAlchemyTeamRepository
from app.persistence.repositories.user_profile_repository import SqlAlchemyUserProfileRepository

router = APIRouter(tags=["teams"])


class CreateTeamRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    display_name: str = Field(..., min_length=1, max_length=255)

    @field_validator("name")
    @classmethod
    def strip_name(cls, v: str) -> str:
        return v.strip()


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
        event_service=ProductEventService(db),
    )
    try:
        result = use_case.execute(
            CreateTeamCommand(supabase_user_id=user_id, team_name=payload.name, name=payload.display_name)
        )
        db.commit()
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except IntegrityError as exc:
        db.rollback()
        if exc.orig and "uix_teams_creator_name" in str(exc.orig):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"You already have a team named '{payload.name[:100]}'.",
            )
        raise

    return CreateTeamResponse(
        team_id=result.team_id,
        membership_id=result.membership_id,
        role=result.role.value,
    )


@router.delete("/teams/{team_id}", status_code=204)
def delete_team(
    team_id: uuid.UUID,
    current_user: Annotated[CurrentUser, Depends(require_coach)],
    db: Session = Depends(get_db),
) -> Response:
    use_case = DeleteTeamUseCase(team_repo=SqlAlchemyTeamRepository(db))
    try:
        use_case.execute(
            DeleteTeamCommand(
                team_id=team_id,
                supabase_user_id=current_user.supabase_user_id,
                caller_team_id=current_user.team_id,
            )
        )
        db.commit()
    except TeamNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found.")
    except NotTeamOwnerError:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the team owner can delete this team.",
        )
    except TeamHasAthletesError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    except TeamHasSessionsError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    except TeamHasCoachExercisesError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))

    return Response(status_code=status.HTTP_204_NO_CONTENT)
