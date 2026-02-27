"""
Multi-tenant isolation regression tests.

Verifies that:
1. A user only sees resources (templates, exercises) from their own team.
2. X-Team-Id with a team the user does not belong to returns 403 — not 404
   (IDOR prevention: no existence leak).
3. A user with a valid JWT but no Membership gets 403 on protected endpoints.
4. A UserProfile whose team_id column is stale (points to an old team) does
   NOT cause cross-tenant data leakage — team_id is taken from Membership.
"""
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Membership, Role, Team, UserProfile
from app.models.workout_template import WorkoutTemplate

_AUTH = {"Authorization": "Bearer test-token"}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_user_with_membership(
    db: Session,
    team: Team,
    role: Role,
    name: str = "Test User",
) -> UserProfile:
    """Create a UserProfile + Membership pair (the expected production state)."""
    profile = UserProfile(
        id=uuid.uuid4(),
        supabase_user_id=uuid.uuid4(),
        team_id=team.id,
        role=role,
        name=name,
    )
    db.add(profile)
    db.flush()
    db.add(Membership(
        id=uuid.uuid4(),
        user_id=profile.supabase_user_id,
        team_id=team.id,
        role=role,
    ))
    db.commit()
    db.refresh(profile)
    return profile


def _make_template(db: Session, team: Team, title: str) -> WorkoutTemplate:
    t = WorkoutTemplate(id=uuid.uuid4(), team_id=team.id, title=title)
    db.add(t)
    db.commit()
    db.refresh(t)
    return t


# ---------------------------------------------------------------------------
# Test: user only sees templates from their own team
# ---------------------------------------------------------------------------

class TestTemplateIsolation:
    def test_user_sees_only_own_team_templates(
        self,
        client: TestClient,
        db_session: Session,
        mock_jwt,
    ):
        """GET /v1/workout-templates returns only templates belonging to the
        authenticated user's team — never templates from other teams."""
        team_a = Team(id=uuid.uuid4(), name="Isolation Team A")
        team_b = Team(id=uuid.uuid4(), name="Isolation Team B")
        db_session.add_all([team_a, team_b])
        db_session.flush()

        user = _make_user_with_membership(db_session, team_a, Role.COACH)
        own_template = _make_template(db_session, team_a, "My Template")
        foreign_template = _make_template(db_session, team_b, "Foreign Template")

        mock_jwt(str(user.supabase_user_id))
        resp = client.get("/v1/workout-templates", headers=_AUTH)

        assert resp.status_code == 200
        ids = {t["id"] for t in resp.json()}
        assert str(own_template.id) in ids
        assert str(foreign_template.id) not in ids, (
            "Cross-tenant leak: foreign template visible to user from team_a"
        )

    def test_foreign_template_detail_returns_404(
        self,
        client: TestClient,
        db_session: Session,
        mock_jwt,
    ):
        """GET /v1/workout-templates/{id} for a template owned by another team
        must return 404 — not the template data, and not 403 (no existence leak)."""
        team_a = Team(id=uuid.uuid4(), name="Owner Team")
        team_b = Team(id=uuid.uuid4(), name="Requester Team")
        db_session.add_all([team_a, team_b])
        db_session.flush()

        user_b = _make_user_with_membership(db_session, team_b, Role.COACH)
        team_a_template = _make_template(db_session, team_a, "Team A Private")

        mock_jwt(str(user_b.supabase_user_id))
        resp = client.get(f"/v1/workout-templates/{team_a_template.id}", headers=_AUTH)

        assert resp.status_code == 404, (
            f"Expected 404 for foreign template, got {resp.status_code}"
        )


# ---------------------------------------------------------------------------
# Test: X-Team-Id IDOR prevention
# ---------------------------------------------------------------------------

