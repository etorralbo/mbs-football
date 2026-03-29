"""Domain use case: session execution view (template structure + merged logs).

Merges the prescribed workout template (blocks → exercises → prescription) with
whatever the athlete has already logged, producing a ready-to-render read model.
"""
import re
import uuid
from dataclasses import dataclass, field
from datetime import date
from typing import Any, Optional

from app.domain.use_cases._session_scope import resolve_session
from app.models.user_profile import Role
from app.persistence.repositories.workout_session_log_repository import (
    AbstractWorkoutSessionLogRepository,
)
from app.persistence.repositories.workout_session_repository import (
    AbstractWorkoutSessionRepository,
)
from app.persistence.repositories.workout_template_repository import (
    AbstractWorkoutTemplateRepository,
)


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------

class NotFoundError(Exception):
    """Session not found or caller not authorised — treated identically."""


# ---------------------------------------------------------------------------
# Result DTOs
# ---------------------------------------------------------------------------

def _block_key(name: str) -> str:
    """Derive a stable machine-readable key from a block name.

    e.g. "Primary Strength" → "PRIMARY_STRENGTH"
    """
    return re.sub(r"[^A-Z0-9]+", "_", name.upper()).strip("_")


@dataclass
class SetLogOut:
    set_number: int  # 1-based: first set = 1, second set = 2, …
    reps: Optional[int]
    weight: Optional[float]
    rpe: Optional[float]
    done: bool = True


@dataclass
class ExerciseExecutionOut:
    exercise_id: uuid.UUID
    exercise_name: str
    prescription: dict[str, Any]
    logs: list[SetLogOut] = field(default_factory=list)
    video: Optional[dict[str, Any]] = None  # {"provider", "url", "external_id"} or None


@dataclass
class BlockExecutionOut:
    name: str
    key: str   # slugified name, e.g. "PRIMARY_STRENGTH" — stable for tests/analytics
    order: int
    items: list[ExerciseExecutionOut] = field(default_factory=list)


@dataclass
class SessionExecutionResult:
    session_id: uuid.UUID
    status: str                     # "pending" | "completed"
    workout_template_id: uuid.UUID
    template_title: str
    athlete_profile_id: uuid.UUID
    scheduled_for: Optional[date]
    blocks: list[BlockExecutionOut] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Query DTO
# ---------------------------------------------------------------------------

@dataclass
class GetSessionExecutionQuery:
    session_id: uuid.UUID
    requesting_role: Role
    requesting_team_id: uuid.UUID
    requesting_athlete_id: Optional[uuid.UUID] = None


# ---------------------------------------------------------------------------
# Use case
# ---------------------------------------------------------------------------

