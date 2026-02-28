"""
ProductEvent SQLAlchemy model for product funnel analytics.

Design constraints:
- No PII: user_id and team_id are opaque UUIDs; metadata must never contain
  names, emails, or raw request payloads.
- Immutable append-only rows: no updated_at needed, only created_at.
- Timezone-aware timestamps via server-side UTC default.
"""
import enum
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Enum as SAEnum, Index, String, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class FunnelEvent(str, enum.Enum):
    """Enumeration of trackable product funnel events."""

    TEAM_CREATED = "team_created"
    INVITE_CREATED = "invite_created"
    INVITE_ACCEPTED = "invite_accepted"
    SESSION_COMPLETED = "session_completed"


class ProductEvent(Base):
    """
    Append-only table capturing product funnel events.

    Rules enforced here:
    - ``event_metadata`` defaults to ``{}``; callers must strip PII before
      writing (no email, no display names, no raw bodies).
    - ``created_at`` is always UTC and set by the database server.
    - No ``updated_at``: events are immutable once written.
    - ``team_id`` is nullable: pre-team events (e.g. signup) are valid.
    - ``role`` is a plain string to keep this module free of business-model
      imports; use the same values as the Role enum ("COACH" / "ATHLETE").
    """

    __tablename__ = "product_events"

    # --- primary key ---
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    # --- who / where ---
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        nullable=False,
    )
    # Nullable: events fired before the user joins a team are valid.
    team_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        nullable=True,
    )
    # Plain string avoids importing the business-domain Role enum here.
    # Expected values: "COACH", "ATHLETE" (or None for pre-onboarding events).
    role: Mapped[Optional[str]] = mapped_column(
        String(32),
        nullable=True,
    )

    # --- what ---
    event_name: Mapped[FunnelEvent] = mapped_column(
        SAEnum(FunnelEvent, name="funnel_event", native_enum=True),
        nullable=False,
    )

    # --- context (no PII) ---
    # Python attribute name avoids collision with DeclarativeBase.metadata
    event_metadata: Mapped[dict] = mapped_column(
        "metadata",
        JSONB,
        nullable=False,
        server_default=text("'{}'::jsonb"),
        default=dict,
    )

    # --- when ---
    # DateTime(timezone=True) maps to PostgreSQL TIMESTAMPTZ, ensuring the
    # driver always returns tz-aware datetime objects regardless of connection
    # settings. The server default keeps all writes in UTC.
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("TIMEZONE('utc', NOW())"),
    )

    # --- indexes for funnel query patterns ---
    __table_args__ = (
        Index("ix_product_events_user_id_created_at", "user_id", "created_at"),
        Index("ix_product_events_team_id_created_at", "team_id", "created_at"),
        Index("ix_product_events_event_name_created_at", "event_name", "created_at"),
    )

    def __repr__(self) -> str:
        return (
            f"<ProductEvent(id={self.id}, event={self.event_name}, "
            f"user={self.user_id}, team={self.team_id}, role={self.role})>"
        )
