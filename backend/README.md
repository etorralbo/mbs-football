# Backend Architecture

The backend of Mettle Performance is a REST API that serves as the single source of truth for all data, business logic, authorization, and multi-tenant isolation. It exposes a versioned API (`/v1`) consumed by the Next.js frontend.

## Tech Stack

| Technology | Version | Purpose |
|---|---|---|
| Python | 3.12 | Runtime |
| FastAPI | 0.115.6 | HTTP framework |
| SQLAlchemy | 2.0.36 | ORM and query builder |
| Alembic | 1.14.0 | Database migrations |
| PostgreSQL | 16 | Primary database |
| Pydantic | 2.10.3 | Request/response validation |
| psycopg | 3.2.3 | PostgreSQL driver (async-capable) |
| PyJWT | 2.10.1 | JWT verification (ES256 via JWKS) |
| OpenAI SDK | 1.57.4 | AI template generation |
| Uvicorn | 0.32.1 | ASGI server |
| pytest | 9.x | Testing framework |
| httpx | 0.28.1 | Async HTTP test client |

## Project Structure

```
backend/
├── app/
│   ├── main.py                          # Application factory and CORS config
│   ├── core/
│   │   ├── config.py                    # Pydantic Settings (env vars)
│   │   ├── security.py                  # JWT verification via Supabase JWKS
│   │   └── dependencies.py              # FastAPI dependencies (auth, team resolution)
│   ├── models/                          # SQLAlchemy ORM models
│   ├── schemas/                         # Pydantic request/response schemas
│   ├── api/v1/                          # Legacy endpoint layer
│   │   ├── router.py                    # Central router (registers both layers)
│   │   └── endpoints/                   # Legacy endpoint handlers
│   │       ├── exercises.py             # Exercise library CRUD
│   │       ├── workout_templates.py     # Template CRUD + block management
│   │       ├── workout_builder.py       # Block/item CRUD + reordering
│   │       └── ai.py                    # AI template draft generation
│   ├── services/                        # Legacy service layer (used by legacy endpoints)
│   ├── transport/http/v1/               # New transport layer (clean architecture)
│   │   ├── me.py                        # GET /me (user profile + memberships)
│   │   ├── onboarding.py               # POST /onboarding
│   │   ├── teams.py                     # Team creation + deletion
│   │   ├── invites.py                   # Invite create + preview + accept
│   │   ├── athletes.py                  # Athlete roster (coach-only)
│   │   ├── workout_templates.py         # POST /workout-templates/from-ai
│   │   ├── workout_assignments.py       # Assignment creation
│   │   ├── workout_sessions.py          # Session list + complete + cancel
│   │   ├── workout_execution.py         # Session logs + detail + execution view
│   │   └── analytics.py                 # Funnel analytics (coach-only)
│   ├── domain/
│   │   ├── use_cases/                   # Business logic (framework-independent)
│   │   ├── events/                      # Domain event tracking (funnel)
│   │   └── analytics/                   # Analytics domain service
│   └── persistence/
│       └── repositories/                # Database access layer
├── alembic/                             # Migration scripts
├── tests/                               # Integration tests
├── docker/postgres-init/                # DB initialization scripts
├── entrypoint.sh                        # Container startup (migrations + uvicorn)
├── Dockerfile                           # Production container
└── requirements.txt                     # Python dependencies
```

## Layered Architecture

The backend is in the process of transitioning from a legacy two-layer structure to a clean three-layer architecture. Both patterns coexist and are registered through the same router.

### Target architecture (new features)

```
Transport (app/transport/http/v1/)
    │  Parses HTTP requests, resolves auth/team context,
    │  calls use case, maps domain errors to HTTP responses.
    ▼
Domain Use Cases (app/domain/use_cases/)
    │  Orchestrates business rules, validates invariants,
    │  coordinates repositories. Framework-independent.
    ▼
Persistence Repositories (app/persistence/repositories/)
       Executes database queries, maps ORM models.
       No business logic.
```

### Legacy architecture (existing features)

```
Endpoint Handler (app/api/v1/endpoints/)
    │  Parses request, executes business logic,
    │  queries database, formats response — all in one layer.
    ▼
Service (app/services/)
       Partial extraction of logic, but still coupled
       to SQLAlchemy and HTTP concerns.
```

### Why both exist

The transition was introduced during sprint 4 when multi-step operations (workout assignments, session execution) required clear transaction boundaries and testable business rules. Rather than rewriting all existing endpoints at once, new features were implemented in the transport layer while legacy endpoints remained frozen.

For the full architectural decision record, see [ADR-001: Transport Layer](../docs/adr-001-transport-layer.md).

## Endpoint Migration Table

| Endpoint Group | Count | Location | Architecture |
|---|---|---|---|
| Exercises (CRUD + tags + favorites) | 7 | `api/v1/endpoints/exercises.py` | Legacy (service) |
| Workout Templates (CRUD + blocks) | 7 | `api/v1/endpoints/workout_templates.py` | Legacy (service) |
| Workout Builder (block/item ops) | 6 | `api/v1/endpoints/workout_builder.py` | Legacy (service) |
| AI Draft | 1 | `api/v1/endpoints/ai.py` | Legacy (service) |
| User Profile (/me) | 1 | `transport/http/v1/me.py` | Transport (direct query) |
| Onboarding | 1 | `transport/http/v1/onboarding.py` | Transport (use case) |
| Teams | 2 | `transport/http/v1/teams.py` | Transport (use case) |
| Invites | 3 | `transport/http/v1/invites.py` | Transport (use case) |
| Athletes | 1 | `transport/http/v1/athletes.py` | Transport (repository) |
| Template from AI | 1 | `transport/http/v1/workout_templates.py` | Transport (use case) |
| Workout Assignments | 1 | `transport/http/v1/workout_assignments.py` | Transport (use case) |
| Workout Sessions | 3 | `transport/http/v1/workout_sessions.py` | Transport (use case) |
| Session Execution + Logs | 4 | `transport/http/v1/workout_execution.py` | Transport (use case) |
| Analytics (Funnel) | 1 | `transport/http/v1/analytics.py` | Transport (domain service) |
| **Total** | **39** | | **21 legacy / 18 transport** |

