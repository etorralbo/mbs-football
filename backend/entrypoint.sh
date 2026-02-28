#!/bin/sh
set -eu

# --- DEBUG: confirm filesystem layout (remove after verifying on Render) ---
echo "=== /app contents ==="
ls -la /app
echo "=== /app/alembic contents (if present) ==="
ls -la /app/alembic 2>/dev/null || echo "(no /app/alembic directory)"
# --- END DEBUG ---

echo "Running database migrations..."
alembic -c /app/alembic.ini upgrade head

echo "Starting uvicorn..."
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
