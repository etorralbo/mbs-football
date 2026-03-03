"""
Integration tests for Exercise API authentication and authorization.

Tests:
- Authentication requirements (401)
- User onboarding requirements (403)
- Role-based access control (Coach only for all operations)
- Coach-scoped data isolation (exercises belong to the coach, not the team)
- Input validation (name, description, tags)
- Tag filtering (GET /exercises?tags=...)
- Tags autocomplete (GET /exercises/tags)
- Favourites toggle (POST /exercises/{id}/favorite)
"""
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import UserProfile, Team, Exercise

HEADERS = {"Authorization": "Bearer test-token"}

# Reusable valid payloads — satisfy all validation constraints.
_VALID_CREATE = {
    "name": "Lunges",
    "description": "Forward lunges targeting quads, glutes, and hip flexors.",
    "tags": ["strength", "lower-body"],
}


class TestExercisesAuthentication:
    """Test authentication requirements for Exercise endpoints."""

    def test_list_exercises_requires_auth(self, client: TestClient):
        """List exercises without auth token should return 401."""
        response = client.get("/v1/exercises")
        assert response.status_code == 401
        assert "Missing authentication token" in response.json()["detail"]

    def test_create_exercise_requires_auth(self, client: TestClient):
        """Create exercise without auth token should return 401."""
        response = client.post("/v1/exercises", json=_VALID_CREATE)
        assert response.status_code == 401
        assert "Missing authentication token" in response.json()["detail"]

    def test_update_exercise_requires_auth(self, client: TestClient, exercise_team_a: Exercise):
        """Update exercise without auth token should return 401."""
        response = client.patch(
            f"/v1/exercises/{exercise_team_a.id}",
            json={"name": "Updated Name"},
        )
        assert response.status_code == 401

    def test_delete_exercise_requires_auth(self, client: TestClient, exercise_team_a: Exercise):
        """Delete exercise without auth token should return 401."""
        response = client.delete(f"/v1/exercises/{exercise_team_a.id}")
        assert response.status_code == 401


class TestUserOnboarding:
    """Test that users must be onboarded (have UserProfile) to access endpoints."""

    def test_list_exercises_user_not_onboarded(self, client: TestClient, mock_jwt):
        """User with valid token but no UserProfile should get 403."""
        mock_jwt(str(uuid.uuid4()))  # Random sub with no matching UserProfile

        response = client.get("/v1/exercises", headers=HEADERS)

        assert response.status_code == 403


