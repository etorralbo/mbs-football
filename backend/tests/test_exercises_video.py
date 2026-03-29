"""
Integration tests for YouTube video support on Exercise endpoints.

Tests cover:
  - CREATE with/without video
  - CREATE with invalid video URL (422)
  - UPDATE with video (attach, replace, clear, leave unchanged)
  - GET exercises — video field present in all responses
  - Backward compat: existing exercises without video return video=null
"""
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.exercise import Exercise
from app.models.user_profile import UserProfile

# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

HEADERS = {"Authorization": "Bearer test-token"}

_VALID_YOUTUBE_URL = "https://www.youtube.com/watch?v=dQw4w9WgXcW"
_EXPECTED_ID = "dQw4w9WgXcW"
_CANONICAL_URL = f"https://www.youtube.com/watch?v={_EXPECTED_ID}"

_BASE_EXERCISE = {
    "name": "Video Test Exercise",
    "description": "Exercise used to test YouTube video attachment features.",
    "tags": ["strength"],
}


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def coach_jwt(coach_a: UserProfile, mock_jwt) -> UserProfile:
    """Return coach_a with a mocked JWT active."""
    mock_jwt(str(coach_a.supabase_user_id))
    return coach_a


@pytest.fixture
def exercise_no_video(db_session: Session, coach_a: UserProfile) -> Exercise:
    """Exercise with no video — tests backward compat."""
    ex = Exercise(
        id=uuid.uuid4(),
        coach_id=coach_a.id,
        name="No Video Exercise",
        description="This exercise has no video attached to it for testing.",
        tags=["strength"],
    )
    db_session.add(ex)
    db_session.commit()
    db_session.refresh(ex)
    return ex


@pytest.fixture
def exercise_with_video(db_session: Session, coach_a: UserProfile) -> Exercise:
    """Exercise with all video columns pre-set."""
    ex = Exercise(
        id=uuid.uuid4(),
        coach_id=coach_a.id,
        name="Has Video Exercise",
        description="This exercise already has a YouTube video attached.",
        tags=["strength"],
        video_provider="YOUTUBE",
        video_url=_CANONICAL_URL,
        video_external_id=_EXPECTED_ID,
    )
    db_session.add(ex)
    db_session.commit()
    db_session.refresh(ex)
    return ex


# ---------------------------------------------------------------------------
# CREATE — POST /v1/exercises
# ---------------------------------------------------------------------------

class TestCreateExerciseVideo:

    def test_create_with_valid_youtube_url_returns_video(
        self, client: TestClient, coach_jwt: UserProfile
    ) -> None:
        payload = {
            **_BASE_EXERCISE,
            "name": "Nordic Curl",
            "video": {"provider": "YOUTUBE", "url": _VALID_YOUTUBE_URL},
        }
        resp = client.post("/v1/exercises", json=payload, headers=HEADERS)
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["video"] is not None
        assert body["video"]["provider"] == "YOUTUBE"
        assert body["video"]["external_id"] == _EXPECTED_ID
        assert body["video"]["url"] == _CANONICAL_URL

    def test_create_with_short_youtube_url(
        self, client: TestClient, coach_jwt: UserProfile
    ) -> None:
        payload = {
            **_BASE_EXERCISE,
            "name": "Short URL Exercise",
            "video": {"provider": "YOUTUBE", "url": "https://youtu.be/dQw4w9WgXcW"},
        }
        resp = client.post("/v1/exercises", json=payload, headers=HEADERS)
        assert resp.status_code == 201, resp.text
        assert resp.json()["video"]["external_id"] == _EXPECTED_ID
        # Canonical URL always returned regardless of input format
        assert resp.json()["video"]["url"] == _CANONICAL_URL

    def test_create_without_video_returns_null(
        self, client: TestClient, coach_jwt: UserProfile
    ) -> None:
        payload = {**_BASE_EXERCISE, "name": "No Video Exercise Create"}
        resp = client.post("/v1/exercises", json=payload, headers=HEADERS)
        assert resp.status_code == 201, resp.text
        assert resp.json()["video"] is None

    def test_create_with_invalid_url_returns_422(
        self, client: TestClient, coach_jwt: UserProfile
    ) -> None:
        payload = {
            **_BASE_EXERCISE,
            "name": "Bad Video Exercise",
            "video": {"provider": "YOUTUBE", "url": "https://vimeo.com/123456789"},
        }
        resp = client.post("/v1/exercises", json=payload, headers=HEADERS)
        assert resp.status_code == 422

    def test_create_with_non_youtube_returns_422(
        self, client: TestClient, coach_jwt: UserProfile
    ) -> None:
        payload = {
            **_BASE_EXERCISE,
            "name": "Dailymotion Exercise",
            "video": {"provider": "YOUTUBE", "url": "https://dailymotion.com/video/abc"},
        }
        resp = client.post("/v1/exercises", json=payload, headers=HEADERS)
        assert resp.status_code == 422

    def test_create_with_malformed_url_returns_422(
        self, client: TestClient, coach_jwt: UserProfile
    ) -> None:
        payload = {
            **_BASE_EXERCISE,
            "name": "Bad URL Exercise",
            "video": {"provider": "YOUTUBE", "url": "not-a-url"},
        }
        resp = client.post("/v1/exercises", json=payload, headers=HEADERS)
        assert resp.status_code == 422

    def test_create_with_youtube_url_missing_id_returns_422(
        self, client: TestClient, coach_jwt: UserProfile
    ) -> None:
        payload = {
            **_BASE_EXERCISE,
            "name": "Missing ID Exercise",
            "video": {"provider": "YOUTUBE", "url": "https://www.youtube.com/watch"},
        }
        resp = client.post("/v1/exercises", json=payload, headers=HEADERS)
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# UPDATE — PATCH /v1/exercises/{id}
# ---------------------------------------------------------------------------

