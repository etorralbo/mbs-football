"""
Test configuration and fixtures.

Provides:
- Test database with automatic cleanup
- Test FastAPI client
- JWT mocking utilities
- Test data fixtures
"""
import time
import uuid
from contextlib import contextmanager
from typing import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import Session, sessionmaker

from app.core import dependencies
from app.core.config import get_settings
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models import Team, UserProfile, Role, Exercise

# Use test database with explicit credentials
TEST_DATABASE_URL = "postgresql+psycopg://app:app@db:5432/app_test"

# Create test engine
test_engine = create_engine(TEST_DATABASE_URL, pool_pre_ping=True)
TestSessionLocal = sessionmaker(bind=test_engine, autocommit=False, autoflush=False)


@pytest.fixture(scope="session", autouse=True)
def setup_test_database():
    """
    Create test database if it doesn't exist and set up schema.

    Runs once per test session.
    """
    # Extract database name from URL
    db_name = "app_test"

    # Connect to default 'postgres' database to create test database
    default_url = "postgresql+psycopg://app:app@db:5432/postgres"
    default_engine = create_engine(default_url, isolation_level="AUTOCOMMIT")

    with default_engine.connect() as conn:
        # Check if test database exists
        result = conn.execute(
            text("SELECT 1 FROM pg_database WHERE datname = :db_name"),
            {"db_name": db_name}
        )
        if not result.fetchone():
            # Create test database
            conn.execute(text(f"CREATE DATABASE {db_name}"))

    default_engine.dispose()

    # Create all tables in test database
    Base.metadata.create_all(bind=test_engine)

    yield

    # Teardown: Drop all tables (optional - comment out to inspect DB after tests)
    # Base.metadata.drop_all(bind=test_engine)
    test_engine.dispose()


@pytest.fixture(scope="function")
def db_session() -> Generator[Session, None, None]:
    """
    Provide a test database session with automatic rollback.

    Each test gets a fresh transaction that is rolled back after the test.
    """
    connection = test_engine.connect()
    transaction = connection.begin()
    session = TestSessionLocal(bind=connection)

    yield session

    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture(scope="function")
def client(db_session: Session) -> Generator[TestClient, None, None]:
    """
    Provide a test client with overridden database dependency.

    Uses the test database session instead of the production one.
    """
    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()


@pytest.fixture
def count_queries():
    """
    Return a context manager that captures every SQL statement fired
    against test_engine while inside the block.

    Usage:
        with count_queries() as stmts:
            client.post(...)
        exercise_selects = [s for s in stmts if "exercises" in s.lower()]
    """
    @contextmanager
    def _capture():
        statements: list[str] = []

        def _listener(conn, cursor, statement, parameters, context, executemany):
            statements.append(statement)

        event.listen(test_engine, "before_cursor_execute", _listener)
        try:
            yield statements
        finally:
            event.remove(test_engine, "before_cursor_execute", _listener)

    return _capture


@pytest.fixture
def mock_jwt(monkeypatch):
    """
    Monkeypatch verify_jwt_token used by dependencies.py
    so requests can authenticate without calling Supabase.

    Usage in tests:
        mock_jwt(str(user.supabase_user_id))
        resp = client.get("/v1/exercises", headers={"Authorization": "Bearer test-token"})
    """
    settings = get_settings()

    def _set_sub(sub: str):
        def fake_verify(_token: str):
            now = int(time.time())
            return {
                "sub": sub,
                "aud": settings.SUPABASE_JWT_AUD,
                "iss": settings.SUPABASE_JWT_ISSUER,
                "iat": now,
                "exp": now + 3600,
            }

        # Patch the symbol imported in dependencies.py, not the source module
        monkeypatch.setattr(dependencies, "verify_jwt_token", fake_verify)

    return _set_sub


# Test data fixtures

@pytest.fixture
def team_a(db_session: Session) -> Team:
    """Create test team A."""
    team = Team(id=uuid.uuid4(), name="Team Alpha")
    db_session.add(team)
    db_session.commit()
    db_session.refresh(team)
    return team


