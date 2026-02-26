"""WorkoutSessionLog — one log record per exercise block per session."""
import uuid
from typing import Optional

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class WorkoutSessionLog(Base, TimestampMixin):
    """
    Records an athlete's actual performance for one exercise within a session.

    team_id is denormalized from the session for fast tenant-scoped queries
    without joining through workout_sessions.
    block_name must match one of the blocks in the session's template.
    """

    __tablename__ = "workout_session_logs"

    team_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("teams.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workout_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    block_name: Mapped[str] = mapped_column(String(255), nullable=False)
    exercise_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("exercises.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by_profile_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("user_profiles.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Relationships
    session: Mapped["WorkoutSession"] = relationship(
        "WorkoutSession",
        back_populates="logs",
    )
    entries: Mapped[list["WorkoutSessionLogEntry"]] = relationship(
        "WorkoutSessionLogEntry",
        back_populates="log",
        cascade="all, delete-orphan",
        order_by="WorkoutSessionLogEntry.set_number",
    )

    def __repr__(self) -> str:
        return (
            f"<WorkoutSessionLog(id={self.id}, session_id={self.session_id}, "
            f"block={self.block_name})>"
        )
