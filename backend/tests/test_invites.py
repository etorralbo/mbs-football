"""Tests for POST /v1/team-invites and POST /v1/team-invites/{token}/accept."""
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Invite, Membership, Role, Team


AUTH = {"Authorization": "Bearer test-token"}


# ---------------------------------------------------------------------------
# POST /v1/team-invites
# ---------------------------------------------------------------------------

class TestCreateInvite:
    def test_no_auth_returns_401(self, client: TestClient) -> None:
        resp = client.post("/v1/team-invites", json={"team_id": str(uuid.uuid4())})
        assert resp.status_code == 401

    def test_non_coach_returns_403(
        self, client: TestClient, db_session: Session, mock_jwt
    ) -> None:
        user_id = uuid.uuid4()
        team = Team(id=uuid.uuid4(), name="Invite-403 Team")
        db_session.add(team)
        db_session.flush()
        m = Membership(
            id=uuid.uuid4(), user_id=user_id, team_id=team.id, role=Role.ATHLETE
        )
        db_session.add(m)
        db_session.commit()

        mock_jwt(str(user_id))
        resp = client.post(
            "/v1/team-invites", json={"team_id": str(team.id)}, headers=AUTH
        )
        assert resp.status_code == 403

    def test_coach_creates_invite_happy_path(
        self, client: TestClient, db_session: Session, mock_jwt
    ) -> None:
        user_id = uuid.uuid4()
        team = Team(id=uuid.uuid4(), name="Invite-Happy Team")
        db_session.add(team)
        db_session.flush()
        m = Membership(
            id=uuid.uuid4(), user_id=user_id, team_id=team.id, role=Role.COACH
        )
        db_session.add(m)
        db_session.commit()

        mock_jwt(str(user_id))
        resp = client.post(
            "/v1/team-invites",
            json={"team_id": str(team.id)},
            headers=AUTH,
        )
        assert resp.status_code == 201
        body = resp.json()
        assert "token" in body
        assert len(body["token"]) >= 43  # secrets.token_urlsafe(32) → 43 chars
        assert "/join/" in body["join_url"]
        assert body["token"] in body["join_url"]
        assert body["team_id"] == str(team.id)
        assert body["expires_at"] is not None  # default 7 days

    def test_default_expires_in_7_days(
        self, client: TestClient, db_session: Session, mock_jwt
    ) -> None:
        """When expires_in_days is omitted the invite expires in 7 days."""
        user_id = uuid.uuid4()
        team = Team(id=uuid.uuid4(), name="Expiry Default Team")
        db_session.add(team)
        db_session.flush()
        db_session.add(
            Membership(id=uuid.uuid4(), user_id=user_id, team_id=team.id, role=Role.COACH)
        )
        db_session.commit()

        mock_jwt(str(user_id))
        resp = client.post("/v1/team-invites", json={"team_id": str(team.id)}, headers=AUTH)
        assert resp.status_code == 201
        expires_at = resp.json()["expires_at"]
        assert expires_at is not None
        parsed = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
        delta = parsed - datetime.now(timezone.utc)
        assert timedelta(days=6, hours=23, minutes=59, seconds=50) < delta < timedelta(days=7, seconds=10)

    def test_coach_different_team_returns_403(
        self, client: TestClient, db_session: Session, mock_jwt
    ) -> None:
        """A coach cannot create an invite for a team they don't belong to."""
        user_id = uuid.uuid4()
        own_team = Team(id=uuid.uuid4(), name="Own Team 2")
        other_team = Team(id=uuid.uuid4(), name="Other Team 2")
        db_session.add_all([own_team, other_team])
        db_session.flush()
        m = Membership(
            id=uuid.uuid4(), user_id=user_id, team_id=own_team.id, role=Role.COACH
        )
        db_session.add(m)
        db_session.commit()

        mock_jwt(str(user_id))
        resp = client.post(
            "/v1/team-invites", json={"team_id": str(other_team.id)}, headers=AUTH
        )
        assert resp.status_code == 403

    def test_creates_invite_created_event(
        self, client: TestClient, db_session: Session, mock_jwt
    ) -> None:
        """A successful invite creation fires exactly one INVITE_CREATED event."""
        from sqlalchemy import select
        from app.domain.events.models import FunnelEvent, ProductEvent

        user_id = uuid.uuid4()
        team = Team(id=uuid.uuid4(), name="Event-Track Team")
        db_session.add(team)
        db_session.flush()
        db_session.add(
            Membership(id=uuid.uuid4(), user_id=user_id, team_id=team.id, role=Role.COACH)
        )
        db_session.commit()

        mock_jwt(str(user_id))
        resp = client.post("/v1/team-invites", json={"team_id": str(team.id)}, headers=AUTH)
        assert resp.status_code == 201

        events = db_session.execute(
            select(ProductEvent)
            .where(ProductEvent.event_name == FunnelEvent.INVITE_CREATED)
            .where(ProductEvent.team_id == team.id)
        ).scalars().all()
        assert len(events) == 1
        ev = events[0]
        assert ev.user_id == user_id
        assert ev.role == "COACH"
        assert "invite_id" in ev.event_metadata

    def test_invite_created_event_scoped_to_team(
        self, client: TestClient, db_session: Session, mock_jwt
    ) -> None:
        """INVITE_CREATED event is stored under team A; team B has no events."""
        from sqlalchemy import select
        from app.domain.events.models import FunnelEvent, ProductEvent

        user_id = uuid.uuid4()
        team_a = Team(id=uuid.uuid4(), name="Scoping Team A2")
        team_b = Team(id=uuid.uuid4(), name="Scoping Team B2")
        db_session.add_all([team_a, team_b])
        db_session.flush()
        db_session.add(
            Membership(id=uuid.uuid4(), user_id=user_id, team_id=team_a.id, role=Role.COACH)
        )
        db_session.commit()

        mock_jwt(str(user_id))
        resp = client.post("/v1/team-invites", json={"team_id": str(team_a.id)}, headers=AUTH)
        assert resp.status_code == 201

        team_a_events = db_session.execute(
            select(ProductEvent)
            .where(ProductEvent.event_name == FunnelEvent.INVITE_CREATED)
            .where(ProductEvent.team_id == team_a.id)
        ).scalars().all()
        assert len(team_a_events) == 1

        team_b_events = db_session.execute(
            select(ProductEvent)
            .where(ProductEvent.event_name == FunnelEvent.INVITE_CREATED)
            .where(ProductEvent.team_id == team_b.id)
        ).scalars().all()
        assert len(team_b_events) == 0


