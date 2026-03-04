"""Add cancelled_at to workout_sessions and session_cancelled enum value.

Revision ID: 6e7f8a9b0c1d
Revises: 5d6e7f8a9b0c
Create Date: 2026-03-04
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import TIMESTAMP

# revision identifiers, used by Alembic.
revision = "6e7f8a9b0c1d"
down_revision = "5d6e7f8a9b0c"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "workout_sessions",
        sa.Column("cancelled_at", TIMESTAMP(timezone=True), nullable=True),
    )
    # Add new enum value — DDL-only, cannot run inside a transaction on PG < 12,
    # but Alembic runs each migration in its own transaction by default.
    # ADD VALUE IF NOT EXISTS is safe and idempotent.
    op.execute("ALTER TYPE funnel_event ADD VALUE IF NOT EXISTS 'session_cancelled'")


def downgrade() -> None:
    op.drop_column("workout_sessions", "cancelled_at")
    # Enum value removal is not supported by PostgreSQL; leave in place.
