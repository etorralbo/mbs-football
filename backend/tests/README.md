# Testing Guide

## Overview
Integration tests for the Football MVP API focusing on authentication, authorization, and tenant isolation.

## Test Structure

```
tests/
├── __init__.py
├── conftest.py               # Fixtures and test configuration
├── test_exercises_auth.py    # Auth/authz and tenant isolation tests
└── README.md                 # This file
```

## Test Database

Tests use a separate database named `app_test` in the same PostgreSQL instance.

- **Created automatically** on first test run
- **Schema created** from SQLAlchemy models
- **Isolated** from production/development data
- **Transaction rollback** after each test for clean state

## Running Tests

### Inside Docker (Recommended)

```bash
# Run all tests
docker compose exec backend pytest

# Run with verbose output
docker compose exec backend pytest -v

# Run with quiet output
docker compose exec backend pytest -q

# Run specific test file
docker compose exec backend pytest tests/test_exercises_auth.py

# Run specific test class
docker compose exec backend pytest tests/test_exercises_auth.py::TestRoleBasedAccessControl

# Run specific test
docker compose exec backend pytest tests/test_exercises_auth.py::TestRoleBasedAccessControl::test_create_exercise_coach_ok

# Run tests matching a pattern
docker compose exec backend pytest -k "tenant_isolation"

# Run with coverage
docker compose exec backend pytest --cov=app --cov-report=term-missing
```

### Local Development

```bash
cd backend

# Ensure test database exists and is accessible
# Set DATABASE_URL in .env to point to your test database

# Install test dependencies
pip install -r requirements.txt

# Run tests
pytest

# Run with specific options
pytest -v -s  # Verbose with print statements
```

## Test Categories

### 1. Authentication Tests (`TestExercisesAuthentication`)
Verify that endpoints require valid Bearer tokens.

**Tests:**
- ✅ `test_list_exercises_requires_auth` - 401 without token
- ✅ `test_create_exercise_requires_auth` - 401 without token
- ✅ `test_update_exercise_requires_auth` - 401 without token
- ✅ `test_delete_exercise_requires_auth` - 401 without token

### 2. User Onboarding Tests (`TestUserOnboarding`)
Verify that users must have a `UserProfile` to access the API.

**Tests:**
- ✅ `test_list_exercises_user_not_onboarded` - 403 for valid token but no profile

### 3. Onboarded User Tests (`TestExercisesOnboardedUser`)
Verify that onboarded users can access their team's data.

**Tests:**
- ✅ `test_list_exercises_onboarded_ok` - 200 with team exercises
- ✅ `test_get_single_exercise_ok` - 200 for specific exercise
- ✅ `test_list_exercises_with_search` - Search filters by name

### 4. Role-Based Access Control (`TestRoleBasedAccessControl`)
Verify that only coaches can create/update/delete exercises.

**Tests:**
- ✅ `test_create_exercise_coach_ok` - Coach can create (201)
- ✅ `test_create_exercise_athlete_forbidden` - Athlete cannot create (403)
- ✅ `test_update_exercise_coach_ok` - Coach can update (200)
- ✅ `test_update_exercise_athlete_forbidden` - Athlete cannot update (403)
- ✅ `test_delete_exercise_coach_ok` - Coach can delete (204)
- ✅ `test_delete_exercise_athlete_forbidden` - Athlete cannot delete (403)

### 5. Tenant Isolation (`TestTenantIsolation`)
**Most Important:** Verify that teams cannot access each other's data (IDOR prevention).

**Tests:**
- ✅ `test_tenant_isolation_list` - List only shows own team's exercises
- ✅ `test_tenant_isolation_get_single` - Cannot GET other team's exercise (404)
- ✅ `test_tenant_isolation_update` - Cannot PATCH other team's exercise (404)
- ✅ `test_tenant_isolation_delete` - Cannot DELETE other team's exercise (404)

## Fixtures

### Database Fixtures
- `db_session` - Test database session with automatic rollback
- `client` - FastAPI TestClient with overridden DB dependency

### JWT Mocking Fixtures
- `mock_jwt_payload` - Default JWT payload for testing
- `mock_verify_token` - Mocks `verify_jwt_token()` to return controlled payloads

### Test Data Fixtures
- `team_a`, `team_b` - Test teams
- `coach_a`, `coach_b` - Coach users for teams A and B
- `athlete_a` - Athlete user for team A
- `exercise_team_a` - Sample exercise for team A

## JWT Mocking Strategy

Tests **do not call Supabase**. Instead, they mock `app.core.security.verify_jwt_token`:

```python
def test_example(client, mocker, coach_a):
    # Mock JWT verification to return coach_a's user ID
    mocker.patch(
        "app.core.security.verify_jwt_token",
        return_value={
            "sub": str(coach_a.supabase_user_id),
            "aud": "authenticated",
            "iss": "https://test.supabase.co/auth/v1",
            "exp": int((datetime.utcnow() + timedelta(hours=1)).timestamp()),
            "iat": int(datetime.utcnow().timestamp()),
        }
    )

    # Make authenticated request
    response = client.get(
        "/v1/exercises",
        headers={"Authorization": "Bearer fake-token"}
    )

    assert response.status_code == 200
```

## Security Features Tested

✅ **Authentication** - All endpoints require valid Bearer token
✅ **User Onboarding** - Users must have UserProfile (403 if not)
✅ **Authorization** - Role-based access (Coach vs Athlete)
✅ **Tenant Isolation** - Team-scoped queries prevent IDOR
✅ **404 for Cross-Tenant Access** - Don't leak existence of other teams' data

## Continuous Integration

To add CI/CD pipeline:

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: app
          POSTGRES_PASSWORD: app_password
          POSTGRES_DB: app_test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432

    steps:
      - uses: actions/checkout@v3

      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.12'

      - name: Install dependencies
        run: |
          cd backend
          pip install -r requirements.txt

      - name: Run tests
        env:
          DATABASE_URL: postgresql://app:app_password@localhost:5432/app_test
          SUPABASE_URL: https://test.supabase.co
        run: |
          cd backend
          pytest -v --cov=app
```

## Troubleshooting

### Database Connection Error
```
Error: could not connect to server
```

**Solution:** Ensure PostgreSQL is running and `DATABASE_URL` is correct in `.env`.

### Test Database Not Created
```
Error: database "app_test" does not exist
```

**Solution:** The `setup_test_database` fixture should create it automatically. Ensure your database user has `CREATEDB` permission:

```sql
ALTER USER app CREATEDB;
```

### Import Errors
```
ModuleNotFoundError: No module named 'app'
```

**Solution:** Ensure you're running pytest from the `backend` directory and that the Python path is correct.

### Fixture Not Found
```
fixture 'db_session' not found
```

**Solution:** Ensure `conftest.py` is in the `tests/` directory and pytest can discover it.

## Best Practices

1. **Isolate Tests** - Each test should be independent
2. **Use Fixtures** - Reuse common setup with fixtures
3. **Mock External Services** - Don't call Supabase, Stripe, etc.
4. **Test Security** - Always test authentication, authorization, and tenant isolation
5. **Use Descriptive Names** - Test names should describe what they test
6. **Clean Up** - Fixtures handle cleanup via transaction rollback

## Future Improvements

- [ ] Add performance tests
- [ ] Add end-to-end tests with real Supabase (staging environment)
- [ ] Add mutation testing (pytest-mutpy)
- [ ] Add property-based testing (Hypothesis)
- [ ] Add API contract tests (Pact)
- [ ] Measure code coverage and enforce minimum threshold

---

**Happy Testing! 🧪**
