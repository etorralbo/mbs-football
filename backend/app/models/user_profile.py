import enum
import uuid

from sqlalchemy import Enum, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class Role(str, enum.Enum):
    """User roles in the application."""
    COACH = "COACH"
    ATHLETE = "ATHLETE"


class UserProfile(Base, TimestampMixin):
    """
    UserProfile model linking Supabase users to teams.

    Each user profile is associated with a Supabase user_id,
    belongs to a team, and has a role (COACH or ATHLETE).
    """
    __tablename__ = "user_profiles"

    supabase_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        unique=True,
        nullable=False,
        index=True
    )
    team_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("teams.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    role: Mapped[Role] = mapped_column(
        Enum(Role, name="user_role", native_enum=False),
        nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)

    def __repr__(self) -> str:
        return f"<UserProfile(id={self.id}, name={self.name}, role={self.role})>"