class TestExercisesCoachOnly:
    """Test that all exercise endpoints require COACH role."""

    def test_list_exercises_coach_ok(
        self,
        client: TestClient,
        mock_jwt,
        coach_a: UserProfile,
        exercise_team_a: Exercise,
    ):
        """Coach can list exercises from their library."""
        mock_jwt(str(coach_a.supabase_user_id))

        response = client.get("/v1/exercises", headers=HEADERS)

        assert response.status_code == 200
        exercises = response.json()
        assert isinstance(exercises, list)
        assert len(exercises) >= 1
        names = [e["name"] for e in exercises]
        assert "Squats" in names

    def test_list_exercises_response_has_required_fields(
        self,
        client: TestClient,
        mock_jwt,
        coach_a: UserProfile,
        exercise_team_a: Exercise,
    ):
        """Exercise list items must include description, tags, and is_favorite."""
        mock_jwt(str(coach_a.supabase_user_id))

        response = client.get("/v1/exercises", headers=HEADERS)

        assert response.status_code == 200
        ex = next(e for e in response.json() if e["name"] == "Squats")
        assert isinstance(ex["description"], str)
        assert isinstance(ex["tags"], list)
        assert isinstance(ex["is_favorite"], bool)

    def test_list_exercises_athlete_forbidden(
        self,
        client: TestClient,
        mock_jwt,
        athlete_a: UserProfile,
    ):
        """Athlete cannot list exercises (403)."""
        mock_jwt(str(athlete_a.supabase_user_id))

        response = client.get("/v1/exercises", headers=HEADERS)

        assert response.status_code == 403
        assert "Access denied" in response.json()["detail"]

    def test_get_single_exercise_coach_ok(
        self,
        client: TestClient,
        mock_jwt,
        coach_a: UserProfile,
        exercise_team_a: Exercise,
    ):
        """Coach can get a single exercise from their library."""
        mock_jwt(str(coach_a.supabase_user_id))

        response = client.get(f"/v1/exercises/{exercise_team_a.id}", headers=HEADERS)

        assert response.status_code == 200
        exercise = response.json()
        assert exercise["id"] == str(exercise_team_a.id)
        assert exercise["name"] == "Squats"

    def test_get_single_exercise_athlete_forbidden(
        self,
        client: TestClient,
        mock_jwt,
        athlete_a: UserProfile,
        exercise_team_a: Exercise,
    ):
        """Athlete cannot get a single exercise by ID (403)."""
        mock_jwt(str(athlete_a.supabase_user_id))

        response = client.get(f"/v1/exercises/{exercise_team_a.id}", headers=HEADERS)

        assert response.status_code == 403
        assert "Access denied" in response.json()["detail"]

    def test_list_exercises_with_search(
        self,
        client: TestClient,
        mock_jwt,
        db_session: Session,
        coach_a: UserProfile,
    ):
        """Search functionality filters exercises by name."""
        db_session.add_all([
            Exercise(
                coach_id=coach_a.id,
                name="Squats",
                description="Standard squat movement with proper form and full range of motion.",
                tags=["strength", "lower-body"],
            ),
            Exercise(
                coach_id=coach_a.id,
                name="Push-ups",
                description="Bodyweight push-up targeting chest, triceps, and anterior deltoids.",
                tags=["strength", "upper-body"],
            ),
        ])
        db_session.commit()

        mock_jwt(str(coach_a.supabase_user_id))

        response = client.get("/v1/exercises?search=squat", headers=HEADERS)

        assert response.status_code == 200
        exercises = response.json()
        names = [e["name"] for e in exercises]
        assert "Squats" in names
        assert "Push-ups" not in names


class TestExerciseValidation:
    """Test input validation for exercise creation and update."""

    @pytest.mark.parametrize("name", ["", "ab"])
    def test_create_exercise_name_too_short(
        self,
        client: TestClient,
        mock_jwt,
        coach_a: UserProfile,
        name: str,
    ):
        """Name shorter than 3 chars should return 422."""
        mock_jwt(str(coach_a.supabase_user_id))

        response = client.post(
            "/v1/exercises",
            headers=HEADERS,
            json={**_VALID_CREATE, "name": name},
        )

        assert response.status_code == 422

    def test_create_exercise_name_too_long(
        self,
        client: TestClient,
        mock_jwt,
        coach_a: UserProfile,
    ):
        """Name longer than 80 chars should return 422."""
        mock_jwt(str(coach_a.supabase_user_id))

        response = client.post(
            "/v1/exercises",
            headers=HEADERS,
            json={**_VALID_CREATE, "name": "A" * 81},
        )

        assert response.status_code == 422

    def test_create_exercise_description_too_short(
        self,
        client: TestClient,
        mock_jwt,
        coach_a: UserProfile,
    ):
        """Description shorter than 20 chars should return 422."""
        mock_jwt(str(coach_a.supabase_user_id))

        response = client.post(
            "/v1/exercises",
            headers=HEADERS,
            json={**_VALID_CREATE, "description": "Too short."},
        )

        assert response.status_code == 422

    def test_create_exercise_description_missing(
        self,
        client: TestClient,
        mock_jwt,
        coach_a: UserProfile,
    ):
        """Omitting description should return 422 (required field)."""
        mock_jwt(str(coach_a.supabase_user_id))

        response = client.post(
            "/v1/exercises",
            headers=HEADERS,
            json={"name": "Lunges", "tags": ["strength"]},
        )

        assert response.status_code == 422

    def test_create_exercise_tags_empty_list(
        self,
        client: TestClient,
        mock_jwt,
        coach_a: UserProfile,
    ):
        """Empty tags list should return 422."""
        mock_jwt(str(coach_a.supabase_user_id))

        response = client.post(
            "/v1/exercises",
            headers=HEADERS,
            json={**_VALID_CREATE, "tags": []},
        )

        assert response.status_code == 422

    def test_create_exercise_tags_missing(
        self,
        client: TestClient,
        mock_jwt,
        coach_a: UserProfile,
    ):
        """Omitting tags should return 422 (required field)."""
        mock_jwt(str(coach_a.supabase_user_id))

        response = client.post(
            "/v1/exercises",
            headers=HEADERS,
            json={"name": "Lunges", "description": "Forward lunges targeting quads and glutes."},
        )

        assert response.status_code == 422

    def test_create_exercise_tag_too_long(
        self,
        client: TestClient,
        mock_jwt,
        coach_a: UserProfile,
    ):
        """A tag exceeding 30 chars should return 422."""
        mock_jwt(str(coach_a.supabase_user_id))

        response = client.post(
            "/v1/exercises",
            headers=HEADERS,
            json={**_VALID_CREATE, "tags": ["a" * 31]},
        )

        assert response.status_code == 422

    def test_create_exercise_tags_are_normalised(
        self,
        client: TestClient,
        mock_jwt,
        coach_a: UserProfile,
    ):
        """Tags are stored lowercase, trimmed, and deduplicated."""
        mock_jwt(str(coach_a.supabase_user_id))

        response = client.post(
            "/v1/exercises",
            headers=HEADERS,
            json={
                **_VALID_CREATE,
                "name": "Tag Normalisation Test",
                "tags": ["  Strength  ", "STRENGTH", "lower-body"],
            },
        )

        assert response.status_code == 201
        tags = response.json()["tags"]
        assert tags == ["strength", "lower-body"]


