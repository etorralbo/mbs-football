"""
Integration tests for company-managed (COMPANY) exercise access control.

Covers:
  - Coach sees both COMPANY and own COACH exercises in the list.
  - COMPANY exercises appear before COACH exercises in sorted order.
  - Coach does NOT see other coaches' COACH exercises.
  - Coach can GET a COMPANY exercise by ID.
  - Coach cannot PATCH a COMPANY exercise (403).
  - Coach cannot DELETE a COMPANY exercise (403).
  - Coach CAN PATCH their own COACH exercise.
  - Coach CAN DELETE their own COACH exercise.
  - search works across both COMPANY and COACH exercises.
"""
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Exercise, OwnerType, UserProfile

HEADERS = {"Authorization": "Bearer test-token"}


@pytest.fixture
def company_exercise(db_session: Session) -> Exercise:
    """A COMPANY-owned exercise (global, read-only).

    Uses a name outside the seed dataset so it doesn't conflict with the
    data migration that already seeds 'Back Squat', 'Nordic Hamstring Curl',
    etc. via `alembic upgrade head` in conftest.
    """
    ex = Exercise(
        id=uuid.uuid4(),
        coach_id=None,
        owner_type=OwnerType.COMPANY,
        is_editable=False,
        name="Zercher Squat",
        tags="strength, legs",
    )
    db_session.add(ex)
    db_session.commit()
    db_session.refresh(ex)
    return ex


@pytest.fixture
def another_company_exercise(db_session: Session) -> Exercise:
    """A second COMPANY exercise used for sort-order tests."""
    ex = Exercise(
        id=uuid.uuid4(),
        coach_id=None,
        owner_type=OwnerType.COMPANY,
        is_editable=False,
        name="Svend Press",
    )
    db_session.add(ex)
    db_session.commit()
    db_session.refresh(ex)
    return ex


class TestCompanyExerciseVisibility:
    """A coach should see COMPANY exercises together with their own exercises."""

    def test_coach_sees_company_and_own_exercises(
        self,
        client: TestClient,
        mock_jwt,
        db_session: Session,
        coach_a: UserProfile,
        company_exercise: Exercise,
    ):
        """List returns both COMPANY exercises and the coach's own exercises."""
        own = Exercise(coach_id=coach_a.id, name="My Custom Move",
                       owner_type=OwnerType.COACH, is_editable=True)
        db_session.add(own)
        db_session.commit()

        mock_jwt(str(coach_a.supabase_user_id))
        resp = client.get("/v1/exercises", headers=HEADERS)

        assert resp.status_code == 200
        names = [e["name"] for e in resp.json()]
        assert company_exercise.name in names
        assert own.name in names

    def test_company_exercises_appear_before_coach_exercises(
        self,
        client: TestClient,
        mock_jwt,
        db_session: Session,
        coach_a: UserProfile,
        company_exercise: Exercise,
    ):
        """COMPANY exercises are returned before COACH exercises in the list."""
        own = Exercise(coach_id=coach_a.id, name="AAA First Alphabetically",
                       owner_type=OwnerType.COACH, is_editable=True)
        db_session.add(own)
        db_session.commit()

        mock_jwt(str(coach_a.supabase_user_id))
        resp = client.get("/v1/exercises", headers=HEADERS)

        assert resp.status_code == 200
        result = resp.json()
        company_indices = [i for i, e in enumerate(result) if e["owner_type"] == "COMPANY"]
        coach_indices = [i for i, e in enumerate(result) if e["owner_type"] == "COACH"]
        # Every company exercise index must be less than every coach exercise index.
        assert all(ci < oi for ci in company_indices for oi in coach_indices)

    def test_coach_does_not_see_other_coach_exercises(
        self,
        client: TestClient,
        mock_jwt,
        db_session: Session,
        coach_a: UserProfile,
        coach_b: UserProfile,
        company_exercise: Exercise,
    ):
        """Coach A cannot see Coach B's custom exercises (isolation preserved)."""
        exercise_b = Exercise(
            coach_id=coach_b.id,
            name="Coach B Secret Move",
            owner_type=OwnerType.COACH,
            is_editable=True,
        )
        db_session.add(exercise_b)
        db_session.commit()

        mock_jwt(str(coach_a.supabase_user_id))
        resp = client.get("/v1/exercises", headers=HEADERS)

        assert resp.status_code == 200
        names = [e["name"] for e in resp.json()]
        assert company_exercise.name in names        # COMPANY: visible ✓
        assert exercise_b.name not in names           # COACH B:  hidden ✓

    def test_coach_can_get_company_exercise_by_id(
        self,
        client: TestClient,
        mock_jwt,
        coach_a: UserProfile,
        company_exercise: Exercise,
    ):
        """GET /exercises/{id} returns a COMPANY exercise to any coach."""
        mock_jwt(str(coach_a.supabase_user_id))
        resp = client.get(f"/v1/exercises/{company_exercise.id}", headers=HEADERS)

        assert resp.status_code == 200
        body = resp.json()
        assert body["id"] == str(company_exercise.id)
        assert body["owner_type"] == "COMPANY"
        assert body["is_editable"] is False
        assert body["coach_id"] is None

    def test_company_exercise_fields_in_response(
        self,
        client: TestClient,
        mock_jwt,
        coach_a: UserProfile,
        company_exercise: Exercise,
    ):
        """ExerciseOut includes owner_type and is_editable for every exercise."""
        mock_jwt(str(coach_a.supabase_user_id))
        resp = client.get("/v1/exercises", headers=HEADERS)

        assert resp.status_code == 200
        company_items = [e for e in resp.json() if e["owner_type"] == "COMPANY"]
        assert len(company_items) >= 1
        item = company_items[0]
        assert item["is_editable"] is False
        assert item["coach_id"] is None

    def test_search_includes_company_and_own_exercises(
        self,
        client: TestClient,
        mock_jwt,
        db_session: Session,
        coach_a: UserProfile,
    ):
        """Search query filters across both COMPANY and COACH exercises.

        "Back Squat" is already present via the seed migration — no fixture needed.
        """
        own_squat = Exercise(coach_id=coach_a.id, name="Front Squat",
                             owner_type=OwnerType.COACH, is_editable=True)
        other = Exercise(coach_id=coach_a.id, name="Bench Press",
                         owner_type=OwnerType.COACH, is_editable=True)
        db_session.add_all([own_squat, other])
        db_session.commit()

        mock_jwt(str(coach_a.supabase_user_id))
        resp = client.get("/v1/exercises?search=squat", headers=HEADERS)

        assert resp.status_code == 200
        names = [e["name"] for e in resp.json()]
        assert "Back Squat" in names    # COMPANY (seeded by migration)
        assert "Front Squat" in names   # COACH (own)
        assert "Bench Press" not in names


