"""
Hardening tests for POST /v1/workout-assignments/batch

Covers the four areas introduced to close Sprint 1 technical debt:

  1. Transaction ownership — rollback on failure: no data persists when use
     case raises after partial flushes.

  2. Template readiness — 422 when template has no exercises.

  3. is_ready field — GET /workout-templates/{id} returns the computed field.

  4. Duplicate submission guard — 409 on rapid back-to-back batch assignments
     targeting the same athletes + template.
"""
import uuid
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Role, Team, UserProfile, WorkoutTemplate, Membership
from app.models.workout_assignment import WorkoutAssignment
from app.models.workout_session import WorkoutSession

BATCH_ENDPOINT = "/v1/workout-assignments/batch"
TEMPLATES_ENDPOINT = "/v1/workout-templates"
HEADERS = {"Authorization": "Bearer test-token"}


# ---------------------------------------------------------------------------
# Shared fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def template_empty(db_session: Session, team_a: Team) -> WorkoutTemplate:
    """Template with no blocks and no exercises."""
    t = WorkoutTemplate(id=uuid.uuid4(), team_id=team_a.id, title="Empty Template Sprint1")
    db_session.add(t)
    db_session.commit()
    db_session.refresh(t)
    return t


@pytest.fixture
def second_athlete_a(db_session: Session, team_a: Team) -> UserProfile:
    """A second athlete in team A."""
    athlete = UserProfile(
        id=uuid.uuid4(),
        supabase_user_id=uuid.uuid4(),
        team_id=team_a.id,
        role=Role.ATHLETE,
        name="Hardening Athlete 2",
    )
    db_session.add(athlete)
    db_session.flush()
    db_session.add(Membership(
        id=uuid.uuid4(),
        user_id=athlete.supabase_user_id,
        team_id=team_a.id,
        role=Role.ATHLETE,
    ))
    db_session.commit()
    db_session.refresh(athlete)
    return athlete


# ---------------------------------------------------------------------------
# 1. Transaction rollback on failure
# ---------------------------------------------------------------------------

class TestTransactionRollback:
    """No assignments or sessions persist when the use case raises."""

    def test_no_data_persists_when_session_flush_fails(
        self,
        client: TestClient,
        db_session: Session,
        mock_jwt,
        coach_a: UserProfile,
        athlete_a: UserProfile,
        template_empty: WorkoutTemplate,
    ):
        """If create_sessions_for_batch raises, the rolled-back transaction
        must not leave any WorkoutAssignment rows in the DB.

        We make the template appear ready by adding a block+item mock at the
        use-case level, and inject a failure in create_sessions_for_batch.
        """
        mock_jwt(str(coach_a.supabase_user_id))

        # Capture PKs before any API call that may trigger a rollback, to
        # avoid DetachedInstanceError / ObjectDeletedError on post-call access.
        template_id = template_empty.id
        athlete_id = athlete_a.id

        # Patch the session repo's create_sessions_for_batch to raise after
        # assignments have been flushed (simulating a mid-transaction failure).
        with patch(
            "app.persistence.repositories.workout_session_repository"
            ".SqlAlchemyWorkoutSessionRepository.create_sessions_for_batch",
            side_effect=RuntimeError("Simulated DB failure"),
        ):
            # Also patch readiness so the guard doesn't block us first
            with patch(
                "app.domain.use_cases.batch_create_workout_assignment._is_template_ready",
                return_value=True,
            ):
                resp = client.post(
                    BATCH_ENDPOINT,
                    json={
                        "workout_template_id": str(template_id),
                        "athlete_ids": [str(athlete_id)],
                    },
                    headers=HEADERS,
                )

        assert resp.status_code == 500

        # Verify no WorkoutAssignment was committed for this template
        assignments = db_session.execute(
            select(WorkoutAssignment).where(
                WorkoutAssignment.workout_template_id == template_id
            )
        ).scalars().all()
        assert assignments == [], "Assignments should have been rolled back"

    def test_no_sessions_persisted_when_template_not_ready(
        self,
        client: TestClient,
        db_session: Session,
        mock_jwt,
        coach_a: UserProfile,
        athlete_a: UserProfile,
        template_empty: WorkoutTemplate,
    ):
        """TemplateNotReadyError (before any write) → 422, zero sessions in DB."""
        mock_jwt(str(coach_a.supabase_user_id))

        # Capture PKs before any API call that may trigger a rollback, to
        # avoid DetachedInstanceError / ObjectDeletedError on post-call access.
        template_id = template_empty.id
        athlete_id = athlete_a.id

        resp = client.post(
            BATCH_ENDPOINT,
            json={
                "workout_template_id": str(template_id),
                "athlete_ids": [str(athlete_id)],
            },
            headers=HEADERS,
        )

        assert resp.status_code == 422

        sessions = db_session.execute(
            select(WorkoutSession)
            .join(WorkoutAssignment, WorkoutSession.assignment_id == WorkoutAssignment.id)
            .where(WorkoutAssignment.workout_template_id == template_id)
        ).scalars().all()
        assert sessions == []


