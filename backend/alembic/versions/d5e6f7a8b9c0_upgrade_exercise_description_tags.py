"""exercises: upgrade description (NOT NULL) and tags (TEXT → JSONB + GIN index)

Revision ID: d5e6f7a8b9c0
Revises: c4d5e6f7a8b9
Create Date: 2026-03-03 12:00:00.000000

Schema changes:
  - description: TEXT NULL  → TEXT NOT NULL  (CHECK length >= 20)
  - tags:        TEXT NULL  → JSONB NOT NULL (DEFAULT '[]', GIN index)

Data strategy:
  - COMPANY exercises get curated descriptions and normalised tag arrays.
  - COACH exercises with NULL description get a placeholder (≥ 20 chars).
  - COACH exercises with TEXT tags are split on comma and trimmed into a
    JSONB array; NULL/empty become '[]'.

The CHECK constraint is added with NOT VALID first, then validated, so
the migration is non-blocking on large tables (PostgreSQL skips a full
table scan for existing rows when adding NOT VALID, then validates
incrementally).
"""
from typing import Sequence, Union

from alembic import op

revision: str = 'd5e6f7a8b9c0'
down_revision: Union[str, None] = 'c4d5e6f7a8b9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# ---------------------------------------------------------------------------
# Curated data for the 36 known COMPANY exercises.
# Tags use the canonical filter-chip values so that the UI filter chips work
# out-of-the-box:  strength | power | mobility | conditioning | core |
#                  upper-body | lower-body
# ---------------------------------------------------------------------------
_COMPANY_DATA: list[dict] = [
    # Strength — Lower body
    {
        "name": "Back Squat",
        "description": "Compound lower body exercise targeting quads, glutes, and hamstrings using a barbell on the back.",
        "tags": ["strength", "lower-body"],
    },
    {
        "name": "Front Squat",
        "description": "Barbell squat variation with the bar held in front, emphasising quad development and core stability.",
        "tags": ["strength", "lower-body"],
    },
    {
        "name": "Romanian Deadlift",
        "description": "Hip hinge movement targeting the hamstrings and glutes with a controlled eccentric phase.",
        "tags": ["strength", "lower-body"],
    },
    {
        "name": "Conventional Deadlift",
        "description": "Foundational hip hinge lift targeting the posterior chain, glutes, and lower back.",
        "tags": ["strength", "lower-body"],
    },
    {
        "name": "Bulgarian Split Squat",
        "description": "Unilateral rear-foot-elevated squat targeting the quads, glutes, and hip flexors.",
        "tags": ["strength", "lower-body"],
    },
    {
        "name": "Hip Thrust",
        "description": "Hip extension exercise with a bar loaded across the hips, primarily targeting the glutes.",
        "tags": ["strength", "lower-body"],
    },
    {
        "name": "Nordic Hamstring Curl",
        "description": "Eccentric hamstring strengthening exercise with strong injury prevention value.",
        "tags": ["strength", "lower-body", "mobility"],
    },
    {
        "name": "Leg Press",
        "description": "Machine-based lower body push exercise targeting the quads, glutes, and hamstrings.",
        "tags": ["strength", "lower-body"],
    },
    {
        "name": "Leg Curl",
        "description": "Isolation exercise targeting the hamstrings through knee flexion on a machine.",
        "tags": ["strength", "lower-body"],
    },
    {
        "name": "Calf Raise",
        "description": "Isolation exercise for the gastrocnemius and soleus through plantar flexion.",
        "tags": ["strength", "lower-body"],
    },
    # Strength — Upper body
    {
        "name": "Bench Press",
        "description": "Horizontal pressing movement targeting the pectorals, anterior deltoids, and triceps.",
        "tags": ["strength", "upper-body"],
    },
    {
        "name": "Incline Dumbbell Press",
        "description": "Upper chest pressing exercise performed on an inclined bench with dumbbells.",
        "tags": ["strength", "upper-body"],
    },
    {
        "name": "Overhead Press",
        "description": "Vertical pressing movement targeting the deltoids, triceps, and upper trapezius.",
        "tags": ["strength", "upper-body"],
    },
    {
        "name": "Pull Up",
        "description": "Bodyweight vertical pulling movement targeting the lats, biceps, and upper back.",
        "tags": ["strength", "upper-body"],
    },
    {
        "name": "Chin Up",
        "description": "Supinated-grip vertical pull targeting the lats and biceps with more arm emphasis.",
        "tags": ["strength", "upper-body"],
    },
    {
        "name": "Barbell Row",
        "description": "Horizontal pulling movement targeting the upper back, lats, and rear deltoids.",
        "tags": ["strength", "upper-body"],
    },
    {
        "name": "Dumbbell Row",
        "description": "Unilateral horizontal pull targeting the upper back and lats with a dumbbell.",
        "tags": ["strength", "upper-body"],
    },
    {
        "name": "Lat Pulldown",
        "description": "Cable-based vertical pulling exercise targeting the latissimus dorsi and biceps.",
        "tags": ["strength", "upper-body"],
    },
    {
        "name": "Face Pull",
        "description": "Cable exercise targeting the rear deltoids, rotator cuff, and upper back muscles.",
        "tags": ["strength", "upper-body"],
    },
    {
        "name": "Dips",
        "description": "Bodyweight pressing exercise targeting the triceps, chest, and anterior deltoids.",
        "tags": ["strength", "upper-body"],
    },
    # Core & stability
    {
        "name": "Plank",
        "description": "Isometric core stability exercise developing anti-extension strength and trunk endurance.",
        "tags": ["core"],
    },
    {
        "name": "Copenhagen Plank",
        "description": "Side plank variation targeting the adductors with strong injury prevention value.",
        "tags": ["core"],
    },
    {
        "name": "Dead Bug",
        "description": "Supine core stability exercise emphasising anti-extension and contralateral coordination.",
        "tags": ["core"],
    },
    {
        "name": "Pallof Press",
        "description": "Anti-rotation core exercise using a cable to challenge transverse plane stability.",
        "tags": ["core"],
    },
    {
        "name": "Cable Woodchop",
        "description": "Rotational core exercise mimicking athletic movement patterns under cable resistance.",
        "tags": ["core"],
    },
    # Power & plyometrics
    {
        "name": "Box Jump",
        "description": "Plyometric jump onto a box developing lower body power and reactive strength.",
        "tags": ["power"],
    },
    {
        "name": "Broad Jump",
        "description": "Horizontal plyometric jump assessing and developing explosive lower body power.",
        "tags": ["power"],
    },
    {
        "name": "Trap Bar Jump",
        "description": "Loaded jump using a trap bar to develop rate of force development and power output.",
        "tags": ["power"],
    },
    {
        "name": "Medicine Ball Slam",
        "description": "Explosive full-body power exercise using a medicine ball slammed to the ground.",
        "tags": ["power", "conditioning"],
    },
    {
        "name": "Power Clean",
        "description": "Olympic weightlifting movement developing explosive triple extension and rate of force development.",
        "tags": ["power"],
    },
    # Conditioning & mobility
    {
        "name": "Farmer's Carry",
        "description": "Loaded carry exercise building grip strength, core stability, and general conditioning.",
        "tags": ["conditioning"],
    },
    {
        "name": "Sled Push",
        "description": "Resisted push using a weighted sled developing lower body strength and conditioning.",
        "tags": ["conditioning", "lower-body"],
    },
    {
        "name": "Sled Pull",
        "description": "Resisted pull using a weighted sled targeting the posterior chain and conditioning.",
        "tags": ["conditioning", "lower-body"],
    },
    {
        "name": "Battle Ropes",
        "description": "High-intensity conditioning tool using heavy ropes for metabolic and upper body training.",
        "tags": ["conditioning", "upper-body"],
    },
    {
        "name": "Hip Flexor Stretch",
        "description": "Static stretch targeting the hip flexors to improve hip extension range of motion.",
        "tags": ["mobility"],
    },
    {
        "name": "Ankle Mobility Drill",
        "description": "Mobility exercise improving ankle dorsiflexion for better squatting and running mechanics.",
        "tags": ["mobility"],
    },
]


