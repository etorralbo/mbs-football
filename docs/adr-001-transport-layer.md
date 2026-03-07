# ADR-001: Introduction of the Transport Layer

**Status:** Accepted
**Date:** 2026-02
**Context:** Backend architecture evolution during sprint 4-6 development

## Context

The backend started as a single-layer FastAPI application where HTTP endpoint handlers (in `app/api/v1/endpoints/`) contained request parsing, business logic, database queries, and HTTP response formatting in the same function. This approach was practical for the initial sprints but created several problems as the codebase grew:

1. **Tight coupling** — endpoint handlers imported SQLAlchemy models, executed queries directly, and raised `HTTPException` interleaved with business rules. This made it impossible to reuse business logic outside of HTTP context (e.g., background jobs, CLI commands).

2. **Untestable business rules** — testing a business rule required spinning up a full HTTP test client and database, because the rule was embedded in the endpoint handler. There was no way to unit-test domain logic in isolation.

3. **Error handling inconsistency** — each endpoint handler implemented its own error-to-HTTP-status mapping, leading to subtle differences (e.g., some endpoints returned 404 for cross-tenant access while others returned 403).

4. **Transaction boundaries** — multi-step operations (e.g., creating a workout assignment + generating sessions) had unclear transaction boundaries because the handler mixed query logic with business decisions.

## Decision

Introduce a **three-layer clean architecture** for all new features:

```
Transport (app/transport/http/v1/)
    ↓ calls
Domain (app/domain/use_cases/)
    ↓ calls
Persistence (app/persistence/repositories/)
```

### Layer responsibilities

| Layer | Responsibility | Forbidden |
|---|---|---|
| **Transport** | Parse HTTP request, resolve dependencies (auth, DB session), call use case, map domain errors to HTTP responses | Business logic, direct SQL, SQLAlchemy model imports |
| **Domain Use Cases** | Orchestrate business rules, validate invariants, coordinate repositories, raise domain-specific errors | FastAPI imports, HTTPException, direct DB access |
| **Persistence Repositories** | Execute database queries, map ORM models to domain objects | Business rules, HTTP concerns |

### Coexistence strategy

Rather than rewriting all existing endpoints at once (risky, time-consuming), the two systems coexist:

- **Legacy endpoints** (`app/api/v1/endpoints/`) remain operational and serve existing features.
- **New features** are implemented exclusively in the transport layer.
- Both layers register their routers through the same `app/api/v1/router.py` aggregator, so all endpoints share the `/v1` prefix and there are no path conflicts.

## Consequences

### Positive

- **Testability** — domain use cases can be tested with mock repositories, no HTTP client needed.
- **Consistent error handling** — transport layer maps domain errors to HTTP statuses in one place per endpoint, following a standard pattern.
- **Clear transaction boundaries** — use cases receive a DB session and control when `commit()` is called.
- **Reusability** — the same use case can be invoked from HTTP, a CLI command, or a background worker.

### Negative

- **Two patterns in the codebase** — developers must understand both the legacy service pattern and the new use-case pattern until migration is complete.
- **Router file complexity** — `router.py` imports from both `app/api/v1/endpoints/` and `app/transport/http/v1/`, which can be confusing at first glance.

### Neutral

- No runtime performance impact — both layers use the same FastAPI/SQLAlchemy stack.
- No database schema changes — the migration is purely a code organization concern.

## Migration Status

### Endpoint inventory (39 total)

#### Legacy layer — `app/api/v1/endpoints/` (21 endpoints)

| Module | Endpoints | Prefix | Architecture |
|---|---|---|---|
| `exercises.py` | 7 (CRUD + tags + favorite) | `/exercises` | Service (`exercises_service`) |
| `workout_templates.py` | 7 (CRUD + blocks + reorder) | `/workout-templates` | Service (`workout_templates_service`) |
| `workout_builder.py` | 6 (block/item CRUD + reorder) | `/blocks`, `/block-items` | Service (`workout_builder_service`) |
| `ai.py` | 1 (POST draft) | `/ai` | Service (`ai_template_service`) |

#### Transport layer — `app/transport/http/v1/` (18 endpoints)

| Module | Endpoints | Prefix | Architecture |
|---|---|---|---|
| `me.py` | 1 (GET /me) | `/me` | Direct query |
| `onboarding.py` | 1 (POST /onboarding) | `/onboarding` | Use case (`OnboardUserUseCase`) |
| `teams.py` | 2 (POST + DELETE) | `/teams` | Use cases (`CreateTeamUseCase`, `DeleteTeamUseCase`) |
| `invites.py` | 3 (create + preview + accept) | `/team-invites`, `/invites` | Use cases (`CreateInviteUseCase`, `AcceptInviteUseCase`) |
| `athletes.py` | 1 (GET list) | `/athletes` | Query repository |
| `workout_templates.py` | 1 (POST from-ai) | `/workout-templates` | Use case (`CreateWorkoutTemplateFromAiUseCase`) |
| `workout_assignments.py` | 1 (POST create) | `/workout-assignments` | Use case (`CreateWorkoutAssignmentUseCase`) |
| `workout_sessions.py` | 3 (list + complete + cancel) | `/workout-sessions` | Use cases |
| `workout_execution.py` | 4 (logs + detail + execution) | `/workout-sessions` | Use cases |
| `analytics.py` | 1 (GET funnel) | `/analytics` | Domain service (`FunnelAnalyticsService`) |

#### Path conflict check: none detected

Both layers share the `/v1/workout-templates` prefix, but their paths are distinct:
- Legacy: `POST /`, `GET /`, `GET /{id}`, `PATCH /{id}`, `DELETE /{id}`, `POST /{id}/blocks`, `PUT /{id}/blocks/reorder`
- Transport: `POST /from-ai`

## Deprecation Plan

### Phase 1 — Current (sprints 4-8)
New features are implemented only in the transport layer with domain use cases. Legacy endpoints remain frozen — no new functionality is added to them.

### Phase 2 — Migration (post-MVP)
Migrate legacy endpoints to the transport layer one module at a time:
1. `exercises.py` (7 endpoints) — high value, most complex service
2. `workout_templates.py` (7 endpoints) — shares prefix with transport layer
3. `workout_builder.py` (6 endpoints) — tightly coupled to templates
4. `ai.py` (1 endpoint) — simple, low risk

Each migration creates a corresponding use case, moves the service logic into it, and updates tests. The legacy module is deleted once all its endpoints are migrated and the old tests pass against the new implementation.

### Phase 3 — Cleanup
- Delete `app/services/` directory (all logic moved to use cases)
- Delete `app/api/v1/endpoints/` directory
- Simplify `router.py` to import only from `app/transport/http/v1/`
- Update CLAUDE.md to remove legacy references