class GetSessionExecutionViewUseCase:
    """
    Produces the execution view for a single session:
      - Template blocks and items (prescribed structure)
      - Actual sets logged so far, merged into the matching exercise slot

    Access rules mirror GetWorkoutSessionDetailUseCase:
    - ATHLETE: must own the session
    - COACH:   session must belong to a team athlete
    """

    def __init__(
        self,
        session_repo: AbstractWorkoutSessionRepository,
        template_repo: AbstractWorkoutTemplateRepository,
        log_repo: AbstractWorkoutSessionLogRepository,
    ) -> None:
        self._session_repo = session_repo
        self._template_repo = template_repo
        self._log_repo = log_repo

    def execute(self, query: GetSessionExecutionQuery) -> SessionExecutionResult:
        # 1. Authorised session fetch
        session = resolve_session(
            session_id=query.session_id,
            role=query.requesting_role,
            team_id=query.requesting_team_id,
            athlete_id=query.requesting_athlete_id,
            session_repo=self._session_repo,
        )
        if session is None:
            raise NotFoundError(f"Session {query.session_id} not found")

        # 2. Check for snapshot on the assignment (new assignments store one).
        #    Legacy assignments (NULL snapshot) fall back to the live template.
        snapshot = session.assignment.template_snapshot if session.assignment else None

        # 3. All logs for this session (entries pre-loaded, ordered by set_number)
        logs = self._log_repo.list_by_session(session.id)

        # 4. Build a lookup keyed by exercise_id only.
        #
        #    Keying by (block_name, exercise_id) is fragile: a coach can rename a
        #    block after athletes have already logged sets, making block_name in the
        #    historical log mismatch the current template block name. Merging by
        #    exercise_id alone is resilient to renames. The edge case where the same
        #    exercise appears in two blocks of the same template is intentionally
        #    accepted: the first block's logs are shown in both slots.
        log_index: dict[uuid.UUID, list[SetLogOut]] = {}
        for log in logs:
            log_index[log.exercise_id] = [
                SetLogOut(
                    set_number=entry.set_number,
                    reps=entry.reps,
                    weight=entry.weight,
                    rpe=entry.rpe,
                    done=True,
                )
                for entry in log.entries
            ]

        if snapshot is not None:
            # ---- Build blocks from snapshot (immutable view) ----
            block_results = self._blocks_from_snapshot(snapshot, log_index)
            template_title = snapshot.get("title", "")
        else:
            # ---- Fallback: live template (legacy assignments without snapshot) ----
            # TODO: remove this branch after backfilling snapshots for existing
            # assignments (data migration). Once every assignment has a snapshot,
            # the live-template path is no longer needed.
            template = self._template_repo.get_by_id_with_blocks(
                template_id=session.workout_template_id,
                team_id=query.requesting_team_id,
            )
            if template is None:
                raise NotFoundError(
                    f"Template {session.workout_template_id} not found for this team"
                )
            block_results = self._blocks_from_template(template, log_index)
            template_title = template.title

        return SessionExecutionResult(
            session_id=session.id,
            status="completed" if session.completed_at is not None else "pending",
            workout_template_id=session.workout_template_id,
            template_title=template_title,
            athlete_profile_id=session.athlete_id,
            scheduled_for=session.scheduled_for,
            blocks=block_results,
        )

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _blocks_from_snapshot(
        snapshot: dict[str, Any],
        log_index: dict[uuid.UUID, list[SetLogOut]],
    ) -> list[BlockExecutionOut]:
        """Build execution blocks from a JSONB snapshot stored on the assignment."""
        block_results = []
        for block_data in snapshot.get("blocks", []):
            exercise_results = []
            for item_data in block_data.get("items", []):
                ex_id = uuid.UUID(item_data["exercise_id"])
                exercise_results.append(
                    ExerciseExecutionOut(
                        exercise_id=ex_id,
                        exercise_name=item_data["exercise_name"],
                        prescription=item_data.get("prescription", {}),
                        logs=log_index.get(ex_id, []),
                        video=item_data.get("video"),  # None for legacy snapshots
                    )
                )
            block_results.append(
                BlockExecutionOut(
                    name=block_data["name"],
                    key=_block_key(block_data["name"]),
                    order=block_data["order"],
                    items=exercise_results,
                )
            )
        return block_results

    @staticmethod
    def _blocks_from_template(
        template: Any,
        log_index: dict[uuid.UUID, list[SetLogOut]],
    ) -> list[BlockExecutionOut]:
        """Build execution blocks from the live template (legacy fallback)."""
        sorted_blocks = sorted(template.blocks, key=lambda b: b.order_index)
        block_results = []
        for block in sorted_blocks:
            items = sorted(block.items, key=lambda i: i.order_index)
            exercise_results = []
            for item in items:
                ex = item.exercise
                video = (
                    {
                        "provider": ex.video_provider,
                        "url": ex.video_url,
                        "external_id": ex.video_external_id,
                    }
                    if ex.video_provider
                    else None
                )
                exercise_results.append(
                    ExerciseExecutionOut(
                        exercise_id=item.exercise_id,
                        exercise_name=ex.name,
                        prescription=item.prescription_json or {},
                        logs=log_index.get(item.exercise_id, []),
                        video=video,
                    )
                )
            block_results.append(
                BlockExecutionOut(
                    name=block.name,
                    key=_block_key(block.name),
                    order=block.order_index,
                    items=exercise_results,
                )
            )
        return block_results