def _sql_str(s: str) -> str:
    """Escape single quotes for safe SQL string literals."""
    return s.replace("'", "''")


def _tags_literal(tags: list[str]) -> str:
    """Build a PostgreSQL JSONB literal from a Python list of strings."""
    inner = ", ".join(f'"{t}"' for t in tags)
    return f"'[{inner}]'::jsonb"


def upgrade() -> None:
    # ------------------------------------------------------------------
    # 1. Backfill COMPANY exercise descriptions before making NOT NULL.
    #    Tags are NOT updated here — they must be updated AFTER the column
    #    type is changed to JSONB (see step 6).  Updating a TEXT column with
    #    a JSONB literal causes PostgreSQL to store the JSON text
    #    representation (e.g. '["strength","lower-body"]'), which is then
    #    mis-split by regexp_split_to_array in step 3.
    # ------------------------------------------------------------------
    for ex in _COMPANY_DATA:
        op.execute(f"""
            UPDATE exercises
               SET description = '{_sql_str(ex["description"])}'
             WHERE owner_type = 'COMPANY'
               AND name       = '{_sql_str(ex["name"])}'
        """)

    # ------------------------------------------------------------------
    # 2. Backfill any remaining COMPANY exercises not listed above.
    # ------------------------------------------------------------------
    op.execute("""
        UPDATE exercises
           SET description = 'Official exercise from the Mettle Performance library.'
         WHERE owner_type = 'COMPANY'
           AND description IS NULL
    """)

    # ------------------------------------------------------------------
    # 3. Backfill COACH exercises that have no description yet.
    #    Use a placeholder that satisfies the ≥ 20 char CHECK below.
    # ------------------------------------------------------------------
    op.execute("""
        UPDATE exercises
           SET description = 'No description added yet. Edit this exercise to add one.'
         WHERE owner_type = 'COACH'
           AND description IS NULL
    """)

    # ------------------------------------------------------------------
    # 4. Make description NOT NULL and add CHECK constraint (NOT VALID so
    #    Postgres skips a full scan of existing rows, then validate).
    # ------------------------------------------------------------------
    op.execute("ALTER TABLE exercises ALTER COLUMN description SET NOT NULL")
    op.execute("""
        ALTER TABLE exercises
        ADD CONSTRAINT ck_exercise_description_min_length
        CHECK (length(description) >= 20) NOT VALID
    """)
    op.execute("""
        ALTER TABLE exercises
        VALIDATE CONSTRAINT ck_exercise_description_min_length
    """)

    # ------------------------------------------------------------------
    # 5. Migrate tags column: TEXT → JSONB
    #    At this point COMPANY exercises still have the old comma-separated
    #    TEXT tags from the seed migration (e.g. "strength, legs").
    #    COACH exercises may have NULL, empty string, or comma-separated text.
    #
    #    PostgreSQL does NOT allow subqueries in the USING clause of
    #    ALTER COLUMN TYPE.  regexp_split_to_array + to_jsonb are pure scalar
    #    expressions and work correctly here.
    #
    #    "strength, legs" → regexp_split_to_array → {strength,legs}
    #                     → to_jsonb              → ["strength","legs"]
    # ------------------------------------------------------------------
    op.execute(r"""
        ALTER TABLE exercises
        ALTER COLUMN tags TYPE jsonb
        USING (
            CASE
                WHEN tags IS NULL OR trim(tags) = ''
                THEN '[]'::jsonb
                ELSE to_jsonb(regexp_split_to_array(trim(tags), '\s*,\s*'))
            END
        )
    """)

    # ------------------------------------------------------------------
    # 6. tags: NOT NULL + server default
    # ------------------------------------------------------------------
    op.execute("ALTER TABLE exercises ALTER COLUMN tags SET NOT NULL")
    op.execute("ALTER TABLE exercises ALTER COLUMN tags SET DEFAULT '[]'::jsonb")

    # ------------------------------------------------------------------
    # 7. GIN index for efficient @> containment queries
    # ------------------------------------------------------------------
    op.execute("""
        CREATE INDEX ix_exercises_tags_gin
        ON exercises
        USING GIN (tags)
    """)

    # ------------------------------------------------------------------
    # 8. NOW update COMPANY exercise tags with canonical filter-chip values.
    #    The column is JSONB at this point so the JSONB literals are stored
    #    correctly as JSON arrays (not as text).
    # ------------------------------------------------------------------
    for ex in _COMPANY_DATA:
        op.execute(f"""
            UPDATE exercises
               SET tags = {_tags_literal(ex["tags"])}
             WHERE owner_type = 'COMPANY'
               AND name       = '{_sql_str(ex["name"])}'
        """)

    # Any remaining COMPANY exercises not in the curated list get a default.
    op.execute("""
        UPDATE exercises
           SET tags = '["general"]'::jsonb
         WHERE owner_type = 'COMPANY'
           AND tags = '[]'::jsonb
    """)


def downgrade() -> None:
    # Remove GIN index
    op.execute("DROP INDEX IF EXISTS ix_exercises_tags_gin")

    # Revert tags: JSONB → TEXT (best-effort: jsonb_array_elements_text joined)
    op.execute("""
        ALTER TABLE exercises
        ALTER COLUMN tags TYPE text
        USING (
            CASE
                WHEN tags = '[]'::jsonb OR tags IS NULL THEN NULL
                ELSE (
                    SELECT string_agg(t, ', ')
                    FROM jsonb_array_elements_text(tags) AS t(t)
                )
            END
        )
    """)
    op.execute("ALTER TABLE exercises ALTER COLUMN tags DROP NOT NULL")
    op.execute("ALTER TABLE exercises ALTER COLUMN tags DROP DEFAULT")

    # Revert description
    op.execute("""
        ALTER TABLE exercises
        DROP CONSTRAINT IF EXISTS ck_exercise_description_min_length
    """)
    op.execute("ALTER TABLE exercises ALTER COLUMN description DROP NOT NULL")
