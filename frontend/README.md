# Frontend Architecture

The frontend of MBS Football is a single-page application that serves as the coaching and athlete management interface. It allows coaches to design workout templates (manually or with AI assistance), assign them to athletes, and track session completion. Athletes use the same application to view their assigned sessions and log exercise execution data.

The application communicates exclusively with a FastAPI backend via a REST API, delegating all business logic, persistence, and authorization to the server.

## Frontend in the System Architecture

The frontend is one of three main components of the system:

- **Frontend (Next.js)** — provides the user interface for coaches and athletes.
- **Backend API (FastAPI)** — handles business logic, authorization, tenant isolation, and persistence.
- **Authentication Provider (Supabase Auth)** — issues JWT tokens and manages user sessions via OAuth and email/password flows.

The frontend is intentionally thin: it focuses on UI state and user interactions while delegating all domain logic and validation to the backend. This separation ensures that:

- Authorization rules are enforced server-side and cannot be bypassed by client manipulation.
- Multi-tenant isolation (`X-Team-Id` header) is validated exclusively by the backend.
- The API remains the single source of truth for all data and business rules.

## Tech Stack

| Technology | Version | Purpose |
|---|---|---|
| Next.js | 16.1.6 | Framework (App Router) |
| React | 19.2.3 | UI library |
| TypeScript | 5.x | Language (strict mode) |
| Tailwind CSS | 4.x | Utility-first styling |
| Supabase JS | 2.49.x | Authentication (OAuth + email/password) |
| Recharts | 3.7.x | Analytics charts |
| @dnd-kit | 6.3.x / 10.x | Drag-and-drop (template block reordering) |
| Vitest | 4.x | Unit and integration testing |
| React Testing Library | 16.3.x | Component testing |
| jsdom | 28.x | Test DOM environment |

## Project Structure

```
frontend/
├── app/                          # Next.js App Router (routing + page components)
│   ├── layout.tsx                # Root layout
│   ├── page.tsx                  # Landing page (/)
│   ├── not-found.tsx             # 404 page
│   ├── auth/callback/            # OAuth callback handler
│   ├── (public)/                 # Unauthenticated route group
│   │   ├── login/                # Email/password + Google OAuth login
│   │   ├── signup/               # Account creation
│   │   └── join/[token]/         # Invite acceptance flow
│   ├── (app)/                    # Authenticated route group (guarded)
│   │   ├── layout.tsx            # Auth guard + context providers
│   │   ├── dashboard/            # Coach dashboard with overview cards
│   │   ├── templates/            # Workout template list + builder
│   │   ├── sessions/             # Session list + detail/execution view
│   │   ├── exercises/            # Exercise library (CRUD + favorites)
│   │   ├── team/                 # Team management + team selector
│   │   ├── create-team/          # Team creation form
│   │   ├── onboarding/           # Post-signup onboarding flow
│   │   ├── auth/continue/        # Post-auth redirect router
│   │   └── invite-invalid/       # Invalid invite error page
│   └── _shared/                  # Non-route shared code
│       ├── api/                  # HTTP client, error types, API type definitions
│       ├── auth/                 # Supabase client, RequireAuth, TeamSelectGuard
│       └── components/           # Shared UI: NavBar, PageHeader, Button, Skeleton, etc.
├── src/                          # Feature modules and shared logic
│   ├── features/
│   │   ├── activation/           # Activation checklist (coach/athlete onboarding steps)
│   │   ├── analytics/            # Funnel stats card and hook
│   │   ├── dashboard/            # Team overview cards and data hook
│   │   ├── session-execution/    # Session execution state machine and API
│   │   └── sessions/             # Calendar view component
│   ├── shared/auth/              # AuthContext provider + active team store
│   └── components/               # Additional shared components
├── public/                       # Static assets and branding
├── vitest.config.ts              # Test configuration
├── vitest.setup.ts               # Test setup (RTL matchers)
├── next.config.ts                # Next.js configuration
├── Dockerfile                    # Production container build
└── .env.local.example            # Environment variable template
```

## Routing and Pages

The application uses the Next.js App Router with **route groups** to separate public and authenticated areas.

### Public Routes (`(public)/`)

