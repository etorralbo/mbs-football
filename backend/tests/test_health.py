"""
Tests for the /health endpoint and startup env validation.

Covers:
- GET /health → 200, correct shape, no auth required
- validate_production_env() fail-fast rules
"""
import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app

_REQUIRED = dict(
    DATABASE_URL="postgresql+psycopg://fake:fake@localhost:5432/fake",
    SUPABASE_URL="https://fake.supabase.co",
)


# ---------------------------------------------------------------------------
# /health endpoint
# ---------------------------------------------------------------------------


class TestRootEndpoint:
    """GET / must be reachable without credentials and return {"status": "ok"}."""

    def test_root_returns_200(self, client: TestClient):
        response = client.get("/")
        assert response.status_code == 200

    def test_root_no_auth_required(self, client: TestClient):
        response = client.get("/")
        assert response.status_code == 200

    def test_root_body_has_status_ok(self, client: TestClient):
        data = client.get("/").json()
        assert data["status"] == "ok"


class TestHealthEndpoint:
    """GET /health must be reachable without credentials and return minimal JSON."""

    def test_health_returns_200(self, client: TestClient):
        response = client.get("/health")
        assert response.status_code == 200

    def test_health_no_auth_required(self, client: TestClient):
        """Endpoint must be accessible without any Authorization header."""
        response = client.get("/health")
        # If auth were required, we would get 401/403 — 200 proves it is open.
        assert response.status_code == 200

    def test_health_body_has_status_ok(self, client: TestClient):
        data = client.get("/health").json()
        assert data["status"] == "ok"

    def test_health_body_has_env(self, client: TestClient):
        data = client.get("/health").json()
        assert "env" in data

    def test_health_body_has_service(self, client: TestClient):
        data = client.get("/health").json()
        assert data["service"] == "mbs-football-api"


# ---------------------------------------------------------------------------
# validate_production_env()
# ---------------------------------------------------------------------------


class TestStartupValidation:
    """Settings.validate_production_env() must fail fast on bad config."""

    def test_local_env_always_passes(self):
        """ENV=local skips all production checks."""
        cfg = Settings(ENV="local", **_REQUIRED)
        cfg.validate_production_env()  # must not raise

    def test_production_with_valid_config_passes(self):
        cfg = Settings(
            ENV="production",
            OPENAI_API_KEY="sk-test-key",
            CORS_ALLOW_ORIGINS="https://app.example.com",
            **_REQUIRED,
        )
        cfg.validate_production_env()  # must not raise

    def test_production_missing_openai_key_raises(self):
        """Non-local ENV with AI_ENABLED=True and no key (and no stub) must raise."""
        cfg = Settings(
            ENV="production",
            AI_ENABLED=True,
            OPENAI_API_KEY="",
            AI_STUB=False,
            CORS_ALLOW_ORIGINS="https://app.example.com",
            **_REQUIRED,
        )
        with pytest.raises(ValueError, match="OPENAI_API_KEY"):
            cfg.validate_production_env()

    def test_production_missing_cors_raises(self):
        """Non-local ENV without CORS_ALLOW_ORIGINS must raise."""
        cfg = Settings(
            ENV="production",
            OPENAI_API_KEY="sk-test-key",
            CORS_ALLOW_ORIGINS="",
            **_REQUIRED,
        )
        with pytest.raises(ValueError, match="CORS_ALLOW_ORIGINS"):
            cfg.validate_production_env()

    def test_production_ai_stub_bypasses_openai_key_check(self):
        """AI_STUB=True suppresses the OPENAI_API_KEY requirement."""
        cfg = Settings(
            ENV="production",
            OPENAI_API_KEY="",
            AI_STUB=True,
            CORS_ALLOW_ORIGINS="https://app.example.com",
            **_REQUIRED,
        )
        cfg.validate_production_env()  # must not raise

    def test_production_ai_disabled_bypasses_openai_key_check(self):
        """AI_ENABLED=False means AI endpoints are off — OPENAI_API_KEY not required."""
        cfg = Settings(
            ENV="production",
            AI_ENABLED=False,
            OPENAI_API_KEY="",
            AI_STUB=False,
            CORS_ALLOW_ORIGINS="https://app.example.com",
            **_REQUIRED,
        )
        cfg.validate_production_env()  # must not raise

    def test_multiple_errors_reported_together(self):
        """When both OPENAI_API_KEY and CORS_ALLOW_ORIGINS are missing,
        the error message mentions both."""
        cfg = Settings(
            ENV="production",
            OPENAI_API_KEY="",
            AI_STUB=False,
            CORS_ALLOW_ORIGINS="",
            **_REQUIRED,
        )
        with pytest.raises(ValueError) as exc_info:
            cfg.validate_production_env()
        msg = str(exc_info.value)
        assert "OPENAI_API_KEY" in msg
        assert "CORS_ALLOW_ORIGINS" in msg

    def test_create_app_raises_on_invalid_prod_config(self):
        """create_app() must propagate the validation error at boot time."""
        cfg = Settings(
            ENV="production",
            OPENAI_API_KEY="",
            AI_STUB=False,
            CORS_ALLOW_ORIGINS="",
            **_REQUIRED,
        )
        with pytest.raises(ValueError):
            create_app(settings=cfg)
