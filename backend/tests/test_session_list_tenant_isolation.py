"""
Regression tests — list_by_athlete must enforce the team_id guard.

Scenario exploited before the fix:
    list_by_athlete(athlete_id)          ← no team scope
    → could return sessions that belong to a different tenant
      if the athlete_id was known/guessed.

After the fix:
    list_by_athlete(athlete_id, team_id) ← JOIN to UserProfile.team_id
    → an athlete_id from team A paired with team_b.id returns nothing.

Two layers of coverage:
  1. Repository unit test  — calls the repo method directly with a mismatched
                             team_id and asserts an empty result.
  2. HTTP integration test — athlete from team B cannot see sessions that
                             belong to team A's athletes.
"""
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Membership, Role, Team, UserProfile, WorkoutTemplate
from app.persistence.repositories.workout_session_repository import (
    SqlAlchemyWorkoutSessionRepository,
)

HEADERS = {"Authorization": "Bearer test-token"}
ASSIGN_ENDPOINT = "/v1/workout-assignments"
SESSIONS_ENDPOINT = "/v1/workout-sessions"


# ---------------------------------------------------------------------------
# Local fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def workout_template_a(db_session: Session, team_a: Team) -> WorkoutTemplate:
    t = WorkoutTemplate(id=uuid.uuid4(), team_id=team_a.id, title="Team A Template")
    db_session.add(t)
    db_session.commit()
    db_session.refresh(t)
    return t


@pytest.fixture
def athlete_b(db_session: Session, team_b: Team) -> UserProfile:
    athlete = UserProfile(
        id=uuid.uuid4(),
        supabase_user_id=uuid.uuid4(),
        team_id=team_b.id,
        role=Role.ATHLETE,
        name="Athlete Beta",
    )
    db_session.add(athlete)
    db_session.flush()
    db_session.add(Membership(
        id=uuid.uuid4(),
        user_id=athlete.supabase_user_id,
        team_id=team_b.id,
        role=Role.ATHLETE,
    ))
    db_session.commit()
    db_session.refresh(athlete)
    return athlete


# ---------------------------------------------------------------------------
# Helper: create one session for athlete_a via the assignment API
# ---------------------------------------------------------------------------

def _assign_to_athlete_a(
    client: TestClient,
    mock_jwt,
    coach_a: UserProfile,
    template_a: WorkoutTemplate,
    athlete_a: UserProfile,
) -> None:
    mock_jwt(str(coach_a.supabase_user_id))
    r = client.post(
        ASSIGN_ENDPOINT,
        headers=HEADERS,
        json={
            "workout_template_id": str(template_a.id),
            "target": {"type": "athlete", "athlete_id": str(athlete_a.id)},
        },
    )
    assert r.status_code == 201, r.text
    assert r.json()["sessions_created"] == 1


# ---------------------------------------------------------------------------
# 1 · Repository-level test: team_id guard is enforced inside the repo itself
# ---------------------------------------------------------------------------

