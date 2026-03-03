import uuid
from typing import Any

from sqlalchemy import ForeignKey, Integer, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class BlockExercise(Base, TimestampMixin):
    """
    BlockExercise model linking exercises to workout blocks with prescription.

    Represents a specific exercise within a workout block, including its order
    and prescription details (sets, reps, rest, RPE, notes, etc.) stored as JSONB.
    """
    __tablename__ = "block_exercises"
    __table_args__ = (
        UniqueConstraint(
            "workout_block_id",
            "order",
            name="uq_block_exercise_block_order"
        ),
    )

    workout_block_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workout_blocks.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    exercise_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("exercises.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    order_index: Mapped[int] = mapped_column(
        "order",  # column name in database
        Integer,
        nullable=False
    )
    prescription_json: Mapped[dict[str, Any]] = mapped_column(
        JSONB,
        nullable=False,
        default=dict,
        server_default="{}"
    )

    @property
    def sets(self) -> list[dict]:
        """Expose sets array from prescription_json for Pydantic serialisation."""
        return (self.prescription_json or {}).get("sets", [])

    # Relationships
    workout_block: Mapped["WorkoutBlock"] = relationship(
        "WorkoutBlock",
        back_populates="items"
    )
    exercise: Mapped["Exercise"] = relationship("Exercise")

    def __repr__(self) -> str:
        return f"<BlockExercise(id={self.id}, order={self.order_index})>"