| Route | Description |
|---|---|
| `/login` | Email/password sign-in and Google OAuth |
| `/signup` | New account creation |
| `/join/[token]` | Invite link acceptance (previews team info, auto-accepts on load) |

### Authenticated Routes (`(app)/`)

All routes in this group are wrapped by a guard stack (see Authentication section).

| Route | Role | Description |
|---|---|---|
| `/dashboard` | Coach | Team overview cards, activation checklist, funnel analytics |
| `/templates` | Coach | Workout template list with AI draft panel and manual creation |
| `/templates/[id]` | Coach | Template builder: block editor, exercise picker (slide-in drawer), drag-and-drop reordering, assignment panel |
| `/exercises` | Coach | Exercise library with tag-based filtering, favorites, and CRUD |
| `/sessions` | Both | Session list with calendar view; coaches see all team sessions, athletes see their own |
| `/sessions/[id]` | Both | Session detail with block-by-block exercise view and set logging (execution) |
| `/team` | Coach | Team roster, invite link generation, and team deletion (owner only) |
| `/team/select` | Coach | Team selector for multi-team coaches |
| `/create-team` | Coach | Team creation form |
| `/onboarding` | Both | Post-signup profile setup (display name) |
| `/auth/continue` | Both | Post-auth redirect router (handles invite flows) |

### Other Routes

| Route | Description |
|---|---|
| `/auth/callback` | Supabase OAuth code exchange; redirects to `/onboarding` |
| `/invite-invalid` | Error page for expired or invalid invite links |

## Authentication and Roles

### Authentication Provider

The application uses **Supabase Auth** with two sign-in methods:
- **Email/password** (`signInWithPassword`)
- **Google OAuth** (`signInWithOAuth`) with redirect to `/auth/callback`

The Supabase client is initialized in `app/_shared/auth/supabaseClient.ts`. Tokens are managed by the Supabase SDK session — the application does not persist tokens in `localStorage` manually.

### Guard Stack

Protected routes are wrapped by a four-layer guard hierarchy defined in `app/(app)/layout.tsx`:

```
RequireAuth          → Checks Supabase session; redirects to /login if absent
  AuthProvider       → Fetches GET /v1/me; provides user profile, role, and active team
    TeamSelectGuard  → Redirects multi-team coaches to /team/select if no team is chosen
      AppShellGate   → Shows skeleton loader during bootstrap; prevents content flash
```

### Role System

Roles are **not global** — they are derived per team from the user's memberships:

```typescript
interface MembershipItem {
  team_id: string
  team_name: string
  role: 'COACH' | 'ATHLETE'
  is_owner: boolean
}
```

The `AuthContext` resolves the current role by finding the membership matching the active team. The same user can be a coach in one team and an athlete in another.

Role-based UI rendering uses the `useAuth()` hook:

```typescript
const { role } = useAuth()
const isCoach = role === 'COACH'
```

Coach-only navigation items (Dashboard, Templates, Exercises) are conditionally rendered in the `NavBar` component. Sessions are visible to both roles.

## API Integration

### HTTP Client

All backend communication goes through a custom fetch wrapper in `app/_shared/api/httpClient.ts`:

- **Base URL**: configured via `NEXT_PUBLIC_API_BASE_URL`
- **Authentication**: every request attaches `Authorization: Bearer <token>` from the Supabase session
- **Team scoping**: requests include an `X-Team-Id` header by default; bootstrap endpoints (e.g., `/v1/me`) use `teamScoped: false`
- **Stale request detection**: an epoch counter detects team switches mid-flight and silently discards stale responses

### Error Hierarchy

The HTTP client throws typed error classes for structured error handling:

| Error Class | HTTP Status | Behavior |
|---|---|---|
| `UnauthorizedError` | 401 | Redirect to `/login` |
| `ForbiddenError` | 403 | Display message from response |
| `NotFoundError` | 404 | Show "not found" state |
| `ValidationError` | 400/422 | Surface field-level errors |
| `ConflictError` | 409 | Idempotence violation |
| `GoneError` | 410 | Resource expired (e.g., invite token) |
| `ServerError` | 500+ | Generic error state |
| `TeamNotSelectedError` | (internal) | Multi-team coach without active team |
| `StaleTeamRequestError` | (internal) | Response silently discarded |

