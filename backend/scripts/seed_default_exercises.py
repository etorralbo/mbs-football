"""
Seed a coach's exercise library with a curated set of 30 sport-generic exercises.

Usage:
    # via env var
    DATABASE_URL=postgresql+psycopg://... COACH_ID=<uuid> python scripts/seed_default_exercises.py

    # via CLI argument
    DATABASE_URL=postgresql+psycopg://... python scripts/seed_default_exercises.py <coach-uuid>

    # inside Docker (local)
    docker compose exec backend python scripts/seed_default_exercises.py <coach-uuid>

    # inside Render shell (if available) or one-off job
    python scripts/seed_default_exercises.py <coach-uuid>

Idempotent: exercises that already exist (matched by coach_id + name) are skipped.
No PII is written — all names are generic and sport-agnostic.
"""
import os
import sys
import uuid
from pathlib import Path

# Make the backend package importable when running from the repo root or
# from the scripts/ directory directly.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker

from app.models.exercise import Exercise

# ---------------------------------------------------------------------------
# Curated exercise library — 30 exercises across the 6 fixed blocks.
# Tags use the same keywords as the block names so the AI matcher scores them
# correctly even when the team has no other exercises.
# ---------------------------------------------------------------------------

EXERCISES = [
    # --- Preparation to Movement ---
    {
        "name": "Dynamic Hip Flexor Stretch",
        "description": "Lunge-based dynamic stretch targeting hip flexors and thoracic rotation.",
        "tags": "preparation,movement,mobility,warmup,hip,dynamic",
    },
    {
        "name": "Glute Bridge Activation",
        "description": "Supine glute bridge held 2 s per rep to activate posterior chain before loading.",
        "tags": "preparation,movement,activation,warmup,glute,hip",
    },
    {
        "name": "Lateral Band Walk",
        "description": "Mini-band side steps to activate gluteus medius and hip abductors.",
        "tags": "preparation,movement,activation,warmup,hip,lateral",
    },
    {
        "name": "Leg Swing",
        "description": "Front-to-back and lateral leg swings to increase hip range of motion.",
        "tags": "preparation,movement,mobility,warmup,hip,dynamic",
    },
    {
        "name": "Ankle Mobility Drill",
        "description": "Wall ankle dorsiflexion drill to improve ankle range of motion.",
        "tags": "preparation,movement,mobility,warmup,ankle",
    },
    # --- Plyometrics ---
    {
        "name": "Box Jump",
        "description": "Maximal-effort two-leg jump onto a box; step down under control.",
        "tags": "plyometrics,jump,explosive,power,lower",
    },
    {
        "name": "Broad Jump",
        "description": "Horizontal two-leg jump for maximum distance; emphasises triple extension.",
        "tags": "plyometrics,jump,explosive,power,horizontal",
    },
    {
        "name": "Lateral Hurdle Hop",
        "description": "Side-to-side single-leg hops over a hurdle to develop lateral stiffness.",
        "tags": "plyometrics,jump,lateral,explosive,power,unilateral",
    },
    {
        "name": "Single-Leg Bound",
        "description": "Alternating single-leg horizontal bounds for reactive leg power.",
        "tags": "plyometrics,jump,explosive,power,unilateral",
    },
    {
        "name": "Medicine Ball Slam",
        "description": "Overhead medicine ball slam developing upper-body power and trunk stiffness.",
        "tags": "plyometrics,explosive,power,upper,medicine ball",
    },
    # --- Primary Strength ---
    {
        "name": "Back Squat",
        "description": "Barbell back squat — primary lower-body compound movement.",
        "tags": "primary,strength,squat,compound,lower,barbell",
    },
    {
        "name": "Romanian Deadlift",
        "description": "Hip-hinge pull emphasising hamstring and glute loading under control.",
        "tags": "primary,strength,deadlift,compound,lower,hip hinge,hamstring",
    },
    {
        "name": "Hip Thrust",
        "description": "Barbell hip thrust for maximal glute strength and hip extension power.",
        "tags": "primary,strength,glute,compound,lower,hip extension",
    },
    {
        "name": "Trap Bar Deadlift",
        "description": "Hex-bar deadlift allowing more upright torso; excellent primary load.",
        "tags": "primary,strength,deadlift,compound,lower,barbell",
    },
    {
        "name": "Nordic Hamstring Curl",
        "description": "Eccentric-dominant hamstring exercise with strong injury-prevention evidence.",
        "tags": "primary,strength,hamstring,eccentric,compound,lower",
    },
    # --- Secondary Strength ---
    {
        "name": "Bulgarian Split Squat",
        "description": "Rear-foot elevated split squat for unilateral leg strength and stability.",
        "tags": "secondary,strength,squat,unilateral,lower,compound",
    },
    {
        "name": "Bench Press",
        "description": "Flat barbell bench press — primary horizontal push for upper-body strength.",
        "tags": "secondary,strength,upper,compound,push,barbell,chest",
    },
    {
        "name": "Bent-Over Row",
        "description": "Barbell bent-over row — horizontal pull developing upper-back thickness.",
        "tags": "secondary,strength,upper,compound,pull,barbell,back",
    },
    {
        "name": "Pull-Up",
        "description": "Strict bodyweight or weighted pull-up for vertical pull strength.",
        "tags": "secondary,strength,upper,compound,pull,vertical,back",
    },
    {
        "name": "Single-Leg RDL",
        "description": "Unilateral Romanian deadlift for hip-hinge strength and balance.",
        "tags": "secondary,strength,lower,unilateral,hip hinge,hamstring",
    },
    # --- Auxiliary Strength ---
    {
        "name": "Copenhagen Hip Adduction",
        "description": "Side-lying adductor loading exercise with strong groin-injury prevention evidence.",
        "tags": "auxiliary,strength,adductor,hip,groin,prevention",
    },
    {
        "name": "Face Pull",
        "description": "Cable face pull for rear delt, rotator cuff, and upper-back health.",
        "tags": "auxiliary,strength,upper,shoulder,rotator cuff,cable",
    },
    {
        "name": "Pallof Press",
        "description": "Anti-rotation cable press targeting deep core stability.",
        "tags": "auxiliary,strength,core,anti-rotation,stability,cable",
    },
    {
        "name": "Calf Raise",
        "description": "Single-leg calf raise to build soleus and gastrocnemius strength and resilience.",
        "tags": "auxiliary,strength,lower,calf,soleus,unilateral",
    },
    {
        "name": "Lateral Lunge",
        "description": "Bodyweight or loaded lateral lunge to build frontal-plane leg strength.",
        "tags": "auxiliary,strength,lower,lateral,unilateral,adductor",
    },
    # --- Recovery ---
    {
        "name": "Static Hip Flexor Stretch",
        "description": "90-second kneeling hip flexor stretch to restore hip extension ROM.",
        "tags": "recovery,flexibility,stretch,cooldown,hip,static",
    },
    {
        "name": "Foam Roll Quads",
        "description": "Self-myofascial release of the quadriceps using a foam roller.",
        "tags": "recovery,mobility,foam roll,cooldown,quad,self myofascial",
    },
    {
        "name": "Seated Hamstring Stretch",
        "description": "Long-sit hamstring stretch held 60 s each leg.",
        "tags": "recovery,flexibility,stretch,cooldown,hamstring,static",
    },
    {
        "name": "Pigeon Pose",
        "description": "Deep hip external-rotation stretch targeting piriformis and posterior capsule.",
        "tags": "recovery,mobility,stretch,hip,cooldown,flexibility",
    },
    {
        "name": "Breathing Box Drill",
        "description": "4-4-4-4 box-breathing protocol to activate parasympathetic recovery.",
        "tags": "recovery,breathing,cooldown,relaxation,nervous system",
    },
]


