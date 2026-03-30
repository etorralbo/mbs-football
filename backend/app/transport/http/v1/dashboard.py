"""HTTP transport layer — Dashboard router.

Exposes:
    GET /v1/dashboard/attention  — attention queue for the coach's team
"""
import uuid
from datetime import date
from typing import Annotated, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.dependencies import CurrentUser, require_coach
from app.db.session import get_db
from app.domain.use_cases.get_attention_queue import GetAttentionQueueUseCase
from app.persistence.repositories.workout_session_repository import (
    SqlAlchemyWorkoutSessionRepository,
)

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------


class AttentionItemOut(BaseModel):
    id: uuid.UUID
    athlete_id: uuid.UUID
    workout_template_id: uuid.UUID
    scheduled_for: Optional[date]
    template_title: str
    athlete_name: str
    exercise_count: int
    exercises_logged_count: int


class AttentionSummaryOut(BaseModel):
    total_overdue: int
    total_due_today: int
    total_stale: int


class AttentionQueueOut(BaseModel):
    overdue: list[AttentionItemOut]
    due_today: list[AttentionItemOut]
    stale: list[AttentionItemOut]
    summary: AttentionSummaryOut


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------


@router.get("/attention", response_model=AttentionQueueOut)
def get_attention_queue(
    current_user: Annotated[CurrentUser, Depends(require_coach)],
    db: Session = Depends(get_db),
) -> AttentionQueueOut:
    """Return the attention queue for the coach's team.

    Three buckets, non-overlapping:
    - overdue:   sessions past their scheduled date, not completed
    - due_today: sessions scheduled for today with no logs yet
    - stale:     sessions with logs but no activity in > 48 h
    """
    queue = GetAttentionQueueUseCase(
        session_repo=SqlAlchemyWorkoutSessionRepository(db),
    ).execute(team_id=current_user.team_id)

    return AttentionQueueOut(
        overdue=[AttentionItemOut(**vars(item)) for item in queue.overdue],
        due_today=[AttentionItemOut(**vars(item)) for item in queue.due_today],
        stale=[AttentionItemOut(**vars(item)) for item in queue.stale],
        summary=AttentionSummaryOut(**vars(queue.summary)),
    )