### Error Handling Pattern

Pages use a centralized `handleApiError()` utility that handles redirects (401 → login, not-onboarded → onboarding, stale → discard), then re-throw for the caller to display locally:

```typescript
request<Data>('/v1/endpoint')
  .then(setData)
  .catch((err) => {
    try { handleApiError(err, router) }
    catch { setError('Something went wrong.') }
  })
```

### Type Definitions

All API response types are defined in `app/_shared/api/types.ts`, including: `MeResponse`, `WorkoutTemplate`, `WorkoutTemplateDetail`, `WorkoutBlock`, `BlockItem`, `Exercise`, `WorkoutSessionSummary`, `WorkoutSessionDetail`, `SessionExecution`, `AiDraftResponse`, `FunnelResponse`, among others.

## Key User Flows

### 1. Sign Up and Onboarding
Login/signup via email or Google OAuth → OAuth callback exchanges code for session → onboarding page collects display name → coach creates a team or athlete joins via invite.

### 2. Join Team via Invite Link
Athlete receives `/join/<token>` link → page shows invite preview (team name, coach name) → auto-accepts on load → redirects to sessions.

### 3. AI-Assisted Template Creation (Coach)
Coach opens Templates page → clicks "AI Draft" → enters template name, workout description, and language → backend calls OpenAI GPT to generate per-block training intents, then matches exercises from the library via keyword overlap → if the LLM is unavailable, the system falls back to a deterministic rule-based generator (the UI shows a warning banner) → coach reviews the 6-block plan with suggested exercises and relevance scores → confirms and saves → redirects to template builder for refinement.

### 4. Manual Template Building (Coach)
Coach creates a template → opens the block editor → adds blocks with names and notes → opens exercise picker (full-screen drawer with tag filtering, favorites, and search) → selects exercises → reorders blocks and items via drag-and-drop → publishes template.

### 5. Workout Assignment (Coach)
From template detail, coach opens the Assign Panel → selects "Whole team" or specific athletes via checkbox list → sets optional scheduled date → creates assignment → backend generates one session per athlete.

### 6. Session Execution (Athlete)
Athlete opens session detail → views prescribed exercises organized by block → logs sets (reps, weight, RPE) per exercise → marks sets as done → session completion tracked via progress bar.

### 7. Dashboard and Analytics (Coach)
Coach views dashboard with team overview cards → activation checklist tracks onboarding progress (create team → create template → assign session) → funnel analytics card shows conversion through the engagement pipeline (team created → invite → template → assignment → first log → session completed).

### 8. Team Deletion (Coach / Owner)
From `/team`, the team owner sees a Danger Zone section → clicks "Delete team" → a confirmation modal requires typing the exact team name → on confirmation the team, all memberships, templates, sessions, logs, and invites are permanently deleted → user is redirected to team selector or team creation depending on remaining memberships.

## Environment Variables

All client-side variables use the `NEXT_PUBLIC_` prefix (required by Next.js for browser exposure).

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anonymous/public API key |
| `NEXT_PUBLIC_API_BASE_URL` | Yes | Backend API base URL (e.g., `http://localhost:8000`) |

A template file is provided at `.env.local.example`. Copy it to `.env.local` for local development:

```bash
cp .env.local.example .env.local
```

## Running the Project

### Development

```bash
npm install
npm run dev          # Starts Next.js dev server (default: http://localhost:3000)
```

Requires the backend to be running at the URL specified in `NEXT_PUBLIC_API_BASE_URL`.

### Tests

```bash
npm test             # Watch mode (re-runs on file changes)
npm run test:run     # Single pass (suitable for CI)
```

### Build

```bash
npm run build        # Production build
npm start            # Serve production build locally
```

### Lint and Type Check

```bash
npm run lint         # ESLint
npx tsc --noEmit     # TypeScript type checking
```

### Docker

A `Dockerfile` is provided for production deployment:

```bash
docker build -t mbs-football-frontend .
```

## Key Design Decisions

### Thin Frontend Architecture

