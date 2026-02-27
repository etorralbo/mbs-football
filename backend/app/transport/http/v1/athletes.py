"""HTTP transport layer — Athletes roster.

Exposes:
    GET /athletes   (Coach only: list all athletes in the team)
"""
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.dependencies import CurrentUser, require_coach
from app.db.session import get_db
from app.persistence.repositories.athlete_query_repository import (
    SqlAlchemyAthleteQueryRepository,
)

router = APIRouter(prefix="/athletes", tags=["athletes"])


class AthleteOut(BaseModel):
    id: uuid.UUID
    name: str


@router.get("", response_model=list[AthleteOut])
def list_athletes(
    current_user: Annotated[CurrentUser, Depends(require_coach)],
    db: Session = Depends(get_db),
) -> list[AthleteOut]:
    repo = SqlAlchemyAthleteQueryRepository(db)
    athletes = repo.list_athletes_by_team(current_user.team_id)
    return [AthleteOut(id=a.id, name=a.name) for a in athletes]