class TestListByAthleteTenantGuard:
    """
    Directly exercises SqlAlchemyWorkoutSessionRepository.list_by_athlete
    to prove the team_id filter is active at the lowest possible layer.
    """

    def test_correct_team_returns_the_session(
        self,
        client: TestClient,
        mock_jwt,
        db_session: Session,
        coach_a: UserProfile,
        workout_template_a: WorkoutTemplate,
        athlete_a: UserProfile,
        team_a: Team,
    ):
        """Sanity check: correct (athlete_id, team_id) pair → 1 result."""
        _assign_to_athlete_a(client, mock_jwt, coach_a, workout_template_a, athlete_a)

        repo = SqlAlchemyWorkoutSessionRepository(db_session)
        results = repo.list_by_athlete(athlete_a.id, team_a.id)

        assert len(results) == 1
        assert results[0].athlete_id == athlete_a.id

    def test_wrong_team_id_returns_nothing(
        self,
        client: TestClient,
        mock_jwt,
        db_session: Session,
        coach_a: UserProfile,
        workout_template_a: WorkoutTemplate,
        athlete_a: UserProfile,
        team_b: Team,
    ):
        """
        Regression: athlete_a's sessions exist but calling list_by_athlete with
        team_b.id must return an empty list.

        Before the fix (no team guard):
            list_by_athlete(athlete_a.id)
            → returned athlete_a's session regardless of team

        After the fix (JOIN to UserProfile.team_id):
            list_by_athlete(athlete_a.id, team_b.id)
            → athlete_a is in team_a, so the JOIN filter removes the row → []
        """
        _assign_to_athlete_a(client, mock_jwt, coach_a, workout_template_a, athlete_a)

        repo = SqlAlchemyWorkoutSessionRepository(db_session)
        # athlete_a belongs to team_a; passing team_b.id must yield nothing
        results = repo.list_by_athlete(athlete_a.id, team_b.id)

        assert results == [], (
            "list_by_athlete must not return sessions when team_id does not match "
            "the athlete's own team — cross-tenant leakage detected."
        )


# ---------------------------------------------------------------------------
# 2 · HTTP integration test: end-to-end isolation via the GET /workout-sessions
# ---------------------------------------------------------------------------

class TestSessionListCrossTenantIsolation:
    """
    An athlete authenticated as team B must never see sessions that belong
    to team A's athletes, even after a team-wide assignment in team A.
    """

    def test_athlete_b_cannot_see_team_a_sessions(
        self,
        client: TestClient,
        mock_jwt,
        coach_a: UserProfile,
        workout_template_a: WorkoutTemplate,
        athlete_a: UserProfile,
        athlete_b: UserProfile,
    ):
        """
        1. Create a session for athlete_a (team A).
        2. athlete_b (team B) hits GET /workout-sessions.
        3. Response must be an empty list — not athlete_a's session.
        """
        _assign_to_athlete_a(client, mock_jwt, coach_a, workout_template_a, athlete_a)

        # athlete_b logs in and fetches their sessions
        mock_jwt(str(athlete_b.supabase_user_id))
        r = client.get(SESSIONS_ENDPOINT, headers=HEADERS)

        assert r.status_code == 200
        assert r.json() == [], (
            "athlete_b (team B) must receive an empty session list — "
            "sessions from team A must not be visible across tenant boundaries."
        )


# ---------------------------------------------------------------------------
# 3 · athlete_name is included in the list response
# ---------------------------------------------------------------------------

class TestSessionListAthleteName:
    """
    GET /workout-sessions must include athlete_name in every row so that
    coaches can distinguish sessions belonging to different athletes.
    """

    def test_coach_sees_athlete_name(
        self,
        client: TestClient,
        mock_jwt,
        coach_a: UserProfile,
        workout_template_a: WorkoutTemplate,
        athlete_a: UserProfile,
    ):
        """Coach list response includes the athlete's display name."""
        _assign_to_athlete_a(client, mock_jwt, coach_a, workout_template_a, athlete_a)

        mock_jwt(str(coach_a.supabase_user_id))
        r = client.get(SESSIONS_ENDPOINT, headers=HEADERS)

        assert r.status_code == 200
        data = r.json()
        assert len(data) == 1
        assert data[0]["athlete_name"] == athlete_a.name

    def test_athlete_sees_own_name(
        self,
        client: TestClient,
        mock_jwt,
        coach_a: UserProfile,
        workout_template_a: WorkoutTemplate,
        athlete_a: UserProfile,
    ):
        """Athlete list response also includes athlete_name (their own)."""
        _assign_to_athlete_a(client, mock_jwt, coach_a, workout_template_a, athlete_a)

        mock_jwt(str(athlete_a.supabase_user_id))
        r = client.get(SESSIONS_ENDPOINT, headers=HEADERS)

        assert r.status_code == 200
        data = r.json()
        assert len(data) == 1
        assert data[0]["athlete_name"] == athlete_a.name