class TestTagFiltering:
    """Test tag-based exercise filtering."""

    def test_filter_by_single_tag(
        self,
        client: TestClient,
        mock_jwt,
        db_session: Session,
        coach_a: UserProfile,
    ):
        """Filtering by tag returns only matching exercises."""
        db_session.add_all([
            Exercise(
                coach_id=coach_a.id,
                name="Strength Move",
                description="A strength-focused exercise for the lower body.",
                tags=["strength", "lower-body"],
            ),
            Exercise(
                coach_id=coach_a.id,
                name="Mobility Move",
                description="A mobility drill targeting the hips and ankles.",
                tags=["mobility"],
            ),
        ])
        db_session.commit()
        mock_jwt(str(coach_a.supabase_user_id))

        response = client.get("/v1/exercises?tags=strength", headers=HEADERS)

        assert response.status_code == 200
        names = [e["name"] for e in response.json()]
        assert "Strength Move" in names
        assert "Mobility Move" not in names

    def test_filter_by_multiple_tags_is_AND(
        self,
        client: TestClient,
        mock_jwt,
        db_session: Session,
        coach_a: UserProfile,
    ):
        """Filtering by multiple tags is an AND operation."""
        db_session.add_all([
            Exercise(
                coach_id=coach_a.id,
                name="Both Tags",
                description="Exercise matching both strength and lower-body tags.",
                tags=["strength", "lower-body"],
            ),
            Exercise(
                coach_id=coach_a.id,
                name="Only Strength",
                description="Strength exercise that targets the upper body primarily.",
                tags=["strength", "upper-body"],
            ),
        ])
        db_session.commit()
        mock_jwt(str(coach_a.supabase_user_id))

        response = client.get(
            "/v1/exercises?tags=strength&tags=lower-body", headers=HEADERS
        )

        assert response.status_code == 200
        names = [e["name"] for e in response.json()]
        assert "Both Tags" in names
        assert "Only Strength" not in names


class TestTagsAutocomplete:
    """Test GET /exercises/tags endpoint."""

    def test_get_tags_returns_sorted_distinct_list(
        self,
        client: TestClient,
        mock_jwt,
        db_session: Session,
        coach_a: UserProfile,
    ):
        """GET /exercises/tags returns distinct sorted tags from accessible exercises."""
        db_session.add_all([
            Exercise(
                coach_id=coach_a.id,
                name="Alpha Exercise",
                description="First exercise to test tag aggregation endpoint.",
                tags=["strength", "lower-body"],
            ),
            Exercise(
                coach_id=coach_a.id,
                name="Beta Exercise",
                description="Second exercise to test tag aggregation endpoint.",
                tags=["strength", "core"],
            ),
        ])
        db_session.commit()
        mock_jwt(str(coach_a.supabase_user_id))

        response = client.get("/v1/exercises/tags", headers=HEADERS)

        assert response.status_code == 200
        tags = response.json()
        assert isinstance(tags, list)
        assert len(tags) == len(set(tags))
        assert tags == sorted(tags)
        assert "strength" in tags
        assert "lower-body" in tags
        assert "core" in tags

    def test_get_tags_requires_coach(
        self,
        client: TestClient,
        mock_jwt,
        athlete_a: UserProfile,
    ):
        """Athlete cannot access the tags endpoint."""
        mock_jwt(str(athlete_a.supabase_user_id))

        response = client.get("/v1/exercises/tags", headers=HEADERS)

        assert response.status_code == 403