class TestCompanyExerciseMutationBlocked:
    """Coaches must not be able to edit or delete company exercises."""

    def test_patch_company_exercise_returns_403(
        self,
        client: TestClient,
        mock_jwt,
        coach_a: UserProfile,
        company_exercise: Exercise,
    ):
        """PATCH on a COMPANY exercise returns 403 Forbidden."""
        mock_jwt(str(coach_a.supabase_user_id))
        resp = client.patch(
            f"/v1/exercises/{company_exercise.id}",
            headers=HEADERS,
            json={"name": "Hacked Name"},
        )

        assert resp.status_code == 403
        assert "cannot be modified" in resp.json()["detail"].lower()

    def test_delete_company_exercise_returns_403(
        self,
        client: TestClient,
        mock_jwt,
        coach_a: UserProfile,
        company_exercise: Exercise,
    ):
        """DELETE on a COMPANY exercise returns 403 Forbidden."""
        mock_jwt(str(coach_a.supabase_user_id))
        resp = client.delete(f"/v1/exercises/{company_exercise.id}", headers=HEADERS)

        assert resp.status_code == 403
        assert "cannot be modified" in resp.json()["detail"].lower()

    def test_company_exercise_unchanged_after_attempted_patch(
        self,
        client: TestClient,
        mock_jwt,
        db_session: Session,
        coach_a: UserProfile,
        company_exercise: Exercise,
    ):
        """The COMPANY exercise row is not modified after a rejected PATCH."""
        mock_jwt(str(coach_a.supabase_user_id))
        client.patch(
            f"/v1/exercises/{company_exercise.id}",
            headers=HEADERS,
            json={"name": "Attempted Override"},
        )

        db_session.expire_all()
        unchanged = db_session.get(Exercise, company_exercise.id)
        assert unchanged is not None
        assert unchanged.name == company_exercise.name


class TestCoachExerciseMutationAllowed:
    """Coaches can still edit and delete their own COACH exercises."""

    def test_coach_can_patch_own_exercise(
        self,
        client: TestClient,
        mock_jwt,
        db_session: Session,
        coach_a: UserProfile,
    ):
        """PATCH on the coach's own exercise succeeds."""
        own = Exercise(coach_id=coach_a.id, name="My Lunge",
                       owner_type=OwnerType.COACH, is_editable=True)
        db_session.add(own)
        db_session.commit()
        db_session.refresh(own)

        mock_jwt(str(coach_a.supabase_user_id))
        resp = client.patch(
            f"/v1/exercises/{own.id}",
            headers=HEADERS,
            json={"name": "Bulgarian Split Squat"},
        )

        assert resp.status_code == 200
        assert resp.json()["name"] == "Bulgarian Split Squat"
        assert resp.json()["is_editable"] is True

    def test_coach_can_delete_own_exercise(
        self,
        client: TestClient,
        mock_jwt,
        db_session: Session,
        coach_a: UserProfile,
    ):
        """DELETE on the coach's own exercise succeeds."""
        own = Exercise(coach_id=coach_a.id, name="Temp Exercise",
                       owner_type=OwnerType.COACH, is_editable=True)
        db_session.add(own)
        db_session.commit()
        db_session.refresh(own)

        mock_jwt(str(coach_a.supabase_user_id))
        resp = client.delete(f"/v1/exercises/{own.id}", headers=HEADERS)

        assert resp.status_code == 204
        db_session.expire_all()
        assert db_session.get(Exercise, own.id) is None

    def test_create_always_produces_coach_exercise(
        self,
        client: TestClient,
        mock_jwt,
        coach_a: UserProfile,
    ):
        """POST /exercises always creates owner_type=COACH, is_editable=True."""
        mock_jwt(str(coach_a.supabase_user_id))
        resp = client.post(
            "/v1/exercises",
            headers=HEADERS,
            json={"name": "New Personal Move"},
        )

        assert resp.status_code == 201
        body = resp.json()
        assert body["owner_type"] == "COACH"
        assert body["is_editable"] is True
        assert body["coach_id"] == str(coach_a.id)


