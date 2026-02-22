#!/usr/bin/env bash
set -euo pipefail

: "${SUPABASE_URL:?missing SUPABASE_URL}"
: "${SUPABASE_ANON_KEY:?missing SUPABASE_ANON_KEY}"
: "${SUPABASE_EMAIL:?missing SUPABASE_EMAIL}"
: "${SUPABASE_PASSWORD:?missing SUPABASE_PASSWORD}"

curl -sS --fail \
  -X POST "${SUPABASE_URL}/auth/v1/token?grant_type=password" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${SUPABASE_EMAIL}\",\"password\":\"${SUPABASE_PASSWORD}\"}" \
| python3 -c 'import sys, json; print(json.load(sys.stdin)["access_token"])'