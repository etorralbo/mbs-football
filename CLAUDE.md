# Claude Code — Monorepo Instructions (MBS Football)

## Repo structure
- backend/: FastAPI + SQLAlchemy + Alembic + Postgres + Supabase Auth
- frontend/: (Next/React) UI (when requested)

## Global rules
- Work incrementally, small safe changes.
- TDD: tests first (RED), then minimal (GREEN), then refactor.
- Never commit automatically; suggest milestone commits only.
- Do not leak secrets; never print tokens/keys.
- Prefer changes scoped to the requested package (backend vs frontend).

## Security baseline
- Enforce OWASP-style safety: least privilege, input validation, no overposting.
- If a change affects auth/tenant boundaries, add tests for 401/403/404 behavior.

## How to respond
When implementing:
1) Identify files to change.
2) Add failing tests.
3) Implement minimal code.
4) Refactor.
5) Provide commands to run tests + smoke curl.
6) Suggest commit message.
