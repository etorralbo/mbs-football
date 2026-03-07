# MBS Football — Mettle Performance

A multi-tenant football coaching platform. Coaches create teams, design sessions and templates, and invite athletes. Athletes join via invite code and access their team's content.

## Project Naming

| Context | Name | Rationale |
|---|---|---|
| Product branding (UI, documentation, user-facing text) | **Mettle Performance** | The product name shown to coaches, athletes, and evaluators |
| Repository and infrastructure (paths, Docker images, service IDs, Vercel URLs) | **mbs-football** | The original project codename; changing it would break deployment URLs, CI pipelines, and git history |

The repository was created under the working title "MBS Football" during early development. The product was later branded **Mettle Performance** for its public-facing identity. Both names coexist intentionally: the codebase and infrastructure retain the original codename, while all user-visible surfaces use the product name.

---

## Table of Contents

1. [Architecture](#architecture)
2. [Activation Strategy & Product Analytics](#activation-strategy--product-analytics)
3. [Project Structure](#project-structure)
4. [Environments](#environments)
5. [Development Workflow](#development-workflow)
6. [Database Migrations](#database-migrations)
7. [Environment Variables](#environment-variables)
8. [API Reference](#api-reference)
9. [Production Smoke Test Checklist](#production-smoke-test-checklist)
10. [Security Principles](#security-principles)
11. [Golden Rules](#golden-rules)

---

## Architecture

```
                        ┌─────────────────────────────┐
                        │         Supabase Auth         │
                        │   (email/password, JWKS/JWT)  │
                        └───────────┬─────────────────┘
                                    │ access_token (ES256)
                    ┌───────────────▼───────────────┐
                    │         Frontend (Vercel)       │
                    │   Next.js 15 · App Router       │
                    │   TypeScript · Tailwind CSS     │
                    └───────────────┬───────────────┘
                                    │ Bearer <token>
                    ┌───────────────▼───────────────┐
                    │         Backend (Render)        │
                    │   FastAPI · SQLAlchemy 2.0      │
                    │   Clean architecture layers     │
                    └───────────────┬───────────────┘
                                    │ SQLAlchemy ORM
                    ┌───────────────▼───────────────┐
                    │         PostgreSQL 16           │
                    │   (Render managed / local)      │
                    └───────────────────────────────┘
```

### Authentication flow

1. User authenticates with Supabase (signup or login).
2. Supabase issues a signed JWT (`access_token`). The `sub` claim holds the Supabase user UUID.
3. The frontend stores the session in the Supabase JS client (localStorage/cookies) and attaches `Authorization: Bearer <token>` to every API call via `httpClient.ts`.
4. The backend fetches Supabase's public JWKS once and caches it for 10 minutes. Every request is validated against that key set — no Supabase SDK dependency on the backend.
5. `get_auth_user_id()` returns the UUID from `sub` (works before onboarding). `get_current_user()` additionally loads the `UserProfile` row and returns a `CurrentUser` dataclass with role + team context.

### Multi-tenant isolation

All domain tables carry a `team_id` column. Every query in the service/use-case layer filters by the `team_id` derived from the authenticated user's `UserProfile`, never from client input.

### RBAC

Two roles: `COACH` and `ATHLETE`. Roles are stored server-side in `memberships` (and mirrored in `user_profiles` for backward compatibility). The client never sends its own role.

---

## Activation Strategy & Product Analytics

The MVP is designed around a measurable activation funnel, not only feature completeness.

### North Star Metric

> Percentage of users reaching `SESSION_COMPLETED` within 48 hours of signup.

This ensures the platform is evaluated not only by functionality, but by successful onboarding and real usage.

### Tracked Product Events

The backend persists product events in a dedicated `product_events` table:

- `TEAM_CREATED`
- `INVITE_ACCEPTED`
- `SESSION_COMPLETED`

Design principles:

- Server-side tracking only (no public event endpoint)
- Transactional (event is written in the same DB transaction as the business action)
- Multi-tenant scoped (`team_id`)
- Auth identity scoped (`supabase_user_id`)
- Append-only table (immutable rows)
- PostgreSQL native ENUM (`funnel_event`)
- JSONB metadata (no PII stored)

This allows computing activation and conversion metrics directly from PostgreSQL without external analytics tools.

### Funnel Example Query

```sql
SELECT event_name, COUNT(DISTINCT user_id)
FROM product_events
GROUP BY event_name;
```

This provides a minimal but production-grade funnel measurement layer.

---

## Project Structure

```
mbs-football/
├── backend/                  FastAPI application
│   ├── app/
│   │   ├── api/v1/           Route registration (router.py)
│   │   ├── core/             Config, dependencies, security (JWT/JWKS)
│   │   ├── db/               SQLAlchemy engine + session factory
│   │   ├── domain/
│   │   │   └── use_cases/    Business logic (one class per use case)
│   │   ├── models/           SQLAlchemy ORM models
│   │   ├── persistence/
│   │   │   └── repositories/ DB access (abstract + SQLAlchemy impl)
│   │   ├── schemas/          Pydantic v2 request/response schemas
│   │   ├── transport/http/v1 FastAPI route handlers (thin layer)
│   │   └── main.py           Application entry point
│   ├── alembic/              Migration scripts
│   ├── tests/                pytest integration tests
│   ├── Dockerfile
│   └── requirements.txt
│
├── frontend/                 Next.js application
│   ├── app/
│   │   ├── (public)/         Unauthenticated routes: /login, /signup
│   │   ├── (app)/            Authenticated routes: /onboarding, /create-team,
│   │   │                     /join, /templates, /sessions
│   │   └── _shared/          Auth helpers, API client, shared components
│   ├── vitest.config.ts
│   └── Dockerfile
│
└── docker-compose.yml        Local full-stack environment
```

---

## Environments

### Local development

| Service    | URL                      | How it runs            |
|------------|--------------------------|------------------------|
| Frontend   | http://localhost:3000    | `npm run dev`          |
| Backend    | http://localhost:8000    | `uvicorn` via Docker   |
| PostgreSQL | localhost:5432           | Docker Compose         |
| Supabase   | remote project           | shared dev project     |

### Production

| Service    | Platform  | Notes                                   |
|------------|-----------|-----------------------------------------|
| Frontend   | Vercel    | Auto-deploy on push to `main`           |
| Backend    | Render    | Web Service, Docker-based               |
| PostgreSQL | Render    | Managed Postgres 16                     |
| Auth       | Supabase  | Production project (separate from dev)  |

---

## Development Workflow

### Prerequisites

- Docker Desktop running
- Node.js 20+
- Python 3.12+

### 1. Clone and configure

```bash
git clone <repo-url>
cd mbs-football
cp backend/.env.example backend/.env   # fill in values (see Environment Variables)
cp frontend/.env.local.example frontend/.env.local
```

### 2. Start the local stack

There are two modes depending on where you run the frontend:

#### Option A — Full Docker stack (frontend + backend + DB)

```bash
docker compose up --build
```

The frontend container uses `NEXT_PUBLIC_API_BASE_URL=http://backend:8000`.
Docker's internal DNS resolves `backend` to the correct container.
Open http://localhost:3000.

#### Option B — Local frontend + Dockerised backend/DB (recommended for fast HMR)

```bash
# 1. Start Postgres + backend in Docker
docker compose up -d db backend

# 2. Create frontend/.env.local so the browser can reach the backend
echo "NEXT_PUBLIC_API_BASE_URL=http://localhost:8000" > frontend/.env.local

# 3. Run Next.js locally
cd frontend
npm install
npm run dev
```

Open http://localhost:3000.
The backend is reachable at http://localhost:8000 (port mapped by Docker Compose).

### 3. Apply migrations

```bash
cd backend
alembic upgrade head
```

### 4. Run backend tests

Tests use a dedicated `app_test` database on the same Docker Postgres instance.
`conftest.py` loads `backend/.env.test` via python-dotenv before any app module is
imported, so `DATABASE_URL=postgresql+psycopg://app:app@localhost:5432/app_test`
takes effect before pydantic-settings reads it.

`app_test` is provisioned automatically by the init script
`backend/docker/postgres-init/01-create-test-db.sql`, which Postgres runs once
when the `pgdata` volume is first created.

**First time, or after changing init scripts — reset the volume:**

```bash
docker compose down -v          # destroys pgdata (all local data is lost)
docker compose up -d db         # recreates volume + runs init scripts
```

**Normal workflow (volume already exists):**

```bash
docker compose up -d db         # only the db service is required
cd backend && pytest -q
```

**Troubleshooting**

| Symptom | Cause | Fix |
|---|---|---|
| `password authentication failed for user "app"` | Another Postgres on port 5432 | `brew services stop postgresql@16` then `docker compose up -d db` |
| `database "app_test" does not exist` | Volume predates the init script | `docker compose down -v && docker compose up -d db` |
| `connection refused` | Docker not running or `db` service not started | `docker compose up -d db` |

### 5. Run frontend tests

```bash
cd frontend
npm test           # run once
npm run test:watch # watch mode
```

### 6. Seed default exercises (optional)

If a team has 0 exercises, seed 30 curated sport-generic exercises so the AI draft can suggest them immediately.
The script is idempotent — re-running it skips exercises that already exist.

```bash
# Get the team UUID first (from /v1/me response or the DB)

# Local Docker stack
docker compose exec backend \
  python scripts/seed_default_exercises.py <team-uuid>

# Local venv (backend/ directory)
cd backend
DATABASE_URL=postgresql+psycopg://app:app@localhost:5432/app \
  python scripts/seed_default_exercises.py <team-uuid>
```

### 7. Lint and type-check

```bash
# Backend
cd backend
# (add ruff / mypy if configured)

# Frontend
cd frontend
npm run lint
npx tsc --noEmit
```

---

## Database Migrations

### Strategy

- Migrations live in `backend/alembic/versions/`.
- Every schema change requires a new migration file. Never edit an existing migration that has been applied to any environment.
- Naming convention: `<short_hash>_<descriptive_slug>.py`.

### Local

```bash
cd backend

# Generate a new migration after changing a model
alembic revision --autogenerate -m "describe_the_change"

# Apply all pending migrations
alembic upgrade head

# Roll back one step
alembic downgrade -1
```

### Production (Render)

Render runs DB migrations on container startup via `entrypoint.sh` (`alembic upgrade head`). If the migration fails, the container exits and uvicorn never starts.

`entrypoint.sh` (in `backend/`) is copied into the image by the Dockerfile and set as the container `CMD`. It runs:

```
alembic -c /app/alembic.ini upgrade head
uvicorn app.main:app ...
```

> `DATABASE_URL` must be set as an environment variable in the Render service dashboard.

---

## Environment Variables

### Backend — `backend/.env` (local) / Render env vars (production)

| Variable              | Required | Default              | Description                                         |
|-----------------------|----------|----------------------|-----------------------------------------------------|
| `DATABASE_URL`        | Yes      | —                    | PostgreSQL connection string (`postgresql+psycopg://...`) |
| `SUPABASE_URL`        | Yes      | —                    | Supabase project URL (`https://<ref>.supabase.co`)  |
| `SUPABASE_JWT_AUD`    | No       | `authenticated`      | Expected JWT audience claim                         |
| `SUPABASE_JWT_ISSUER` | No       | derived from URL     | Expected JWT issuer claim                           |
| `SUPABASE_JWKS_URL`   | No       | derived from URL     | JWKS endpoint for public key fetch                  |
| `FRONTEND_URL`        | No       | `http://localhost:3000` | Used to build invite join URLs                   |
| `ENV`                 | No       | `local`              | `local` or `production`                             |

### Frontend — `frontend/.env.local` (local) / Vercel env vars (production)

| Variable                        | Required | Description                                    |
|---------------------------------|----------|------------------------------------------------|
| `NEXT_PUBLIC_SUPABASE_URL`      | Yes      | Supabase project URL                           |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes      | Supabase anonymous (public) key                |
| `NEXT_PUBLIC_API_BASE_URL`      | Yes      | Backend base URL (`http://localhost:8000` locally, Render URL in prod) |

### Security rules

- Never commit `.env` or `.env.local` files. Both are in `.gitignore`.
- The Supabase `service_role` key must never appear in frontend code or environment variables.
- Rotate secrets immediately if they are accidentally exposed.

---

## API Reference

All endpoints are prefixed with `/v1`.

### Auth-free

| Method | Path      | Description                  |
|--------|-----------|------------------------------|
| GET    | `/health` | Liveness probe               |

### Require valid JWT (`get_auth_user_id` — no UserProfile needed)

| Method | Path                  | Role  | Description                        |
|--------|-----------------------|-------|------------------------------------|
| GET    | `/v1/me`              | Any   | Current user memberships           |
| POST   | `/v1/teams`           | —     | Create team + become COACH         |
| POST   | `/v1/invites`         | COACH | Generate invite code for a team    |
| POST   | `/v1/invites/accept`  | —     | Accept invite, become ATHLETE      |

### Require UserProfile (`get_current_user`)

| Method | Path                                          | Role    | Description                              |
|--------|-----------------------------------------------|---------|------------------------------------------|
| GET    | `/v1/exercises`                               | Any     | List exercises (team-scoped)             |
| POST   | `/v1/exercises`                               | COACH   | Create exercise                          |
| GET    | `/v1/exercises/{id}`                          | Any     | Get exercise                             |
| PATCH  | `/v1/exercises/{id}`                          | COACH   | Update exercise                          |
| DELETE | `/v1/exercises/{id}`                          | COACH   | Delete exercise                          |
| GET    | `/v1/workout-templates`                       | Any     | List templates (team-scoped)             |
| POST   | `/v1/workout-templates`                       | COACH   | Create template                          |
| POST   | `/v1/workout-templates/from-ai`               | COACH   | Create template via AI draft             |
| GET    | `/v1/workout-assignments`                     | COACH   | List assignments                         |
| POST   | `/v1/workout-assignments`                     | COACH   | Assign template to athlete(s) or team    |
| GET    | `/v1/workout-sessions`                        | Any     | List sessions (athlete: own; coach: all) |
| PATCH  | `/v1/workout-sessions/{id}/complete`          | ATHLETE | Mark session as completed                |
| GET    | `/v1/workout-sessions/{id}/execution`         | Any     | Session execution view (blocks + logs)   |
| PUT    | `/v1/workout-sessions/{id}/logs`              | ATHLETE | Save set logs for an exercise            |
| GET    | `/v1/athletes`                                | COACH   | List athletes in the team                |

### Planned analytics endpoint

Add this endpoint to the table above when implemented:

| Method | Path                   | Role  | Description                           |
|--------|------------------------|-------|---------------------------------------|
| GET    | `/v1/analytics/funnel` | COACH | Returns team-scoped funnel metrics    |

---

## Production Smoke Test Checklist

Run this checklist after every production deploy.

### Auth

- [ ] `GET /health` returns `200 OK`
- [ ] `GET /v1/me` without a token returns `401`
- [ ] `GET /v1/me` with an expired token returns `401`

### COACH flow

- [ ] New user can sign up at `/signup`
- [ ] After signup, redirect lands on `/onboarding`
- [ ] `/onboarding` shows "I'm a coach" and "I'm an athlete" CTAs
- [ ] Clicking "I'm a coach" navigates to `/create-team`
- [ ] Submitting the create-team form redirects to `/team`
- [ ] `GET /v1/me` returns the new team in `memberships` with role `COACH`
- [ ] Attempting to create a second team returns `409`

### ATHLETE flow

- [ ] Coach generates an invite code via `POST /v1/invites`
- [ ] New athlete signs up and visits `/join?code=<code>`
- [ ] Submitting the join form redirects to `/sessions`
- [ ] `GET /v1/me` returns the team in `memberships` with role `ATHLETE`
- [ ] Submitting the same invite code a second time returns `409` (already used)
- [ ] Submitting an expired invite code returns `410`

### Returning user

- [ ] Existing user with memberships is redirected from `/onboarding` to `/templates`
- [ ] Sign out from the NavBar clears the session and redirects to `/login`

### Sessions & workout flow

- [ ] Coach can assign a template to an athlete via `POST /v1/workout-assignments`
- [ ] Assigned session appears in `GET /v1/workout-sessions` for both coach and athlete
- [ ] Coach session list includes `athlete_name` to distinguish between athletes
- [ ] Athlete can log sets via `PUT /v1/workout-sessions/{id}/logs`
- [ ] Athlete can mark session complete via `PATCH /v1/workout-sessions/{id}/complete`
- [ ] Coach sees the session as read-only (no "Start session" / no "Mark as completed")

### Multi-tenant isolation

- [ ] Coach from Team A cannot read exercises belonging to Team B
- [ ] Athlete cannot create or delete exercises (`403`)
- [ ] Athlete cannot see sessions belonging to other teams

---

## Security Principles

1. **JWT verified server-side.** The backend fetches Supabase's JWKS and validates every token locally. No token is trusted on face value.

2. **No client-supplied roles.** User role is determined from `memberships` on the server. The request body never contains `role`.

3. **Team ID from auth context, not request body.** `team_id` is always resolved from `get_current_user()`. Client input is ignored for tenant resolution.

4. **Least privilege by default.** New dependencies return the minimum information needed. `get_auth_user_id()` grants pre-onboarding access only. Full data access requires `get_current_user()`.

5. **Invite codes are unguessable.** Codes are generated with `secrets.token_urlsafe(18)` (24 characters of base64url-safe entropy, ~108 bits). Codes are single-use and support optional expiry.

6. **Idempotent membership creation.** Accepting an invite twice is safe: the second call returns the existing membership without creating duplicate rows.

7. **No secret leakage.** The Supabase `service_role` key is never used in the backend or frontend. JWT validation uses the public JWKS endpoint only.

8. **Input validation at the boundary.** Pydantic v2 schemas validate all incoming data at the transport layer. Internal layers trust validated types.

---

## Golden Rules

1. **Tests before code.** Write a failing test, then write the minimum code to make it pass. Never merge untested behaviour.

2. **Small, safe commits.** Each commit represents one coherent change. Never commit secrets, never commit broken code.

3. **Backend owns tenant context.** If a piece of data could be spoofed by the client to access another user's data, it must be server-resolved.

4. **Migrations are append-only.** Never modify a migration that has been applied to any shared environment. Add a new migration instead.

5. **One source of truth.** Environment variables live in `.env` (backend) and `.env.local` (frontend) locally, and in the hosting platform's secrets manager in production. They are never duplicated in code.

6. **Prefer explicit over implicit.** Dependency injection (`Depends(...)`) makes security requirements visible at the function signature. Avoid middleware-based auth that hides the contract.

7. **Fail closed.** When in doubt about authorization, return `403`. Do not expose data because an edge case was not considered.

8. **No auto-commits.** Commits are made manually at meaningful milestones, with a descriptive message. Automated tooling never pushes to `main` without review.
