"""exercises: add exercise_favorites table for coach bookmarks

Revision ID: e6f7a8b9c0d1
Revises: d5e6f7a8b9c0
Create Date: 2026-03-03 12:30:00.000000

Each coach can mark any visible exercise (COMPANY or own COACH) as a
favourite. Favourites are coach-scoped — coaches cannot see each other's
bookmarks.  The primary key (coach_id, exercise_id) naturally prevents
duplicates and makes toggle logic a simple INSERT … ON CONFLICT DO NOTHING
/ DELETE combination.

ON DELETE CASCADE on exercise_id ensures that deleting a COACH exercise
automatically removes its bookmark rows — no orphan cleanup needed.
"""
from typing import Sequence, Union

from alembic import op

revision: str = 'e6f7a8b9c0d1'
down_revision: Union[str, None] = 'd5e6f7a8b9c0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE exercise_favorites (
            coach_id    UUID        NOT NULL
                            REFERENCES user_profiles(id) ON DELETE CASCADE,
            exercise_id UUID        NOT NULL
                            REFERENCES exercises(id)     ON DELETE CASCADE,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (coach_id, exercise_id)
        )
    """)

    # Lookup index so "give me all favourites for coach X" is O(log n)
    op.execute("""
        CREATE INDEX ix_exercise_favorites_coach_id
        ON exercise_favorites (coach_id)
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS exercise_favorites")
