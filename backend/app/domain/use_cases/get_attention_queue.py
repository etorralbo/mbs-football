"""Use case: build the attention queue for a coach's dashboard.

Classification rules (non-overlapping, priority order):
1. overdue   — scheduled_for < today, not completed, not cancelled
2. due_today — scheduled_for == today, not completed, not cancelled, no logs yet
3. stale     — has logs, last log > STALE_THRESHOLD_HOURS ago,
               not completed, not cancelled, NOT already overdue
"""
import uuid
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from app.persistence.repositories.workout_session_repository import (
    AbstractWorkoutSessionRepository,
    AttentionSessionRow,
)

STALE_THRESHOLD_HOURS = 48


@dataclass
class AttentionItem:
    id: uuid.UUID
    athlete_id: uuid.UUID
    workout_template_id: uuid.UUID
    scheduled_for: Optional[date]
    template_title: str
    athlete_name: str
    exercise_count: int
    exercises_logged_count: int


@dataclass
class AttentionSummary:
    total_overdue: int
    total_due_today: int
    total_stale: int


@dataclass
class AttentionQueue:
    overdue: list[AttentionItem]
    due_today: list[AttentionItem]
    stale: list[AttentionItem]
    summary: AttentionSummary


class GetAttentionQueueUseCase:
    def __init__(self, session_repo: AbstractWorkoutSessionRepository) -> None:
        self._sessions = session_repo

    def execute(self, team_id: uuid.UUID) -> AttentionQueue:
        today = date.today()
        stale_cutoff = datetime.utcnow() - timedelta(hours=STALE_THRESHOLD_HOURS)

        pending = self._sessions.get_pending_by_team(team_id)

        overdue: list[AttentionItem] = []
        due_today: list[AttentionItem] = []
        stale: list[AttentionItem] = []

        for s in pending:
            if s.scheduled_for and s.scheduled_for < today:
                # Overdue — takes priority over all other buckets
                overdue.append(_to_item(s))
            elif s.scheduled_for and s.scheduled_for == today and s.exercises_logged_count == 0:
                # Due today and not started
                due_today.append(_to_item(s))
            elif (
                s.exercises_logged_count > 0
                and s.last_log_at is not None
                and s.last_log_at < stale_cutoff
                and not (s.scheduled_for and s.scheduled_for < today)
            ):
                # In-progress but stale (last log > 48h ago, not overdue)
                stale.append(_to_item(s))

        return AttentionQueue(
            overdue=overdue,
            due_today=due_today,
            stale=stale,
            summary=AttentionSummary(
                total_overdue=len(overdue),
                total_due_today=len(due_today),
                total_stale=len(stale),
            ),
        )


def _to_item(s: AttentionSessionRow) -> AttentionItem:
    return AttentionItem(
        id=s.id,
        athlete_id=s.athlete_id,
        workout_template_id=s.workout_template_id,
        scheduled_for=s.scheduled_for,
        template_title=s.template_title,
        athlete_name=s.athlete_name,
        exercise_count=s.exercise_count,
        exercises_logged_count=s.exercises_logged_count,
    )