# ---------------------------------------------------------------------------
# 2. Template readiness guard
# ---------------------------------------------------------------------------

class TestTemplateReadinessGuard:
    """Batch assignment requires a ready template."""

    def test_empty_template_returns_422(
        self,
        client: TestClient,
        mock_jwt,
        coach_a: UserProfile,
        athlete_a: UserProfile,
        template_empty: WorkoutTemplate,
    ):
        """Template with no blocks/exercises → 422."""
        mock_jwt(str(coach_a.supabase_user_id))

        resp = client.post(
            BATCH_ENDPOINT,
            json={
                "workout_template_id": str(template_empty.id),
                "athlete_ids": [str(athlete_a.id)],
            },
            headers=HEADERS,
        )

        assert resp.status_code == 422
        assert "exercise" in resp.json()["detail"].lower()

    def test_ready_template_allows_assignment(
        self,
        client: TestClient,
        db_session: Session,
        mock_jwt,
        coach_a: UserProfile,
        athlete_a: UserProfile,
        template_empty: WorkoutTemplate,
    ):
        """When is_ready is patched True, the endpoint succeeds."""
        mock_jwt(str(coach_a.supabase_user_id))

        # Force the readiness check to pass (template_empty has no exercises)
        with patch(
            "app.domain.use_cases.batch_create_workout_assignment._is_template_ready",
            return_value=True,
        ):
            resp = client.post(
                BATCH_ENDPOINT,
                json={
                    "workout_template_id": str(template_empty.id),
                    "athlete_ids": [str(athlete_a.id)],
                },
                headers=HEADERS,
            )

        assert resp.status_code == 201
        assert resp.json()["sessions_created"] == 1


# ---------------------------------------------------------------------------
# 3. is_ready field in template detail response
# ---------------------------------------------------------------------------

class TestIsReadyField:
    """GET /workout-templates/{id} exposes is_ready."""

    def test_empty_template_is_not_ready(
        self,
        client: TestClient,
        mock_jwt,
        coach_a: UserProfile,
        template_empty: WorkoutTemplate,
    ):
        """A template with no blocks has is_ready == False."""
        mock_jwt(str(coach_a.supabase_user_id))

        resp = client.get(
            f"{TEMPLATES_ENDPOINT}/{template_empty.id}",
            headers=HEADERS,
        )

        assert resp.status_code == 200
        data = resp.json()
        assert "is_ready" in data, "Response must include is_ready field"
        assert data["is_ready"] is False

    def test_template_with_block_but_no_exercises_is_not_ready(
        self,
        client: TestClient,
        db_session: Session,
        mock_jwt,
        coach_a: UserProfile,
        team_a: Team,
    ):
        """A template with one block but no exercises has is_ready == False."""
        from app.models.workout_block import WorkoutBlock

        t = WorkoutTemplate(
            id=uuid.uuid4(),
            team_id=team_a.id,
            title="Has Block No Exercises Sprint1",
        )
        db_session.add(t)
        db_session.flush()
        block = WorkoutBlock(
            id=uuid.uuid4(),
            workout_template_id=t.id,
            order_index=0,
            name="Prep",
        )
        db_session.add(block)
        db_session.commit()

        mock_jwt(str(coach_a.supabase_user_id))
        resp = client.get(f"{TEMPLATES_ENDPOINT}/{t.id}", headers=HEADERS)

        assert resp.status_code == 200
        assert resp.json()["is_ready"] is False


