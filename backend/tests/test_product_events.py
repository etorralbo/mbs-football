"""
Unit / integration tests for ProductEventService.

Four invariants:
1. track() writes the row with correct fields after the caller commits.
2. track() does NOT commit — the row is invisible to other connections until
   the caller commits.
3. track() raises ValueError when caller-supplied team_id ≠ actor.team_id.
4. Every FunnelEvent value is accepted by the DB enum without error.
   (Guards against migrations using UPPERCASE values while Python uses lowercase.)
"""
import uuid

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domain.events.models import FunnelEvent, ProductEvent
from app.domain.events.service import AuthContext, ProductEventService
from tests.conftest import TestSessionLocal


class TestProductEventService:

    # ------------------------------------------------------------------
    # Test 1 — happy path: row lands with the expected fields
    # ------------------------------------------------------------------

    def test_track_inserts_row(self, db_session: Session) -> None:
        team_id = uuid.uuid4()
        user_id = uuid.uuid4()

        service = ProductEventService(db_session)
        service.track(
            event=FunnelEvent.TEAM_CREATED,
            actor=AuthContext(user_id=user_id, role="COACH", team_id=None),
            team_id=team_id,
            metadata={"source": "ui"},
        )

        # The caller owns the commit — simulate it here.
        db_session.commit()

        row = db_session.execute(
            select(ProductEvent).where(ProductEvent.user_id == user_id)
        ).scalar_one()

        assert row.event_name == FunnelEvent.TEAM_CREATED
        assert row.team_id == team_id
        assert row.role == "COACH"
        assert row.event_metadata == {"source": "ui"}

    # ------------------------------------------------------------------
    # Test 2 — no commit: row must not be visible to other connections
    # ------------------------------------------------------------------

    def test_track_does_not_commit(self, db_session: Session) -> None:
        """
        Proves track() never issues a COMMIT.

        Strategy:
        1. Call track() and flush the row into the open transaction (flush
           sends the SQL INSERT but does NOT commit).
        2. Open a fresh connection — PostgreSQL READ COMMITTED means it
           cannot see uncommitted rows from another connection.
        3. Assert 0 rows via the fresh connection.
        """
        user_id = uuid.uuid4()
        team_id = uuid.uuid4()

        service = ProductEventService(db_session)
        service.track(
            event=FunnelEvent.TEAM_CREATED,
            actor=AuthContext(user_id=user_id, role="COACH", team_id=None),
            team_id=team_id,
        )

        # Push the row into the active transaction without committing.
        db_session.flush()

        # A brand-new connection must not see the uncommitted row.
        fresh = TestSessionLocal()
        try:
            row = fresh.execute(
                select(ProductEvent).where(ProductEvent.user_id == user_id)
            ).scalar_one_or_none()
            assert row is None, "track() must not commit — row should be invisible until caller commits"
        finally:
            fresh.close()

    # ------------------------------------------------------------------
    # Test 3 — tenant guard: mismatched team_id raises ValueError
    # ------------------------------------------------------------------

    def test_team_id_mismatch_raises(self, db_session: Session) -> None:
        team_a = uuid.uuid4()
        team_b = uuid.uuid4()

        service = ProductEventService(db_session)

        with pytest.raises(ValueError, match="team_id mismatch"):
            service.track(
                event=FunnelEvent.INVITE_ACCEPTED,
                actor=AuthContext(user_id=uuid.uuid4(), role="ATHLETE", team_id=team_a),
                team_id=team_b,
                metadata={"invite_id": str(uuid.uuid4())},
            )

        # No row must have been added to the session.
        db_session.flush()
        count = db_session.execute(select(ProductEvent)).scalars().all()
        assert len(count) == 0

    # ------------------------------------------------------------------
    # Test 4 — enum parity: every FunnelEvent value commits without error
    #
    # This test would have caught the UPPERCASE migration / lowercase Python
    # mismatch that caused POST /v1/workout-templates/from-ai to return 500.
    # ------------------------------------------------------------------

    @pytest.mark.parametrize("event", list(FunnelEvent))
    def test_every_funnel_event_value_is_accepted_by_db(
        self, event: FunnelEvent, db_session: Session
    ) -> None:
        """Each FunnelEvent member must round-trip through the DB without error."""
        user_id = uuid.uuid4()
        team_id = uuid.uuid4()

        service = ProductEventService(db_session)
        service.track(
            event=event,
            actor=AuthContext(user_id=user_id, role="COACH", team_id=None),
            team_id=team_id,
        )

        # commit() is what fails when DB enum values don't match Python values.
        db_session.commit()

        row = db_session.execute(
            select(ProductEvent).where(ProductEvent.user_id == user_id)
        ).scalar_one()
        assert row.event_name == event
