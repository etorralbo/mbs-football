import uuid

from sqlalchemy import Index, String, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class Team(Base, TimestampMixin):
    """
    Team model representing a football team in the app.

    Team names are unique per creator (case-insensitive).
    """
    __tablename__ = "teams"

    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False
    )

    __table_args__ = (
        Index(
            "uix_teams_creator_name",
            "created_by_user_id",
            text("lower(name)"),
            unique=True,
        ),
    )

    def __repr__(self) -> str:
        return f"<Team(id={self.id}, name={self.name})>"