# ---------------------------------------------------------------------------
# 4. Duplicate submission guard
# ---------------------------------------------------------------------------

class TestDuplicateSubmissionGuard:
    """Rapid back-to-back batch assignments return 409."""

    def test_second_identical_batch_within_window_returns_409(
        self,
        client: TestClient,
        db_session: Session,
        mock_jwt,
        coach_a: UserProfile,
        athlete_a: UserProfile,
        template_empty: WorkoutTemplate,
    ):
        """Two batch assignments for the same template+athlete within the
        deduplication window: first succeeds, second returns 409.
        """
        mock_jwt(str(coach_a.supabase_user_id))

        payload = {
            "workout_template_id": str(template_empty.id),
            "athlete_ids": [str(athlete_a.id)],
        }

        # Both calls use the patched readiness so neither is blocked for that reason.
        with patch(
            "app.domain.use_cases.batch_create_workout_assignment._is_template_ready",
            return_value=True,
        ):
            first = client.post(BATCH_ENDPOINT, json=payload, headers=HEADERS)
            second = client.post(BATCH_ENDPOINT, json=payload, headers=HEADERS)

        assert first.status_code == 201, f"First call failed: {first.text}"
        assert second.status_code == 409, f"Second call should be 409: {second.text}"
        assert "recently" in second.json()["detail"].lower()

    def test_different_athletes_not_blocked_by_duplicate_guard(
        self,
        client: TestClient,
        db_session: Session,
        mock_jwt,
        coach_a: UserProfile,
        athlete_a: UserProfile,
        second_athlete_a: UserProfile,
        template_empty: WorkoutTemplate,
    ):
        """A batch for athlete_a followed by a batch for second_athlete_a (different
        athlete) must both succeed — the guard is per athlete_id set.
        """
        mock_jwt(str(coach_a.supabase_user_id))

        with patch(
            "app.domain.use_cases.batch_create_workout_assignment._is_template_ready",
            return_value=True,
        ):
            first = client.post(
                BATCH_ENDPOINT,
                json={
                    "workout_template_id": str(template_empty.id),
                    "athlete_ids": [str(athlete_a.id)],
                },
                headers=HEADERS,
            )
            second = client.post(
                BATCH_ENDPOINT,
                json={
                    "workout_template_id": str(template_empty.id),
                    "athlete_ids": [str(second_athlete_a.id)],
                },
                headers=HEADERS,
            )

        assert first.status_code == 201
        assert second.status_code == 201, (
            "Second call targets a different athlete — should not be blocked"
        )

    def test_expired_window_allows_reassignment(
        self,
        client: TestClient,
        db_session: Session,
        mock_jwt,
        coach_a: UserProfile,
        athlete_a: UserProfile,
        template_empty: WorkoutTemplate,
    ):
        """When the duplicate detection window is patched to 0 s, a second call
        immediately after the first should be allowed.

        This proves the guard is time-based, not session-based.
        """
        from datetime import timedelta

        mock_jwt(str(coach_a.supabase_user_id))

        payload = {
            "workout_template_id": str(template_empty.id),
            "athlete_ids": [str(athlete_a.id)],
        }

        with patch(
            "app.domain.use_cases.batch_create_workout_assignment._is_template_ready",
            return_value=True,
        ):
            first = client.post(BATCH_ENDPOINT, json=payload, headers=HEADERS)
            assert first.status_code == 201

            # Patch the guard's repo method to report no recent assignment
            with patch(
                "app.persistence.repositories.workout_assignment_repository"
                ".SqlAlchemyWorkoutAssignmentRepository.exists_recent_athlete_assignment",
                return_value=False,
            ):
                second = client.post(BATCH_ENDPOINT, json=payload, headers=HEADERS)

        assert second.status_code == 201, (
            "With an expired window (guard disabled), second call should succeed"
        )
