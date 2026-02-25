# Claude Code — Backend Instructions (MBS Football)

## Stack
- FastAPI
- SQLAlchemy 2.0 + Alembic
- Postgres via Docker Compose
- Supabase Auth: JWT ES256 + JWKS (NO shared secret)
- Multi-tenant by team_id
- RBAC: COACH / ATHLETE
- Architecture: 3 layers
  - Transport: backend/app/transport/http/...
  - Domain: backend/app/domain/use_cases/...
  - Persistence: backend/app/persistence/repositories/...

## Non-negotiables
### TDD workflow
1) Add failing integration tests in backend/tests (RED).
2) Implement minimal changes (GREEN).
3) Refactor with tests green (REFACTOR).
Never skip tests.

### Auth, onboarding, RBAC, tenant isolation
- Missing/invalid token => 401
- Valid token but not onboarded => 403 ("User not onboarded")
- Role forbidden => 403
- Cross-team resource access => 404 (do not leak existence)
- All DB access scoped to current_user.team_id
- Never log tokens/PII.

### Clean architecture rules
- Transport: request parsing, dependencies, mapping domain errors to HTTP only.
- Domain UseCases: business rules; no FastAPI/HTTPException imports.
- Repositories: DB access only; no business rules.

### Transactions
- Commands that write multiple tables must use a single transaction.
- On error, persist nothing (atomicity).
- Avoid N+1; prefer single-query validation.

## Environment & Docker
- docker compose reads .env by default (not .env.local unless configured).
- In Docker, DATABASE_URL must point to DB service hostname (e.g. db:5432).
- Manual testing:
  - set -a; source .env; set +a
  - export TOKEN=$(./scripts/get_token.sh)

## Testing commands
- Full suite: docker compose exec backend python -m pytest -q
- Single file: docker compose exec backend python -m pytest -q backend/tests/<file>.py

## Output expectations
When you change code:
- Show which tests you added/updated.
- Provide exact commands to run tests.
- Provide curl smoke tests for the endpoint.
- Suggest milestone commit messages (do not run git).
