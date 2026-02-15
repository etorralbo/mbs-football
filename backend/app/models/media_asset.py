import enum
import uuid

from sqlalchemy import BigInteger, Enum, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class MediaAssetType(str, enum.Enum):
    """Media asset types."""
    VIDEO = "VIDEO"


class MediaAsset(Base, TimestampMixin):
    """
    MediaAsset model for storing video and media references.

    Stores metadata about media files (videos, etc.) associated with a team.
    The actual file is stored elsewhere (S3, etc.) referenced by storage_key.
    """
    __tablename__ = "media_assets"

    team_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("teams.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    type: Mapped[MediaAssetType] = mapped_column(
        Enum(MediaAssetType, name="media_asset_type", native_enum=False),
        nullable=False
    )
    storage_key: Mapped[str] = mapped_column(
        String(512),
        unique=True,
        nullable=False
    )
    mime_type: Mapped[str] = mapped_column(String(127), nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)

    def __repr__(self) -> str:
        return f"<MediaAsset(id={self.id}, type={self.type}, storage_key={self.storage_key})>"
