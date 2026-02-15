import uuid
from typing import Optional

from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class WorkoutBlock(Base, TimestampMixin):
    """
    WorkoutBlock model representing a section within a workout template.

    Each block has an order within the workout and contains multiple exercises.
    """
    __tablename__ = "workout_blocks"

    workout_template_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workout_templates.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    order_index: Mapped[int] = mapped_column(
        "order",  # column name in database
        Integer,
        nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    workout_template: Mapped["WorkoutTemplate"] = relationship(
        "WorkoutTemplate",
        back_populates="blocks"
    )
    items: Mapped[list["BlockExercise"]] = relationship(
        "BlockExercise",
        back_populates="workout_block",
        order_by="BlockExercise.order_index",
        cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<WorkoutBlock(id={self.id}, name={self.name}, order={self.order_index})>"
