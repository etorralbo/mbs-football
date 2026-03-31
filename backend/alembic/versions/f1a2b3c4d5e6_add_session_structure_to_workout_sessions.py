"""workout_sessions: add session_structure for per-session coach customization

Revision ID: f1a2b3c4d5e6
Revises: e5f7a9b1c3d5
Create Date: 2026-03-31 12:00:00.000000
"""
from typing import Union

from alembic import op


revision: str = 'f1a2b3c4d5e6'
down_revision: Union[str, None] = 'e5f7a9b1c3d5'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE workout_sessions
          ADD COLUMN session_structure JSONB NULL
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE workout_sessions DROP COLUMN session_structure")
