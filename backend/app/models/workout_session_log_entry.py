"""WorkoutSessionLogEntry — one row per set within a WorkoutSessionLog."""
import uuid
from typing import Optional

from sqlalchemy import CheckConstraint, Float, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, uuid_pk, created_at


class WorkoutSessionLogEntry(Base):
    """
    A single set logged by an athlete: set number, reps, weight, and RPE.

    Entries are append-only: no updated_at column.
    """

    __tablename__ = "workout_session_log_entries"
    __table_args__ = (
        CheckConstraint("set_number > 0", name="ck_log_entries_set_number_positive"),
    )

    id: Mapped[uuid_pk]
    created_at: Mapped[created_at]

    log_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workout_session_logs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    set_number: Mapped[int] = mapped_column(Integer, nullable=False)
    reps: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    weight: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    rpe: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Relationship
    log: Mapped["WorkoutSessionLog"] = relationship(
        "WorkoutSessionLog",
        back_populates="entries",
    )

    def __repr__(self) -> str:
        return (
            f"<WorkoutSessionLogEntry(id={self.id}, log_id={self.log_id}, "
            f"set={self.set_number})>"
        )
