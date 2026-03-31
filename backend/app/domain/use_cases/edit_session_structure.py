"""Domain use case: coach edits session structure (prescription / exercises).

A session starts as a snapshot of the template.  On the first edit, the
assignment's template_snapshot is deep-copied into session.session_structure
(copy-on-write).  Subsequent edits mutate that copy only.

Guarantees:
- Template is never touched.
- Other sessions are never touched.
- Exercises with existing athlete logs cannot be removed (409).
- Only coaches can call these operations (enforced at transport layer).
"""
import copy
import uuid
from dataclasses import dataclass, field
from typing import Any, Optional

from app.domain.use_cases._session_scope import resolve_session
from app.models.user_profile import Role
from app.persistence.repositories.exercise_repository import AbstractExerciseRepository
from app.persistence.repositories.workout_session_log_repository import (
    AbstractWorkoutSessionLogRepository,
)
from app.persistence.repositories.workout_session_repository import (
    AbstractWorkoutSessionRepository,
)


# ---------------------------------------------------------------------------
# Errors (no FastAPI / HTTP imports — transport layer maps these to HTTP)
# ---------------------------------------------------------------------------

class SessionNotFoundError(Exception):
    """Session does not exist or caller is not authorised to view it."""


class ExerciseNotFoundError(Exception):
    """Exercise not found or not accessible to this team."""


class ExerciseNotInSessionError(Exception):
    """The exercise is not present in the session structure."""


class BlockNotFoundError(Exception):
    """block_index is out of range for this session's structure."""


class ExerciseHasLogsError(Exception):
    """Cannot remove an exercise that the athlete has already logged."""


class BlockHasLogsError(Exception):
    """Cannot remove a block when any exercise in it has athlete logs."""


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------

@dataclass
class AddBlockCommand:
    session_id: uuid.UUID
    name: str
    requesting_team_id: uuid.UUID


@dataclass
class RemoveBlockCommand:
    session_id: uuid.UUID
    block_index: int
    requesting_team_id: uuid.UUID


@dataclass
class UpdatePrescriptionCommand:
    session_id: uuid.UUID
    exercise_id: uuid.UUID
    sets: list[dict[str, Any]]
    requesting_team_id: uuid.UUID


@dataclass
class RemoveExerciseCommand:
    session_id: uuid.UUID
    exercise_id: uuid.UUID
    requesting_team_id: uuid.UUID


@dataclass
class AddExerciseCommand:
    session_id: uuid.UUID
    exercise_id: uuid.UUID
    block_index: int
    sets: list[dict[str, Any]] = field(default_factory=list)
    requesting_team_id: uuid.UUID = field(default_factory=uuid.uuid4)


# ---------------------------------------------------------------------------
# Use case
# ---------------------------------------------------------------------------

