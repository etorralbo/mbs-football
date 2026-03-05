"""Tests for DELETE /v1/teams/{team_id}."""
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import (
    Exercise,
    Membership,
    Role,
    Team,
    UserProfile,
    WorkoutAssignment,
    WorkoutSession,
    WorkoutTemplate,
)


AUTH = {"Authorization": "Bearer test-token"}


def _make_team(db: Session, *, created_by: uuid.UUID, name: str = "Test Team") -> Team:
    team = Team(id=uuid.uuid4(), name=name, created_by_user_id=created_by)
    db.add(team)
    db.flush()
    return team


def _make_coach(db: Session, *, team: Team, supabase_uid: uuid.UUID | None = None) -> UserProfile:
    uid = supabase_uid or uuid.uuid4()
    profile = UserProfile(
        id=uuid.uuid4(),
        supabase_user_id=uid,
        team_id=team.id,
        role=Role.COACH,
        name="Coach",
    )
    db.add(profile)
    db.flush()
    db.add(Membership(id=uuid.uuid4(), user_id=uid, team_id=team.id, role=Role.COACH))
    db.flush()
    return profile


def _make_athlete(db: Session, *, team: Team) -> UserProfile:
    uid = uuid.uuid4()
    profile = UserProfile(
        id=uuid.uuid4(),
        supabase_user_id=uid,
        team_id=team.id,
        role=Role.ATHLETE,
        name="Athlete",
    )
    db.add(profile)
    db.flush()
    db.add(Membership(id=uuid.uuid4(), user_id=uid, team_id=team.id, role=Role.ATHLETE))
    db.flush()
    return profile


