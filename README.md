# Mettle Performance

A multi-tenant training and coaching platform designed to help coaches plan workouts, assign sessions to athletes, and track training execution in a structured environment.

> **Note on repository name:** The repository is named `mbs-football` (the original working title). The product name is **Mettle Performance**. Both names coexist intentionally — infrastructure retains the codename while all user-facing surfaces use the product name.

---

## Quick Links

- **Repository:** https://github.com/etorralbo/mbs-football
- **Video demo:** https://drive.google.com/file/d/1DYzwmwYkf0BtVjtve1dIEtArHhAnDdvi/view?usp=sharing
- **Slides:** [`docs/slides.pdf`](docs/slides.pdf)
- **API docs (local):** http://localhost:8000/docs

---

## TFM Evaluation Overview

| Requirement | Section |
|---|---|
| Quick evaluation guide | [How to Evaluate This Project](#how-to-evaluate-this-project) |
| Academic context | [Academic Context](#academic-context) |
| Project description | [Project Description](#project-description) |
| Main features | [Main Features](#main-features) |
| Technology stack | [Technology Stack](#technology-stack) |
| Architecture | [Architecture Overview](#architecture-overview) |
| Project structure | [Project Structure](#project-structure) |
| Installation and execution | [Running the Project Locally](#running-the-project-locally) |
| Deployment / public URL | [Deployment](#deployment) |
| Code repository | [This repository](.) |
| Slides presentation | [Slides Presentation](#slides-presentation) |

---

## How to Evaluate This Project

If you want to quickly review the functionality of the platform, follow these steps:

1. Open the deployed application (see [Deployment](#deployment) section).
2. Create a **coach account** at `/signup`.
3. Create a **team**.
4. Create a **workout template** (manually or using the **AI draft** feature).

5. Go to the **Team** section and **invite an athlete using their email address**.
6. Open the invite link (or use another browser/incognito window) and **register the athlete using the same email from the invitation**.  
   The athlete will automatically join the team.
7. Switch back to the **coach account**.
8. **Assign the template** to the athlete.

9. Log in as the **athlete** and open the assigned session in **/sessions**.
10. **Execute the workout**, logging sets/reps/load.
11. **Mark the session as completed**.

12. Switch back to the **coach account** and verify that the **session appears as completed**.

This flow demonstrates the core lifecycle of the system:

**Template creation → Athlete invitation → Session assignment → Workout execution → Completion tracking.**

---

## Academic Context

This project was developed as the final Master's thesis (TFM).

The objective was to design and implement a full-stack web application that demonstrates:

- Multi-tenant SaaS architecture
- Role-based access control
- Modern web frontend development
- REST API backend design
- AI-assisted functionality integration
- Automated testing strategies

The project includes both a production-ready application and the full technical documentation required for evaluation.

---

## Project Description

Mettle Performance is a web application designed for strength and conditioning coaches and their athletes. It solves the problem of planning, distributing, and tracking training sessions in a structured, multi-tenant environment.

**Coaches** create a team, build an exercise library, design reusable workout templates (manually or with AI assistance), and assign sessions to individual athletes or the entire team. **Athletes** join a team via a secure invite link, view their assigned sessions, execute workouts, and log sets/reps/load in real time.

The platform enforces strict role-based access control (COACH / ATHLETE) and multi-tenant isolation — every query is scoped to the authenticated user's team.

---

## Main Features

### Coach capabilities

- Create and manage a team
- Build and maintain an exercise library (with tags, search, and favorites)
- Design workout templates using a block-based editor
- Generate workout templates using AI assistance (OpenAI-powered draft generation)
- Assign templates to individual athletes or the entire team
- Monitor athlete sessions and completion status
- View activation funnel analytics (team-scoped product events)
- Generate secure, time-limited invite links for athletes

### Athlete capabilities

- Join a team via a secure invite link
- View assigned workout sessions
- Execute sessions with a guided block-by-block interface
- Log sets, reps, and load for each exercise
- Mark sessions as completed

---

## AI Integration

The platform includes an AI-assisted template creation feature (`POST /v1/workout-templates/from-ai`). When a coach provides a training goal (e.g. "upper body strength session"), the system:

1. Sends the goal to an OpenAI-compatible chat API with a structured prompt
2. The LLM generates a title and intent for each predefined block (Preparation to Movement, Plyometrics, Primary Strength, etc.)
3. The backend performs keyword-based exercise matching against the team's exercise library — no LLM involvement in exercise selection
4. Returns a complete draft template that the coach can review and edit before saving

The AI layer is stateless and non-persistent: it generates a draft but never writes directly to the database.

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
| Recharts | 3.x | Analytics charts |
| Supabase JS | 2.x | Authentication client |

### Backend

| Technology | Version | Purpose |
|---|---|---|
| FastAPI | 0.115.6 | Web framework |
| SQLAlchemy | 2.0.36 | ORM |
| Alembic | 1.14.0 | Database migrations |
| PostgreSQL | 16 | Database |
| Pydantic | 2.10.3 | Request/response validation |
| PyJWT | 2.10.1 | JWT verification (ES256 + JWKS) |
| OpenAI SDK | 1.57.4 | AI template draft generation |
| psycopg | 3.2.3 | PostgreSQL driver |
| pytest | 9.x | Testing |
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
                │   Clean architecture layers     │
                └───────────────┬───────────────┘
                                │ SQLAlchemy ORM
                ┌───────────────▼───────────────┐
                │         PostgreSQL 16           │
                │   (Render managed / local)      │
                └───────────────────────────────┘
```

The backend follows a three-layer clean architecture:

- **Transport** (`transport/http/v1/`): FastAPI route handlers — request parsing, dependency injection, HTTP error mapping
- **Domain** (`domain/use_cases/`): Business logic — one class per use case, no framework dependencies
- **Persistence** (`persistence/repositories/`): Database access — abstract interfaces + SQLAlchemy implementations

Authentication flow: Users authenticate via Supabase → the frontend attaches a Bearer token to every API call → the backend verifies the JWT against Supabase's public JWKS (no Supabase SDK dependency on the backend). Multi-tenant isolation is enforced by resolving `team_id` from the authenticated user's profile on every request.

---

## Project Structure

```
mbs-football/
├── backend/                  FastAPI application
│   ├── app/
│   │   ├── api/v1/           Route registration
│   │   ├── core/             Config, dependencies, security (JWT/JWKS), AI client
│   │   ├── db/               SQLAlchemy engine + session factory
│   │   ├── domain/
│   │   │   ├── use_cases/    Business logic (one class per use case)
│   │   │   └── events/       Product analytics events
│   │   ├── models/           SQLAlchemy ORM models
│   │   ├── persistence/
│   │   │   └── repositories/ DB access (abstract + SQLAlchemy impl)
│   │   ├── schemas/          Pydantic v2 request/response schemas
│   │   ├── services/         AI template generation service
│   │   ├── transport/http/v1 FastAPI route handlers (thin layer)
│   │   └── main.py           Application entry point
│   ├── alembic/              Database migration scripts
│   ├── scripts/              Utility scripts (seed data, etc.)
│   ├── tests/                pytest integration tests
│   ├── Dockerfile
│   ├── entrypoint.sh         Container startup (migrations + server)
│   └── requirements.txt
│
├── frontend/                 Next.js application
│   ├── app/
│   │   ├── (public)/         Unauthenticated routes: /login, /signup
│   │   ├── (app)/            Authenticated routes:
│   │   │   ├── dashboard/      Coach analytics dashboard
│   │   │   ├── exercises/      Exercise library (CRUD, tags, favorites)
│   │   │   ├── templates/      Template builder (blocks, drag-and-drop, AI)
│   │   │   ├── sessions/       Workout sessions (list + execution)
│   │   │   ├── team/           Team management
│   │   │   └── onboarding/     Role selection + team creation/join
│   │   └── _shared/          Auth helpers, API client, shared components
│   ├── vitest.config.ts
│   └── Dockerfile
│
├── docs/                     Architecture decision records
├── docker-compose.yml        Local full-stack environment
└── CLAUDE.md                 AI assistant instructions
```

---

## Running the Project Locally

### Prerequisites

- Docker Desktop running
- Node.js 20+
- Python 3.12+

### Backend setup

```bash
# 1. Clone the repository
git clone <repo-url>
cd mbs-football

# 2. Configure environment variables
cp backend/.env.example backend/.env   # fill in Supabase URL and DATABASE_URL

# 3. Start PostgreSQL and backend via Docker
docker compose up -d db backend

# 4. Apply database migrations
docker compose exec backend alembic upgrade head

# 5. (Optional) Seed default exercises for AI draft suggestions
docker compose exec backend python scripts/seed_default_exercises.py <team-uuid>

# 6. Run backend tests
docker compose up -d db
cd backend && pytest -q
```

The backend runs at http://localhost:8000. API docs are available at http://localhost:8000/docs.

#### Backend environment variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string (`postgresql+psycopg://...`) |
| `SUPABASE_URL` | Yes | Supabase project URL |
| `FRONTEND_URL` | No | Used to build invite URLs (default: `http://localhost:3000`) |
| `ENV` | No | `local` or `production` (default: `local`) |

### Frontend setup

```bash
# 1. Configure environment variables
cp frontend/.env.local.example frontend/.env.local
# Set NEXT_PUBLIC_API_BASE_URL=http://localhost:8000

# 2. Install dependencies and start
cd frontend
npm install
npm run dev
```

The frontend runs at http://localhost:3000.

#### Frontend environment variables

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anonymous (public) key |
| `NEXT_PUBLIC_API_BASE_URL` | Yes | Backend URL (`http://localhost:8000` locally) |

### Running tests

```bash
# Backend tests
cd backend && pytest -q

# Frontend tests
cd frontend && npm test
```

---

## Deployment

The application is deployed and publicly accessible.
Evaluators can access the running system using the URLs below.

| Service | Platform | URL |
|---|---|---|
| Frontend | Vercel | <!-- TODO: add production URL --> |
| Backend | Render | <!-- TODO: add production URL --> |
| Database | Render | Managed PostgreSQL 16 |
| Authentication | Supabase | Managed auth service |

- The **frontend** deploys automatically to Vercel on every push to `main`.
- The **backend** runs as a Docker container on Render. On startup, `entrypoint.sh` runs `alembic upgrade head` before starting the server — if migrations fail, the container exits and the application never starts.
- Environment variables (`DATABASE_URL`, `SUPABASE_URL`, etc.) are configured in each platform's dashboard.

---

## Demo Workflow

To test the main functionality end-to-end:

1. **Sign up** at `/signup` with an email and password
2. **Choose role**: select "I'm a coach" on the onboarding screen
3. **Create a team**: enter a team name on `/create-team`
4. **Add exercises**: go to `/exercises` and create exercises (or seed defaults via the script)
5. **Create a template**: go to `/templates`, create a new template — either manually using the block editor or via "AI Draft" by providing a training goal
6. **Invite an athlete**: go to `/team`, generate an invite link, and share it
7. **Athlete joins**: the athlete signs up and visits the invite link to join the team
8. **Assign a session**: back as coach, assign the template to the athlete (or the whole team)
9. **Execute the session**: as the athlete, go to `/sessions`, open the assigned session, log sets/reps/load, and mark it as completed
10. **Review**: as the coach, verify the session shows as completed in the sessions list

---

## Slides Presentation

<!-- TODO: add link to the slides file once included in the repository -->

The slides for the TFM presentation are available at: `docs/slides.pdf`

---

## Author

Estibaliz Torralbo

Master's Thesis (TFM) — 2026
