"""add_set_number_positive_constraint

Adds a CHECK constraint that enforces set_number > 0 on the
workout_session_log_entries table.

Revision ID: b1c4d9e2f037
Revises: a3f7c2d8e914
Create Date: 2026-02-25 11:32:44.079098

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "b1c4d9e2f037"
down_revision: Union[str, None] = "a3f7c2d8e914"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_check_constraint(
        "ck_log_entries_set_number_positive",
        "workout_session_log_entries",
        "set_number > 0",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_log_entries_set_number_positive",
        "workout_session_log_entries",
        type_="check",
    )
