"""
Integration tests for POST /v1/ai/workout-template-draft.

The OpenAI call is always mocked; no network access required.
"""
import uuid
from unittest.mock import MagicMock

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


@pytest.fixture(autouse=True)
def force_stub_off(mocker):
    """Pin AI_STUB=False for every test in this module.

    This guards against the container having AI_STUB=true set in its
    environment (which is valid for local demos) bleeding into tests that
    exercise the real LLM path.  Tests in TestAiTemplateDraftStub re-patch
    get_settings themselves, which overrides this fixture for those tests.
    """
    cfg = MagicMock()
    cfg.ENV = "local"
    cfg.AI_STUB = False
    mocker.patch("app.api.v1.endpoints.ai.get_settings", return_value=cfg)


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
        assert response.status_code == 403


class TestAiTemplateDraftResponse:
    """Response shape and BASE_BLOCKS contract tests."""

    def test_returns_200_with_source_ai(
        self,
        client: TestClient,
        mock_jwt,
        mock_llm,
        coach_a: UserProfile,
    ):
        """Onboarded user gets 200 with a draft and source='ai'."""
        mock_jwt(str(coach_a.supabase_user_id))

        response = client.post(
            "/v1/ai/workout-template-draft",
            headers=HEADERS,
            json={"prompt": "upper body strength"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["title"] == "AI Strength Day"
        assert data["source"] == "ai"
        assert data["fallback_reason"] is None
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
        coach_b: UserProfile,
    ):
        """Exercises from coach B must never appear in coach A's suggestions."""
        # Create one exercise per coach — both would match "squat" / "deadlift"
        ex_a = Exercise(
            coach_id=coach_a.id,
            name="Back Squat",
            description="Barbell compound lower body squat",
            tags="squat compound lower barbell",
        )
        ex_b = Exercise(
            coach_id=coach_b.id,
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


# ---------------------------------------------------------------------------
# Stub mode
# ---------------------------------------------------------------------------

def _stub_settings(*, ai_stub: bool = True) -> MagicMock:
    """Return a mock Settings-like object with only the fields the endpoint reads."""
    cfg = MagicMock()
    cfg.AI_STUB = ai_stub
    return cfg


class TestAiTemplateDraftStub:
    """When AI_STUB=True the endpoint bypasses OpenAI entirely, regardless of ENV."""

    def test_stub_returns_200_with_fallback_source(
        self,
        client: TestClient,
        mock_jwt,
        mocker,
        coach_a: UserProfile,
    ):
        """Stub mode must return 200 with source='fallback' and must NOT invoke the LLM."""
        spy_llm = mocker.patch("app.core.ai_client.call_llm")
        mocker.patch("app.api.v1.endpoints.ai.get_settings", return_value=_stub_settings())

        mock_jwt(str(coach_a.supabase_user_id))
        response = client.post(
            "/v1/ai/workout-template-draft",
            headers=HEADERS,
            json={"prompt": "upper body strength"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["source"] == "fallback"
        assert data["fallback_reason"] == "stub_mode"
        spy_llm.assert_not_called()

    def test_stub_response_matches_schema(
        self,
        client: TestClient,
        mock_jwt,
        mocker,
        coach_a: UserProfile,
    ):
        """Stub response must match the AiTemplateDraft schema exactly."""
        mocker.patch("app.core.ai_client.call_llm")
        mocker.patch("app.api.v1.endpoints.ai.get_settings", return_value=_stub_settings())

        mock_jwt(str(coach_a.supabase_user_id))
        response = client.post(
            "/v1/ai/workout-template-draft",
            headers=HEADERS,
            json={"prompt": "lower body power"},
        )

        data = response.json()
        assert "title" in data
        assert len(data["blocks"]) == len(BASE_BLOCKS)
        assert [b["name"] for b in data["blocks"]] == BASE_BLOCKS
        for block in data["blocks"]:
            assert "notes" in block
            assert isinstance(block["suggested_exercises"], list)

    def test_stub_title_contains_prompt(
        self,
        client: TestClient,
        mock_jwt,
        mocker,
        coach_a: UserProfile,
    ):
        """Stub title should echo the prompt so demos are easy to identify."""
        mocker.patch("app.core.ai_client.call_llm")
        mocker.patch("app.api.v1.endpoints.ai.get_settings", return_value=_stub_settings())

        mock_jwt(str(coach_a.supabase_user_id))
        response = client.post(
            "/v1/ai/workout-template-draft",
            headers=HEADERS,
            json={"prompt": "acceleration sprint session"},
        )

        title: str = response.json()["title"]
        assert "acceleration sprint session" in title.lower()

    def test_stub_active_in_production_env(
        self,
        client: TestClient,
        mock_jwt,
        mocker,
        coach_a: UserProfile,
    ):
        """AI_STUB=True activates stub regardless of ENV — no LLM call is made."""
        spy_llm = mocker.patch("app.core.ai_client.call_llm")
        mocker.patch(
            "app.api.v1.endpoints.ai.get_settings",
            return_value=_stub_settings(ai_stub=True),
        )

        mock_jwt(str(coach_a.supabase_user_id))
        response = client.post(
            "/v1/ai/workout-template-draft",
            headers=HEADERS,
            json={"prompt": "strength workout"},
        )

        assert response.status_code == 200
        spy_llm.assert_not_called()


# ---------------------------------------------------------------------------
# OpenAI failure — safe error surfacing
# ---------------------------------------------------------------------------


class TestAiTemplateDraftOpenAIFailure:
    """When the real LLM path fails, the endpoint falls back to stub draft."""

    def test_openai_error_falls_back_to_stub_draft(
        self,
        client: TestClient,
        mock_jwt,
        mocker,
        coach_a: UserProfile,
    ):
        """OpenAI errors must fall back to stub draft with source='fallback'."""
        from openai import OpenAIError

        mock_oa_client = MagicMock()
        mock_oa_client.chat.completions.create.side_effect = OpenAIError(
            "Rate limit exceeded. key=sk-proj-VERYSENSITIVE429. retry_after=60"
        )
        mocker.patch("app.core.ai_client._get_client", return_value=mock_oa_client)

        mock_jwt(str(coach_a.supabase_user_id))
        response = client.post(
            "/v1/ai/workout-template-draft",
            headers=HEADERS,
            json={"prompt": "upper body strength"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["source"] == "fallback"
        assert data["fallback_reason"] == "upstream_error"
        assert len(data["blocks"]) == len(BASE_BLOCKS)
        assert [b["name"] for b in data["blocks"]] == BASE_BLOCKS

    def test_openai_error_does_not_leak_sensitive_data(
        self,
        client: TestClient,
        mock_jwt,
        mocker,
        coach_a: UserProfile,
    ):
        """Fallback response must not contain any upstream error details."""
        from openai import OpenAIError

        mock_oa_client = MagicMock()
        mock_oa_client.chat.completions.create.side_effect = OpenAIError(
            "Rate limit exceeded. key=sk-proj-VERYSENSITIVE429. retry_after=60"
        )
        mocker.patch("app.core.ai_client._get_client", return_value=mock_oa_client)

        mock_jwt(str(coach_a.supabase_user_id))
        response = client.post(
            "/v1/ai/workout-template-draft",
            headers=HEADERS,
            json={"prompt": "upper body strength"},
        )

        body = response.text
        assert "sk-proj" not in body
        assert "VERYSENSITIVE" not in body
        assert "retry_after" not in body

    def test_missing_api_key_falls_back_to_stub(
        self,
        client: TestClient,
        mock_jwt,
        mocker,
        coach_a: UserProfile,
    ):
        """Missing OPENAI_API_KEY must fall back to stub, not return 503."""
        mocker.patch("app.core.ai_client.get_settings", return_value=MagicMock(OPENAI_API_KEY=""))

        mock_jwt(str(coach_a.supabase_user_id))
        response = client.post(
            "/v1/ai/workout-template-draft",
            headers=HEADERS,
            json={"prompt": "upper body strength"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["source"] == "fallback"
        assert data["fallback_reason"] == "missing_api_key"
        assert len(data["blocks"]) == len(BASE_BLOCKS)
