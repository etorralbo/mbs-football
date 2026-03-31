"""workout_templates: add system_template_key for stable sample identity

Revision ID: e5f7a9b1c3d5
Revises: d4e5f6a8b9c1
Create Date: 2026-03-31 10:00:00.000000
"""
from typing import Union

from alembic import op


revision: str = 'e5f7a9b1c3d5'
down_revision: Union[str, None] = 'd4e5f6a8b9c1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE workout_templates
          ADD COLUMN system_template_key VARCHAR(64) NULL
    """)
    op.execute("""
        CREATE UNIQUE INDEX uix_workout_templates_team_system_key
          ON workout_templates (team_id, system_template_key)
          WHERE system_template_key IS NOT NULL
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uix_workout_templates_team_system_key")
    op.execute("ALTER TABLE workout_templates DROP COLUMN system_template_key")
