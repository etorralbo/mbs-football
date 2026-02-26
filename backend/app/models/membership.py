import uuid

from sqlalchemy import Enum, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin
from app.models.user_profile import Role


class Membership(Base, TimestampMixin):
    """
    Membership linking a Supabase user to a team with a role.

    Replaces the old 1-to-1 UserProfile approach for multi-team support.
    user_id stores the Supabase UUID ('sub' claim from JWT).
    """
    __tablename__ = "memberships"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        nullable=False,
        index=True,
    )
    team_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("teams.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role: Mapped[Role] = mapped_column(
        Enum(Role, name="user_role", native_enum=False),
        nullable=False,
    )

    __table_args__ = (
        UniqueConstraint("user_id", "team_id", name="uq_memberships_user_team"),
    )

    def __repr__(self) -> str:
        return f"<Membership(id={self.id}, user_id={self.user_id}, role={self.role})>"
