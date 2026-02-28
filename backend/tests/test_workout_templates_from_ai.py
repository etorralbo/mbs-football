"""
Integration tests for POST /v1/workout-templates/from-ai.
"""
import uuid
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import BlockExercise, Exercise, UserProfile, WorkoutBlock, WorkoutTemplate

HEADERS = {"Authorization": "Bearer test-token"}
ENDPOINT = "/v1/workout-templates/from-ai"

# Mirror of ai_template_service.BASE_BLOCKS — must stay in sync.
BASE_BLOCKS = [
    "Preparation to Movement",
    "Plyometrics",
    "Primary Strength",
    "Secondary Strength",
    "Auxiliary Strength",
    "Recovery",
]


def _valid_payload(exercise_id: uuid.UUID | None = None) -> dict[str, Any]:
    """Minimal valid request body.  Optionally pins one exercise into Primary Strength."""
    blocks = []
    for name in BASE_BLOCKS:
        items: list[dict[str, Any]] = []
        if exercise_id is not None and name == "Primary Strength":
            items = [{"exercise_id": str(exercise_id), "order": 0}]
        blocks.append({"name": name, "notes": f"Notes for {name}", "items": items})
    return {"title": "AI Workout", "blocks": blocks}


class TestFromAiAuth:
    """Authentication and role guards."""

    def test_requires_auth(self, client: TestClient):
        """Missing token → 401."""
        response = client.post(ENDPOINT, json=_valid_payload())
        assert response.status_code == 401

    def test_not_onboarded_returns_403(self, client: TestClient, mock_jwt):
        """Valid token but no UserProfile → 403."""
        mock_jwt(str(uuid.uuid4()))

        response = client.post(ENDPOINT, headers=HEADERS, json=_valid_payload())

        assert response.status_code == 403
        assert response.status_code == 403

    def test_athlete_cannot_create(
        self,
        client: TestClient,
        mock_jwt,
        athlete_a: UserProfile,
    ):
        """ATHLETE role → 403."""
        mock_jwt(str(athlete_a.supabase_user_id))

        response = client.post(ENDPOINT, headers=HEADERS, json=_valid_payload())

        assert response.status_code == 403


class TestFromAiValidation:
    """Request-body validation."""

    def test_missing_block_returns_400(
        self,
        client: TestClient,
        onboarded_coach_jwt: UserProfile,
    ):
        """Fewer blocks than BASE_BLOCKS → 400."""
        payload = _valid_payload()
        payload["blocks"] = payload["blocks"][:-1]  # drop Recovery

        response = client.post(ENDPOINT, headers=HEADERS, json=payload)

        assert response.status_code == 400

    def test_wrong_block_name_returns_400(
        self,
        client: TestClient,
        onboarded_coach_jwt: UserProfile,
    ):
        """Block with a name not in BASE_BLOCKS → 400."""
        payload = _valid_payload()
        payload["blocks"][0]["name"] = "Not A Real Block"

        response = client.post(ENDPOINT, headers=HEADERS, json=payload)

        assert response.status_code == 400

    def test_non_contiguous_order_returns_400(
        self,
        client: TestClient,
        db_session: Session,
        onboarded_coach_jwt: UserProfile,
        coach_team_exercise_id: uuid.UUID,
    ):
        """Items with a gap in order values (0, 2 instead of 0, 1) → 400."""
        # Create a second exercise in the same team to use as the second item.
        ex2 = Exercise(
            id=uuid.uuid4(),
            team_id=onboarded_coach_jwt.team_id,
            name="Second Coach Exercise",
        )
        db_session.add(ex2)
        db_session.commit()

        payload = _valid_payload()
        for block in payload["blocks"]:
            if block["name"] == "Primary Strength":
                block["items"] = [
                    {"exercise_id": str(coach_team_exercise_id), "order": 0},
                    {"exercise_id": str(ex2.id), "order": 2},  # gap — not contiguous
                ]

        response = client.post(ENDPOINT, headers=HEADERS, json=payload)

        assert response.status_code == 400


class TestFromAiTenantIsolation:
    """Exercises must belong to the requesting coach's team."""

    def test_foreign_exercise_returns_404(
        self,
        client: TestClient,
        onboarded_coach_jwt: UserProfile,
        foreign_team_exercise_id: uuid.UUID,
    ):
        """exercise_id from another team → 404."""
        payload = _valid_payload()
        for block in payload["blocks"]:
            if block["name"] == "Primary Strength":
                block["items"] = [
                    {"exercise_id": str(foreign_team_exercise_id), "order": 0}
                ]

        response = client.post(ENDPOINT, headers=HEADERS, json=payload)

        assert response.status_code == 404


class TestFromAiSuccess:
    """Happy-path persistence."""

    def test_creates_template_returns_201(
        self,
        client: TestClient,
        onboarded_coach_jwt: UserProfile,
        coach_team_exercise_id: uuid.UUID,
    ):
        """Valid payload → 201 with the new template id."""
        payload = _valid_payload(exercise_id=coach_team_exercise_id)

        response = client.post(ENDPOINT, headers=HEADERS, json=payload)

        assert response.status_code == 201
        data = response.json()
        assert "id" in data
        uuid.UUID(data["id"])  # must be a valid UUID


