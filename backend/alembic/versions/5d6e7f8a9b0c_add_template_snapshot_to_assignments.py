"""add template_snapshot to workout_assignments

Revision ID: 5d6e7f8a9b0c
Revises: 4c5d6e7f8a9b
Create Date: 2026-03-04

Stores a JSONB snapshot of the template structure at assignment time so that
sessions are immutable after creation (the "snapshot invariant").
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

# revision identifiers, used by Alembic.
revision = "5d6e7f8a9b0c"
down_revision = "4c5d6e7f8a9b"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "workout_assignments",
        sa.Column("template_snapshot", JSONB, nullable=True),
    )


def downgrade() -> None:
    op.drop_column("workout_assignments", "template_snapshot")
