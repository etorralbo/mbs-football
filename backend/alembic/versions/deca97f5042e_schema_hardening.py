"""schema_hardening

Resolves migration drift and adds missing constraints:

1. Replaces the composite (team_id, session_id) index on workout_session_logs
   with two separate single-column indexes — aligns DB with the current model.
2. Indexes workout_session_logs.created_by_profile_id (FK without index).
3. Adds CHECK constraint on workout_assignments.target_type so only
   'team' and 'athlete' are valid at the DB level.
4. Adds UNIQUE(assignment_id, athlete_id) on workout_sessions to prevent
   duplicate sessions being created for the same athlete per assignment.

Revision ID: deca97f5042e
Revises: b1c4d9e2f037
Create Date: 2026-02-26 09:15:42.992694

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'deca97f5042e'
down_revision: Union[str, None] = 'b1c4d9e2f037'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Fix index drift: composite → two separate single-column indexes
    op.drop_index("ix_workout_session_logs_team_session",
                  table_name="workout_session_logs")
    op.create_index("ix_workout_session_logs_session_id",
                    "workout_session_logs", ["session_id"])
    op.create_index("ix_workout_session_logs_team_id",
                    "workout_session_logs", ["team_id"])

    # 2. Index the FK column that was missing
    op.create_index("ix_workout_session_logs_created_by_profile_id",
                    "workout_session_logs", ["created_by_profile_id"])

    # 3. Enforce valid target_type values at the DB level
    op.create_check_constraint(
        "ck_target_type_valid",
        "workout_assignments",
        "target_type IN ('team', 'athlete')",
    )

    # 4. Prevent duplicate sessions per athlete per assignment
    op.create_unique_constraint(
        "uq_session_assignment_athlete",
        "workout_sessions",
        ["assignment_id", "athlete_id"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_session_assignment_athlete",
                       "workout_sessions", type_="unique")
    op.drop_constraint("ck_target_type_valid",
                       "workout_assignments", type_="check")
    op.drop_index("ix_workout_session_logs_created_by_profile_id",
                  table_name="workout_session_logs")
    op.drop_index("ix_workout_session_logs_team_id",
                  table_name="workout_session_logs")
    op.drop_index("ix_workout_session_logs_session_id",
                  table_name="workout_session_logs")
    op.create_index("ix_workout_session_logs_team_session",
                    "workout_session_logs", ["team_id", "session_id"])
