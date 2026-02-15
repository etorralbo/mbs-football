import uuid
from datetime import datetime
from typing import Annotated

from sqlalchemy import MetaData, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


# UUID primary key type
uuid_pk = Annotated[
    uuid.UUID,
    mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
]

# Timestamps with timezone awareness and server defaults
created_at = Annotated[
    datetime,
    mapped_column(
        nullable=False,
        server_default=text("TIMEZONE('utc', NOW())")
    )
]

updated_at = Annotated[
    datetime,
    mapped_column(
        nullable=False,
        server_default=text("TIMEZONE('utc', NOW())"),
        onupdate=datetime.utcnow
    )
]


class Base(DeclarativeBase):
    """
    SQLAlchemy 2.0 DeclarativeBase for all models.
    """
    metadata = MetaData(
        naming_convention={
            "ix": "ix_%(column_0_label)s",
            "uq": "uq_%(table_name)s_%(column_0_name)s",
            "ck": "ck_%(table_name)s_%(constraint_name)s",
            "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
            "pk": "pk_%(table_name)s"
        }
    )


class TimestampMixin:
    """
    Mixin providing id, created_at, and updated_at columns.
    """
    id: Mapped[uuid_pk]
    created_at: Mapped[created_at]
    updated_at: Mapped[updated_at]