class TestFavourites:
    """Test POST /exercises/{id}/favorite — toggle bookmark."""

    def test_toggle_favorite_on(
        self,
        client: TestClient,
        mock_jwt,
        coach_a: UserProfile,
        exercise_team_a: Exercise,
    ):
        """Toggling a non-favourite exercise marks it as favourite."""
        mock_jwt(str(coach_a.supabase_user_id))

        response = client.post(
            f"/v1/exercises/{exercise_team_a.id}/favorite",
            headers=HEADERS,
        )

        assert response.status_code == 200
        body = response.json()
        assert body["is_favorite"] is True
        assert body["exercise_id"] == str(exercise_team_a.id)

    def test_toggle_favorite_off(
        self,
        client: TestClient,
        mock_jwt,
        coach_a: UserProfile,
        exercise_team_a: Exercise,
    ):
        """Toggling a favourite exercise removes the bookmark."""
        mock_jwt(str(coach_a.supabase_user_id))

        client.post(f"/v1/exercises/{exercise_team_a.id}/favorite", headers=HEADERS)
        response = client.post(
            f"/v1/exercises/{exercise_team_a.id}/favorite",
            headers=HEADERS,
        )

        assert response.status_code == 200
        assert response.json()["is_favorite"] is False

    def test_is_favorite_reflected_in_list(
        self,
        client: TestClient,
        mock_jwt,
        coach_a: UserProfile,
        exercise_team_a: Exercise,
    ):
        """After toggling favourite, is_favorite=True appears in the exercise list."""
        mock_jwt(str(coach_a.supabase_user_id))

        client.post(f"/v1/exercises/{exercise_team_a.id}/favorite", headers=HEADERS)

        list_response = client.get("/v1/exercises", headers=HEADERS)
        ex = next(e for e in list_response.json() if e["id"] == str(exercise_team_a.id))
        assert ex["is_favorite"] is True

    def test_toggle_favorite_not_found(
        self,
        client: TestClient,
        mock_jwt,
        coach_a: UserProfile,
    ):
        """Toggling favourite on a non-existent exercise returns 404."""
        mock_jwt(str(coach_a.supabase_user_id))

        response = client.post(
            f"/v1/exercises/{uuid.uuid4()}/favorite",
            headers=HEADERS,
        )

        assert response.status_code == 404

    def test_favorite_isolation_between_coaches(
        self,
        client: TestClient,
        mock_jwt,
        coach_a: UserProfile,
        coach_b: UserProfile,
        exercise_team_a: Exercise,
    ):
        """Coach B cannot favourite an exercise that belongs to Coach A (IDOR)."""
        # exercise_team_a is a COACH exercise owned by coach_a — invisible to coach_b
        mock_jwt(str(coach_b.supabase_user_id))
        response = client.post(
            f"/v1/exercises/{exercise_team_a.id}/favorite",
            headers=HEADERS,
        )
        assert response.status_code == 404


