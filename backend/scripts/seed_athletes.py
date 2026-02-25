#!/usr/bin/env python3
"""
Seed dev ATHLETE user_profiles for manual testing.

Environment variables
---------------------
TEAM_ID      (required) UUID of the team to seed athletes into.
N            (optional, default 3) Number of athlete profiles to create.
DATABASE_URL (required) PostgreSQL connection string — same value as the app uses.

Usage (inside the backend container)
--------------------------------------
    docker compose exec \\
      -e TEAM_ID=<team-uuid> \\
      -e N=3 \\
      backend python scripts/seed_athletes.py

Idempotency
-----------
Each athlete's supabase_user_id is derived deterministically from TEAM_ID + index
using uuid5, so re-running the script with the same TEAM_ID and N is safe — rows
that already exist are skipped and reported without error.
"""
import os
import sys
import uuid

from sqlalchemy import create_engine, text


def _require_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        print(f"ERROR: {name} env var is required.", file=sys.stderr)
        sys.exit(1)
    return value


def _dev_supabase_id(team_id: uuid.UUID, index: int) -> uuid.UUID:
    """
    Return a deterministic UUID for athlete <index> on <team_id>.

    Using uuid5 (SHA-1 namespaced) guarantees the same UUID for the same
    inputs across script runs, which is what makes the insert idempotent.
    """
    return uuid.uuid5(uuid.NAMESPACE_DNS, f"dev-athlete-{team_id}-{index}")


def main() -> None:
    database_url = _require_env("DATABASE_URL")
    team_id_raw = _require_env("TEAM_ID")

    try:
        team_id = uuid.UUID(team_id_raw)
    except ValueError:
        print(f"ERROR: TEAM_ID '{team_id_raw}' is not a valid UUID.", file=sys.stderr)
        sys.exit(1)

    try:
        n = int(os.environ.get("N", "3"))
        if n < 0:
            raise ValueError
    except ValueError:
        print("ERROR: N must be a non-negative integer.", file=sys.stderr)
        sys.exit(1)

    engine = create_engine(database_url, pool_pre_ping=True)

    created: list[tuple[int, uuid.UUID]] = []
    skipped: list[tuple[int, uuid.UUID]] = []

    with engine.begin() as conn:
        for i in range(1, n + 1):
            supabase_user_id = _dev_supabase_id(team_id, i)

            row = conn.execute(
                text(
                    "SELECT id FROM user_profiles WHERE supabase_user_id = :sub"
                ),
                {"sub": supabase_user_id},
            ).fetchone()

            if row is not None:
                skipped.append((i, row[0]))
                continue

            profile_id = uuid.uuid4()
            conn.execute(
                text(
                    """
                    INSERT INTO user_profiles (id, supabase_user_id, team_id, role, name)
                    VALUES (:id, :sub, :team_id, 'ATHLETE', :name)
                    """
                ),
                {
                    "id": profile_id,
                    "sub": supabase_user_id,
                    "team_id": team_id,
                    "name": f"Dev Athlete {i}",
                },
            )
            created.append((i, profile_id))

    for i, pid in skipped:
        print(f"[SKIP]    Dev Athlete {i} — already exists (id={pid})")
    for i, pid in created:
        print(f"[CREATED] Dev Athlete {i} — id={pid}")

    if n == 0:
        print("Nothing to do (N=0).")
    else:
        print(f"\nDone. Created: {len(created)}, Skipped: {len(skipped)}")


if __name__ == "__main__":
    main()
