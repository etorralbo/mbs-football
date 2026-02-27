"""add session_completed to funnel_event enum

Revision ID: a1b2c3d4e5f6
Revises: ff6f8d76c493
Create Date: 2026-02-27 18:30:00.000000

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = 'ff6f8d76c493'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ALTER TYPE ... ADD VALUE is idempotent with IF NOT EXISTS (PG 9.3+).
    # Safe to run inside a transaction in PostgreSQL 12+.
    op.execute("ALTER TYPE funnel_event ADD VALUE IF NOT EXISTS 'SESSION_COMPLETED'")


def downgrade() -> None:
    # PostgreSQL does not support removing enum values once added.
    # The value will remain harmless if unused; document the limitation here.
    pass
