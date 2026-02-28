"""
Integration tests for GET /v1/workout-sessions/{session_id}/execution.

Four invariant groups:
1. Auth / RBAC  — 401, 403, 404 for cross-tenant access
2. Response shape — session_id, status, workout_template_id, blocks[].items[]
3. Block/item order — blocks sorted by order_index, items by order_index
4. Log merge — logged sets appear inside the matching ExerciseExecutionOut;
   unlogged exercises have logs: []
"""
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.block_exercise import BlockExercise
from app.models.workout_assignment import WorkoutAssignment
from app.models.workout_block import WorkoutBlock
from app.models.workout_session import WorkoutSession
from app.models.workout_session_log import WorkoutSessionLog
from app.models.workout_session_log_entry import WorkoutSessionLogEntry
from app.models.workout_template import WorkoutTemplate
from app.models.user_profile import Role, UserProfile
from app.models.membership import Membership
from tests.conftest import Team

HEADERS = {"Authorization": "Bearer test-token"}


# ---------------------------------------------------------------------------
# Local fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def exercise_b(db_session: Session, team_a) -> "Exercise":
    from app.models.exercise import Exercise
    ex = Exercise(id=uuid.uuid4(), team_id=team_a.id, name="Romanian Deadlift")
    db_session.add(ex)
    db_session.flush()
    return ex


@pytest.fixture
def template_a(db_session: Session, team_a, exercise_team_a, exercise_b):
    """
    Template with 2 blocks:
      block 0 "Primary Strength" → exercise_team_a (order 0)
      block 1 "Recovery"         → exercise_b       (order 0)
    """
    tpl = WorkoutTemplate(id=uuid.uuid4(), team_id=team_a.id, title="Sprint Power")
    db_session.add(tpl)
    db_session.flush()

    block0 = WorkoutBlock(
        id=uuid.uuid4(), workout_template_id=tpl.id,
        name="Primary Strength", order_index=0,
    )
    block1 = WorkoutBlock(
        id=uuid.uuid4(), workout_template_id=tpl.id,
        name="Recovery", order_index=1,
    )
    db_session.add_all([block0, block1])
    db_session.flush()

    db_session.add(BlockExercise(
        id=uuid.uuid4(), workout_block_id=block0.id,
        exercise_id=exercise_team_a.id, order_index=0,
        prescription_json={"sets": 3, "reps": "5", "load": "85%"},
    ))
    db_session.add(BlockExercise(
        id=uuid.uuid4(), workout_block_id=block1.id,
        exercise_id=exercise_b.id, order_index=0,
        prescription_json={"duration": "60s"},
    ))
    db_session.commit()
    db_session.refresh(tpl)
    return tpl


@pytest.fixture
def assignment_a(db_session: Session, team_a, template_a):
    asgn = WorkoutAssignment(
        id=uuid.uuid4(), team_id=team_a.id,
        workout_template_id=template_a.id, target_type="athlete",
    )
    db_session.add(asgn)
    db_session.commit()
    return asgn


@pytest.fixture
def session_a(db_session: Session, assignment_a, athlete_a, template_a):
    sess = WorkoutSession(
        id=uuid.uuid4(), assignment_id=assignment_a.id,
        athlete_id=athlete_a.id, workout_template_id=template_a.id,
    )
    db_session.add(sess)
    db_session.commit()
    return sess


@pytest.fixture
def session_a_with_log(db_session: Session, session_a, athlete_a, team_a, exercise_team_a):
    """session_a with one log (2 sets) in Primary Strength for exercise_team_a."""
    log = WorkoutSessionLog(
        id=uuid.uuid4(), team_id=team_a.id, session_id=session_a.id,
        block_name="Primary Strength", exercise_id=exercise_team_a.id,
        notes="Felt strong", created_by_profile_id=athlete_a.id,
    )
    db_session.add(log)
    db_session.flush()
    db_session.add(WorkoutSessionLogEntry(
        id=uuid.uuid4(), log_id=log.id, set_number=1, reps=5, weight=100.0, rpe=8.0,
    ))
    db_session.add(WorkoutSessionLogEntry(
        id=uuid.uuid4(), log_id=log.id, set_number=2, reps=5, weight=100.0, rpe=8.5,
    ))
    db_session.commit()
    return session_a


@pytest.fixture
def athlete_b(db_session: Session, team_b) -> UserProfile:
    athlete = UserProfile(
        id=uuid.uuid4(), supabase_user_id=uuid.uuid4(),
        team_id=team_b.id, role=Role.ATHLETE, name="Athlete Beta",
    )
    db_session.add(athlete)
    db_session.flush()
    db_session.add(Membership(
        id=uuid.uuid4(), user_id=athlete.supabase_user_id,
        team_id=team_b.id, role=Role.ATHLETE,
    ))
    db_session.commit()
    db_session.refresh(athlete)
    return athlete


