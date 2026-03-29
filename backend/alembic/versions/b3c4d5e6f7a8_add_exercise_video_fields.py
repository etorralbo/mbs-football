"""exercises: add YouTube video support (video_provider, video_url, video_external_id)

Revision ID: b3c4d5e6f7a8
Revises: 8a9b0c1d2e3f
Create Date: 2026-03-29 10:00:00.000000

Adds three nullable VARCHAR columns to the exercises table so coaches can
attach an external (YouTube) video to an exercise.

All three columns are NULL for existing exercises — full backward compatibility.
No PostgreSQL enum is used; provider is stored as VARCHAR to avoid enum
migration complexity (lesson learned from funnel_event).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b3c4d5e6f7a8"
down_revision: Union[str, None] = "8a9b0c1d2e3f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "exercises",
        sa.Column("video_provider", sa.String(20), nullable=True),
    )
    op.add_column(
        "exercises",
        sa.Column("video_url", sa.String(2048), nullable=True),
    )
    op.add_column(
        "exercises",
        sa.Column("video_external_id", sa.String(20), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("exercises", "video_external_id")
    op.drop_column("exercises", "video_url")
    op.drop_column("exercises", "video_provider")
