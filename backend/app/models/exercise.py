import enum
import uuid
from typing import Optional

import sqlalchemy as sa
from sqlalchemy import Boolean, ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy import Enum as SAEnum
from sqlalchemy import text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class OwnerType(str, enum.Enum):
    """Whether an exercise is managed by the company or by an individual coach."""
    COMPANY = "COMPANY"
    COACH = "COACH"


class Exercise(Base, TimestampMixin):
    """
    Exercise in a training library.

    Ownership model:
    - owner_type = COMPANY → global, read-only; coach_id is NULL.
    - owner_type = COACH   → personal to a coach; coach_id = coach's UserProfile.id.

    Uniqueness:
    - COACH exercises: (coach_id, name) unique — see uq_exercise_coach_name.
    - COMPANY exercises: name unique across all COMPANY rows — see
      uix_company_exercise_name (partial index).
    """
    __tablename__ = "exercises"
    __table_args__ = (
        # Coach-scoped uniqueness (NULL coach_id for COMPANY rows is excluded
        # from this constraint in PostgreSQL — NULLs are never equal).
        UniqueConstraint("coach_id", "name", name="uq_exercise_coach_name"),
        # Partial unique index: COMPANY exercise names must be globally unique.
        Index(
            "uix_company_exercise_name",
            "name",
            unique=True,
            postgresql_where=text("owner_type = 'COMPANY'"),
        ),
    )

    # NULL for COMPANY exercises; set to the owning coach for COACH exercises.
    coach_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("user_profiles.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    owner_type: Mapped[OwnerType] = mapped_column(
        SAEnum(
            OwnerType,
            name="exercise_owner_type",
            native_enum=True,
            values_callable=lambda x: [e.value for e in x],
        ),
        nullable=False,
        default=OwnerType.COACH,
        server_default=OwnerType.COACH.value,
    )
    is_editable: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default=sa.true(),
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    # description is required (NOT NULL, min 20 chars enforced at DB + schema level).
    description: Mapped[str] = mapped_column(Text, nullable=False)
    # tags stored as a JSONB array of lowercase strings, e.g. ["strength", "lower-body"].
    # GIN index ix_exercises_tags_gin enables efficient @> containment queries.
    tags: Mapped[list] = mapped_column(
        JSONB,
        nullable=False,
        default=list,
        server_default=sa.text("'[]'::jsonb"),
    )
    video_asset_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("media_assets.id", ondelete="SET NULL"),
        nullable=True,
    )
    # External video support (YouTube). All three columns are NULL when no video is set.
    # VARCHAR is used intentionally — avoids PostgreSQL enum migration complexity.
    video_provider: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    video_url: Mapped[Optional[str]] = mapped_column(String(2048), nullable=True)
    video_external_id: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    @property
    def video(self) -> dict | None:
        """Assembled video object for Pydantic ORM serialisation (ExerciseOut).

        Returns a VideoOut-compatible dict when all three columns are set,
        or None when no video is attached.  This allows ExerciseOut with
        from_attributes=True to read `exercise.video` directly without any
        intermediate service layer.
        """
        if self.video_provider and self.video_url and self.video_external_id:
            return {
                "provider": self.video_provider,
                "url": self.video_url,
                "external_id": self.video_external_id,
            }
        return None

    def __repr__(self) -> str:
        return f"<Exercise(id={self.id}, name={self.name}, owner_type={self.owner_type})>"