No path conflicts exist between the two layers — they share the `/v1` prefix but use distinct endpoint paths.

## Architecture Guardrails

The transition from legacy to clean architecture is enforced by automated tests in `tests/test_architecture_guard.py` (24 tests, ~0.03s, no database required):

| Rule | What it checks | Violation message |
|---|---|---|
| **Legacy layer frozen** | No new `.py` modules may be added to `api/v1/endpoints/` | Lists the extra modules that must be relocated to `transport/http/v1/` |
| **Use cases are framework-free** | No `fastapi`, `starlette`, or `HTTPException` imports in `domain/use_cases/` | Names the offending file and import |
| **Transport avoids ORM models** | `transport/http/v1/` modules must not import SQLAlchemy table classes from `app.models` | Lists the forbidden import (shared enums like `Role` are allowed; `me.py` and `invites.py` are acknowledged exceptions for direct-query endpoints) |

Run the guard standalone (no Docker/database needed):

```bash
cd backend
python -m pytest tests/test_architecture_guard.py -v
```

Every legacy endpoint module also carries a `FROZEN (see ADR-001)` docstring banner as a human-readable reminder.

## Authentication and Authorization

### JWT Verification

All authenticated requests include an `Authorization: Bearer <token>` header. The backend verifies tokens using **Supabase JWKS** (ES256 public key, fetched and cached from the Supabase well-known endpoint). No shared secret is used.

### Multi-Tenant Isolation

Every team-scoped request includes an `X-Team-Id` header. The `dependencies.py` module:

1. Validates the JWT and extracts the user ID.
2. Looks up the user's memberships.
3. Verifies the user belongs to the requested team.
4. Returns a `CurrentUser` object with `user_id`, `team_id`, and `role`.

Invalid or unowned team IDs return **403** (not 404) to prevent information leakage about team existence.

### Role-Based Access Control

Two roles exist: `COACH` and `ATHLETE`. Each endpoint declares its required role. The same user can have different roles in different teams.

| Scenario | HTTP Status |
|---|---|
| Missing/invalid token | 401 |
| Valid token, not onboarded | 403 |
| Wrong role for endpoint | 403 |
| Cross-tenant resource access | 404 (no leak) |

## AI Integration

The backend integrates with OpenAI GPT for workout template generation:

- **Endpoint:** `POST /v1/ai/workout-template-draft`
- **Flow:** LLM generates per-block training intents → backend matches exercises from the library via keyword overlap in name/tags/description
- **Stub mode:** When `AI_STUB=true` (default for local dev), deterministic fixtures replace LLM calls
- **Fallback:** If the LLM returns an error (502/503), the system falls back to stub mode and marks the response with `source: "fallback"`
- **Feature flag:** `AI_ENABLED=false` disables AI endpoints entirely

## Environment Variables

See `backend/.env.example` for the complete template with comments. Key variables:

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `SUPABASE_URL` | Yes | Supabase project URL (JWKS auto-derived) |
| `SUPABASE_JWT_AUD` | No | JWT audience claim (default: `authenticated`) |
| `OPENAI_API_KEY` | Conditional | Required when `AI_ENABLED=true` and `AI_STUB=false` |
| `AI_MODEL` | No | OpenAI model (default: `gpt-4o-mini`) |
| `AI_ENABLED` | No | Feature flag for AI endpoints (default: `true`) |
| `AI_STUB` | No | Use deterministic stubs instead of LLM (default: `false`) |
| `FRONTEND_URL` | No | Frontend URL for invite links (default: `http://localhost:3000`) |
| `CORS_ALLOW_ORIGINS` | Prod | Comma-separated allowed origins |
| `CORS_ALLOW_ORIGIN_REGEX` | Prod | Regex for dynamic origins (e.g., Vercel previews) |
| `ENV` | No | Environment: `local`, `test`, or `production` |

## Running the Project

### With Docker Compose (recommended)

```bash
# From the repository root
cp .env.example .env
# Fill in SUPABASE_URL and SUPABASE_ANON_KEY
docker compose up -d
```

The backend runs at `http://localhost:8000`. Migrations execute automatically on container startup via `entrypoint.sh`.

### Local development (without Docker)

```bash
cd backend
cp .env.example .env
# Fill in DATABASE_URL and SUPABASE_URL
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

### Running Tests

```bash
# Via Docker
docker compose exec backend python -m pytest -q

# Local (requires app_test database)
cd backend
python -m pytest -v
```

Tests run against a separate `app_test` database. The test conftest executes `alembic upgrade head` at session scope.

## Deployment

The backend is deployed as a Docker container on Render:

1. `entrypoint.sh` runs `alembic upgrade head` (fail-fast with `set -eu`)
2. If migrations succeed, `exec uvicorn` starts as PID 1 (correct signal handling)
3. If migrations fail, the container exits immediately — uvicorn never starts
