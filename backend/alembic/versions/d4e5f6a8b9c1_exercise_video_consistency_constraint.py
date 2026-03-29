"""exercises: add CHECK constraint for video column consistency

Revision ID: d4e5f6a8b9c1
Revises: b3c4d5e6f7a8
Create Date: 2026-03-29 11:00:00.000000

Enforces the invariant that the three video columns (video_provider,
video_url, video_external_id) are either all NULL or all NOT NULL.
A partial state (e.g., provider set but external_id NULL) is a data error
that should never be persisted.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "d4e5f6a8b9c1"
down_revision: Union[str, None] = "b3c4d5e6f7a8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_CONSTRAINT = "chk_exercise_video_columns_all_or_none"


def upgrade() -> None:
    op.execute(f"""
        ALTER TABLE exercises ADD CONSTRAINT {_CONSTRAINT}
        CHECK (
            (video_provider IS NULL AND video_url IS NULL AND video_external_id IS NULL)
            OR
            (video_provider IS NOT NULL AND video_url IS NOT NULL AND video_external_id IS NOT NULL)
        )
    """)


def downgrade() -> None:
    op.execute(f"ALTER TABLE exercises DROP CONSTRAINT {_CONSTRAINT}")