class TestXTeamIdIsolation:
    def test_x_team_id_not_owned_returns_403(
        self,
        client: TestClient,
        db_session: Session,
        mock_jwt,
    ):
        """X-Team-Id referencing a team the user does not belong to must return
        403, NOT 404. Returning 404 would confirm the team_id exists."""
        own_team = Team(id=uuid.uuid4(), name="Own Team")
        foreign_team = Team(id=uuid.uuid4(), name="Foreign Team")
        db_session.add_all([own_team, foreign_team])
        db_session.flush()

        user = _make_user_with_membership(db_session, own_team, Role.COACH)

        mock_jwt(str(user.supabase_user_id))
        resp = client.get(
            "/v1/workout-templates",
            headers={**_AUTH, "X-Team-Id": str(foreign_team.id)},
        )

        assert resp.status_code == 403, (
            f"Expected 403 for foreign X-Team-Id, got {resp.status_code} — "
            "possible IDOR: attacker can enumerate team existence"
        )

    def test_x_team_id_nonexistent_uuid_returns_403(
        self,
        client: TestClient,
        db_session: Session,
        mock_jwt,
    ):
        """X-Team-Id with a UUID that doesn't exist at all must also return 403."""
        own_team = Team(id=uuid.uuid4(), name="Real Team")
        db_session.add(own_team)
        db_session.flush()

        user = _make_user_with_membership(db_session, own_team, Role.COACH)

        mock_jwt(str(user.supabase_user_id))
        resp = client.get(
            "/v1/workout-templates",
            headers={**_AUTH, "X-Team-Id": str(uuid.uuid4())},
        )

        assert resp.status_code == 403

    def test_x_team_id_owned_returns_200(
        self,
        client: TestClient,
        db_session: Session,
        mock_jwt,
    ):
        """X-Team-Id matching a team the user belongs to is accepted."""
        team = Team(id=uuid.uuid4(), name="My Team")
        db_session.add(team)
        db_session.flush()
        user = _make_user_with_membership(db_session, team, Role.COACH)

        mock_jwt(str(user.supabase_user_id))
        resp = client.get(
            "/v1/workout-templates",
            headers={**_AUTH, "X-Team-Id": str(team.id)},
        )

        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# Test: no Membership → 403
# ---------------------------------------------------------------------------

class TestNoMembership:
    def test_valid_jwt_but_no_membership_returns_403(
        self,
        client: TestClient,
        db_session: Session,
        mock_jwt,
    ):
        """A user with a valid JWT and a UserProfile but NO Membership must get
        403 — they have not completed onboarding via the new flow."""
        team = Team(id=uuid.uuid4(), name="Orphan Team")
        db_session.add(team)
        db_session.flush()

        # UserProfile exists, Membership does NOT.
        orphan = UserProfile(
            id=uuid.uuid4(),
            supabase_user_id=uuid.uuid4(),
            team_id=team.id,
            role=Role.COACH,
            name="Orphan Coach",
        )
        db_session.add(orphan)
        db_session.commit()

        mock_jwt(str(orphan.supabase_user_id))
        resp = client.get("/v1/workout-templates", headers=_AUTH)

        assert resp.status_code == 403

    def test_valid_jwt_no_profile_no_membership_returns_403(
        self,
        client: TestClient,
        mock_jwt,
    ):
        """A brand-new user with only a JWT (no DB records) gets 403."""
        mock_jwt(str(uuid.uuid4()))
        resp = client.get("/v1/workout-templates", headers=_AUTH)
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Test: stale UserProfile.team_id does not cause cross-tenant leak
# ---------------------------------------------------------------------------

class TestStaleUserProfile:
    def test_stale_profile_team_id_does_not_leak_foreign_templates(
        self,
        client: TestClient,
        db_session: Session,
        mock_jwt,
    ):
        """Regression: if UserProfile.team_id points to an old team (stale) but
        the Membership points to the current team, templates must come from the
        Membership's team — never from the stale team."""
        old_team = Team(id=uuid.uuid4(), name="Old Team")
        new_team = Team(id=uuid.uuid4(), name="New Team")
        db_session.add_all([old_team, new_team])
        db_session.flush()

        old_template = _make_template(db_session, old_team, "Old Team Template")
        new_template = _make_template(db_session, new_team, "New Team Template")

        # UserProfile.team_id is STALE (points to old_team).
        # Membership points to new_team.
        supabase_id = uuid.uuid4()
        profile = UserProfile(
            id=uuid.uuid4(),
            supabase_user_id=supabase_id,
            team_id=old_team.id,   # stale — was set during old onboarding
            role=Role.COACH,
            name="Migrated Coach",
        )
        db_session.add(profile)
        db_session.flush()
        db_session.add(Membership(
            id=uuid.uuid4(),
            user_id=supabase_id,
            team_id=new_team.id,   # current team via new flow
            role=Role.COACH,
        ))
        db_session.commit()

        mock_jwt(str(supabase_id))
        resp = client.get("/v1/workout-templates", headers=_AUTH)

        assert resp.status_code == 200
        ids = {t["id"] for t in resp.json()}
        assert str(old_template.id) not in ids, (
            "Cross-tenant leak via stale UserProfile.team_id"
        )
        assert str(new_template.id) in ids, (
            "Expected to see new_team's template via Membership"
        )