# ---------------------------------------------------------------------------
# Tests — Auth / RBAC
# ---------------------------------------------------------------------------

class TestSessionExecutionAuth:

    def test_requires_auth(self, client: TestClient):
        response = client.get(f"/v1/workout-sessions/{uuid.uuid4()}/execution")
        assert response.status_code == 401

    def test_not_onboarded_returns_403(
        self, client: TestClient, mock_jwt,
    ):
        mock_jwt(str(uuid.uuid4()))  # valid JWT, no membership
        response = client.get(
            f"/v1/workout-sessions/{uuid.uuid4()}/execution",
            headers=HEADERS,
        )
        assert response.status_code == 403

    def test_coach_b_cannot_see_team_a_session(
        self, client: TestClient, mock_jwt, coach_b, session_a,
    ):
        mock_jwt(str(coach_b.supabase_user_id))
        response = client.get(
            f"/v1/workout-sessions/{session_a.id}/execution",
            headers=HEADERS,
        )
        assert response.status_code == 404

    def test_athlete_cannot_see_other_athletes_session(
        self, client: TestClient, mock_jwt, athlete_b, session_a,
    ):
        """athlete_b (team B) cannot see session_a (athlete_a, team A) → 404."""
        mock_jwt(str(athlete_b.supabase_user_id))
        response = client.get(
            f"/v1/workout-sessions/{session_a.id}/execution",
            headers=HEADERS,
        )
        assert response.status_code == 404

    def test_unknown_session_returns_404(
        self, client: TestClient, mock_jwt, coach_a,
    ):
        mock_jwt(str(coach_a.supabase_user_id))
        response = client.get(
            f"/v1/workout-sessions/{uuid.uuid4()}/execution",
            headers=HEADERS,
        )
        assert response.status_code == 404


# ---------------------------------------------------------------------------
# Tests — Response shape
# ---------------------------------------------------------------------------

class TestSessionExecutionShape:

    def test_coach_gets_200(
        self, client: TestClient, mock_jwt, coach_a, session_a,
    ):
        mock_jwt(str(coach_a.supabase_user_id))
        response = client.get(
            f"/v1/workout-sessions/{session_a.id}/execution",
            headers=HEADERS,
        )
        assert response.status_code == 200

    def test_athlete_owner_gets_200(
        self, client: TestClient, mock_jwt, athlete_a, session_a,
    ):
        mock_jwt(str(athlete_a.supabase_user_id))
        response = client.get(
            f"/v1/workout-sessions/{session_a.id}/execution",
            headers=HEADERS,
        )
        assert response.status_code == 200

    def test_top_level_fields(
        self, client: TestClient, mock_jwt, coach_a, session_a, template_a,
    ):
        mock_jwt(str(coach_a.supabase_user_id))
        data = client.get(
            f"/v1/workout-sessions/{session_a.id}/execution",
            headers=HEADERS,
        ).json()

        assert data["session_id"] == str(session_a.id)
        assert data["status"] == "pending"
        assert data["workout_template_id"] == str(template_a.id)
        assert isinstance(data["blocks"], list)

    def test_blocks_contain_prescribed_exercises(
        self, client: TestClient, mock_jwt, coach_a, session_a,
        exercise_team_a, exercise_b,
    ):
        mock_jwt(str(coach_a.supabase_user_id))
        data = client.get(
            f"/v1/workout-sessions/{session_a.id}/execution",
            headers=HEADERS,
        ).json()

        all_exercise_ids = {
            item["exercise_id"]
            for block in data["blocks"]
            for item in block["items"]
        }
        assert str(exercise_team_a.id) in all_exercise_ids
        assert str(exercise_b.id) in all_exercise_ids

    def test_exercise_item_schema(
        self, client: TestClient, mock_jwt, coach_a, session_a,
    ):
        """Each item must have exercise_id, exercise_name, prescription, logs."""
        mock_jwt(str(coach_a.supabase_user_id))
        data = client.get(
            f"/v1/workout-sessions/{session_a.id}/execution",
            headers=HEADERS,
        ).json()

        item = data["blocks"][0]["items"][0]
        assert set(item.keys()) >= {"exercise_id", "exercise_name", "prescription", "logs"}

    def test_prescription_json_is_preserved(
        self, client: TestClient, mock_jwt, coach_a, session_a,
    ):
        mock_jwt(str(coach_a.supabase_user_id))
        data = client.get(
            f"/v1/workout-sessions/{session_a.id}/execution",
            headers=HEADERS,
        ).json()

        primary_block = next(b for b in data["blocks"] if b["name"] == "Primary Strength")
        item = primary_block["items"][0]
        assert item["prescription"] == {"sets": 3, "reps": "5", "load": "85%"}


