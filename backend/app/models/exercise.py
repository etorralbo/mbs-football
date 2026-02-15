import uuid
from typing import Optional

from sqlalchemy import ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class Exercise(Base, TimestampMixin):
    """
    Exercise model representing a single exercise in the team's library.

    Each exercise belongs to a team and can optionally have a video demonstration.
    The tags field is a simple text field for MVP; can be normalized later.
    """
    __tablename__ = "exercises"
    __table_args__ = (
        UniqueConstraint("team_id", "name", name="uq_exercise_team_name"),
    )

    team_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("teams.id", ondelete="CASCADE"),
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