class TestRoleBasedAccessControl:
    """Test that only coaches can create/update/delete exercises."""

    def test_create_exercise_coach_ok(
        self,
        client: TestClient,
        mock_jwt,
        coach_a: UserProfile,
    ):
        """Coach can create exercises with valid payload."""
        mock_jwt(str(coach_a.supabase_user_id))

        response = client.post("/v1/exercises", headers=HEADERS, json=_VALID_CREATE)

        assert response.status_code == 201
        exercise = response.json()
        assert exercise["name"] == "Lunges"
        assert exercise["coach_id"] == str(coach_a.id)
        assert exercise["tags"] == ["strength", "lower-body"]
        assert exercise["is_favorite"] is False

    def test_create_exercise_athlete_forbidden(
        self,
        client: TestClient,
        mock_jwt,
        athlete_a: UserProfile,
    ):
        """Athlete cannot create exercises (403)."""
        mock_jwt(str(athlete_a.supabase_user_id))

        response = client.post("/v1/exercises", headers=HEADERS, json=_VALID_CREATE)

        assert response.status_code == 403
        assert "Access denied" in response.json()["detail"]

    def test_update_exercise_coach_ok(
        self,
        client: TestClient,
        mock_jwt,
        coach_a: UserProfile,
        exercise_team_a: Exercise,
    ):
        """Coach can update exercises."""
        mock_jwt(str(coach_a.supabase_user_id))

        response = client.patch(
            f"/v1/exercises/{exercise_team_a.id}",
            headers=HEADERS,
            json={"name": "Advanced Squats"},
        )

        assert response.status_code == 200
        assert response.json()["name"] == "Advanced Squats"

    def test_update_exercise_athlete_forbidden(
        self,
        client: TestClient,
        mock_jwt,
        athlete_a: UserProfile,
        exercise_team_a: Exercise,
    ):
        """Athlete cannot update exercises (403)."""
        mock_jwt(str(athlete_a.supabase_user_id))

        response = client.patch(
            f"/v1/exercises/{exercise_team_a.id}",
            headers=HEADERS,
            json={"name": "Advanced Squats"},
        )

        assert response.status_code == 403
        assert "Access denied" in response.json()["detail"]

    def test_delete_exercise_coach_ok(
        self,
        client: TestClient,
        mock_jwt,
        db_session: Session,
        coach_a: UserProfile,
    ):
        """Coach can delete exercises."""
        exercise = Exercise(
            coach_id=coach_a.id,
            name="Temp Exercise",
            description="Temporary exercise created to test the delete endpoint.",
            tags=["strength"],
        )
        db_session.add(exercise)
        db_session.commit()
        db_session.refresh(exercise)

        mock_jwt(str(coach_a.supabase_user_id))

        response = client.delete(f"/v1/exercises/{exercise.id}", headers=HEADERS)

        assert response.status_code == 204

    def test_delete_exercise_athlete_forbidden(
        self,
        client: TestClient,
        mock_jwt,
        athlete_a: UserProfile,
        exercise_team_a: Exercise,
    ):
        """Athlete cannot delete exercises (403)."""
        mock_jwt(str(athlete_a.supabase_user_id))

        response = client.delete(f"/v1/exercises/{exercise_team_a.id}", headers=HEADERS)

        assert response.status_code == 403


class TestExerciseInUseDeletion:
    """Deleting an exercise used in a template block must return 409."""

    def test_delete_exercise_in_use_returns_409(
        self,
        client: TestClient,
        mock_jwt,
        db_session: Session,
        coach_a: UserProfile,
        exercise_team_a: Exercise,
    ):
        """Coach cannot delete an exercise that is referenced by a block item (409)."""
        from app.models import WorkoutTemplate, WorkoutBlock, BlockExercise

        template = WorkoutTemplate(
            id=uuid.uuid4(),
            team_id=coach_a.team_id,
            title="Test Template",
        )
        db_session.add(template)
        db_session.flush()

        block = WorkoutBlock(
            id=uuid.uuid4(),
            workout_template_id=template.id,
            order_index=0,
            name="Block A",
        )
        db_session.add(block)
        db_session.flush()

        item = BlockExercise(
            id=uuid.uuid4(),
            workout_block_id=block.id,
            exercise_id=exercise_team_a.id,
            order_index=0,
        )
        db_session.add(item)
        db_session.commit()

        mock_jwt(str(coach_a.supabase_user_id))
        response = client.delete(f"/v1/exercises/{exercise_team_a.id}", headers=HEADERS)

        assert response.status_code == 409
        assert "in use" in response.json()["detail"].lower()

    def test_delete_unused_exercise_still_returns_204(
        self,
        client: TestClient,
        mock_jwt,
        db_session: Session,
        coach_a: UserProfile,
    ):
        """Deleting an exercise not referenced by any block item still works (204)."""
        exercise = Exercise(
            id=uuid.uuid4(),
            coach_id=coach_a.id,
            name="Unused Exercise",
            description="Exercise with no block items referencing it at all.",
            tags=["strength"],
        )
        db_session.add(exercise)
        db_session.commit()

        mock_jwt(str(coach_a.supabase_user_id))
        response = client.delete(f"/v1/exercises/{exercise.id}", headers=HEADERS)

        assert response.status_code == 204