def _resolve_coach_id() -> uuid.UUID:
    """Return coach_id from CLI arg or COACH_ID env var."""
    raw = None
    if len(sys.argv) > 1:
        raw = sys.argv[1]
    elif "COACH_ID" in os.environ:
        raw = os.environ["COACH_ID"]

    if not raw:
        print(
            "ERROR: provide coach UserProfile UUID as a CLI argument or via COACH_ID env var.\n"
            "  python scripts/seed_default_exercises.py <coach-uuid>",
            file=sys.stderr,
        )
        sys.exit(1)

    try:
        return uuid.UUID(raw)
    except ValueError:
        print(f"ERROR: '{raw}' is not a valid UUID.", file=sys.stderr)
        sys.exit(1)


def seed(coach_id: uuid.UUID, session: Session) -> None:
    # Fetch all existing names for this team in one query.
    existing_names: set[str] = {
        row for (row,) in session.execute(
            select(Exercise.name).where(Exercise.coach_id == coach_id)
        )
    }

    added = 0
    skipped = 0

    for data in EXERCISES:
        if data["name"] in existing_names:
            print(f"  skip  {data['name']}")
            skipped += 1
            continue

        exercise = Exercise(
            coach_id=coach_id,
            name=data["name"],
            description=data.get("description"),
            tags=data.get("tags"),
        )
        session.add(exercise)
        print(f"  add   {data['name']}")
        added += 1

    session.commit()
    print(f"\nDone. Added {added}, skipped {skipped} (already present).")


def main() -> None:
    coach_id = _resolve_coach_id()

    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        print("ERROR: DATABASE_URL environment variable is not set.", file=sys.stderr)
        sys.exit(1)

    engine = create_engine(database_url, pool_pre_ping=True)
    SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)

    print(f"Seeding default exercises for coach {coach_id} …\n")

    with SessionLocal() as session:
        seed(coach_id, session)

    engine.dispose()


if __name__ == "__main__":
    main()
