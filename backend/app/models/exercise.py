import uuid
from typing import Optional

from sqlalchemy import ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class Exercise(Base, TimestampMixin):
    """
    Exercise model representing a single exercise in a coach's library.

    Each exercise belongs to a coach (UserProfile) rather than a team, so the
    same library is reusable across all teams the coach manages.
    The tags field is a simple text field for MVP; can be normalized later.
    """
    __tablename__ = "exercises"
    __table_args__ = (
        UniqueConstraint("coach_id", "name", name="uq_exercise_coach_name"),
    )

    coach_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("user_profiles.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    tags: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    video_asset_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("media_assets.id", ondelete="SET NULL"),
        nullable=True
    )

    def __repr__(self) -> str:
        return f"<Exercise(id={self.id}, name={self.name})>"
