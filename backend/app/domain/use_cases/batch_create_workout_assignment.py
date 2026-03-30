"""Domain use case: batch-assign a WorkoutTemplate to multiple athletes at once.

Replaces the N-call Promise.allSettled pattern from the frontend with a single
API call that validates all athletes and commits everything in one transaction.

Security:
- All athlete_ids are validated against the requesting team in a single query.
- If any athlete_id is not found in the team → NotFoundError (prevents IDOR).
- Template must belong to requesting team → NotFoundError.
"""
import uuid
from dataclasses import dataclass
from datetime import date
from datetime import datetime, timezone
from typing import Any, Optional

from app.domain.events.models import FunnelEvent
from app.domain.events.service import AuthContext, ProductEventService
from app.models.user_profile import Role
from app.models.workout_assignment import AssignmentTargetType
from app.models.workout_template import WorkoutTemplate
from app.persistence.repositories.athlete_query_repository import (
    SqlAlchemyAthleteQueryRepository,
)
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
# Errors (same namespace as single-assignment use case for consistent mapping)
# ---------------------------------------------------------------------------

class NotFoundError(Exception):
    """Raised when a resource is not found in the caller's tenant."""


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
# Use case
# ---------------------------------------------------------------------------

class BatchCreateWorkoutAssignmentUseCase:
    """Assign a template to multiple athletes in a single DB transaction."""

    def __init__(
        self,
        template_repo: AbstractWorkoutTemplateRepository,
        assignment_repo: AbstractWorkoutAssignmentRepository,
        session_repo: AbstractWorkoutSessionRepository,
        athlete_query_repo: SqlAlchemyAthleteQueryRepository,
        event_service: ProductEventService,
    ) -> None:
        self._template_repo = template_repo
        self._assignment_repo = assignment_repo
        self._session_repo = session_repo
        self._athlete_query_repo = athlete_query_repo
        self._event_service = event_service

    @staticmethod
    def _snapshot_template(template: WorkoutTemplate) -> dict[str, Any]:
        """Snapshot the template structure at assignment time (same as single-assign)."""
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
        # 1. Validate all athletes belong to the requesting team (single query).
        #    Any ID not found → 404 to prevent IDOR (do not leak existence).
        athletes = self._athlete_query_repo.get_athletes_by_ids_and_team(
            command.athlete_ids, command.requesting_team_id
        )
        found_ids = {a.id for a in athletes}
        missing = [aid for aid in command.athlete_ids if aid not in found_ids]
        if missing:
            raise NotFoundError(
                f"Athletes not found in this team: {[str(m) for m in missing]}"
            )

        # 2. Load template (with blocks/items for snapshot).
        template = self._template_repo.get_by_id_with_blocks(
            command.workout_template_id, command.requesting_team_id
        )
        if template is None:
            raise NotFoundError(
                f"WorkoutTemplate {command.workout_template_id} not found"
            )

        snapshot = self._snapshot_template(template)

        # 3. Create one ATHLETE assignment per athlete (flush only — no commit yet).
        #    All share the same template snapshot captured at this moment.
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

        # 4. Audit log — recorded atomically with the assignments + sessions.
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

        # 5. Create all sessions + commit the whole transaction at once.
        sessions = self._session_repo.create_sessions_for_batch(
            items=assignment_pairs,
            workout_template_id=command.workout_template_id,
            scheduled_for=command.scheduled_for,
        )

        return BatchCreateWorkoutAssignmentResult(sessions_created=len(sessions))
