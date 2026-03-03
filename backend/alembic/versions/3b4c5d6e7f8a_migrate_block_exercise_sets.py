"""block_exercises: migrate prescription_json to per-set array format

Revision ID: 3b4c5d6e7f8a
Revises: 2a3b4c5d6e7f
Create Date: 2026-03-03 16:00:00.000000
"""
from typing import Sequence, Union

from alembic import op

revision: str = '3b4c5d6e7f8a'
down_revision: Union[str, None] = '2a3b4c5d6e7f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Transform all rows that don't already have prescription_json.sets as an array.
    # Existing rows are either {} or contain old flat fields (sets_count/reps/etc.).
    # All get a single default set with null values; coaches will fill in actuals.
    op.execute("""
        UPDATE block_exercises
        SET prescription_json = '{"sets": [{"order": 0, "reps": null, "weight": null, "rpe": null}]}'::jsonb
        WHERE jsonb_typeof(prescription_json->'sets') != 'array'
    """)


def downgrade() -> None:
    # Strip the sets key, leaving an empty object.
    op.execute("""
        UPDATE block_exercises
        SET prescription_json = prescription_json - 'sets'
        WHERE jsonb_typeof(prescription_json->'sets') = 'array'
    """)
