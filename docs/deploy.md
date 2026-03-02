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

## Migration history (current revisions)

| Revision | Description |
|----------|-------------|
| `a8b9c0d1e2f3` | Recreate funnel_event enum with lowercase values — **head** |
| `f6a7b8c9d0e1` | Add session_first_log_added to funnel_event enum |
| `e5f6a7b8c9d0` | Add assignment_created to funnel_event enum |
| `d4e5f6a7b8c9` | Add template_created_ai to funnel_event enum |
| `c3d4e5f6a7b8` | Add invite_created to funnel_event enum |
| `a1b2c3d4e5f6` | Add session_completed to funnel_event enum |
| `ff6f8d76c493` | Add product_events table |
| `e1f2a3b4c5d6` | Add memberships and invites (Sprint 5) |
| `deca97f5042e` | Schema hardening (indexes, CHECK, UNIQUE constraints) |
| `b1c4d9e2f037` | Add set_number positive constraint |
| `a3f7c2d8e914` | Sprint 3–4: assignments, sessions, execution logs |
| `d48fd4f74c77` | Sprint 2: blocks model |
| `7147e8359e30` | Init team and user_profile |
| `4a60e2eb8fb2` | Init schema |

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
alembic current   # must show: a8b9c0d1e2f3 (head)
alembic check     # must exit 0
```

---

## CI/CD release step (suggested)

Add this as a pre-start command or release phase (e.g. Heroku `Procfile`, Railway start command, Docker CMD override):

```
alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000
```

This ensures migrations always run before traffic is accepted.
