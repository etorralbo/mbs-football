"""exercises: seed default COMPANY exercise dataset

Revision ID: c4d5e6f7a8b9
Revises: b2c3d4e5f6a7
Create Date: 2026-03-03 10:00:00.000000

Data migration — inserts the curated list of company-managed exercises.

Safety guarantees:
  - Idempotent: uses INSERT … ON CONFLICT ON CONSTRAINT DO NOTHING, keyed
    on the partial unique index uix_company_exercise_name (name WHERE
    owner_type = 'COMPANY').  Re-running alembic upgrade head is safe.
  - No IDs are hard-coded; UUIDs are generated at migration time via
    gen_random_uuid() so they are unique per environment.
  - coach_id is NULL and is_editable is FALSE for every row.

Downgrade removes ONLY the exact names seeded here, leaving any
company exercises added manually after deployment untouched.
"""
from typing import Sequence, Union

from alembic import op

revision: str = 'c4d5e6f7a8b9'
down_revision: Union[str, None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# ---------------------------------------------------------------------------
# Dataset
# ---------------------------------------------------------------------------
# Each entry becomes one COMPANY exercise row.
# Adjust or extend this list freely — the upsert makes re-runs safe.
_COMPANY_EXERCISES: list[dict] = [
    # Strength — Lower body
    {"name": "Back Squat",             "tags": "strength, legs"},
    {"name": "Front Squat",            "tags": "strength, legs"},
    {"name": "Romanian Deadlift",      "tags": "strength, legs, posterior chain"},
    {"name": "Conventional Deadlift",  "tags": "strength, legs, posterior chain"},
    {"name": "Bulgarian Split Squat",  "tags": "strength, legs, unilateral"},
    {"name": "Hip Thrust",             "tags": "strength, glutes, posterior chain"},
    {"name": "Nordic Hamstring Curl",  "tags": "strength, hamstrings, injury prevention"},
    {"name": "Leg Press",              "tags": "strength, legs"},
    {"name": "Leg Curl",               "tags": "strength, hamstrings"},
    {"name": "Calf Raise",             "tags": "strength, calves"},
    # Strength — Upper body
    {"name": "Bench Press",            "tags": "strength, chest, push"},
    {"name": "Incline Dumbbell Press", "tags": "strength, chest, push"},
    {"name": "Overhead Press",         "tags": "strength, shoulders, push"},
    {"name": "Pull Up",                "tags": "strength, back, pull"},
    {"name": "Chin Up",                "tags": "strength, back, pull"},
    {"name": "Barbell Row",            "tags": "strength, back, pull"},
    {"name": "Dumbbell Row",           "tags": "strength, back, pull, unilateral"},
    {"name": "Lat Pulldown",           "tags": "strength, back, pull"},
    {"name": "Face Pull",              "tags": "strength, shoulders, rear delt"},
    {"name": "Dips",                   "tags": "strength, triceps, push"},
    # Core & stability
    {"name": "Plank",                  "tags": "core, stability"},
    {"name": "Copenhagen Plank",       "tags": "core, adductors, injury prevention"},
    {"name": "Dead Bug",               "tags": "core, stability"},
    {"name": "Pallof Press",           "tags": "core, anti-rotation"},
    {"name": "Cable Woodchop",         "tags": "core, rotation"},
    # Power & plyometrics
    {"name": "Box Jump",               "tags": "power, plyometrics"},
    {"name": "Broad Jump",             "tags": "power, plyometrics"},
    {"name": "Trap Bar Jump",          "tags": "power, plyometrics"},
    {"name": "Medicine Ball Slam",     "tags": "power, conditioning"},
    {"name": "Power Clean",            "tags": "power, olympic lifting"},
    # Conditioning & mobility
    {"name": "Farmer's Carry",         "tags": "conditioning, grip, carry"},
    {"name": "Sled Push",              "tags": "conditioning, legs"},
    {"name": "Sled Pull",              "tags": "conditioning, legs"},
    {"name": "Battle Ropes",           "tags": "conditioning, upper body"},
    {"name": "Hip Flexor Stretch",     "tags": "mobility, flexibility"},
    {"name": "Ankle Mobility Drill",   "tags": "mobility, injury prevention"},
]


def _rows_sql() -> str:
    """Build the VALUES clause for the bulk INSERT."""
    rows = []
    for ex in _COMPANY_EXERCISES:
        name = ex["name"].replace("'", "''")   # SQL-escape single quotes
        tags = ex.get("tags", "")
        tags_escaped = tags.replace("'", "''")
        rows.append(
            f"(gen_random_uuid(), 'COMPANY', FALSE, NULL, '{name}', '{tags_escaped}', NOW(), NOW())"
        )
    return ",\n    ".join(rows)


def upgrade() -> None:
    op.execute(f"""
        INSERT INTO exercises
            (id, owner_type, is_editable, coach_id, name, tags, created_at, updated_at)
        VALUES
            {_rows_sql()}
        ON CONFLICT (name) WHERE owner_type = 'COMPANY'
        DO NOTHING
    """)


def downgrade() -> None:
    names_csv = ", ".join(
        f"'{ex['name'].replace(chr(39), chr(39)*2)}'"
        for ex in _COMPANY_EXERCISES
    )
    op.execute(f"""
        DELETE FROM exercises
        WHERE owner_type = 'COMPANY'
          AND name IN ({names_csv})
    """)
