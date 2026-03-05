"""Tests for GET /v1/me."""
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Membership, Role, Team


AUTH = {"Authorization": "Bearer test-token"}


class TestGetMe:
    def test_no_auth_returns_401(self, client: TestClient) -> None:
        resp = client.get("/v1/me")
        assert resp.status_code == 401

    def test_no_memberships_returns_empty_list(
        self, client: TestClient, mock_jwt
    ) -> None:
        user_id = uuid.uuid4()
        mock_jwt(str(user_id))
        resp = client.get("/v1/me", headers=AUTH)
        assert resp.status_code == 200
        body = resp.json()
        assert body["user_id"] == str(user_id)
        assert body["memberships"] == []
        assert body["active_team_id"] is None

    def test_single_membership_sets_active_team(
        self, client: TestClient, db_session: Session, mock_jwt
    ) -> None:
        user_id = uuid.uuid4()
        team = Team(id=uuid.uuid4(), created_by_user_id=uuid.uuid4(), name="Me-Test Team")
        db_session.add(team)
        db_session.flush()
        m = Membership(id=uuid.uuid4(), user_id=user_id, team_id=team.id, role=Role.COACH)
        db_session.add(m)
        db_session.commit()

        mock_jwt(str(user_id))
        resp = client.get("/v1/me", headers=AUTH)
        assert resp.status_code == 200
        body = resp.json()
        assert len(body["memberships"]) == 1
        assert body["memberships"][0]["role"] == "COACH"
        assert body["memberships"][0]["team_name"] == "Me-Test Team"
        assert body["active_team_id"] == str(team.id)

    def test_multiple_memberships_active_team_is_none(
        self, client: TestClient, db_session: Session, mock_jwt
    ) -> None:
        user_id = uuid.uuid4()
        for i in range(2):
            team = Team(id=uuid.uuid4(), created_by_user_id=uuid.uuid4(), name=f"Multi-Team {i}")
            db_session.add(team)
            db_session.flush()
            m = Membership(
                id=uuid.uuid4(), user_id=user_id, team_id=team.id, role=Role.ATHLETE
            )
            db_session.add(m)
        db_session.commit()

        mock_jwt(str(user_id))
        resp = client.get("/v1/me", headers=AUTH)
        assert resp.status_code == 200
        body = resp.json()
        assert len(body["memberships"]) == 2
        assert body["active_team_id"] is None
