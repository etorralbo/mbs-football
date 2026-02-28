#!/bin/sh
set -eu

export PGCONNECT_TIMEOUT=5
export PGOPTIONS='-c lock_timeout=5s -c statement_timeout=60s'

echo "Running database migrations..."
alembic -c /app/alembic.ini upgrade head

echo "Starting uvicorn..."
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
