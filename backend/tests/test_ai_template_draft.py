"""
Integration tests for POST /v1/ai/workout-template-draft.

The OpenAI call is always mocked; no network access required.
"""
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Exercise, Team, UserProfile
from app.services.ai_template_service import BASE_BLOCKS

HEADERS = {"Authorization": "Bearer test-token"}

# Canonical mocked LLM response — matches BASE_BLOCKS exactly.
_MOCK_LLM = {
    "title": "AI Strength Day",
    "block_intents": {
        "Preparation to Movement": "Hip and ankle activation drills",
        "Plyometrics": "Broad jumps and hurdle hops for lower body power",
        "Primary Strength": "Heavy barbell squat compound lower body",
        "Secondary Strength": "Romanian deadlift hip hinge posterior chain",
        "Auxiliary Strength": "Single leg stability and core anti-rotation",
        "Recovery": "Foam rolling and static stretching cooldown",
    },
}


@pytest.fixture
def mock_llm(mocker):
    """Patch call_llm so no real API call is made."""
    return mocker.patch(
        "app.core.ai_client.call_llm",
        return_value=_MOCK_LLM,
    )


class TestAiTemplateDraftAuth:
    """Authentication and onboarding guard tests."""

    def test_requires_auth(self, client: TestClient):
        """Missing token → 401."""
        response = client.post(
            "/v1/ai/workout-template-draft",
            json={"prompt": "upper body strength"},
        )
        assert response.status_code == 401
        assert "Missing authentication token" in response.json()["detail"]

    def test_user_not_onboarded(self, client: TestClient, mock_jwt):
        """Valid token but no UserProfile → 403."""
        mock_jwt(str(uuid.uuid4()))

        response = client.post(
            "/v1/ai/workout-template-draft",
            headers=HEADERS,
            json={"prompt": "upper body strength"},
        )

        assert response.status_code == 403
        assert "not onboarded" in response.json()["detail"].lower()


class TestAiTemplateDraftResponse:
    """Response shape and BASE_BLOCKS contract tests."""

    def test_returns_200(
        self,
        client: TestClient,
        mock_jwt,
        mock_llm,
        coach_a: UserProfile,
    ):
        """Onboarded user gets 200 with a draft."""
        mock_jwt(str(coach_a.supabase_user_id))

        response = client.post(
            "/v1/ai/workout-template-draft",
            headers=HEADERS,
            json={"prompt": "upper body strength"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["title"] == "AI Strength Day"
        assert "blocks" in data

    def test_blocks_count_matches_base_blocks(
        self,
        client: TestClient,
        mock_jwt,
        mock_llm,
        coach_a: UserProfile,
    ):
        """Response must contain exactly len(BASE_BLOCKS) blocks."""
        mock_jwt(str(coach_a.supabase_user_id))

        response = client.post(
            "/v1/ai/workout-template-draft",
            headers=HEADERS,
            json={"prompt": "strength workout"},
        )

        assert response.status_code == 200
        assert len(response.json()["blocks"]) == len(BASE_BLOCKS)

    def test_blocks_in_correct_order(
        self,
        client: TestClient,
        mock_jwt,
        mock_llm,
        coach_a: UserProfile,
    ):
        """Block names and order must match BASE_BLOCKS exactly."""
        mock_jwt(str(coach_a.supabase_user_id))

        response = client.post(
            "/v1/ai/workout-template-draft",
            headers=HEADERS,
            json={"prompt": "strength workout"},
        )

        assert response.status_code == 200
        returned_names = [b["name"] for b in response.json()["blocks"]]
        assert returned_names == BASE_BLOCKS

    def test_last_block_is_recovery(
        self,
        client: TestClient,
        mock_jwt,
        mock_llm,
        coach_a: UserProfile,
    ):
        """Recovery must always be the last block."""
        mock_jwt(str(coach_a.supabase_user_id))

        response = client.post(
            "/v1/ai/workout-template-draft",
            headers=HEADERS,
            json={"prompt": "anything"},
        )

        assert response.status_code == 200
        assert response.json()["blocks"][-1]["name"] == "Recovery"

    def test_notes_come_from_llm_intent(
        self,
        client: TestClient,
        mock_jwt,
        mock_llm,
        coach_a: UserProfile,
    ):
        """Block notes must reflect the LLM's block_intents, not be empty."""
        mock_jwt(str(coach_a.supabase_user_id))

        response = client.post(
            "/v1/ai/workout-template-draft",
            headers=HEADERS,
            json={"prompt": "strength workout"},
        )

        blocks = {b["name"]: b for b in response.json()["blocks"]}
        assert blocks["Primary Strength"]["notes"] == _MOCK_LLM["block_intents"]["Primary Strength"]


class TestAiTemplateDraftTenantIsolation:
    """Suggested exercises must only come from the requesting user's team."""

    def test_suggested_exercises_belong_to_team(
        self,
        client: TestClient,
        mock_jwt,
        mocker,
        db_session: Session,
        coach_a: UserProfile,
        team_a: Team,
        team_b: Team,
    ):
        """Exercises from team B must never appear in team A's suggestions."""
        # Create one exercise per team — both would match "squat" / "deadlift"
        ex_a = Exercise(
            team_id=team_a.id,
            name="Back Squat",
            description="Barbell compound lower body squat",
            tags="squat compound lower barbell",
        )
        ex_b = Exercise(
            team_id=team_b.id,
            name="Front Squat",
            description="Barbell front rack squat compound",
            tags="squat compound front barbell",
        )
        db_session.add_all([ex_a, ex_b])
        db_session.commit()

        # Patch the LLM with an intent that would match both exercises
        mocker.patch(
            "app.core.ai_client.call_llm",
            return_value={
                **_MOCK_LLM,
                "block_intents": {
                    **_MOCK_LLM["block_intents"],
                    "Primary Strength": "barbell squat compound lower body",
                },
            },
        )

        mock_jwt(str(coach_a.supabase_user_id))

        response = client.post(
            "/v1/ai/workout-template-draft",
            headers=HEADERS,
            json={"prompt": "squat day"},
        )

        assert response.status_code == 200

        all_suggested_ids = {
            s["exercise_id"]
            for block in response.json()["blocks"]
            for s in block["suggested_exercises"]
        }

        assert str(ex_a.id) in all_suggested_ids, "team_a exercise should be suggested"
        assert str(ex_b.id) not in all_suggested_ids, "team_b exercise must not be suggested"

    def test_no_exercises_returns_empty_suggestions(
        self,
        client: TestClient,
        mock_jwt,
        mock_llm,
        coach_a: UserProfile,
    ):
        """When the team has no exercises, suggested_exercises is empty for all blocks."""
        mock_jwt(str(coach_a.supabase_user_id))

        response = client.post(
            "/v1/ai/workout-template-draft",
            headers=HEADERS,
            json={"prompt": "strength workout"},
        )

        assert response.status_code == 200
        for block in response.json()["blocks"]:
            assert block["suggested_exercises"] == []
