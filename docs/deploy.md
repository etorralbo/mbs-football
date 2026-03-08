# Backend Deployment Guide

Covers production deploy, database migrations, rollback, and verification.

---

## Required environment variables

| Variable | Required | Notes |
|----------|----------|-------|
| `DATABASE_URL` | **Yes** | `postgresql+psycopg://user:pass@host:5432/db` |
| `SUPABASE_URL` | **Yes** | e.g. `https://<project>.supabase.co` |
| `SUPABASE_JWT_AUD` | No | Default: `authenticated` |
| `SUPABASE_JWT_ISSUER` | No | Derived from `SUPABASE_URL` if not set |
| `SUPABASE_JWKS_URL` | No | Derived from `SUPABASE_URL` if not set |
| `CORS_ALLOW_ORIGINS` | **Yes** (non-local) | Comma-separated: `https://app.example.com,https://staging.example.com` |
| `OPENAI_API_KEY` | Yes (if `AI_ENABLED=True`) | Not required when `AI_ENABLED=False` or `AI_STUB=True` |
| `AI_ENABLED` | No | Default: `True`. Set `False` to deploy without AI features. |
| `AI_MODEL` | No | Default: `gpt-4o-mini` |
| `AI_STUB` | No | Default: `False`. `True` only for local/test environments. |
| `ENV` | No | Default: `local`. Set `production` for production deploys. |

> The app performs **fail-fast startup validation** — it will refuse to start if `ENV=production`
> and required vars are missing. Check the logs if the container exits immediately on boot.

---

## Running migrations

Migrations use [Alembic](https://alembic.sqlalchemy.org/).

### Apply all pending migrations (upgrade to latest)

```bash
# Docker Compose (local / staging)
docker compose exec backend alembic upgrade head

# Direct (CI/CD release step, bare Python)
alembic upgrade head
```

### Check current revision

```bash
docker compose exec backend alembic current
# Output example:
# deca97f5042e (head)
```

### Verify no drift (model ↔ DB in sync)

```bash
docker compose exec backend alembic check
# Exit 0 = no drift. Any other exit code = undetected model changes.
```

---

## Rolling back

### Roll back one step

```bash
docker compose exec backend alembic downgrade -1
```

### Roll back to a specific revision

```bash
docker compose exec backend alembic downgrade <revision_id>
# Example:
docker compose exec backend alembic downgrade b1c4d9e2f037
```

### Roll back everything (dev/test only — destroys all data)

```bash
docker compose exec backend alembic downgrade base
```

---

## Migration history

Migration files evolve frequently. For the current ordered list, read `backend/alembic/versions/` directly and verify runtime state with:

```bash
docker compose exec backend alembic history
docker compose exec backend alembic current
```

---

## Health check verification

After deploying, verify the service is healthy:

```bash
curl https://<your-domain>/health
# Expected:
# {"status":"ok","service":"mbs-football-api","env":"production"}
```

HTTP 200 + `"status": "ok"` = service is up and config passed startup validation.

---

## Fresh database (new environment)

```bash
# 1. Create the database (if not already created by your cloud provider)
psql $DATABASE_URL -c "SELECT 1"   # verify connectivity

# 2. Run all migrations from scratch
alembic upgrade head

# 3. Verify
alembic current   # must show: <latest head revision>
alembic check     # must exit 0
```

---

## CI/CD release step (suggested)

Add this as a pre-start command or release phase (e.g. Heroku `Procfile`, Railway start command, Docker CMD override):

```
alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000
```

This ensures migrations always run before traffic is accepted.
