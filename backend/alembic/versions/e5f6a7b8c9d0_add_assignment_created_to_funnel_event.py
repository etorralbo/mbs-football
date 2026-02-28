"""add assignment_created to funnel_event enum

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-02-28 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'e5f6a7b8c9d0'
down_revision: Union[str, None] = 'd4e5f6a7b8c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ALTER TYPE ... ADD VALUE is idempotent with IF NOT EXISTS (PG 9.3+).
    # Safe to run inside a transaction in PostgreSQL 12+.
    op.execute("ALTER TYPE funnel_event ADD VALUE IF NOT EXISTS 'ASSIGNMENT_CREATED'")


def downgrade() -> None:
    # PostgreSQL does not support removing enum values once added.
    # The value will remain harmless if unused.
    pass
