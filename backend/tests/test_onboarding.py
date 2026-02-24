"""
TDD RED phase — integration tests for POST /v1/onboarding.

Endpoint does not exist yet. All tests are expected to FAIL.
"""
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Role, Team, UserProfile

HEADERS = {"Authorization": "Bearer test-token"}
ENDPOINT = "/v1/onboarding"

_VALID_PAYLOAD = {
    "team_name": "Test FC",
}


class TestOnboardingAuth:
    """Token is required."""

    def test_requires_auth(self, client: TestClient):
        """Missing token → 401."""
        response = client.post(ENDPOINT, json=_VALID_PAYLOAD)
        assert response.status_code == 401
        assert "Missing authentication token" in response.json()["detail"]


class TestOnboardingSuccess:
    """Happy-path: first-time onboarding creates team + profile."""

    def test_returns_201(self, client: TestClient, mock_jwt):
        """New authenticated user → 201."""
        mock_jwt(str(uuid.uuid4()))

        response = client.post(ENDPOINT, headers=HEADERS, json=_VALID_PAYLOAD)

        assert response.status_code == 201

    def test_response_contains_id_team_id_and_role(
        self, client: TestClient, mock_jwt
    ):
        """201 response must expose id, team_id and role."""
        mock_jwt(str(uuid.uuid4()))

        response = client.post(ENDPOINT, headers=HEADERS, json=_VALID_PAYLOAD)

        assert response.status_code == 201
        data = response.json()
        assert "id" in data
        assert "team_id" in data
        assert "role" in data
        uuid.UUID(data["id"])       # must be a valid UUID
        uuid.UUID(data["team_id"])  # must be a valid UUID

    def test_creates_team_in_db(
        self, client: TestClient, db_session: Session, mock_jwt
    ):
        """A new Team row must be written to the database."""
        mock_jwt(str(uuid.uuid4()))

        response = client.post(ENDPOINT, headers=HEADERS, json=_VALID_PAYLOAD)

        assert response.status_code == 201
        db_session.expire_all()
        team = db_session.execute(
            select(Team).where(Team.id == uuid.UUID(response.json()["team_id"]))
        ).scalar_one_or_none()
        assert team is not None
        assert team.name == _VALID_PAYLOAD["team_name"]

    def test_creates_user_profile_in_db(
        self, client: TestClient, db_session: Session, mock_jwt
    ):
        """A new UserProfile row must be linked to the created team."""
        sub = str(uuid.uuid4())
        mock_jwt(sub)

        response = client.post(ENDPOINT, headers=HEADERS, json=_VALID_PAYLOAD)

        assert response.status_code == 201
        db_session.expire_all()
        profile = db_session.execute(
            select(UserProfile).where(
                UserProfile.supabase_user_id == uuid.UUID(sub)
            )
        ).scalar_one_or_none()
        assert profile is not None
        assert str(profile.team_id) == response.json()["team_id"]
        assert profile.name == _VALID_PAYLOAD["team_name"]

    def test_role_is_always_coach(self, client: TestClient, mock_jwt):
        """Default role must be COACH regardless of payload."""
        mock_jwt(str(uuid.uuid4()))

        response = client.post(ENDPOINT, headers=HEADERS, json=_VALID_PAYLOAD)

        assert response.status_code == 201
        assert response.json()["role"] == Role.COACH.value


class TestOnboardingDuplicatePrevention:
    """Second onboarding attempt for the same user must be rejected."""

    def test_already_onboarded_returns_409(
        self,
        client: TestClient,
        mock_jwt,
        coach_a: UserProfile,
    ):
        """User with an existing UserProfile → 409."""
        mock_jwt(str(coach_a.supabase_user_id))

        response = client.post(ENDPOINT, headers=HEADERS, json=_VALID_PAYLOAD)

        assert response.status_code == 409


class TestOnboardingSecurityConstraints:
    """Client must not be able to influence team assignment or role."""

    def test_ignores_client_team_id(
        self, client: TestClient, db_session: Session, mock_jwt
    ):
        """A team_id in the payload must be ignored; server always creates a fresh team."""
        mock_jwt(str(uuid.uuid4()))
        attacker_team_id = str(uuid.uuid4())

        response = client.post(
            ENDPOINT,
            headers=HEADERS,
            json={**_VALID_PAYLOAD, "team_id": attacker_team_id},
        )

        assert response.status_code == 201
        assert response.json()["team_id"] != attacker_team_id

    def test_ignores_client_role(self, client: TestClient, mock_jwt):
        """A role field in the payload must be ignored; assigned role is always COACH."""
        mock_jwt(str(uuid.uuid4()))

        response = client.post(
            ENDPOINT,
            headers=HEADERS,
            json={**_VALID_PAYLOAD, "role": Role.ATHLETE.value},
        )

        assert response.status_code == 201
        assert response.json()["role"] == Role.COACH.value