class TestUpdateExerciseVideo:

    def test_patch_attaches_video(
        self, client: TestClient, coach_jwt: UserProfile, exercise_no_video: Exercise
    ) -> None:
        resp = client.patch(
            f"/v1/exercises/{exercise_no_video.id}",
            json={"video": {"provider": "YOUTUBE", "url": _VALID_YOUTUBE_URL}},
            headers=HEADERS,
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["video"]["external_id"] == _EXPECTED_ID
        assert body["video"]["url"] == _CANONICAL_URL

    def test_patch_replaces_video(
        self, client: TestClient, coach_jwt: UserProfile, exercise_with_video: Exercise
    ) -> None:
        new_id = "abcdefghijk"
        resp = client.patch(
            f"/v1/exercises/{exercise_with_video.id}",
            json={"video": {"provider": "YOUTUBE", "url": f"https://youtu.be/{new_id}"}},
            headers=HEADERS,
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["video"]["external_id"] == new_id

    def test_patch_null_clears_video(
        self, client: TestClient, coach_jwt: UserProfile, exercise_with_video: Exercise
    ) -> None:
        resp = client.patch(
            f"/v1/exercises/{exercise_with_video.id}",
            json={"video": None},
            headers=HEADERS,
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["video"] is None

    def test_patch_omitting_video_leaves_it_unchanged(
        self, client: TestClient, coach_jwt: UserProfile, exercise_with_video: Exercise
    ) -> None:
        resp = client.patch(
            f"/v1/exercises/{exercise_with_video.id}",
            json={"name": "Updated Name For Video Exercise"},
            headers=HEADERS,
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["name"] == "Updated Name For Video Exercise"
        # Video must be preserved
        assert body["video"] is not None
        assert body["video"]["external_id"] == _EXPECTED_ID

    def test_patch_video_invalid_url_returns_422(
        self, client: TestClient, coach_jwt: UserProfile, exercise_no_video: Exercise
    ) -> None:
        resp = client.patch(
            f"/v1/exercises/{exercise_no_video.id}",
            json={"video": {"provider": "YOUTUBE", "url": "https://vimeo.com/999"}},
            headers=HEADERS,
        )
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# GET — backward compatibility
# ---------------------------------------------------------------------------

class TestGetExerciseVideoBackwardCompat:

    def test_list_exercises_includes_video_field(
        self, client: TestClient, coach_jwt: UserProfile, exercise_no_video: Exercise
    ) -> None:
        """All exercises in list response must have a 'video' key (null or object)."""
        resp = client.get("/v1/exercises", headers=HEADERS)
        assert resp.status_code == 200
        exercises = resp.json()
        assert len(exercises) > 0
        for ex in exercises:
            assert "video" in ex

    def test_existing_exercise_without_video_returns_null(
        self, client: TestClient, coach_jwt: UserProfile, exercise_no_video: Exercise
    ) -> None:
        resp = client.get(f"/v1/exercises/{exercise_no_video.id}", headers=HEADERS)
        assert resp.status_code == 200
        assert resp.json()["video"] is None

    def test_exercise_with_video_returns_video_object(
        self, client: TestClient, coach_jwt: UserProfile, exercise_with_video: Exercise
    ) -> None:
        resp = client.get(f"/v1/exercises/{exercise_with_video.id}", headers=HEADERS)
        assert resp.status_code == 200
        body = resp.json()
        assert body["video"] is not None
        assert body["video"]["provider"] == "YOUTUBE"
        assert body["video"]["external_id"] == _EXPECTED_ID
