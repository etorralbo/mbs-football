"""workout_templates: add status column (draft | published)

Revision ID: 2a3b4c5d6e7f
Revises: f7a8b9c0d1e2
Create Date: 2026-03-03 14:00:00.000000
"""
from typing import Sequence, Union

from alembic import op

revision: str = '2a3b4c5d6e7f'
down_revision: Union[str, None] = 'f7a8b9c0d1e2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE workout_templates
          ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'draft'
    """)
    op.execute("""
        ALTER TABLE workout_templates
          ADD CONSTRAINT ck_workout_template_status
          CHECK (status IN ('draft', 'published'))
    """)


def downgrade() -> None:
    op.execute("""
        ALTER TABLE workout_templates
          DROP CONSTRAINT ck_workout_template_status
    """)
    op.execute("""
        ALTER TABLE workout_templates
          DROP COLUMN status
    """)
