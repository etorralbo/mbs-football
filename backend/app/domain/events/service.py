from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from app.domain.events.models import FunnelEvent, ProductEvent


@dataclass(frozen=True, slots=True)
class AuthContext:
    user_id: UUID
    role: str | None
    team_id: UUID | None


class ProductEventService:
    """
    Tracks product events server-side, inside the caller's DB transaction.

    Guarantees:
    - No commit/flush here — atomicity stays with the caller.
    - Basic tenant integrity guard when team_id is provided.
    - metadata must contain IDs/flags only (no PII: no email, name, raw body).
    """

    def __init__(self, db: Session) -> None:
        self._db = db

    def track(
        self,
        *,
        event: FunnelEvent,
        actor: AuthContext,
        team_id: UUID | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        # Tenant guard: caller-supplied team_id must match actor's team when
        # both are present. Prevents cross-tenant event spoofing.
        if team_id is not None and actor.team_id is not None and team_id != actor.team_id:
            raise ValueError("team_id mismatch while tracking product event")

        row = ProductEvent(
            event_name=event,
            user_id=actor.user_id,
            team_id=team_id if team_id is not None else actor.team_id,
            role=actor.role,
            event_metadata=metadata or {},
        )
        self._db.add(row)
        # DO NOT commit/flush here — the caller owns the transaction boundary.
