"""add session_first_log_added to funnel_event enum

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-02-28 11:00:00.000000

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'f6a7b8c9d0e1'
down_revision: Union[str, None] = 'e5f6a7b8c9d0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ALTER TYPE ... ADD VALUE is idempotent with IF NOT EXISTS (PG 9.3+).
    # Safe to run inside a transaction in PostgreSQL 12+.
    op.execute("ALTER TYPE funnel_event ADD VALUE IF NOT EXISTS 'SESSION_FIRST_LOG_ADDED'")


def downgrade() -> None:
    # PostgreSQL does not support removing enum values once added.
    # The value will remain harmless if unused.
    pass
