"""WorkoutSession model — one session per athlete per WorkoutAssignment."""
import uuid
from datetime import date, datetime
from typing import Optional

from sqlalchemy import Date, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class WorkoutSession(Base, TimestampMixin):
    """
    WorkoutSession represents a single athlete's instance of a WorkoutAssignment.

    completed_at is None until the athlete (or coach) marks it done.
    workout_template_id is denormalized from the assignment for easier querying.
    """

    __tablename__ = "workout_sessions"

    assignment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workout_assignments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    athlete_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("user_profiles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Denormalized for direct filtering without joining through assignments
    workout_template_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workout_templates.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    scheduled_for: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    assignment: Mapped["WorkoutAssignment"] = relationship(
        "WorkoutAssignment",
        back_populates="sessions",
    )
    logs: Mapped[list["WorkoutSessionLog"]] = relationship(
        "WorkoutSessionLog",
        back_populates="session",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<WorkoutSession(id={self.id}, athlete_id={self.athlete_id})>"
