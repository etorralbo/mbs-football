"""WorkoutAssignment model — records a coach assigning a template to team or athlete."""
import enum
import uuid
from datetime import date
from typing import Optional

from sqlalchemy import Date, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class AssignmentTargetType(str, enum.Enum):
    """Who receives WorkoutSessions when an assignment is created."""

    TEAM = "team"
    ATHLETE = "athlete"


class WorkoutAssignment(Base, TimestampMixin):
    """
    WorkoutAssignment records that a coach assigned a WorkoutTemplate.

    target_type is TEAM (all athletes) or ATHLETE (single athlete).
    One WorkoutSession row is created per targeted athlete.
    """

    __tablename__ = "workout_assignments"

    team_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("teams.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    workout_template_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workout_templates.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    target_type: Mapped[str] = mapped_column(String(16), nullable=False)
    # Non-null only when target_type == AssignmentTargetType.ATHLETE
    target_athlete_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("user_profiles.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    scheduled_for: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    sessions: Mapped[list["WorkoutSession"]] = relationship(
        "WorkoutSession",
        back_populates="assignment",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return (
            f"<WorkoutAssignment(id={self.id}, target_type={self.target_type})>"
        )
