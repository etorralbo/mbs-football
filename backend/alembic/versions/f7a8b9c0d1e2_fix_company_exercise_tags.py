"""exercises: fix COMPANY exercise tags corrupted by d5e6f7a8b9c0

Revision ID: f7a8b9c0d1e2
Revises: e6f7a8b9c0d1
Create Date: 2026-03-03 13:00:00.000000

Root cause:
  Migration d5e6f7a8b9c0 updated COMPANY exercises' tags column (still TEXT
  at that point) with JSONB literals like '["strength","lower-body"]'::jsonb.
  PostgreSQL coerced those JSONB values to their text representation, storing
  the string '["strength","lower-body"]' in the TEXT column.

  The subsequent ALTER COLUMN TYPE … USING then ran
  regexp_split_to_array(trim(tags), '\\s*,\\s*') on that text, splitting
  '["strength","lower-body"]' into two tokens:
    - '["strength"'
    - '"lower-body"]'
  and wrapped them in a JSONB array, producing the malformed value
  ["[\"strength\"", "\"lower-body\"]"] instead of ["strength","lower-body"].

Fix:
  Re-apply the correct JSONB tag values now that the column is JSONB.
  COMPANY exercises not in the known list get '["general"]'::jsonb only if
  their current tags are not a clean array (i.e. they contain fragments).
"""
from typing import Sequence, Union

from alembic import op

revision: str = 'f7a8b9c0d1e2'
down_revision: Union[str, None] = 'e6f7a8b9c0d1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# ---------------------------------------------------------------------------
# Same curated data as d5e6f7a8b9c0 — tags use canonical filter-chip values.
# ---------------------------------------------------------------------------
_COMPANY_DATA: list[dict] = [
    {"name": "Back Squat",              "tags": ["strength", "lower-body"]},
    {"name": "Front Squat",             "tags": ["strength", "lower-body"]},
    {"name": "Romanian Deadlift",       "tags": ["strength", "lower-body"]},
    {"name": "Conventional Deadlift",   "tags": ["strength", "lower-body"]},
    {"name": "Bulgarian Split Squat",   "tags": ["strength", "lower-body"]},
    {"name": "Hip Thrust",              "tags": ["strength", "lower-body"]},
    {"name": "Nordic Hamstring Curl",   "tags": ["strength", "lower-body", "mobility"]},
    {"name": "Leg Press",               "tags": ["strength", "lower-body"]},
    {"name": "Leg Curl",                "tags": ["strength", "lower-body"]},
    {"name": "Calf Raise",              "tags": ["strength", "lower-body"]},
    {"name": "Bench Press",             "tags": ["strength", "upper-body"]},
    {"name": "Incline Dumbbell Press",  "tags": ["strength", "upper-body"]},
    {"name": "Overhead Press",          "tags": ["strength", "upper-body"]},
    {"name": "Pull Up",                 "tags": ["strength", "upper-body"]},
    {"name": "Chin Up",                 "tags": ["strength", "upper-body"]},
    {"name": "Barbell Row",             "tags": ["strength", "upper-body"]},
    {"name": "Dumbbell Row",            "tags": ["strength", "upper-body"]},
    {"name": "Lat Pulldown",            "tags": ["strength", "upper-body"]},
    {"name": "Face Pull",               "tags": ["strength", "upper-body"]},
    {"name": "Dips",                    "tags": ["strength", "upper-body"]},
    {"name": "Plank",                   "tags": ["core"]},
    {"name": "Copenhagen Plank",        "tags": ["core"]},
    {"name": "Dead Bug",                "tags": ["core"]},
    {"name": "Pallof Press",            "tags": ["core"]},
    {"name": "Cable Woodchop",          "tags": ["core"]},
    {"name": "Box Jump",                "tags": ["power"]},
    {"name": "Broad Jump",              "tags": ["power"]},
    {"name": "Trap Bar Jump",           "tags": ["power"]},
    {"name": "Medicine Ball Slam",      "tags": ["power", "conditioning"]},
    {"name": "Power Clean",             "tags": ["power"]},
    {"name": "Sled Push",               "tags": ["conditioning"]},
    {"name": "Prowler Sprint",          "tags": ["conditioning"]},
    {"name": "Battle Ropes",            "tags": ["conditioning"]},
    {"name": "Hip Flexor Stretch",      "tags": ["mobility"]},
    {"name": "Thoracic Rotation",       "tags": ["mobility"]},
    {"name": "Ankle Mobility Drill",    "tags": ["mobility"]},
]


def _sql_str(s: str) -> str:
    return s.replace("'", "''")


def _tags_literal(tags: list[str]) -> str:
    """Build a safe PostgreSQL JSONB array literal."""
    inner = ", ".join(f'"{t}"' for t in tags)
    return f"'[{inner}]'::jsonb"


def upgrade() -> None:
    # Re-apply correct tags for all known COMPANY exercises.
    # The column is now JSONB so the cast is applied correctly.
    for ex in _COMPANY_DATA:
        op.execute(f"""
            UPDATE exercises
               SET tags = {_tags_literal(ex["tags"])}
             WHERE owner_type = 'COMPANY'
               AND name       = '{_sql_str(ex["name"])}'
        """)

    # Any COMPANY exercise not in the list but with malformed tags (containing
    # array fragment strings that start with '[') gets reset to '["general"]'.
    op.execute("""
        UPDATE exercises
           SET tags = '["general"]'::jsonb
         WHERE owner_type = 'COMPANY'
           AND EXISTS (
               SELECT 1
               FROM jsonb_array_elements_text(tags) t(tag)
               WHERE tag LIKE '[%' OR tag LIKE '%]'
           )
    """)


def downgrade() -> None:
    # No meaningful rollback — the previous state was corrupted data.
    # Downgrading would re-introduce corruption, so this is intentionally a no-op.
    pass
