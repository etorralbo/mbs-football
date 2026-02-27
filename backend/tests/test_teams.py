"""Tests for POST /v1/teams."""
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Membership, Role, Team


AUTH = {"Authorization": "Bearer test-token"}


class TestCreateTeam:
    def test_no_auth_returns_401(self, client: TestClient) -> None:
        resp = client.post("/v1/teams", json={"name": "My Team"})
        assert resp.status_code == 401

    def test_empty_name_returns_422(self, client: TestClient, mock_jwt) -> None:
        mock_jwt(str(uuid.uuid4()))
        resp = client.post("/v1/teams", json={"name": ""}, headers=AUTH)
        assert resp.status_code == 422

    def test_happy_path_creates_team_and_membership(
        self, client: TestClient, db_session: Session, mock_jwt
    ) -> None:
        user_id = uuid.uuid4()
        mock_jwt(str(user_id))

        resp = client.post("/v1/teams", json={"name": "FC Test"}, headers=AUTH)

        assert resp.status_code == 201
        body = resp.json()
        assert body["role"] == "COACH"
        assert "team_id" in body
        assert "membership_id" in body

        # Membership and UserProfile must exist in DB
        from app.models import UserProfile
        from sqlalchemy import select

        m = db_session.execute(
            select(Membership).where(Membership.user_id == user_id)
        ).scalar_one_or_none()
        assert m is not None
        assert m.role == Role.COACH

        p = db_session.execute(
            select(UserProfile).where(UserProfile.supabase_user_id == user_id)
        ).scalar_one_or_none()
        assert p is not None
        assert p.role == Role.COACH

    def test_second_team_returns_409(
        self, client: TestClient, db_session: Session, mock_jwt
    ) -> None:
        user_id = uuid.uuid4()
        # Pre-create a COACH membership
        team = Team(id=uuid.uuid4(), name="Existing Team")
        db_session.add(team)
        db_session.flush()
        m = Membership(id=uuid.uuid4(), user_id=user_id, team_id=team.id, role=Role.COACH)
        db_session.add(m)
        db_session.commit()

        mock_jwt(str(user_id))
        resp = client.post("/v1/teams", json={"name": "New Team"}, headers=AUTH)
        assert resp.status_code == 409
        assert "already manage" in resp.json()["detail"]

    def test_athlete_can_create_team(
        self, client: TestClient, db_session: Session, mock_jwt
    ) -> None:
        """An ATHLETE membership does not block creating a new team (COACH is a separate role)."""
        user_id = uuid.uuid4()
        team = Team(id=uuid.uuid4(), name="Athlete's Original Team")
        db_session.add(team)
        db_session.flush()
        m = Membership(
            id=uuid.uuid4(), user_id=user_id, team_id=team.id, role=Role.ATHLETE
        )
        db_session.add(m)
        db_session.commit()

        mock_jwt(str(user_id))
        resp = client.post("/v1/teams", json={"name": "New Coach Team"}, headers=AUTH)
        assert resp.status_code == 201