class TestDeleteTeam:
    """DELETE /v1/teams/{team_id}"""

    def test_delete_team_success_empty_team_returns_204(
        self, client: TestClient, db_session: Session, mock_jwt
    ) -> None:
        """Coach creator can delete an empty team (no athletes, no sessions, no exercises)."""
        creator_uid = uuid.uuid4()
        team = _make_team(db_session, created_by=creator_uid)
        _make_coach(db_session, team=team, supabase_uid=creator_uid)
        db_session.commit()

        mock_jwt(str(creator_uid))
        resp = client.delete(f"/v1/teams/{team.id}", headers=AUTH)

        assert resp.status_code == 204

        # Team should be gone from the database
        db_session.expire_all()
        assert db_session.get(Team, team.id) is None

    def test_delete_team_not_owner_returns_403(
        self, client: TestClient, db_session: Session, mock_jwt
    ) -> None:
        """A coach member who is NOT the creator gets 403."""
        creator_uid = uuid.uuid4()
        team = _make_team(db_session, created_by=creator_uid)
        _make_coach(db_session, team=team, supabase_uid=creator_uid)

        # Second coach — member but not creator
        other_uid = uuid.uuid4()
        _make_coach(db_session, team=team, supabase_uid=other_uid)
        db_session.commit()

        mock_jwt(str(other_uid))
        resp = client.delete(
            f"/v1/teams/{team.id}",
            headers={**AUTH, "X-Team-Id": str(team.id)},
        )

        assert resp.status_code == 403
        assert "owner" in resp.json()["detail"].lower()

    def test_delete_team_has_athletes_returns_403(
        self, client: TestClient, db_session: Session, mock_jwt
    ) -> None:
        """Cannot delete a team that still has athlete members."""
        creator_uid = uuid.uuid4()
        team = _make_team(db_session, created_by=creator_uid)
        _make_coach(db_session, team=team, supabase_uid=creator_uid)
        _make_athlete(db_session, team=team)
        db_session.commit()

        mock_jwt(str(creator_uid))
        resp = client.delete(f"/v1/teams/{team.id}", headers=AUTH)

        assert resp.status_code == 403
        assert "athlete" in resp.json()["detail"].lower()

    def test_delete_team_has_sessions_returns_403(
        self, client: TestClient, db_session: Session, mock_jwt
    ) -> None:
        """Cannot delete a team that has workout sessions."""
        creator_uid = uuid.uuid4()
        team = _make_team(db_session, created_by=creator_uid)
        coach = _make_coach(db_session, team=team, supabase_uid=creator_uid)

        # Create a user_profile for the athlete (needed for session FK)
        # but NO athlete membership — so the "has_athletes" guard won't trigger.
        athlete_profile = UserProfile(
            id=uuid.uuid4(),
            supabase_user_id=uuid.uuid4(),
            team_id=team.id,
            role=Role.ATHLETE,
            name="Ex-Athlete",
        )
        db_session.add(athlete_profile)
        db_session.flush()

        template = WorkoutTemplate(
            id=uuid.uuid4(), team_id=team.id, title="Template", status="draft",
        )
        db_session.add(template)
        db_session.flush()

        assignment = WorkoutAssignment(
            id=uuid.uuid4(),
            team_id=team.id,
            workout_template_id=template.id,
            target_type="team",
        )
        db_session.add(assignment)
        db_session.flush()

        session = WorkoutSession(
            id=uuid.uuid4(),
            assignment_id=assignment.id,
            athlete_id=athlete_profile.id,
            workout_template_id=template.id,
        )
        db_session.add(session)
        db_session.commit()

        mock_jwt(str(creator_uid))
        resp = client.delete(f"/v1/teams/{team.id}", headers=AUTH)

        assert resp.status_code == 403
        assert "session" in resp.json()["detail"].lower()

    def test_delete_team_not_found_returns_404(
        self, client: TestClient, db_session: Session, mock_jwt
    ) -> None:
        """Deleting a non-existent team returns 404 (also for IDOR prevention)."""
        creator_uid = uuid.uuid4()
        # Need a team+membership so get_current_user works
        team = _make_team(db_session, created_by=creator_uid)
        _make_coach(db_session, team=team, supabase_uid=creator_uid)
        db_session.commit()

        mock_jwt(str(creator_uid))
        fake_team_id = uuid.uuid4()
        resp = client.delete(
            f"/v1/teams/{fake_team_id}",
            headers={**AUTH, "X-Team-Id": str(team.id)},
        )

        assert resp.status_code == 404

    def test_delete_team_athlete_cannot_delete_returns_403(
        self, client: TestClient, db_session: Session, mock_jwt
    ) -> None:
        """An athlete member cannot delete the team (role check before ownership)."""
        creator_uid = uuid.uuid4()
        team = _make_team(db_session, created_by=creator_uid)
        _make_coach(db_session, team=team, supabase_uid=creator_uid)

        athlete = _make_athlete(db_session, team=team)
        db_session.commit()

        mock_jwt(str(athlete.supabase_user_id))
        resp = client.delete(
            f"/v1/teams/{team.id}",
            headers={**AUTH, "X-Team-Id": str(team.id)},
        )

        assert resp.status_code == 403

    def test_delete_team_with_coach_exercises_returns_403(
        self, client: TestClient, db_session: Session, mock_jwt
    ) -> None:
        """Cannot delete team if coach has exercises (would cascade-delete them via user_profile)."""
        creator_uid = uuid.uuid4()
        team = _make_team(db_session, created_by=creator_uid)
        coach = _make_coach(db_session, team=team, supabase_uid=creator_uid)

        exercise = Exercise(
            id=uuid.uuid4(),
            coach_id=coach.id,
            name="Squats",
            description="Standard squat movement with proper form and full range.",
            tags=["strength"],
        )
        db_session.add(exercise)
        db_session.commit()

        mock_jwt(str(creator_uid))
        resp = client.delete(f"/v1/teams/{team.id}", headers=AUTH)

        assert resp.status_code == 403
        assert "coach-owned resources" in resp.json()["detail"].lower()

    def test_delete_team_other_coach_team_returns_404(
        self, client: TestClient, db_session: Session, mock_jwt
    ) -> None:
        """Coach A trying to delete Coach B's team gets 404 (no enumeration)."""
        coach_a_uid = uuid.uuid4()
        team_a = _make_team(db_session, created_by=coach_a_uid, name="Team A")
        _make_coach(db_session, team=team_a, supabase_uid=coach_a_uid)

        coach_b_uid = uuid.uuid4()
        team_b = _make_team(db_session, created_by=coach_b_uid, name="Team B")
        _make_coach(db_session, team=team_b, supabase_uid=coach_b_uid)
        db_session.commit()

        mock_jwt(str(coach_a_uid))
        resp = client.delete(
            f"/v1/teams/{team_b.id}",
            headers={**AUTH, "X-Team-Id": str(team_a.id)},
        )

        assert resp.status_code == 404