# ---------------------------------------------------------------------------
# Tests — Ordering
# ---------------------------------------------------------------------------

class TestSessionExecutionOrder:

    def test_blocks_are_ordered_by_order_index(
        self, client: TestClient, mock_jwt, coach_a, session_a,
    ):
        mock_jwt(str(coach_a.supabase_user_id))
        data = client.get(
            f"/v1/workout-sessions/{session_a.id}/execution",
            headers=HEADERS,
        ).json()

        orders = [b["order"] for b in data["blocks"]]
        assert orders == sorted(orders)

    def test_block_names_match_template(
        self, client: TestClient, mock_jwt, coach_a, session_a,
    ):
        mock_jwt(str(coach_a.supabase_user_id))
        data = client.get(
            f"/v1/workout-sessions/{session_a.id}/execution",
            headers=HEADERS,
        ).json()

        names = [b["name"] for b in data["blocks"]]
        assert names == ["Primary Strength", "Recovery"]


# ---------------------------------------------------------------------------
# Tests — Log merge
# ---------------------------------------------------------------------------

class TestSessionExecutionLogMerge:

    def test_unlogged_exercises_have_empty_logs(
        self, client: TestClient, mock_jwt, coach_a, session_a,
    ):
        """No logs recorded yet → every item.logs == []."""
        mock_jwt(str(coach_a.supabase_user_id))
        data = client.get(
            f"/v1/workout-sessions/{session_a.id}/execution",
            headers=HEADERS,
        ).json()

        for block in data["blocks"]:
            for item in block["items"]:
                assert item["logs"] == []

    def test_logged_sets_appear_in_matching_item(
        self, client: TestClient, mock_jwt, coach_a,
        session_a_with_log, exercise_team_a,
    ):
        mock_jwt(str(coach_a.supabase_user_id))
        data = client.get(
            f"/v1/workout-sessions/{session_a_with_log.id}/execution",
            headers=HEADERS,
        ).json()

        primary_block = next(b for b in data["blocks"] if b["name"] == "Primary Strength")
        item = next(i for i in primary_block["items"] if i["exercise_id"] == str(exercise_team_a.id))

        assert len(item["logs"]) == 2
        assert item["logs"][0]["set_number"] == 1
        assert item["logs"][0]["reps"] == 5
        assert item["logs"][0]["weight"] == 100.0
        assert item["logs"][0]["rpe"] == 8.0

    def test_unlogged_exercise_still_empty_when_sibling_is_logged(
        self, client: TestClient, mock_jwt, coach_a,
        session_a_with_log, exercise_b,
    ):
        """exercise_b (Recovery block) was not logged — its logs must stay []."""
        mock_jwt(str(coach_a.supabase_user_id))
        data = client.get(
            f"/v1/workout-sessions/{session_a_with_log.id}/execution",
            headers=HEADERS,
        ).json()

        recovery_block = next(b for b in data["blocks"] if b["name"] == "Recovery")
        item = next(i for i in recovery_block["items"] if i["exercise_id"] == str(exercise_b.id))
        assert item["logs"] == []

    def test_set_log_has_done_true(
        self, client: TestClient, mock_jwt, coach_a,
        session_a_with_log, exercise_team_a,
    ):
        mock_jwt(str(coach_a.supabase_user_id))
        data = client.get(
            f"/v1/workout-sessions/{session_a_with_log.id}/execution",
            headers=HEADERS,
        ).json()

        primary_block = next(b for b in data["blocks"] if b["name"] == "Primary Strength")
        item = next(i for i in primary_block["items"] if i["exercise_id"] == str(exercise_team_a.id))
        assert all(s["done"] is True for s in item["logs"])

    def test_sets_ordered_by_set_number(
        self, client: TestClient, mock_jwt, coach_a,
        session_a_with_log, exercise_team_a,
    ):
        mock_jwt(str(coach_a.supabase_user_id))
        data = client.get(
            f"/v1/workout-sessions/{session_a_with_log.id}/execution",
            headers=HEADERS,
        ).json()

        primary_block = next(b for b in data["blocks"] if b["name"] == "Primary Strength")
        item = next(i for i in primary_block["items"] if i["exercise_id"] == str(exercise_team_a.id))
        set_numbers = [s["set_number"] for s in item["logs"]]
        assert set_numbers == sorted(set_numbers)
