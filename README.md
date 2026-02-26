# MBS Football

A multi-tenant football coaching platform. Coaches create teams, design sessions and templates, and invite athletes. Athletes join via invite code and access their team's content.

---

## Table of Contents

1. [Architecture](#architecture)
2. [Project Structure](#project-structure)
3. [Environments](#environments)
4. [Development Workflow](#development-workflow)
5. [Database Migrations](#database-migrations)
6. [Environment Variables](#environment-variables)
7. [API Reference](#api-reference)
8. [Production Smoke Test Checklist](#production-smoke-test-checklist)
9. [Security Principles](#security-principles)
10. [Golden Rules](#golden-rules)

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

```bash
docker compose up --build
```

This starts PostgreSQL and the backend. The frontend can run either in Docker or locally:

```bash
# Run frontend locally (recommended for fast HMR)
cd frontend
npm install
npm run dev
```

### 3. Apply migrations

```bash
cd backend
alembic upgrade head
```

### 4. Run backend tests

```bash
cd backend
pytest -v
```

### 5. Run frontend tests

```bash
cd frontend
npm test           # run once
npm run test:watch # watch mode
```

### 6. Lint and type-check

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

**Option A — Manual shell (one-off job)**

In the Render dashboard, open a Shell for the backend service and run:

```bash
alembic upgrade head
```

**Option B — Release command (recommended)**

In the Render service settings, set the **Release Command** to:

```
alembic upgrade head
```

Render runs this command after each successful deploy, before traffic switches to the new instance. If the migration fails, the deploy is aborted and the previous version continues serving traffic.

> Note: both options require `DATABASE_URL` to be set in the Render environment.

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

| Method | Path                          | Role        | Description                  |
|--------|-------------------------------|-------------|------------------------------|
| GET    | `/v1/exercises`               | Any         | List exercises (team-scoped) |
| POST   | `/v1/exercises`               | COACH       | Create exercise              |
| GET    | `/v1/exercises/{id}`          | Any         | Get exercise                 |
| PATCH  | `/v1/exercises/{id}`          | COACH       | Update exercise              |
| DELETE | `/v1/exercises/{id}`          | COACH       | Delete exercise              |
| GET    | `/v1/workout-templates`       | Any         | List templates               |
| POST   | `/v1/workout-templates`       | COACH       | Create template              |
| GET    | `/v1/sessions`                | Any         | List sessions                |
| POST   | `/v1/sessions`                | COACH       | Create session               |

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
- [ ] Submitting the create-team form redirects to `/templates`
- [ ] `GET /v1/me` returns the new team in `memberships` with role `COACH`
- [ ] Attempting to create a second team returns `409`

### ATHLETE flow

- [ ] Coach generates an invite code via `POST /v1/invites`
- [ ] New athlete signs up and visits `/join?code=<code>`
- [ ] Submitting the join form redirects to `/templates`
- [ ] `GET /v1/me` returns the team in `memberships` with role `ATHLETE`
- [ ] Submitting the same invite code a second time returns `409` (already used)
- [ ] Submitting an expired invite code returns `410`

### Returning user

- [ ] Existing user with memberships is redirected from `/onboarding` to `/templates`
- [ ] Sign out from the NavBar clears the session and redirects to `/login`

### Multi-tenant isolation

- [ ] Coach from Team A cannot read exercises belonging to Team B
- [ ] Athlete cannot create or delete exercises (`403`)

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