class EditSessionStructureUseCase:
    """Provides three targeted mutations on a session's structure JSONB.

    All methods share the same lifecycle:
      1. Fetch session (coach-scoped → 404 on failure).
      2. Ensure session_structure is populated (copy-on-write from snapshot).
      3. Apply the mutation.
      4. Persist via update_session_structure (commit).
    """

    def __init__(
        self,
        session_repo: AbstractWorkoutSessionRepository,
        log_repo: AbstractWorkoutSessionLogRepository,
        exercise_repo: AbstractExerciseRepository,
    ) -> None:
        self._session_repo = session_repo
        self._log_repo = log_repo
        self._exercise_repo = exercise_repo

    # ------------------------------------------------------------------
    # Public operations
    # ------------------------------------------------------------------

    def update_prescription(self, command: UpdatePrescriptionCommand) -> None:
        """Replace the prescription.sets for one exercise in a session."""
        session = self._get_session_or_raise(command.session_id, command.requesting_team_id)
        structure = self._ensure_structure(session)

        found = False
        for block in structure.get("blocks", []):
            for item in block.get("items", []):
                if item["exercise_id"] == str(command.exercise_id):
                    item["prescription"] = {"sets": command.sets}
                    found = True

        if not found:
            raise ExerciseNotInSessionError(
                f"Exercise {command.exercise_id} not found in session {command.session_id}"
            )

        self._session_repo.update_session_structure(session, structure)

    def remove_exercise(self, command: RemoveExerciseCommand) -> None:
        """Remove an exercise from every block in the session.

        Raises ExerciseHasLogsError if the athlete has already logged sets
        for this exercise — safer to block removal than silently lose data.
        """
        session = self._get_session_or_raise(command.session_id, command.requesting_team_id)

        if self._log_repo.has_logs_for_exercise(command.session_id, command.exercise_id):
            raise ExerciseHasLogsError(
                f"Exercise {command.exercise_id} has athlete logs — cannot remove."
            )

        structure = self._ensure_structure(session)

        found = False
        for block in structure.get("blocks", []):
            before = len(block.get("items", []))
            block["items"] = [
                item for item in block.get("items", [])
                if item["exercise_id"] != str(command.exercise_id)
            ]
            if len(block["items"]) < before:
                found = True

        if not found:
            raise ExerciseNotInSessionError(
                f"Exercise {command.exercise_id} not found in session {command.session_id}"
            )

        self._session_repo.update_session_structure(session, structure)

    def add_block(self, command: AddBlockCommand) -> None:
        """Append a new empty block to the session structure."""
        session = self._get_session_or_raise(command.session_id, command.requesting_team_id)
        structure = self._ensure_structure(session)
        blocks = structure.setdefault("blocks", [])
        new_order = max((b.get("order", 0) for b in blocks), default=-1) + 1
        blocks.append({"name": command.name, "order": new_order, "items": []})
        self._session_repo.update_session_structure(session, structure)

    def remove_block(self, command: RemoveBlockCommand) -> None:
        """Remove a block (and all its exercises) from the session.

        Raises BlockNotFoundError if block_index is out of range.
        Raises BlockHasLogsError if any exercise in the block has athlete logs.
        """
        session = self._get_session_or_raise(command.session_id, command.requesting_team_id)
        structure = self._ensure_structure(session)
        blocks = structure.get("blocks", [])
        if command.block_index < 0 or command.block_index >= len(blocks):
            raise BlockNotFoundError(
                f"block_index {command.block_index} out of range "
                f"(session has {len(blocks)} block(s))"
            )
        block = blocks[command.block_index]
        for item in block.get("items", []):
            ex_id = uuid.UUID(item["exercise_id"])
            if self._log_repo.has_logs_for_exercise(command.session_id, ex_id):
                raise BlockHasLogsError(
                    f"Exercise {ex_id} in this block has athlete logs — cannot remove block."
                )
        structure["blocks"] = [b for i, b in enumerate(blocks) if i != command.block_index]
        self._session_repo.update_session_structure(session, structure)

    def add_exercise(self, command: AddExerciseCommand) -> None:
        """Append an exercise to block[block_index] in the session.

        Validates the exercise is accessible to the team before modifying the
        structure, so we never store a dangling exercise reference.
        """
        session = self._get_session_or_raise(command.session_id, command.requesting_team_id)

        exercise = self._exercise_repo.get_by_id_for_team(
            command.exercise_id, command.requesting_team_id
        )
        if exercise is None:
            raise ExerciseNotFoundError(
                f"Exercise {command.exercise_id} not accessible for this team"
            )

        structure = self._ensure_structure(session)

        blocks = structure.get("blocks", [])
        if command.block_index < 0 or command.block_index >= len(blocks):
            raise BlockNotFoundError(
                f"block_index {command.block_index} out of range "
                f"(session has {len(blocks)} block(s))"
            )

        block = blocks[command.block_index]
        items = block.setdefault("items", [])
        new_order = max((i.get("order", 0) for i in items), default=-1) + 1
        items.append({
            "exercise_id": str(exercise.id),
            "exercise_name": exercise.name,
            "order": new_order,
            "prescription": {"sets": command.sets},
            "video": None,
        })

        self._session_repo.update_session_structure(session, structure)

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _get_session_or_raise(self, session_id: uuid.UUID, team_id: uuid.UUID):
        session = resolve_session(
            session_id=session_id,
            role=Role.COACH,
            team_id=team_id,
            athlete_id=None,
            session_repo=self._session_repo,
        )
        if session is None:
            raise SessionNotFoundError(f"Session {session_id} not found")
        return session

    @staticmethod
    def _ensure_structure(session) -> dict[str, Any]:
        """Return a mutable deep copy of the session structure.

        If session_structure is already set, use it.
        Otherwise, copy the assignment's template_snapshot (copy-on-write).
        Falls back to an empty structure for very old sessions with no snapshot.
        """
        if session.session_structure is not None:
            return copy.deepcopy(dict(session.session_structure))

        snapshot = (
            session.assignment.template_snapshot
            if session.assignment
            else None
        )
        if snapshot is not None:
            return copy.deepcopy(dict(snapshot))

        # Fallback: no snapshot exists (legacy assignment with NULL snapshot).
        # Return a minimal structure so edits can still be applied.
        return {
            "template_id": str(session.workout_template_id),
            "title": "",
            "blocks": [],
        }
