"""exercises: scope by coach_id instead of team_id

Revision ID: a7b8c9d0e1f2
Revises: f6a7b8c9d0e1
Create Date: 2026-03-02 10:00:00.000000

Replaces exercises.team_id (FK → teams) with exercises.coach_id (FK → user_profiles.id).
A coach's exercise library is now personal and reusable across all teams they coach.

Data migration: sets coach_id = UserProfile.id for the COACH of each exercise's former team.
Exercises whose team has no COACH membership are dropped (shouldn't happen in production).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID as PG_UUID

# revision identifiers, used by Alembic.
revision: str = 'a7b8c9d0e1f2'
down_revision: Union[str, None] = 'a8b9c0d1e2f3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Drop existing unique constraint that references team_id
    op.drop_constraint('uq_exercise_team_name', 'exercises', type_='unique')

    # 2. Add coach_id column (nullable first to allow data migration)
    op.add_column('exercises', sa.Column(
        'coach_id',
        PG_UUID(as_uuid=True),
        nullable=True,
    ))

    # 3. Data migration: populate coach_id from the COACH member of each exercise's team.
    #    Uses the first COACH found per team (ORDER BY created_at to be deterministic).
    op.execute("""
        UPDATE exercises e
        SET coach_id = up.id
        FROM user_profiles up
        JOIN memberships m ON m.user_id = up.supabase_user_id
        WHERE m.team_id = e.team_id
          AND m.role = 'COACH'
          AND up.id = (
              SELECT up2.id
              FROM user_profiles up2
              JOIN memberships m2 ON m2.user_id = up2.supabase_user_id
              WHERE m2.team_id = e.team_id
                AND m2.role = 'COACH'
              ORDER BY m2.created_at
              LIMIT 1
          )
    """)

    # 4. Delete exercises that could not be migrated (no COACH in team)
    op.execute("DELETE FROM exercises WHERE coach_id IS NULL")

    # 5. Add FK constraint and make NOT NULL
    op.create_foreign_key(
        'fk_exercises_coach_id',
        'exercises', 'user_profiles',
        ['coach_id'], ['id'],
        ondelete='CASCADE',
    )
    op.alter_column('exercises', 'coach_id', nullable=False)

    # 6. Drop old team_id column
    op.drop_column('exercises', 'team_id')

    # 7. Add new unique constraint on (coach_id, name)
    op.create_unique_constraint('uq_exercise_coach_name', 'exercises', ['coach_id', 'name'])

    # 8. Add index on coach_id for fast lookups
    op.create_index('ix_exercises_coach_id', 'exercises', ['coach_id'])


def downgrade() -> None:
    # Reverse: restore team_id column (data loss — coach_id → team mapping may be ambiguous)
    op.drop_index('ix_exercises_coach_id', table_name='exercises')
    op.drop_constraint('uq_exercise_coach_name', 'exercises', type_='unique')
    op.drop_constraint('fk_exercises_coach_id', 'exercises', type_='foreignkey')

    op.add_column('exercises', sa.Column(
        'team_id',
        PG_UUID(as_uuid=True),
        nullable=True,
    ))

    # Best-effort backfill: set team_id from the coach's primary team
    op.execute("""
        UPDATE exercises e
        SET team_id = m.team_id
        FROM user_profiles up
        JOIN memberships m ON m.user_id = up.supabase_user_id AND m.role = 'COACH'
        WHERE up.id = e.coach_id
        AND m.team_id = (
            SELECT m2.team_id
            FROM memberships m2
            WHERE m2.user_id = up.supabase_user_id AND m2.role = 'COACH'
            ORDER BY m2.created_at
            LIMIT 1
        )
    """)

    op.execute("DELETE FROM exercises WHERE team_id IS NULL")

    op.create_foreign_key(
        'fk_exercises_team_id',
        'exercises', 'teams',
        ['team_id'], ['id'],
        ondelete='CASCADE',
    )
    op.alter_column('exercises', 'team_id', nullable=False)
    op.drop_column('exercises', 'coach_id')
    op.create_unique_constraint('uq_exercise_team_name', 'exercises', ['team_id', 'name'])
    op.create_index('ix_exercises_team_id', 'exercises', ['team_id'])
