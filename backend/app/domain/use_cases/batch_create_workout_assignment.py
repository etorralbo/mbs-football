"""Domain use case: batch-assign a WorkoutTemplate to multiple athletes at once.

Replaces the N-call Promise.allSettled pattern from the frontend with a single
API call that validates all athletes and commits everything in ONE transaction.

Security:
- All athlete_ids are validated against the requesting team in a single query.
- Any ID not found in the team → NotFoundError (prevents IDOR).
- Template must belong to requesting team → NotFoundError.
- Template must be ready (≥1 block, ≥1 exercise) → TemplateNotReadyError.
- Rapid duplicate submits detected → DuplicateAssignmentError (soft guard).

Transaction ownership:
- Repositories flush only; this use case owns commit/rollback via AbstractUnitOfWork.
- On any failure the rollback discards all pending flushes atomically.
"""
import uuid
from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import Any, Optional

from app.domain.events.models import FunnelEvent
from app.domain.events.service import AuthContext, ProductEventService
from app.domain.unit_of_work import AbstractUnitOfWork
from app.domain.use_cases.create_workout_assignment import AbstractAthleteQueryRepository
from app.models.user_profile import Role
from app.models.workout_assignment import AssignmentTargetType
from app.models.workout_template import WorkoutTemplate
from app.persistence.repositories.workout_assignment_repository import (
    AbstractWorkoutAssignmentRepository,
)
from app.persistence.repositories.workout_session_repository import (
    AbstractWorkoutSessionRepository,
)
from app.persistence.repositories.workout_template_repository import (
    AbstractWorkoutTemplateRepository,
)


# ---------------------------------------------------------------------------
# Domain errors
# ---------------------------------------------------------------------------

class NotFoundError(Exception):
    """Raised when a resource is not found in the caller's tenant."""


class TemplateNotReadyError(Exception):
    """Raised when the template lacks at least one block with one exercise."""


class DuplicateAssignmentError(Exception):
    """Raised when a recent duplicate batch assignment is detected.

    This is a soft idempotency guard against accidental rapid double-submits.
    Legitimate reassignments (> deduplication window) are still allowed.
    """


# ---------------------------------------------------------------------------
# Command / Result DTOs
# ---------------------------------------------------------------------------

@dataclass
class BatchCreateWorkoutAssignmentCommand:
    requesting_user_id: uuid.UUID
    requesting_team_id: uuid.UUID
    workout_template_id: uuid.UUID
    athlete_ids: list[uuid.UUID]
    scheduled_for: Optional[date] = None


@dataclass
class BatchCreateWorkoutAssignmentResult:
    sessions_created: int


# ---------------------------------------------------------------------------
# Readiness helper (pure, no DB required — template already loaded)
# ---------------------------------------------------------------------------

def _is_template_ready(template: WorkoutTemplate) -> bool:
    """Return True iff the template has ≥1 block with ≥1 exercise.

    Mirrors the is_ready computed field on WorkoutTemplateDetailOut but
    operates on the ORM object directly to avoid coupling domain logic to
    the Pydantic schema layer.
    """
    return bool(template.blocks) and any(bool(b.items) for b in template.blocks)


# ---------------------------------------------------------------------------
# Use case
# ---------------------------------------------------------------------------