@pytest.fixture
def team_b(db_session: Session) -> Team:
    """Create test team B."""
    team = Team(id=uuid.uuid4(), name="Team Beta")
    db_session.add(team)
    db_session.commit()
    db_session.refresh(team)
    return team


@pytest.fixture
def coach_a(db_session: Session, team_a: Team) -> UserProfile:
    """Create a coach user for team A."""
    coach = UserProfile(
        id=uuid.uuid4(),
        supabase_user_id=uuid.uuid4(),
        team_id=team_a.id,
        role=Role.COACH,
        name="Coach Alpha"
    )
    db_session.add(coach)
    db_session.commit()
    db_session.refresh(coach)
    return coach


@pytest.fixture
def athlete_a(db_session: Session, team_a: Team) -> UserProfile:
    """Create an athlete user for team A."""
    athlete = UserProfile(
        id=uuid.uuid4(),
        supabase_user_id=uuid.uuid4(),
        team_id=team_a.id,
        role=Role.ATHLETE,
        name="Athlete Alpha"
    )
    db_session.add(athlete)
    db_session.commit()
    db_session.refresh(athlete)
    return athlete


@pytest.fixture
def coach_b(db_session: Session, team_b: Team) -> UserProfile:
    """Create a coach user for team B."""
    coach = UserProfile(
        id=uuid.uuid4(),
        supabase_user_id=uuid.uuid4(),
        team_id=team_b.id,
        role=Role.COACH,
        name="Coach Beta"
    )
    db_session.add(coach)
    db_session.commit()
    db_session.refresh(coach)
    return coach


@pytest.fixture
def exercise_team_a(db_session: Session, team_a: Team) -> Exercise:
    """Create an exercise for team A."""
    exercise = Exercise(
        id=uuid.uuid4(),
        team_id=team_a.id,
        name="Squats",
        description="Basic squats",
        tags="strength, legs"
    )
    db_session.add(exercise)
    db_session.commit()
    db_session.refresh(exercise)
    return exercise


# ---------------------------------------------------------------------------
# Fixtures for POST /v1/workout-templates/from-ai tests
# ---------------------------------------------------------------------------

@pytest.fixture
def onboarded_coach(db_session: Session) -> UserProfile:
    """Create an onboarded coach with their own isolated team."""
    team = Team(id=uuid.uuid4(), name="From-AI Team")
    db_session.add(team)
    db_session.flush()
    coach = UserProfile(
        id=uuid.uuid4(),
        supabase_user_id=uuid.uuid4(),
        team_id=team.id,
        role=Role.COACH,
        name="From-AI Coach",
    )
    db_session.add(coach)
    db_session.commit()
    db_session.refresh(coach)
    return coach


@pytest.fixture
def onboarded_coach_jwt(onboarded_coach: UserProfile, mock_jwt) -> UserProfile:
    """Activate mock JWT for onboarded_coach; returns the coach for team_id access."""
    mock_jwt(str(onboarded_coach.supabase_user_id))
    return onboarded_coach


@pytest.fixture
def coach_team_exercise_id(db_session: Session, onboarded_coach: UserProfile) -> uuid.UUID:
    """Create one exercise in the onboarded coach's team; return its ID."""
    exercise = Exercise(
        id=uuid.uuid4(),
        team_id=onboarded_coach.team_id,
        name="Coach Team Exercise",
        description="Owned by the coach's team",
    )
    db_session.add(exercise)
    db_session.commit()
    return exercise.id


@pytest.fixture
def foreign_team_exercise_id(db_session: Session) -> uuid.UUID:
    """Create one exercise on a completely different team; return its ID."""
    other_team = Team(id=uuid.uuid4(), name="Foreign Team")
    db_session.add(other_team)
    db_session.flush()
    exercise = Exercise(
        id=uuid.uuid4(),
        team_id=other_team.id,
        name="Foreign Exercise",
        description="Belongs to another team",
    )
    db_session.add(exercise)
    db_session.commit()
    return exercise.id
