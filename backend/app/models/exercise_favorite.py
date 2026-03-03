"""
ExerciseFavorite — coach bookmark for a single exercise.

Each coach can mark any exercise they can see (COMPANY or own COACH) as a
favourite.  The composite primary key (coach_id, exercise_id) prevents
duplicates; ON DELETE CASCADE on exercise_id means no orphan rows are left
when a COACH exercise is deleted.
"""
import uuid
from datetime import datetime

import sqlalchemy as sa
from sqlalchemy import ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ExerciseFavorite(Base):
    __tablename__ = "exercise_favorites"

    coach_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("user_profiles.id", ondelete="CASCADE"),
        primary_key=True,
    )
    exercise_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("exercises.id", ondelete="CASCADE"),
        primary_key=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True),
        nullable=False,
        server_default=sa.func.now(),
    )
