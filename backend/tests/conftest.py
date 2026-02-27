"""
Test configuration and fixtures.

Load order is critical:
  1. python-dotenv reads .env.test into os.environ (override=True)
  2. Only then do we import app modules — pydantic-settings picks up the
     test DATABASE_URL and SUPABASE_URL instead of the local .env values.
"""
# ---------------------------------------------------------------------------
# Step 1: inject test env vars BEFORE any app module is imported
# ---------------------------------------------------------------------------
from pathlib import Path as _Path
from dotenv import load_dotenv as _load_dotenv

_load_dotenv(_Path(__file__).parent.parent / ".env.test", override=True)

# ---------------------------------------------------------------------------
# Step 2: standard library + third-party imports
# ---------------------------------------------------------------------------
import os
import time
import uuid
from contextlib import contextmanager
from typing import Generator

import pytest
from alembic import command as alembic_command
from alembic.config import Config as AlembicConfig
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, text
from sqlalchemy.engine import URL, make_url
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session, sessionmaker

# ---------------------------------------------------------------------------
# Step 3: app imports — Settings is instantiated here via lru_cache
# ---------------------------------------------------------------------------
from app.core import dependencies
from app.core.config import get_settings
from app.db.session import get_db
from app.main import app
from app.models import Team, UserProfile, Role, Exercise, Membership, Invite

# ---------------------------------------------------------------------------
# Database URL objects derived from the env vars set by .env.test
# ---------------------------------------------------------------------------
# Keep as string for alembic config; use URL object everywhere else.
TEST_DATABASE_URL: str = os.environ["DATABASE_URL"]

_test_url: URL = make_url(TEST_DATABASE_URL)

# Admin URL: same host/credentials, different database (must already exist).
# Defaults to "app" — the POSTGRES_DB created by Docker Compose.
# Override via TEST_ADMIN_DB in .env.test if your setup differs.
_ADMIN_DB: str = os.environ.get("TEST_ADMIN_DB", "app")
_admin_url: URL = _test_url.set(database=_ADMIN_DB)

# Absolute path to alembic.ini — robust regardless of pytest working directory.
_BACKEND_DIR = _Path(__file__).parent.parent
_ALEMBIC_INI = _BACKEND_DIR / "alembic.ini"

# SQLAlchemy engine + session factory for tests
test_engine = create_engine(_test_url, pool_pre_ping=True)
TestSessionLocal = sessionmaker(bind=test_engine, autocommit=False, autoflush=False)


def _check_db_reachable() -> None:
    """
    Verify the admin database is reachable before any fixture tries to use it.
    Raises RuntimeError with an actionable message if the connection fails.
    """
    probe = create_engine(_admin_url, pool_pre_ping=True)
    try:
        with probe.connect():
            pass
    except OperationalError as exc:
        safe_url = _admin_url.render_as_string(hide_password=True)
        raise RuntimeError(
            f"\nCannot connect to Postgres at: {safe_url}\n"
            "\n"
            "Make sure the Docker Compose database service is running:\n"
            "  docker compose up -d db\n"
            "\n"
            "First time or after changing init scripts (resets all local data):\n"
            "  docker compose down -v\n"
            "  docker compose up -d db\n"
            "\n"
            "If another Postgres is already using port 5432, stop it first:\n"
            "  brew services stop postgresql@16   # Homebrew (macOS)\n"
            "  sudo service postgresql stop       # Linux\n"
            f"\nOriginal error: {exc}"
        ) from exc
    finally:
        probe.dispose()


# ---------------------------------------------------------------------------
# Session-scoped fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session", autouse=True)
def setup_test_database():
    """
    1. Verify Postgres is reachable (fail fast with a helpful message).
    2. Create the test database if it does not yet exist (idempotent).
    3. Apply all Alembic migrations to bring the schema to HEAD (idempotent).

    Runs once per pytest session. Schema reflects the real migration history,
    not just the current ORM metadata snapshot.
    """
    _check_db_reachable()

    # --- Ensure test database exists ---
    db_name = _test_url.database
    admin_engine = create_engine(_admin_url, isolation_level="AUTOCOMMIT", pool_pre_ping=True)
    try:
        with admin_engine.connect() as conn:
            exists = conn.execute(
                text("SELECT 1 FROM pg_database WHERE datname = :name"),
                {"name": db_name},
            ).fetchone()
            if not exists:
                conn.execute(text(f'CREATE DATABASE "{db_name}"'))
    finally:
        admin_engine.dispose()

    # --- Apply Alembic migrations (idempotent: already at HEAD → no-op) ---
    # env.py also sets sqlalchemy.url from get_settings(), which already holds
    # the test DATABASE_URL because .env.test was loaded before any app import.
    # The explicit set_main_option below makes the intent clear and decouples
    # from the lru_cache behaviour.
    alembic_cfg = AlembicConfig(str(_ALEMBIC_INI))
    alembic_cfg.set_main_option("sqlalchemy.url", TEST_DATABASE_URL)
    alembic_command.upgrade(alembic_cfg, "head")

    yield

    test_engine.dispose()


