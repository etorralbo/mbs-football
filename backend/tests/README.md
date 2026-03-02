# Backend Tests

Integration tests for the MBS Football API. All tests hit a real PostgreSQL database
(`app_test`) and mock only the JWT layer — no Supabase calls are made.

## Running tests

```bash
# From backend/ (recommended)
python -m pytest -v

# Quick pass (less output)
python -m pytest -q

# Single file
python -m pytest tests/test_workout_sessions.py -v

# Inside Docker
docker compose exec backend python -m pytest -v
```

The test DB (`app_test`) is provisioned by `backend/docker/postgres-init/01-create-test-db.sql`
and migrated to HEAD automatically by `conftest.py` at session scope.

## JWT mocking

Tests use the `mock_jwt` fixture from `conftest.py` to impersonate any user without
hitting Supabase:

```python
def test_example(client, mock_jwt, coach_a):
    mock_jwt(str(coach_a.supabase_user_id))
    r = client.get("/v1/exercises", headers={"Authorization": "Bearer test-token"})
    assert r.status_code == 200
```

## Test files

| File | What it covers |
|---|---|
| `test_health.py` | `GET /health` liveness probe |
| `test_me.py` | `GET /v1/me` — membership resolution |
| `test_onboarding.py` | Team creation + invite-based athlete join flow |
| `test_teams.py` | `POST /v1/teams` — coach team creation, duplicate guard |
| `test_invites.py` | Invite generation, acceptance, expiry, single-use enforcement |
| `test_exercises_auth.py` | Exercise CRUD — auth, RBAC, tenant isolation |
| `test_tenant_isolation.py` | Cross-team data isolation (exercises, templates) |
| `test_athletes.py` | `GET /v1/athletes` — coach-only, team-scoped athlete list |
| `test_workout_assignments.py` | `POST /v1/workout-assignments` — assign templates to athletes/teams |
| `test_workout_execution.py` | Session completion + `PUT /logs` idempotency |
| `test_session_execution.py` | `GET /v1/workout-sessions/{id}/execution` — block/exercise view |
| `test_session_list_tenant_isolation.py` | `GET /v1/workout-sessions` — cross-tenant guard + `athlete_name` in response |
| `test_put_logs.py` | `PUT /v1/workout-sessions/{id}/logs` — log creation, validation |
| `test_rbac_matrix.py` | Role matrix: COACH vs ATHLETE across all write endpoints |
| `test_product_events.py` | Funnel event emission for key user actions |
| `test_analytics.py` | Analytics / event reporting endpoints |
| `test_ai_template_draft.py` | `POST /v1/workout-templates/from-ai` — AI draft generation |
| `test_workout_templates_from_ai.py` | AI template creation, validation, atomicity |
| `test_cors.py` | CORS headers for allowed/disallowed origins |
| `test_logging_middleware.py` | Request logging middleware |

## Key fixtures (`conftest.py`)

| Fixture | Description |
|---|---|
| `db_session` | SQLAlchemy session with per-test rollback |
| `client` | FastAPI `TestClient` with DB dependency overridden |
| `mock_jwt` | Callable — `mock_jwt(supabase_user_id_str)` impersonates a user |
| `team_a`, `team_b` | Two isolated tenant teams |
| `coach_a`, `athlete_a` | UserProfiles for team A |
| `exercise_team_a` | Sample exercise scoped to team A |
