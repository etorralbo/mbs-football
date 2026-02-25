# Claude Code — Frontend Instructions (MBS Football)

## Stack
- **Framework**: Next.js 16 (App Router) + React 19
- **Language**: TypeScript (strict)
- **Styling**: Tailwind CSS v4
- **Testing**: Vitest + React Testing Library (unit/integration), Playwright (E2E — optional for v0)
- **Package manager**: npm (use `npm run ...`)

## Directory layout
The project currently uses the App Router at `app/`. When adding feature code, prefer a
`src/` layout going forward:

```
frontend/
  app/                        # Next.js routing (pages, layouts)
  src/
    features/
      auth/                   # login, token storage, auth context
      workouts/               # workout templates, sessions, logs
      athletes/               # athlete profiles
    lib/
      api/                    # API client (fetch wrapper)
      types/                  # shared TypeScript types
    components/               # generic UI primitives (Button, Card, …)
```

New route files live in `app/`; all other logic lives under `src/`.

## API client
- Base URL from env: `NEXT_PUBLIC_API_BASE_URL` (e.g. `http://localhost:8000`).
- Every authenticated request must include `Authorization: Bearer <token>`.
- Never log tokens or other credentials — not in console.log, not in error messages.
- Handle status codes consistently:
  - `401` → redirect to login / clear token
  - `403` → show "Not authorised" message, do not retry
  - `404` → show "Not found" state, do not throw unhandled error
  - `422` → surface field-level validation errors from the response body
- Keep the raw fetch wrapper in `src/lib/api/` and use it from feature hooks.

## Environment
```
# frontend/.env.local  (never commit)
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```
A `frontend/.env.example` file (no secrets) should be kept up to date.

## Auth
- Tokens are obtained from Supabase Auth (handled by the backend).
- Store the access token in memory (React context) only — do not persist in localStorage
  unless explicitly required.
- The auth context lives in `src/features/auth/`.

## Testing
### Unit / component tests (Vitest + RTL)
```bash
npm run test          # watch mode
npm run test:run      # single pass (CI)
```
- Co-locate tests: `src/features/workouts/WorkoutCard.test.tsx`
- Mock the API client (`src/lib/api/`) — never hit the real backend in unit tests.
- TDD cycle: write a failing test first, then implement, then refactor.

### E2E (Playwright — v0 optional)
```bash
npm run test:e2e
```
- Lives in `e2e/`.
- Requires a running backend + seeded database.

## Code conventions
- `async`/`await` throughout — no `.then()` chains.
- React Server Components where no client state/interactivity is needed.
- `"use client"` only when required (event handlers, hooks, browser APIs).
- No `any` — use `unknown` and narrow, or define a proper type.
- Prefer named exports; default export only for page/layout components (Next.js convention).
- Keep components small; extract logic to custom hooks in `src/features/<name>/hooks/`.

## Security
- Never expose `NEXT_PUBLIC_` variables that are not truly meant to be public.
- Sanitise any user-generated content before rendering (use `textContent`, not `innerHTML`).
- CSRF is mitigated by the Bearer token pattern; do not add `credentials: "include"` unless
  required by a cookie-based auth scheme.

## Incremental change rules
- Scope each PR to a single feature (one screen / one endpoint).
- Run `npm run build` and `npm run test:run` before suggesting a commit.
- Suggest milestone commit messages; never auto-commit.

## Useful commands
```bash
# Dev server
npm run dev

# Type-check only
npx tsc --noEmit

# Lint
npm run lint

# Build (prod)
npm run build
```

## Docker
The `frontend/Dockerfile` builds and serves the production Next.js app.
Local dev uses `npm run dev` directly (no Docker required).