class BatchCreateWorkoutAssignmentUseCase:
    """Assign a template to multiple athletes in a single DB transaction."""

    def __init__(
        self,
        template_repo: AbstractWorkoutTemplateRepository,
        assignment_repo: AbstractWorkoutAssignmentRepository,
        session_repo: AbstractWorkoutSessionRepository,
        athlete_query_repo: AbstractAthleteQueryRepository,
        event_service: ProductEventService,
        uow: AbstractUnitOfWork,
    ) -> None:
        self._template_repo = template_repo
        self._assignment_repo = assignment_repo
        self._session_repo = session_repo
        self._athlete_query_repo = athlete_query_repo
        self._event_service = event_service
        self._uow = uow

    @staticmethod
    def _snapshot_template(template: WorkoutTemplate) -> dict[str, Any]:
        """Snapshot the template structure at assignment time."""
        sorted_blocks = sorted(template.blocks, key=lambda b: b.order_index)
        now_utc = datetime.now(tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        return {
            "template_id": str(template.id),
            "snapshotted_at": now_utc,
            "title": template.title,
            "blocks": [
                {
                    "name": block.name,
                    "order": block.order_index,
                    "items": [
                        {
                            "exercise_id": str(item.exercise_id),
                            "exercise_name": item.exercise.name,
                            "order": item.order_index,
                            "prescription": item.prescription_json or {},
                            "video": (
                                {
                                    "provider": item.exercise.video_provider,
                                    "url": item.exercise.video_url,
                                    "external_id": item.exercise.video_external_id,
                                }
                                if item.exercise.video_provider
                                else None
                            ),
                        }
                        for item in sorted(block.items, key=lambda i: i.order_index)
                    ],
                }
                for block in sorted_blocks
            ],
        }

    def execute(
        self, command: BatchCreateWorkoutAssignmentCommand
    ) -> BatchCreateWorkoutAssignmentResult:
        try:
            return self._execute(command)
        except Exception:
            # Roll back all pending flushes (assignments + sessions) so that
            # no partial data reaches the DB on any error path.
            self._uow.rollback()
            raise

    def _execute(
        self, command: BatchCreateWorkoutAssignmentCommand
    ) -> BatchCreateWorkoutAssignmentResult:
        # 0. Duplicate guard — runs before any writes.
        #    Prevent accidental rapid double-submits (e.g. double-click).
        #    Window: 10 s.  Legitimate reassignments after that are still allowed.
        if self._assignment_repo.exists_recent_athlete_assignment(
            team_id=command.requesting_team_id,
            template_id=command.workout_template_id,
            athlete_ids=command.athlete_ids,
        ):
            raise DuplicateAssignmentError(
                "A batch assignment for one or more of these athletes was created "
                "very recently. Please wait a moment before reassigning."
            )

        # 1. Validate all athletes belong to the requesting team (single query).
        #    Any ID not found → NotFoundError to prevent IDOR (do not leak existence).
        athletes = self._athlete_query_repo.get_athletes_by_ids_and_team(
            command.athlete_ids, command.requesting_team_id
        )
        found_ids = {a.id for a in athletes}
        missing = [aid for aid in command.athlete_ids if aid not in found_ids]
        if missing:
            raise NotFoundError(
                f"Athletes not found in this team: {[str(m) for m in missing]}"
            )

        # 2. Load template (eager-loads blocks/items needed for snapshot + readiness).
        template = self._template_repo.get_by_id_with_blocks(
            command.workout_template_id, command.requesting_team_id
        )
        if template is None:
            raise NotFoundError(
                f"WorkoutTemplate {command.workout_template_id} not found"
            )

        # 3. Readiness check — reject assignment if template has no exercises.
        #    Mirrors the is_ready field on WorkoutTemplateDetailOut.
        if not _is_template_ready(template):
            raise TemplateNotReadyError(
                "Template must have at least one block with one exercise before assigning."
            )

        snapshot = self._snapshot_template(template)

        # 4. Create one ATHLETE assignment per athlete (flush only — no commit yet).
        #    All athletes share the same snapshot captured at this moment.
        assignment_pairs: list[tuple[uuid.UUID, uuid.UUID]] = []
        for athlete in athletes:
            assignment = self._assignment_repo.create(
                team_id=command.requesting_team_id,
                workout_template_id=command.workout_template_id,
                target_type=AssignmentTargetType.ATHLETE,
                target_athlete_id=athlete.id,
                scheduled_for=command.scheduled_for,
                template_snapshot=snapshot,
            )
            assignment_pairs.append((assignment.id, athlete.id))

        # 5. Audit event — recorded atomically with the assignments + sessions.
        self._event_service.track(
            event=FunnelEvent.ASSIGNMENT_CREATED,
            actor=AuthContext(
                user_id=command.requesting_user_id,
                role=Role.COACH.value,
                team_id=command.requesting_team_id,
            ),
            team_id=command.requesting_team_id,
            metadata={
                "batch": True,
                "athlete_count": len(athletes),
                "workout_template_id": str(command.workout_template_id),
            },
        )

        # 6. Flush sessions (no commit yet — use case owns the transaction).
        sessions = self._session_repo.create_sessions_for_batch(
            items=assignment_pairs,
            workout_template_id=command.workout_template_id,
            scheduled_for=command.scheduled_for,
        )

        # 7. Commit everything atomically: assignments + sessions + audit event.
        self._uow.commit()

        return BatchCreateWorkoutAssignmentResult(sessions_created=len(sessions))
