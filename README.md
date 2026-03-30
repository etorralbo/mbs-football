# Mettle Performance

A multi-tenant coaching platform for strength and conditioning coaches and their athletes. Coaches plan workout templates, assign sessions to individuals or whole teams, and monitor execution — athletes receive, log, and complete their sessions through a guided interface.

> **Note on repository name:** The repository is named `mbs-football` (the original working title). The product name is **Mettle Performance**. Both coexist intentionally — infrastructure retains the codename while all user-facing surfaces use the product name.

---

## Quick Links

- **Repository:** https://github.com/etorralbo/mbs-football
- **Video demo:** https://drive.google.com/file/d/1DYzwmwYkf0BtVjtve1dIEtArHhAnDdvi/view?usp=sharing
- **Slides:** [`docs/08032026_MettlePerformance_Sliders.pdf`](docs/08032026_MettlePerformance_Sliders.pdf)
- **API docs (local):** http://localhost:8000/docs

---

## Notes for Evaluators

The deployed backend uses free-tier hosting. If the application has been inactive, the first request may take a few extra seconds due to cold start. Subsequent interactions are faster once the service is active.

---

## TFM Evaluation Overview

| Requirement | Section |
|---|---|
| Quick evaluation guide | [How to Evaluate This Project](#how-to-evaluate-this-project) |
| Academic context | [Academic Context](#academic-context) |
| Project description | [Project Overview](#project-overview) |
| Main features | [Key Features](#key-features) |
| Technology stack | [Technology Stack](#technology-stack) |
| Architecture | [Architecture Overview](#architecture-overview) |
| Technical highlights | [Technical Highlights](#technical-highlights) |
| Project structure | [Project Structure](#project-structure) |
| Installation and execution | [Running the Project Locally](#running-the-project-locally) |
| Deployment / public URL | [Deployment](#deployment) |
| Code repository | [This repository](.) |
| Slides presentation | [Slides Presentation](#slides-presentation) |

---

## How to Evaluate This Project

To quickly review the platform end-to-end:

1. Open the deployed application (see [Deployment](#deployment)).
2. Sign up as a **coach** at `/signup` and create a team.
3. Create a **workout template** — manually via the block editor or using the **AI draft** feature.
4. Go to **Team** and invite an athlete by email.
5. In a second browser window, sign up with the invited email and accept the invite — the athlete automatically joins the team.
6. Back as coach, **assign the template** to the athlete (or the whole team).
7. As the athlete, open `/sessions`, execute the workout by logging sets/reps/load, and mark it as **completed**.
8. Return to the coach account — the session appears as completed in the sessions list and the **dashboard attention queue** updates accordingly.

This flow demonstrates the full lifecycle: **Template → Assignment → Execution → Monitoring**.

---

## Academic Context

This project was developed as the final Master's thesis (TFM).

The objective was to design and implement a production-grade full-stack web application demonstrating:

- Multi-tenant SaaS architecture with strict tenant isolation
- Role-based access control (COACH / ATHLETE)
- Clean architecture with domain-driven use cases
- AI-assisted functionality integration
- Test-driven development with automated test suites
- Deployment via containerised services

---

## Project Overview

Mettle Performance solves the coordination problem between coaches and athletes in strength and conditioning programmes. Planning, distributing, and tracking training sessions manually — through spreadsheets or messaging apps — is fragmented and error-prone.

The platform provides a structured workflow:

1. **Coaches** build a reusable exercise library, design workout templates with a block-based editor (or generate a draft with AI), and assign sessions to individuals or the whole team.
2. **Athletes** receive assignments, execute sessions guided block by block, and log their actual sets, reps, and load.
3. **The dashboard** surfaces what needs attention: overdue sessions, sessions due today that haven't started, and stale in-progress work — so coaches act on operational signals, not just reports.

Every piece of data is scoped to the authenticated user's team. Coaches from different teams never see each other's athletes or sessions.

---

## Key Features

### Planning — Workout Templates

- Block-based template editor (Preparation, Plyometrics, Strength, Conditioning, etc.)
- Always-editable with **autosave** — no save/cancel mode switching
- Drag-and-drop block reordering
- **AI-assisted draft generation**: coach provides a training goal, the system generates block structure and matches exercises from the library via keyword extraction (no LLM involvement in exercise selection)
- Template readiness validation: a template must have at least one block with at least one exercise before it can be assigned

### Assignment — Sessions

- Assign a template to the **whole team** or **selected athletes** in a single operation
- **Batch assignment**: one atomic POST creates all sessions and records an audit event — no N+1 writes
- Duplicate submission protection: the UI disables the submit button after the first click
- Scheduled date support

### Execution — Athlete Experience

- Guided session execution: block by block, exercise by exercise
- Log sets, reps, and load in real time
- Mark session as completed
- Cancellation by coach (with confirmation)

### Monitoring — Coach Dashboard

- **Attention queue** replacing a KPI-only view — answers "what do I need to act on right now?"
  - **Overdue**: sessions past their scheduled date that have not been completed
  - **Due today**: sessions scheduled for today with no logs yet
  - **Stale**: sessions that have been started but had no log activity for more than 48 hours
- Each item links directly to the session detail
- Compact summary counters (overdue / due today / stale)
- Quick-action links to templates, sessions, exercises, and team management

### Team Management

- Secure invite links (base64url token, 7-day expiry)
- Athletes join by visiting the invite URL — no manual code entry
- Coach guard: coaches cannot join via an athlete invite link

### Exercise Library

- Create exercises with name, description, and free-form tags
- Filter by tag, scope (company-provided vs. coach-created), and favorites
- Favorites per coach; company exercises are read-only

---

## AI Integration

The AI-assisted template creation feature (`POST /v1/workout-templates/from-ai`) works as follows:

1. The coach provides a training goal (e.g. "upper body strength, 45 minutes").
2. The backend sends the goal to an OpenAI-compatible chat API with a structured prompt.
3. The LLM generates a title and intent for each predefined block.
4. The backend performs **keyword-based exercise matching** against the team's library — the LLM never selects or names specific exercises.
5. A complete draft template is returned for the coach to review and edit before saving.

The AI layer is stateless and non-persistent: it generates a draft but writes nothing to the database until the coach confirms.

---

## Technology Stack

### Frontend

| Technology | Version | Purpose |
|---|---|---|
| Next.js | 16.1.6 | React framework (App Router) |
| React | 19.2.3 | UI library |
| TypeScript | 5.x | Type safety |
| Tailwind CSS | 4.x | Styling |
| Vitest | 4.x | Unit and integration testing |
| React Testing Library | 16.x | Component testing |
| @dnd-kit | 6.x / 10.x | Drag-and-drop for template builder |
| Supabase JS | 2.x | Authentication client |

### Backend

| Technology | Version | Purpose |
|---|---|---|
| FastAPI | 0.115.6 | Web framework |
| SQLAlchemy | 2.0.36 | ORM |
| Alembic | 1.14.0 | Database migrations |
| PostgreSQL | 16 | Primary database |
| Pydantic | 2.10.3 | Request/response validation |
| PyJWT | 2.10.1 | JWT verification (ES256 + JWKS) |
| OpenAI SDK | 1.57.4 | AI template draft generation |
| psycopg | 3.2.3 | PostgreSQL driver |
| pytest | 9.x | Integration testing |
| Python | 3.12+ | Runtime |

### Infrastructure

| Service | Platform | Purpose |
|---|---|---|
| Frontend hosting | Vercel | Auto-deploy on push to `main` |
| Backend hosting | Render | Docker-based web service |
| Database | Render | Managed PostgreSQL 16 |
| Authentication | Supabase | Email/password auth, JWT (ES256) |
| Local development | Docker Compose | Full-stack local environment |

---

## Architecture Overview

```
                    ┌─────────────────────────────┐
                    │         Supabase Auth         │
                    │   (email/password, JWKS/JWT)  │
                    └───────────┬─────────────────┘
                                │ access_token (ES256)
                ┌───────────────▼───────────────┐
                │         Frontend (Vercel)       │
                │   Next.js 16 · App Router       │
                │   TypeScript · Tailwind CSS     │
                └───────────────┬───────────────┘
                                │ Bearer <token>
                ┌───────────────▼───────────────┐
                │         Backend (Render)        │
                │   FastAPI · SQLAlchemy 2.0      │
                │   Three-layer clean arch        │
                └───────────────┬───────────────┘
                                │ SQLAlchemy ORM
                ┌───────────────▼───────────────┐
                │         PostgreSQL 16           │
                │   (Render managed / local)      │
                └───────────────────────────────┘
```

The backend follows a strict three-layer architecture:

- **Transport** (`transport/http/v1/`): FastAPI route handlers — request parsing, dependency injection, HTTP error mapping only. No business logic.
- **Domain** (`domain/use_cases/`): One class per use case. No FastAPI or SQLAlchemy imports — pure Python.
- **Persistence** (`persistence/repositories/`): Abstract interfaces + SQLAlchemy implementations. Business rules never live here.

**Authentication flow:** Users authenticate via Supabase → the frontend attaches a Bearer token to every API call → the backend verifies the JWT signature against Supabase's public JWKS (no Supabase SDK on the backend). The authenticated user's `team_id` is resolved on every request and used to scope all database queries.

---

## Technical Highlights

### Batch Assignment — One Atomic Operation

Assigning a template to 20 athletes used to require 20 separate API calls. Sprint 1 replaced this with a single `POST /v1/workout-assignments/batch` that creates all assignments and sessions inside one database transaction via the **Unit of Work** pattern. The use case owns the commit; repositories only flush. If anything fails (unknown athlete, wrong team, unready template), nothing is persisted.

### Server-Side Readiness Validation

A template can only be assigned if it has at least one block containing at least one exercise (`is_ready` check). This guard lives in the domain layer — the transport layer delegates and maps the domain error to a 422 response. The frontend reflects readiness state from the API response, so the check is never duplicated across layers.

### Unit of Work for Transactional Integrity

Multi-step write operations (create assignment → create sessions → emit audit event) share a single `AbstractUnitOfWork` context. The use case commits once at the end. If any step raises, the UoW rolls back the entire transaction. This eliminates partial-write states that would require compensating actions.

### Attention Queue — Server-Side Aggregation

The dashboard attention queue (`GET /v1/dashboard/attention`) executes a **single query** with three correlated subqueries per session row:
- exercise count (from template blocks)
- logged exercise count (from session logs)
- last log timestamp (`MAX(created_at)` from session logs)

Classification (overdue / due today / stale) happens in the use case using plain date arithmetic. The three buckets are mutually exclusive: overdue takes priority, then due today (not yet started), then stale (started, no activity > 48 h, not overdue). This avoids N+1 queries and keeps the classification logic testable in isolation.

### Autosave-First Template Editing

The template detail page removes the edit/view mode toggle entirely. Every field change triggers a debounced PATCH request. There is no "Save" button and no risk of losing unsaved work. This simplifies both the UI state machine and the test surface: no mode-switching logic to test or maintain.

### Duplicate Submission Protection

The batch assignment button is disabled immediately on first click (via a `submitting` state flag), preventing double-posts from network latency or impatient users. The backend enforces a unique constraint on `(assignment_id, athlete_id)` as a last line of defence.

---

## Project Structure

```
mbs-football/
├── backend/                   FastAPI application
│   ├── app/
│   │   ├── api/v1/            Route registration (router.py)
│   │   ├── core/              Config, dependencies, JWT/JWKS verification
│   │   ├── db/                SQLAlchemy engine, session factory, base models
│   │   ├── domain/
│   │   │   ├── use_cases/     Business logic — one class per use case
│   │   │   └── events/        Product analytics event tracking
│   │   ├── models/            SQLAlchemy ORM models
│   │   ├── persistence/
│   │   │   └── repositories/  Abstract interfaces + SQLAlchemy implementations
│   │   ├── services/          AI template generation service
│   │   ├── transport/http/v1/ FastAPI route handlers (thin transport layer)
│   │   └── main.py            Application entry point
│   ├── alembic/               Database migration scripts
│   ├── scripts/               Utility scripts (seed exercises, etc.)
│   ├── tests/                 pytest integration tests (~500 tests)
│   ├── Dockerfile
│   ├── entrypoint.sh          Container startup: runs migrations then starts server
│   └── requirements.txt
│
├── frontend/                  Next.js application
│   ├── app/
│   │   ├── (public)/          Unauthenticated routes: /login, /signup, /join
│   │   ├── (app)/             Authenticated routes:
│   │   │   ├── dashboard/       Attention queue (overdue, due today, stale)
│   │   │   ├── exercises/       Exercise library (CRUD, tags, favorites)
│   │   │   ├── templates/       Template builder (blocks, drag-and-drop, AI draft)
│   │   │   ├── sessions/        Workout sessions (list, calendar, execution)
│   │   │   ├── team/            Team management + invite link generation
│   │   │   └── onboarding/      Role selection + team creation/join
│   │   └── _shared/           Auth context, API client, shared UI components
│   ├── src/features/          Feature hooks and shared frontend logic
│   ├── vitest.config.ts
│   └── Dockerfile
│
├── docs/                      Project documentation and slides
├── docker-compose.yml         Local full-stack environment
└── CLAUDE.md                  AI assistant project instructions
```

---

## Running the Project Locally

### Prerequisites

- Docker Desktop running
- Node.js 20+
- Python 3.12+

### Backend

```bash
# 1. Clone the repository
git clone https://github.com/etorralbo/mbs-football.git
cd mbs-football

# 2. Configure environment variables
cp backend/.env.example backend/.env
# Edit backend/.env — set DATABASE_URL and SUPABASE_URL

# 3. Start PostgreSQL and backend via Docker
docker compose up -d db backend

# 4. Apply database migrations (runs automatically on container start,
#    but can also be run manually)
docker compose exec backend alembic upgrade head

# 5. (Optional) Seed default exercises for AI template suggestions
docker compose exec backend python scripts/seed_default_exercises.py <team-uuid>

# 6. Run backend tests
docker compose up -d db
cd backend && python -m pytest -q
```

The backend runs at **http://localhost:8000**.
Interactive API docs: **http://localhost:8000/docs**

#### Backend environment variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string (`postgresql+psycopg://...`) |
| `SUPABASE_URL` | Yes | Supabase project URL (used for JWKS endpoint) |
| `OPENAI_API_KEY` | No | Required only for AI template draft feature |
| `FRONTEND_URL` | No | Used to build invite URLs (default: `http://localhost:3000`) |
| `ENV` | No | `local` or `production` (default: `local`) |

### Frontend

```bash
# 1. Configure environment variables
cp frontend/.env.local.example frontend/.env.local
# Set NEXT_PUBLIC_API_BASE_URL=http://localhost:8000

# 2. Install dependencies and start
cd frontend
npm install
npm run dev
```

The frontend runs at **http://localhost:3000**.

#### Frontend environment variables

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anonymous (public) key |
| `NEXT_PUBLIC_API_BASE_URL` | Yes | Backend base URL (`http://localhost:8000` locally) |

### Running tests

```bash
# Backend integration tests (~500 tests, requires a running Postgres)
cd backend && python -m pytest -q

# Frontend unit/component tests (~490 tests)
cd frontend && npx vitest run
```

---

## Deployment

The application is deployed and publicly accessible.

| Service | Platform | URL |
|---|---|---|
| Frontend | Vercel | <!-- TODO: add production URL --> |
| Backend | Render | <!-- TODO: add production URL --> |
| Database | Render | Managed PostgreSQL 16 |
| Authentication | Supabase | Managed auth service |

**Deployment notes:**

- The **frontend** deploys automatically to Vercel on every push to `main`.
- The **backend** runs as a Docker container on Render. On container startup, `entrypoint.sh` runs `alembic upgrade head` before starting the server. If migrations fail, the container exits immediately — the server never starts in a broken state.
- All secrets (`DATABASE_URL`, `SUPABASE_URL`, `OPENAI_API_KEY`) are configured via each platform's environment variable dashboard, never committed to the repository.

---

## Roadmap

| Sprint | Status | Scope |
|---|---|---|
| Sprint 1 — Core flow | Complete | Always-editable templates, autosave, inline assignment, batch assignment, readiness validation, Unit of Work, duplicate submission protection |
| Sprint 2 — Operational dashboard | Complete | Attention queue (overdue / due today / stale), server-side aggregation endpoint, actionable per-session rows |
| Sprint 3 — Athlete UX | Planned | Simplified session execution flow, progress indicators, mobile layout improvements |
| Sprint 4 — Analytics depth | Planned | Completion rate trends, load progression charts, team performance summary |
| Sprint 5 — Subscriptions | Planned | Billing integration, plan limits, coach account management |

---

## Slides Presentation

The slides for the TFM presentation are available at: [`docs/08032026_MettlePerformance_Sliders.pdf`](docs/08032026_MettlePerformance_Sliders.pdf)

---

## License

This project is developed as academic coursework (TFM). All rights reserved.

---

## Author

**Estibaliz Torralbo**
Master's Thesis (TFM) — 2026