# ---------------------------------------------------------------------------
# Function-scoped fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="function")
def db_session() -> Generator[Session, None, None]:
    """<
    Provide a test database session wrapped in a transaction that is rolled
    back after each test, keeping the database clean without truncating tables.
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
    """Test HTTP client with the database dependency overridden."""
    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()


@pytest.fixture
def count_queries():
    """
    Context-manager fixture that captures every SQL statement executed
    against test_engine while inside the block.

    Usage:
        with count_queries() as stmts:
            client.post(...)
        assert len([s for s in stmts if "exercises" in s.lower()]) == 1
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
    Replace verify_jwt_token (as imported in dependencies.py) with a stub
    that returns a valid-looking payload for the given Supabase user UUID.

    Usage:
        mock_jwt(str(user.supabase_user_id))
        resp = client.get("/v1/me", headers={"Authorization": "Bearer test-token"})
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

        monkeypatch.setattr(dependencies, "verify_jwt_token", fake_verify)

    return _set_sub


# ---------------------------------------------------------------------------
# Test data fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def team_a(db_session: Session) -> Team:
    team = Team(id=uuid.uuid4(), name="Team Alpha")
    db_session.add(team)
    db_session.commit()
    db_session.refresh(team)
    return team


@pytest.fixture
def team_b(db_session: Session) -> Team:
    team = Team(id=uuid.uuid4(), name="Team Beta")
    db_session.add(team)
    db_session.commit()
    db_session.refresh(team)
    return team


@pytest.fixture
def coach_a(db_session: Session, team_a: Team) -> UserProfile:
    coach = UserProfile(
        id=uuid.uuid4(),
        supabase_user_id=uuid.uuid4(),
        team_id=team_a.id,
        role=Role.COACH,
        name="Coach Alpha",
    )
    db_session.add(coach)
    db_session.flush()
    # Membership is the authoritative source for team_id/role in get_current_user.
    db_session.add(Membership(
        id=uuid.uuid4(),
        user_id=coach.supabase_user_id,
        team_id=team_a.id,
        role=Role.COACH,
    ))
    db_session.commit()
    db_session.refresh(coach)
    return coach


@pytest.fixture
def athlete_a(db_session: Session, team_a: Team) -> UserProfile:
    athlete = UserProfile(
        id=uuid.uuid4(),
        supabase_user_id=uuid.uuid4(),
        team_id=team_a.id,
        role=Role.ATHLETE,
        name="Athlete Alpha",
    )
    db_session.add(athlete)
    db_session.flush()
    db_session.add(Membership(
        id=uuid.uuid4(),
        user_id=athlete.supabase_user_id,
        team_id=team_a.id,
        role=Role.ATHLETE,
    ))
    db_session.commit()
    db_session.refresh(athlete)
    return athlete


@pytest.fixture
def coach_b(db_session: Session, team_b: Team) -> UserProfile:
    coach = UserProfile(
        id=uuid.uuid4(),
        supabase_user_id=uuid.uuid4(),
        team_id=team_b.id,
        role=Role.COACH,
        name="Coach Beta",
    )
    db_session.add(coach)
    db_session.flush()
    db_session.add(Membership(
        id=uuid.uuid4(),
        user_id=coach.supabase_user_id,
        team_id=team_b.id,
        role=Role.COACH,
    ))
    db_session.commit()
    db_session.refresh(coach)
    return coach


@pytest.fixture
def exercise_team_a(db_session: Session, team_a: Team) -> Exercise:
    exercise = Exercise(
        id=uuid.uuid4(),
        team_id=team_a.id,
        name="Squats",
        description="Basic squats",
        tags="strength, legs",
    )
    db_session.add(exercise)
    db_session.commit()
    db_session.refresh(exercise)
    return exercise


# ---------------------------------------------------------------------------
# Fixtures for POST /v1/workout-templates/from-ai
# ---------------------------------------------------------------------------

@pytest.fixture
def onboarded_coach(db_session: Session) -> UserProfile:
    """Coach with their own isolated team (used by from-ai tests)."""
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
    db_session.flush()
    # Membership is the authoritative source for team_id/role in get_current_user.
    db_session.add(Membership(
        id=uuid.uuid4(),
        user_id=coach.supabase_user_id,
        team_id=team.id,
        role=Role.COACH,
    ))
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
    """One exercise in the onboarded coach's team."""
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
    """One exercise belonging to a completely different team."""
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


# ---------------------------------------------------------------------------
# Sprint 5: membership + invite fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def membership_coach_a(db_session: Session, team_a: Team) -> Membership:
    """COACH membership for a fresh user in team A."""
    m = Membership(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        team_id=team_a.id,
        role=Role.COACH,
    )
    db_session.add(m)
    db_session.commit()
    db_session.refresh(m)
    return m


@pytest.fixture
def invite_team_a(db_session: Session, team_a: Team, membership_coach_a: Membership) -> Invite:
    """A valid, unused ATHLETE invite for team A."""
    invite = Invite(
        id=uuid.uuid4(),
        team_id=team_a.id,
        code="valid-test-invite-code-abc",
        role=Role.ATHLETE,
        created_by_user_id=membership_coach_a.user_id,
    )
    db_session.add(invite)
    db_session.commit()
    db_session.refresh(invite)
    return invite
