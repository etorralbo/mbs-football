"""sprint3 assignments + sessions; sprint4 execution logs

Revision ID: a3f7c2d8e914
Revises: d48fd4f74c77
Create Date: 2026-02-25 00:00:00.000000

Covers:
  Sprint 3 (previously created only via create_all, not migration):
    - workout_assignments
    - workout_sessions
  Sprint 4 (new):
    - workout_session_logs
    - workout_session_log_entries
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'a3f7c2d8e914'
down_revision: Union[str, None] = 'd48fd4f74c77'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── workout_assignments ────────────────────────────────────────────────
    op.create_table(
        'workout_assignments',
        sa.Column('team_id', sa.UUID(), nullable=False),
        sa.Column('workout_template_id', sa.UUID(), nullable=False),
        sa.Column('target_type', sa.String(length=16), nullable=False),
        sa.Column('target_athlete_id', sa.UUID(), nullable=True),
        sa.Column('scheduled_for', sa.Date(), nullable=True),
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text("TIMEZONE('utc', NOW())"), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text("TIMEZONE('utc', NOW())"), nullable=False),
        sa.ForeignKeyConstraint(['target_athlete_id'], ['user_profiles.id'],
                                name=op.f('fk_workout_assignments_target_athlete_id_user_profiles'),
                                ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['team_id'], ['teams.id'],
                                name=op.f('fk_workout_assignments_team_id_teams'),
                                ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['workout_template_id'], ['workout_templates.id'],
                                name=op.f('fk_workout_assignments_workout_template_id_workout_templates'),
                                ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_workout_assignments')),
    )
    op.create_index(op.f('ix_workout_assignments_target_athlete_id'),
                    'workout_assignments', ['target_athlete_id'], unique=False)
    op.create_index(op.f('ix_workout_assignments_team_id'),
                    'workout_assignments', ['team_id'], unique=False)
    op.create_index(op.f('ix_workout_assignments_workout_template_id'),
                    'workout_assignments', ['workout_template_id'], unique=False)

    # ── workout_sessions ───────────────────────────────────────────────────
    op.create_table(
        'workout_sessions',
        sa.Column('assignment_id', sa.UUID(), nullable=False),
        sa.Column('athlete_id', sa.UUID(), nullable=False),
        sa.Column('workout_template_id', sa.UUID(), nullable=False),
        sa.Column('scheduled_for', sa.Date(), nullable=True),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text("TIMEZONE('utc', NOW())"), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text("TIMEZONE('utc', NOW())"), nullable=False),
        sa.ForeignKeyConstraint(['assignment_id'], ['workout_assignments.id'],
                                name=op.f('fk_workout_sessions_assignment_id_workout_assignments'),
                                ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['athlete_id'], ['user_profiles.id'],
                                name=op.f('fk_workout_sessions_athlete_id_user_profiles'),
                                ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['workout_template_id'], ['workout_templates.id'],
                                name=op.f('fk_workout_sessions_workout_template_id_workout_templates'),
                                ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_workout_sessions')),
    )
    op.create_index(op.f('ix_workout_sessions_assignment_id'),
                    'workout_sessions', ['assignment_id'], unique=False)
    op.create_index(op.f('ix_workout_sessions_athlete_id'),
                    'workout_sessions', ['athlete_id'], unique=False)
    op.create_index(op.f('ix_workout_sessions_workout_template_id'),
                    'workout_sessions', ['workout_template_id'], unique=False)

    # ── workout_session_logs ───────────────────────────────────────────────
    op.create_table(
        'workout_session_logs',
        sa.Column('team_id', sa.UUID(), nullable=False),
        sa.Column('session_id', sa.UUID(), nullable=False),
        sa.Column('block_name', sa.String(length=255), nullable=False),
        sa.Column('exercise_id', sa.UUID(), nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_by_profile_id', sa.UUID(), nullable=True),
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text("TIMEZONE('utc', NOW())"), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text("TIMEZONE('utc', NOW())"), nullable=False),
        sa.ForeignKeyConstraint(['created_by_profile_id'], ['user_profiles.id'],
                                name=op.f('fk_workout_session_logs_created_by_profile_id_user_profiles'),
                                ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['exercise_id'], ['exercises.id'],
                                name=op.f('fk_workout_session_logs_exercise_id_exercises'),
                                ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['session_id'], ['workout_sessions.id'],
                                name=op.f('fk_workout_session_logs_session_id_workout_sessions'),
                                ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['team_id'], ['teams.id'],
                                name=op.f('fk_workout_session_logs_team_id_teams'),
                                ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_workout_session_logs')),
    )
    op.create_index('ix_workout_session_logs_team_session',
                    'workout_session_logs', ['team_id', 'session_id'], unique=False)
    op.create_index(op.f('ix_workout_session_logs_exercise_id'),
                    'workout_session_logs', ['exercise_id'], unique=False)

    # ── workout_session_log_entries ────────────────────────────────────────
    op.create_table(
        'workout_session_log_entries',
        sa.Column('log_id', sa.UUID(), nullable=False),
        sa.Column('set_number', sa.Integer(), nullable=False),
        sa.Column('reps', sa.Integer(), nullable=True),
        sa.Column('weight', sa.Float(), nullable=True),
        sa.Column('rpe', sa.Float(), nullable=True),
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text("TIMEZONE('utc', NOW())"), nullable=False),
        sa.ForeignKeyConstraint(['log_id'], ['workout_session_logs.id'],
                                name=op.f('fk_workout_session_log_entries_log_id_workout_session_logs'),
                                ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_workout_session_log_entries')),
    )
    op.create_index(op.f('ix_workout_session_log_entries_log_id'),
                    'workout_session_log_entries', ['log_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_workout_session_log_entries_log_id'),
                  table_name='workout_session_log_entries')
    op.drop_table('workout_session_log_entries')

    op.drop_index(op.f('ix_workout_session_logs_exercise_id'),
                  table_name='workout_session_logs')
    op.drop_index('ix_workout_session_logs_team_session',
                  table_name='workout_session_logs')
    op.drop_table('workout_session_logs')

    op.drop_index(op.f('ix_workout_sessions_workout_template_id'),
                  table_name='workout_sessions')
    op.drop_index(op.f('ix_workout_sessions_athlete_id'),
                  table_name='workout_sessions')
    op.drop_index(op.f('ix_workout_sessions_assignment_id'),
                  table_name='workout_sessions')
    op.drop_table('workout_sessions')

    op.drop_index(op.f('ix_workout_assignments_workout_template_id'),
                  table_name='workout_assignments')
    op.drop_index(op.f('ix_workout_assignments_team_id'),
                  table_name='workout_assignments')
    op.drop_index(op.f('ix_workout_assignments_target_athlete_id'),
                  table_name='workout_assignments')
    op.drop_table('workout_assignments')
