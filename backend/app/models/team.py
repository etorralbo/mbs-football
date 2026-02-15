from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class Team(Base, TimestampMixin):
    """
    Team model representing a football team in the app.

    Each team has a unique name within the application.
    """
    __tablename__ = "teams"

    name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)

    def __repr__(self) -> str:
        return f"<Team(id={self.id}, name={self.name})>"