class TestCoachIsolation:
    """Test that exercises are properly isolated by coach (not team)."""

    def test_coach_isolation_list(
        self,
        client: TestClient,
        mock_jwt,
        db_session: Session,
        coach_a: UserProfile,
        coach_b: UserProfile,
    ):
        """Exercises from coach A are not visible to coach B."""
        db_session.add_all([
            Exercise(
                coach_id=coach_a.id,
                name="Coach A Exercise",
                description="Private exercise exclusive to coach A personal library.",
                tags=["strength"],
            ),
            Exercise(
                coach_id=coach_b.id,
                name="Coach B Exercise",
                description="Private exercise exclusive to coach B personal library.",
                tags=["strength"],
            ),
        ])
        db_session.commit()

        mock_jwt(str(coach_a.supabase_user_id))
        response_a = client.get("/v1/exercises", headers=HEADERS)

        assert response_a.status_code == 200
        names_a = [e["name"] for e in response_a.json()]
        assert "Coach A Exercise" in names_a
        assert "Coach B Exercise" not in names_a

        mock_jwt(str(coach_b.supabase_user_id))
        response_b = client.get("/v1/exercises", headers=HEADERS)

        assert response_b.status_code == 200
        names_b = [e["name"] for e in response_b.json()]
        assert "Coach B Exercise" in names_b
        assert "Coach A Exercise" not in names_b

    def test_coach_isolation_get_single(
        self,
        client: TestClient,
        mock_jwt,
        db_session: Session,
        coach_a: UserProfile,
        coach_b: UserProfile,
    ):
        """Coach B cannot access an exercise belonging to coach A by ID (IDOR prevention)."""
        exercise_a = Exercise(
            coach_id=coach_a.id,
            name="Coach A Secret Exercise",
            description="Secret exercise belonging exclusively to coach A.",
            tags=["strength"],
        )
        db_session.add(exercise_a)
        db_session.commit()
        db_session.refresh(exercise_a)

        mock_jwt(str(coach_b.supabase_user_id))

        response = client.get(f"/v1/exercises/{exercise_a.id}", headers=HEADERS)

        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_coach_isolation_update(
        self,
        client: TestClient,
        mock_jwt,
        db_session: Session,
        coach_a: UserProfile,
        coach_b: UserProfile,
    ):
        """Coach B cannot update an exercise belonging to coach A (IDOR prevention)."""
        exercise_a = Exercise(
            coach_id=coach_a.id,
            name="Coach A Exercise",
            description="Exercise exclusively owned by coach A in their library.",
            tags=["strength"],
        )
        db_session.add(exercise_a)
        db_session.commit()
        db_session.refresh(exercise_a)

        mock_jwt(str(coach_b.supabase_user_id))

        response = client.patch(
            f"/v1/exercises/{exercise_a.id}",
            headers=HEADERS,
            json={"name": "Hacked Name"},
        )

        assert response.status_code == 404

    def test_coach_isolation_delete(
        self,
        client: TestClient,
        mock_jwt,
        db_session: Session,
        coach_a: UserProfile,
        coach_b: UserProfile,
    ):
        """Coach B cannot delete an exercise belonging to coach A (IDOR prevention)."""
        exercise_a = Exercise(
            coach_id=coach_a.id,
            name="Coach A Exercise",
            description="Exercise exclusively owned by coach A in their library.",
            tags=["strength"],
        )
        db_session.add(exercise_a)
        db_session.commit()
        db_session.refresh(exercise_a)

        mock_jwt(str(coach_b.supabase_user_id))

        response = client.delete(f"/v1/exercises/{exercise_a.id}", headers=HEADERS)

        assert response.status_code == 404

        db_session.expire_all()
        assert db_session.get(Exercise, exercise_a.id) is not None
