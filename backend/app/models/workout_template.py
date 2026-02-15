import uuid
from typing import Optional

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class WorkoutTemplate(Base, TimestampMixin):
    """
    WorkoutTemplate model representing a reusable workout structure.

    A template belongs to a team and contains multiple ordered blocks.
    """
    __tablename__ = "workout_templates"

    team_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("teams.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationship to blocks ordered by order_index
    blocks: Mapped[list["WorkoutBlock"]] = relationship(
        "WorkoutBlock",
        back_populates="workout_template",
        order_by="WorkoutBlock.order_index",
        cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<WorkoutTemplate(id={self.id}, title={self.title})>"