# ---------------------------------------------------------------------------
# Seeding tests — assert that the data migration inserts COMPANY exercises
# ---------------------------------------------------------------------------

class TestSeededCompanyExercises:
    """
    The Alembic data migration c4d5e6f7a8b9 seeds a curated COMPANY dataset.
    These tests verify that the seeded rows are present and well-formed after
    the conftest runs `alembic upgrade head` against the test database.

    We spot-check a representative sample rather than asserting the full list
    so the tests remain green even if the seed list is later extended.
    """

    _EXPECTED_NAMES = [
        "Back Squat",
        "Nordic Hamstring Curl",
        "Bench Press",
        "Pull Up",
        "Plank",
        "Box Jump",
        "Farmer's Carry",
    ]

    def test_seeded_company_exercises_appear_in_list(
        self,
        client: TestClient,
        mock_jwt,
        coach_a: UserProfile,
    ):
        """List endpoint returns the seeded COMPANY exercises."""
        mock_jwt(str(coach_a.supabase_user_id))
        resp = client.get("/v1/exercises", headers=HEADERS)

        assert resp.status_code == 200
        names = {e["name"] for e in resp.json()}
        for expected in self._EXPECTED_NAMES:
            assert expected in names, f"Seeded exercise '{expected}' missing from list"

    def test_seeded_company_exercises_have_correct_fields(
        self,
        client: TestClient,
        mock_jwt,
        coach_a: UserProfile,
    ):
        """Every seeded COMPANY exercise has owner_type=COMPANY, is_editable=False, coach_id=None."""
        mock_jwt(str(coach_a.supabase_user_id))
        resp = client.get("/v1/exercises", headers=HEADERS)

        assert resp.status_code == 200
        company_items = [e for e in resp.json() if e["owner_type"] == "COMPANY"]
        assert len(company_items) >= len(self._EXPECTED_NAMES)
        for item in company_items:
            assert item["is_editable"] is False, f"{item['name']}: expected is_editable=False"
            assert item["coach_id"] is None, f"{item['name']}: expected coach_id=None"

    def test_seeded_exercises_appear_before_coach_exercises(
        self,
        client: TestClient,
        mock_jwt,
        db_session: Session,
        coach_a: UserProfile,
    ):
        """Seeded COMPANY exercises are ordered before any COACH exercises."""
        own = Exercise(
            coach_id=coach_a.id,
            name="AAA Always First Alphabetically",
            owner_type=OwnerType.COACH,
            is_editable=True,
        )
        db_session.add(own)
        db_session.commit()

        mock_jwt(str(coach_a.supabase_user_id))
        resp = client.get("/v1/exercises", headers=HEADERS)

        assert resp.status_code == 200
        result = resp.json()
        company_indices = [i for i, e in enumerate(result) if e["owner_type"] == "COMPANY"]
        coach_indices = [i for i, e in enumerate(result) if e["owner_type"] == "COACH"]
        assert company_indices, "No COMPANY exercises found in response"
        assert coach_indices, "No COACH exercises found in response"
        assert all(ci < oi for ci in company_indices for oi in coach_indices), (
            "COMPANY exercises must precede COACH exercises"
        )

    def test_seeding_is_idempotent(
        self,
        client: TestClient,
        mock_jwt,
        db_session: Session,
        coach_a: UserProfile,
    ):
        """
        Manually re-inserting the same COMPANY name should conflict-silently:
        the upsert must not create duplicates.
        """
        # Simulate what the migration does — insert same name again.
        from sqlalchemy import text
        db_session.execute(
            text("""
                INSERT INTO exercises
                    (id, owner_type, is_editable, coach_id, name, created_at, updated_at)
                VALUES
                    (gen_random_uuid(), 'COMPANY', FALSE, NULL, 'Back Squat', NOW(), NOW())
                ON CONFLICT (name) WHERE owner_type = 'COMPANY'
                DO NOTHING
            """)
        )
        db_session.commit()

        mock_jwt(str(coach_a.supabase_user_id))
        resp = client.get("/v1/exercises", headers=HEADERS)

        assert resp.status_code == 200
        back_squat_rows = [e for e in resp.json() if e["name"] == "Back Squat"]
        assert len(back_squat_rows) == 1, "Duplicate COMPANY exercise was created"