class TestFromAiQueryPerformance:
    """Guarantee exercise ownership validation never produces N+1 queries."""

    def test_exercise_validation_uses_single_query(
        self,
        client: TestClient,
        db_session: Session,
        onboarded_coach_jwt: UserProfile,
        coach_team_exercise_id: uuid.UUID,
        count_queries,
    ):
        """With 3 exercises spread across blocks, exactly 1 SELECT hits the exercises table."""
        # Create 2 more exercises so we have 3 total across 3 blocks.
        extra_ids: list[uuid.UUID] = [coach_team_exercise_id]
        for i in range(2):
            ex = Exercise(
                id=uuid.uuid4(),
                team_id=onboarded_coach_jwt.team_id,
                name=f"Extra Exercise {i + 2}",
            )
            db_session.add(ex)
            db_session.flush()
            extra_ids.append(ex.id)
        db_session.commit()

        payload = _valid_payload()
        target_blocks = ["Primary Strength", "Secondary Strength", "Auxiliary Strength"]
        for block in payload["blocks"]:
            for i, name in enumerate(target_blocks):
                if block["name"] == name:
                    block["items"] = [{"exercise_id": str(extra_ids[i]), "order": 0}]

        with count_queries() as stmts:
            response = client.post(ENDPOINT, headers=HEADERS, json=payload)

        assert response.status_code == 201

        exercise_selects = [
            s for s in stmts
            if s.strip().upper().startswith("SELECT") and "exercises" in s.lower()
        ]
        assert len(exercise_selects) == 1, (
            f"Expected exactly 1 SELECT on exercises table, got "
            f"{len(exercise_selects)}:\n" + "\n---\n".join(exercise_selects)
        )


class TestFromAiAtomicity:
    """Transaction atomicity: nothing is persisted on partial failure."""

    def test_partial_invalid_exercise_rolls_back_everything(
        self,
        client: TestClient,
        db_session: Session,
        onboarded_coach_jwt: UserProfile,
        coach_team_exercise_id: uuid.UUID,
        foreign_team_exercise_id: uuid.UUID,
    ):
        """One valid + one foreign exercise_id → 404 and zero rows persisted."""
        payload = _valid_payload()
        for block in payload["blocks"]:
            if block["name"] == "Primary Strength":
                block["items"] = [
                    {"exercise_id": str(coach_team_exercise_id), "order": 0},
                ]
            if block["name"] == "Secondary Strength":
                block["items"] = [
                    {"exercise_id": str(foreign_team_exercise_id), "order": 0},
                ]

        response = client.post(ENDPOINT, headers=HEADERS, json=payload)

        assert response.status_code == 404

        # --- DB assertions: nothing should have been written ---
        db_session.expire_all()

        templates = db_session.execute(
            select(WorkoutTemplate).where(
                WorkoutTemplate.team_id == onboarded_coach_jwt.team_id
            )
        ).scalars().all()
        assert templates == [], "No WorkoutTemplate should have been persisted"

        blocks = db_session.execute(
            select(WorkoutBlock).join(
                WorkoutTemplate,
                WorkoutBlock.workout_template_id == WorkoutTemplate.id,
            ).where(WorkoutTemplate.team_id == onboarded_coach_jwt.team_id)
        ).scalars().all()
        assert blocks == [], "No WorkoutBlock should have been persisted"

        items = db_session.execute(
            select(BlockExercise).where(
                BlockExercise.exercise_id == coach_team_exercise_id
            )
        ).scalars().all()
        assert items == [], "No BlockExercise should have been persisted"


class TestTemplateCreatedAiEvent:
    """Funnel event tracking for TEMPLATE_CREATED_AI."""

    def test_template_created_ai_event_inserted(
        self,
        client: TestClient,
        db_session: Session,
        onboarded_coach_jwt: UserProfile,
        coach_team_exercise_id: uuid.UUID,
    ) -> None:
        """Successful save fires exactly one TEMPLATE_CREATED_AI event."""
        from sqlalchemy import select
        from app.domain.events.models import FunnelEvent, ProductEvent

        payload = _valid_payload(exercise_id=coach_team_exercise_id)
        resp = client.post(ENDPOINT, headers=HEADERS, json=payload)
        assert resp.status_code == 201

        events = db_session.execute(
            select(ProductEvent)
            .where(ProductEvent.event_name == FunnelEvent.TEMPLATE_CREATED_AI)
            .where(ProductEvent.team_id == onboarded_coach_jwt.team_id)
        ).scalars().all()
        assert len(events) == 1
        ev = events[0]
        assert ev.user_id == onboarded_coach_jwt.supabase_user_id
        assert ev.role == "COACH"
        assert "template_id" in ev.event_metadata

    def test_template_created_ai_event_scoped_to_team(
        self,
        client: TestClient,
        db_session: Session,
        onboarded_coach_jwt: UserProfile,
        coach_team_exercise_id: uuid.UUID,
    ) -> None:
        """TEMPLATE_CREATED_AI event is stored under coach's team; another team has zero events."""
        from sqlalchemy import select
        from app.domain.events.models import FunnelEvent, ProductEvent
        from app.models import Team

        other_team = Team(id=uuid.uuid4(), name="Other Team")
        db_session.add(other_team)
        db_session.commit()

        payload = _valid_payload(exercise_id=coach_team_exercise_id)
        resp = client.post(ENDPOINT, headers=HEADERS, json=payload)
        assert resp.status_code == 201

        coach_events = db_session.execute(
            select(ProductEvent)
            .where(ProductEvent.event_name == FunnelEvent.TEMPLATE_CREATED_AI)
            .where(ProductEvent.team_id == onboarded_coach_jwt.team_id)
        ).scalars().all()
        assert len(coach_events) == 1

        other_events = db_session.execute(
            select(ProductEvent)
            .where(ProductEvent.event_name == FunnelEvent.TEMPLATE_CREATED_AI)
            .where(ProductEvent.team_id == other_team.id)
        ).scalars().all()
        assert len(other_events) == 0
