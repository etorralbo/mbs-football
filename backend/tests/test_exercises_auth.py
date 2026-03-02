"""
Integration tests for Exercise API authentication and authorization.

Tests:
- Authentication requirements (401)
- User onboarding requirements (403)
- Role-based access control (Coach only for all operations)
- Coach-scoped data isolation (exercises belong to the coach, not the team)
"""
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import UserProfile, Team, Exercise

HEADERS = {"Authorization": "Bearer test-token"}


class TestExercisesAuthentication:
    """Test authentication requirements for Exercise endpoints."""

    def test_list_exercises_requires_auth(self, client: TestClient):
        """List exercises without auth token should return 401."""
        response = client.get("/v1/exercises")
        assert response.status_code == 401
        assert "Missing authentication token" in response.json()["detail"]

    def test_create_exercise_requires_auth(self, client: TestClient):
        """Create exercise without auth token should return 401."""
        response = client.post(
            "/v1/exercises",
            json={"name": "Test Exercise", "description": "Test"},
        )
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
        assert exercises[0]["name"] == "Squats"

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
            Exercise(coach_id=coach_a.id, name="Squats", description="Basic squats"),
            Exercise(coach_id=coach_a.id, name="Push-ups", description="Basic push-ups"),
        ])
        db_session.commit()

        mock_jwt(str(coach_a.supabase_user_id))

        response = client.get("/v1/exercises?search=squat", headers=HEADERS)

        assert response.status_code == 200
        exercises = response.json()
        assert len(exercises) == 1
        assert exercises[0]["name"] == "Squats"


class TestRoleBasedAccessControl:
    """Test that only coaches can create/update/delete exercises."""

    def test_create_exercise_coach_ok(
        self,
        client: TestClient,
        mock_jwt,
        coach_a: UserProfile,
    ):
        """Coach can create exercises."""
        mock_jwt(str(coach_a.supabase_user_id))

        response = client.post(
            "/v1/exercises",
            headers=HEADERS,
            json={"name": "Lunges", "description": "Forward lunges", "tags": "strength, legs"},
        )

        assert response.status_code == 201
        exercise = response.json()
        assert exercise["name"] == "Lunges"
        assert exercise["coach_id"] == str(coach_a.id)

    def test_create_exercise_athlete_forbidden(
        self,
        client: TestClient,
        mock_jwt,
        athlete_a: UserProfile,
    ):
        """Athlete cannot create exercises (403)."""
        mock_jwt(str(athlete_a.supabase_user_id))

        response = client.post(
            "/v1/exercises",
            headers=HEADERS,
            json={"name": "Lunges", "description": "Forward lunges"},
        )

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
        exercise = Exercise(coach_id=coach_a.id, name="Temp Exercise", description="To be deleted")
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
            Exercise(coach_id=coach_a.id, name="Coach A Exercise", description="Exclusive to Coach A"),
            Exercise(coach_id=coach_b.id, name="Coach B Exercise", description="Exclusive to Coach B"),
        ])
        db_session.commit()

        # Coach A sees only their exercises
        mock_jwt(str(coach_a.supabase_user_id))
        response_a = client.get("/v1/exercises", headers=HEADERS)

        assert response_a.status_code == 200
        names_a = [e["name"] for e in response_a.json()]
        assert "Coach A Exercise" in names_a
        assert "Coach B Exercise" not in names_a

        # Coach B sees only their exercises
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
        exercise_a = Exercise(coach_id=coach_a.id, name="Coach A Secret Exercise")
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
        exercise_a = Exercise(coach_id=coach_a.id, name="Coach A Exercise")
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
        exercise_a = Exercise(coach_id=coach_a.id, name="Coach A Exercise")
        db_session.add(exercise_a)
        db_session.commit()
        db_session.refresh(exercise_a)

        mock_jwt(str(coach_b.supabase_user_id))

        response = client.delete(f"/v1/exercises/{exercise_a.id}", headers=HEADERS)

        assert response.status_code == 404

        # Verify exercise still exists in the database
        db_session.expire_all()
        assert db_session.get(Exercise, exercise_a.id) is not None
