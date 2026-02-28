#!/bin/sh
set -eu

# --- DEBUG (remove after confirming on Render) ---
echo "[entrypoint] pwd: $(pwd)"
echo "[entrypoint] listing /app:"
ls -la /app || true
echo "[entrypoint] DATABASE_URL is set: ${DATABASE_URL:+yes}"
# --- END DEBUG ---

# Fail fast if the DB is unreachable or slow — prevents indefinite hangs.
export PGCONNECT_TIMEOUT=5
export PGOPTIONS='-c lock_timeout=5s -c statement_timeout=60s'

echo "[entrypoint] Running database migrations..."
alembic -c /app/alembic.ini upgrade head

echo "[entrypoint] Starting uvicorn..."
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