The frontend intentionally avoids embedding business logic. All domain rules — permissions, tenant scoping, data validation — are enforced in the backend API. The frontend only performs UI-level validation (e.g., required fields, email format) for user experience; the backend re-validates everything. This prevents privilege escalation through client manipulation.

### Team-Scoped API Requests

Every authenticated API request includes an `X-Team-Id` header so the backend can resolve the active tenant context. This allows a single user to belong to multiple teams with different roles (coach in one, athlete in another). The HTTP client enforces this automatically and rejects manual header overrides.

### Layered Client-Side Guards

Rather than a single auth check, the application uses a four-layer guard stack (`RequireAuth` → `AuthProvider` → `TeamSelectGuard` → `AppShellGate`) to ensure correct application state at each level before rendering content. This prevents flashes of unauthorized content and handles edge cases like multi-team coaches without a selected team.

### Typed Error Hierarchy

Instead of inspecting raw HTTP status codes at each call site, the HTTP client throws typed error classes (`UnauthorizedError`, `ForbiddenError`, `ValidationError`, etc.). This allows pages to handle failures declaratively and ensures consistent behavior across the application — for example, every 401 triggers a redirect to login regardless of which page made the request.

### Stale Request Detection

When a multi-team coach switches teams, in-flight API responses belong to the previous team context. The HTTP client tracks an epoch counter that increments on team switches and silently discards responses whose epoch no longer matches, preventing stale data from rendering in the UI.

## Testing Strategy

### Framework

Tests use **Vitest** as the test runner with **React Testing Library** for component rendering and interaction. The test environment is **jsdom**. Configuration is in `vitest.config.ts` with a setup file (`vitest.setup.ts`) that registers Testing Library's custom matchers.

### Test Organization

Tests are **colocated** with their source files using the `.test.ts` / `.test.tsx` naming convention. There are no separate test directories — each test file lives next to the module it tests.

### Mocking Strategy

- **API calls**: the `request()` function from `httpClient.ts` is mocked via `vi.mock()` — tests never hit the real backend
- **Supabase client**: mocked at the module level to simulate authenticated/unauthenticated sessions
- **Router**: Next.js `useRouter` and `useParams` are mocked to test navigation behavior
- **Fetch**: `vi.stubGlobal('fetch', mockFetch)` for HTTP client unit tests

### Test Coverage Areas

Tests cover:
- **Page-level integration**: rendering with mocked API data, loading states, error states, empty states
- **User interactions**: form submission, filter toggling, navigation, checkbox selection
- **Auth flows**: login redirect, invite acceptance, onboarding guard
- **Business logic**: activation rules, draft state management, exercise filtering
- **Shared components**: NavBar role-based rendering, team switcher, page header

### Testing Conventions

- `vi.useFakeTimers()` is avoided with `waitFor` (deadlocks in jsdom); real timers with `waitFor({ timeout })` are used instead for debounce tests
- `Element.prototype.scrollIntoView = vi.fn()` is added at module level in tests requiring keyboard navigation (jsdom does not implement it)
- Environment variables are overridden in `vitest.config.ts` to use test-specific values

## Demo Walkthrough

A typical evaluation demo can follow these steps:

1. **Sign up as Coach** — open `/signup`, create an account with email or Google OAuth, complete the onboarding form (display name), and create a team.

2. **Build a workout template** — go to `/templates`, use the AI Draft panel (enter a workout description and generate a structured plan) or create a template manually via the block editor. Add exercises from the exercise library, reorder blocks with drag-and-drop, and publish the template.

3. **Invite an athlete** — go to `/team`, enter an athlete's email, and generate an invite link. Copy the link.

4. **Join as Athlete** — open the invite link (`/join/<token>`) in a different browser or incognito session. Sign up, complete onboarding, and the invite is auto-accepted.

5. **Assign the template** — back as Coach, open the published template, use the Assign Panel to assign it to the whole team or specific athletes with an optional scheduled date.

6. **Execute the session** — as Athlete, open `/sessions`, select the assigned session, log sets (reps, weight, RPE) for each exercise, and complete the session.

7. **Review analytics** — as Coach, open `/dashboard` to see the activation checklist progress and funnel analytics showing the engagement pipeline from team creation through session completion.
