"""add invite_created to funnel_event enum

Revision ID: c3d4e5f6a7b8
Revises: a1b2c3d4e5f6
Create Date: 2026-02-28 08:00:00.000000

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ALTER TYPE ... ADD VALUE is idempotent with IF NOT EXISTS (PG 9.3+).
    # Safe to run inside a transaction in PostgreSQL 12+.
    op.execute("ALTER TYPE funnel_event ADD VALUE IF NOT EXISTS 'INVITE_CREATED'")


def downgrade() -> None:
    # PostgreSQL does not support removing enum values once added.
    # The value will remain harmless if unused.
    pass
