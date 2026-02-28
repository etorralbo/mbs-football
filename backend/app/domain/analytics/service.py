"""Analytics service: funnel counts scoped to a team."""
import uuid

from sqlalchemy import distinct, func, select
from sqlalchemy.orm import Session

from app.domain.events.models import FunnelEvent, ProductEvent


class FunnelAnalyticsService:

    def __init__(self, db: Session) -> None:
        self._db = db

    def get_team_funnel(self, team_id: uuid.UUID) -> dict[str, int]:
        """Return distinct-user counts per funnel event for the given team.

        Uses distinct(user_id) so that a user who fires the same event
        multiple times is counted only once per event bucket.
        """
        rows = self._db.execute(
            select(
                ProductEvent.event_name,
                func.count(distinct(ProductEvent.user_id)).label("cnt"),
            )
            .where(ProductEvent.team_id == team_id)
            .group_by(ProductEvent.event_name)
        ).all()

        # Initialise all known funnel stages at zero so callers always receive
        # a complete dict even for teams with no events yet.
        result: dict[str, int] = {e.value: 0 for e in FunnelEvent}

        for event_name, count in rows:
            result[event_name.value] = count

        return result