# ---------------------------------------------------------------------------
# POST /v1/team-invites/{token}/accept
# ---------------------------------------------------------------------------

class TestAcceptInvite:
    def test_no_auth_returns_401(self, client: TestClient) -> None:
        resp = client.post(
            "/v1/team-invites/some-token/accept",
            json={"display_name": "Test User"},
        )
        assert resp.status_code == 401

    def test_invalid_token_returns_404(
        self, client: TestClient, mock_jwt
    ) -> None:
        mock_jwt(str(uuid.uuid4()))
        resp = client.post(
            "/v1/team-invites/nonexistent-token/accept",
            json={"display_name": "Test User"},
            headers=AUTH,
        )
        assert resp.status_code == 404

    def test_happy_path_creates_membership(
        self,
        client: TestClient,
        db_session: Session,
        mock_jwt,
        invite_team_a: Invite,
    ) -> None:
        from sqlalchemy import select

        athlete_id = uuid.uuid4()
        mock_jwt(str(athlete_id))
        resp = client.post(
            f"/v1/team-invites/{invite_team_a.token}/accept",
            json={"display_name": "Test Athlete"},
            headers=AUTH,
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["role"] == "ATHLETE"
        assert body["team_id"] == str(invite_team_a.team_id)

        m = db_session.execute(
            select(Membership).where(Membership.user_id == athlete_id)
        ).scalar_one_or_none()
        assert m is not None
        assert m.role == Role.ATHLETE

        db_session.expire(invite_team_a)
        assert invite_team_a.used_at is not None

    def test_used_invite_returns_409(
        self,
        client: TestClient,
        db_session: Session,
        mock_jwt,
        invite_team_a: Invite,
    ) -> None:
        invite_team_a.used_at = datetime.now(timezone.utc)
        db_session.commit()

        mock_jwt(str(uuid.uuid4()))
        resp = client.post(
            f"/v1/team-invites/{invite_team_a.token}/accept",
            json={"display_name": "Test User"},
            headers=AUTH,
        )
        assert resp.status_code == 409
        assert "already been used" in resp.json()["detail"]

    def test_expired_token_returns_410(
        self,
        client: TestClient,
        db_session: Session,
        mock_jwt,
        invite_team_a: Invite,
    ) -> None:
        invite_team_a.expires_at = datetime.now(timezone.utc) - timedelta(days=1)
        db_session.commit()

        mock_jwt(str(uuid.uuid4()))
        resp = client.post(
            f"/v1/team-invites/{invite_team_a.token}/accept",
            json={"display_name": "Test User"},
            headers=AUTH,
        )
        assert resp.status_code == 410
        assert "expired" in resp.json()["detail"]

    def test_idempotent_second_accept_returns_existing_membership(
        self,
        client: TestClient,
        db_session: Session,
        mock_jwt,
        invite_team_a: Invite,
    ) -> None:
        """Accepting the same invite twice returns the existing membership."""
        athlete_id = uuid.uuid4()
        m = Membership(
            id=uuid.uuid4(),
            user_id=athlete_id,
            team_id=invite_team_a.team_id,
            role=Role.ATHLETE,
        )
        db_session.add(m)
        db_session.commit()

        mock_jwt(str(athlete_id))
        resp = client.post(
            f"/v1/team-invites/{invite_team_a.token}/accept",
            json={"display_name": "Test Athlete"},
            headers=AUTH,
        )
        assert resp.status_code == 201
        assert resp.json()["membership_id"] == str(m.id)

    def test_display_name_stored_in_user_profile(
        self,
        client: TestClient,
        db_session: Session,
        mock_jwt,
        invite_team_a: Invite,
    ) -> None:
        """Accept stores display_name in UserProfile."""
        from app.models import UserProfile
        from sqlalchemy import select

        athlete_id = uuid.uuid4()
        mock_jwt(str(athlete_id))
        resp = client.post(
            f"/v1/team-invites/{invite_team_a.token}/accept",
            json={"display_name": "Bob Smith"},
            headers=AUTH,
        )
        assert resp.status_code == 201

        db_session.expire_all()
        profile = db_session.execute(
            select(UserProfile).where(UserProfile.supabase_user_id == athlete_id)
        ).scalar_one_or_none()
        assert profile is not None
        assert profile.name == "Bob Smith"

    def test_token_is_team_scoped(
        self,
        client: TestClient,
        db_session: Session,
        mock_jwt,
        invite_team_a: Invite,
    ) -> None:
        """Accepting a token joins the correct team — team_id cannot be spoofed."""
        athlete_id = uuid.uuid4()
        mock_jwt(str(athlete_id))
        resp = client.post(
            f"/v1/team-invites/{invite_team_a.token}/accept",
            json={"display_name": "Scoped Athlete"},
            headers=AUTH,
        )
        assert resp.status_code == 201
        assert resp.json()["team_id"] == str(invite_team_a.team_id)
