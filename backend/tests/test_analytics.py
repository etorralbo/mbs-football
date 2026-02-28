"""
Integration tests for GET /v1/analytics/funnel.

Invariants:
1. Counts are scoped to the requesting coach's team — other teams' events
   are invisible.
2. Athletes receive 403.
3. A team with no events returns all-zero counts.
"""
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.domain.events.models import FunnelEvent, ProductEvent
from app.models import Team, UserProfile

HEADERS = {"Authorization": "Bearer test-token"}
FUNNEL_ENDPOINT = "/v1/analytics/funnel"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _seed_event(
    db: Session,
    *,
    event: FunnelEvent,
    user_id: uuid.UUID,
    team_id: uuid.UUID,
    role: str = "ATHLETE",
) -> ProductEvent:
    """Insert one product event and flush (caller owns the commit)."""
    row = ProductEvent(
        id=uuid.uuid4(),
        event_name=event,
        user_id=user_id,
        team_id=team_id,
        role=role,
        event_metadata={},
    )
    db.add(row)
    db.flush()
    return row


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestFunnelEndpoint:

    def test_returns_counts_scoped_to_coach_team(
        self,
        client: TestClient,
        mock_jwt,
        coach_a: UserProfile,
        athlete_a: UserProfile,
        team_a: Team,
        team_b: Team,
        db_session: Session,
    ):
        """Counts include only events for team_a; team_b events are invisible."""
        # Two INVITE_ACCEPTED events for team_a (different users → count = 2)
        _seed_event(db_session, event=FunnelEvent.INVITE_ACCEPTED, user_id=uuid.uuid4(), team_id=team_a.id)
        _seed_event(db_session, event=FunnelEvent.INVITE_ACCEPTED, user_id=uuid.uuid4(), team_id=team_a.id)
        # One SESSION_COMPLETED for team_a
        _seed_event(db_session, event=FunnelEvent.SESSION_COMPLETED, user_id=uuid.uuid4(), team_id=team_a.id)
        # One INVITE_ACCEPTED for team_b — must NOT appear in coach_a's response
        _seed_event(db_session, event=FunnelEvent.INVITE_ACCEPTED, user_id=uuid.uuid4(), team_id=team_b.id)
        db_session.commit()

        mock_jwt(str(coach_a.supabase_user_id))
        response = client.get(FUNNEL_ENDPOINT, headers=HEADERS)

        assert response.status_code == 200
        data = response.json()
        assert data["invite_accepted"] == 2
        assert data["session_completed"] == 1
        assert data["team_created"] == 0

    def test_athlete_cannot_access_funnel(
        self,
        client: TestClient,
        mock_jwt,
        athlete_a: UserProfile,
    ):
        """ATHLETE role → 403 (funnel is coach-only analytics)."""
        mock_jwt(str(athlete_a.supabase_user_id))
        response = client.get(FUNNEL_ENDPOINT, headers=HEADERS)
        assert response.status_code == 403

    def test_returns_zeros_when_no_events(
        self,
        client: TestClient,
        mock_jwt,
        coach_a: UserProfile,
    ):
        """A team that has never fired any events returns all zeros."""
        mock_jwt(str(coach_a.supabase_user_id))
        response = client.get(FUNNEL_ENDPOINT, headers=HEADERS)

        assert response.status_code == 200
        data = response.json()
        assert data == {
            "team_created": 0,
            "invite_created": 0,
            "invite_accepted": 0,
            "template_created_ai": 0,
            "assignment_created": 0,
            "session_completed": 0,
        }

    def test_same_user_counted_once_per_event(
        self,
        client: TestClient,
        mock_jwt,
        coach_a: UserProfile,
        team_a: Team,
        db_session: Session,
    ):
        """Two SESSION_COMPLETED rows for the same user_id count as 1."""
        user = uuid.uuid4()
        _seed_event(db_session, event=FunnelEvent.SESSION_COMPLETED, user_id=user, team_id=team_a.id)
        _seed_event(db_session, event=FunnelEvent.SESSION_COMPLETED, user_id=user, team_id=team_a.id)
        db_session.commit()

        mock_jwt(str(coach_a.supabase_user_id))
        response = client.get(FUNNEL_ENDPOINT, headers=HEADERS)

        assert response.status_code == 200
        assert response.json()["session_completed"] == 1
