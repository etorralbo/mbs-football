"""scope team name to creator and template title to team

Revision ID: 7f8a9b0c1d2e
Revises: 6e7f8a9b0c1d
Create Date: 2026-03-04 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers, used by Alembic.
revision: str = "7f8a9b0c1d2e"
down_revision: Union[str, None] = "6e7f8a9b0c1d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Task 1: teams.created_by_user_id + scoped unique ────────────────

    # 1a. Add column (nullable for backfill)
    op.add_column(
        "teams",
        sa.Column("created_by_user_id", UUID(as_uuid=True), nullable=True),
    )

    # 1b. Backfill from the first COACH membership per team
    op.execute(
        """
        UPDATE teams
        SET created_by_user_id = sub.user_id
        FROM (
            SELECT DISTINCT ON (team_id) team_id, user_id
            FROM memberships
            WHERE role = 'COACH'
            ORDER BY team_id, created_at
        ) sub
        WHERE teams.id = sub.team_id
          AND teams.created_by_user_id IS NULL
        """
    )

    # 1c. Teams without any COACH membership (orphans) — assign a sentinel
    #     so we can set NOT NULL. In practice all teams have a coach.
    op.execute(
        """
        UPDATE teams
        SET created_by_user_id = '00000000-0000-0000-0000-000000000000'
        WHERE created_by_user_id IS NULL
        """
    )

    # 1d. Set NOT NULL
    op.alter_column("teams", "created_by_user_id", nullable=False)

    # 1e. Drop the global unique index on name
    op.drop_index("ix_teams_name", table_name="teams")

    # 1f. Create scoped unique index (case-insensitive)
    op.execute(
        """
        CREATE UNIQUE INDEX uix_teams_creator_name
        ON teams (created_by_user_id, lower(name))
        """
    )

    # 1g. Create non-unique index on name for general lookups
    op.create_index("ix_teams_name", "teams", ["name"])

    # ── Task 2: workout_templates scoped unique on (team_id, lower(title)) ─
    op.execute(
        """
        CREATE UNIQUE INDEX uix_templates_team_title
        ON workout_templates (team_id, lower(title))
        """
    )


def downgrade() -> None:
    # ── Reverse Task 2 ──────────────────────────────────────────────────
    op.drop_index("uix_templates_team_title", table_name="workout_templates")

    # ── Reverse Task 1 ──────────────────────────────────────────────────
    op.drop_index("ix_teams_name", table_name="teams")
    op.drop_index("uix_teams_creator_name", table_name="teams")

    # Recreate the original global unique index
    op.create_index("ix_teams_name", "teams", ["name"], unique=True)

    op.drop_column("teams", "created_by_user_id")
