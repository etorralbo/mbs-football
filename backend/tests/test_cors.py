"""CORS preflight integration tests.

Verifies that CORSMiddleware is wired correctly for each ENV mode.
We use create_app() with an explicit Settings object so the tests are
independent of the environment the test runner was started in.
"""
import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_FAKE_REQUIRED = dict(
    DATABASE_URL="postgresql+psycopg://fake:fake@localhost:5432/fake",
    SUPABASE_URL="https://fake.supabase.co",
)

_PREFLIGHT_HEADERS = {
    "Origin": "http://localhost:3001",
    "Access-Control-Request-Method": "POST",
    "Access-Control-Request-Headers": "Authorization, Content-Type",
}


def _local_client() -> TestClient:
    """Return a TestClient whose app is configured for ENV=local."""
    settings = Settings(ENV="local", **_FAKE_REQUIRED)
    return TestClient(create_app(settings=settings), raise_server_exceptions=False)


def _prod_client(cors_origins: str = "") -> TestClient:
    """Return a TestClient whose app is configured for ENV=production."""
    settings = Settings(
        ENV="production",
        CORS_ALLOW_ORIGINS=cors_origins,
        **_FAKE_REQUIRED,
    )
    return TestClient(create_app(settings=settings), raise_server_exceptions=False)


# ---------------------------------------------------------------------------
# Tests: ENV=local
# ---------------------------------------------------------------------------

class TestCorsLocalEnv:
    def test_preflight_returns_successful_status(self):
        """OPTIONS /v1/onboarding should return 200 (or 204) for local origins."""
        response = _local_client().options("/v1/onboarding", headers=_PREFLIGHT_HEADERS)
        assert response.status_code in (200, 204)

    def test_preflight_echoes_localhost_3001_origin(self):
        """Access-Control-Allow-Origin must be echoed back for localhost:3001."""
        response = _local_client().options("/v1/onboarding", headers=_PREFLIGHT_HEADERS)
        assert response.headers.get("access-control-allow-origin") == "http://localhost:3001"

    def test_preflight_echoes_localhost_3000_origin(self):
        """Access-Control-Allow-Origin must also be echoed back for localhost:3000."""
        headers = {**_PREFLIGHT_HEADERS, "Origin": "http://localhost:3000"}
        response = _local_client().options("/v1/onboarding", headers=headers)
        assert response.headers.get("access-control-allow-origin") == "http://localhost:3000"

    def test_preflight_allows_authorization_header(self):
        response = _local_client().options("/v1/onboarding", headers=_PREFLIGHT_HEADERS)
        allowed = response.headers.get("access-control-allow-headers", "").lower()
        assert "authorization" in allowed

    def test_preflight_allows_post_method(self):
        response = _local_client().options("/v1/onboarding", headers=_PREFLIGHT_HEADERS)
        allowed = response.headers.get("access-control-allow-methods", "").upper()
        assert "POST" in allowed

    def test_cors_header_present_on_regular_request(self):
        """A plain GET to /health should also carry the ACAO header when Origin is set."""
        response = _local_client().get(
            "/health",
            headers={"Origin": "http://localhost:3001"},
        )
        assert response.headers.get("access-control-allow-origin") == "http://localhost:3001"


# ---------------------------------------------------------------------------
# Tests: non-local ENV
# ---------------------------------------------------------------------------

class TestCorsNonLocalEnv:
    def test_no_cors_header_when_origins_empty(self):
        """With ENV != local and no CORS_ALLOW_ORIGINS, the header must be absent."""
        response = _prod_client(cors_origins="").options(
            "/v1/onboarding", headers=_PREFLIGHT_HEADERS
        )
        assert "access-control-allow-origin" not in response.headers

    def test_cors_header_present_when_origin_configured(self):
        """CORS_ALLOW_ORIGINS (comma-separated) should be honoured in production."""
        client = _prod_client(cors_origins="https://example.com,https://app.example.com")
        response = client.options(
            "/v1/onboarding",
            headers={**_PREFLIGHT_HEADERS, "Origin": "https://example.com"},
        )
        assert response.headers.get("access-control-allow-origin") == "https://example.com"

    def test_wildcard_origin_not_used(self):
        """access-control-allow-origin must never be '*' — that would bypass credentials."""
        client = _prod_client(cors_origins="https://example.com")
        response = client.options(
            "/v1/onboarding",
            headers={**_PREFLIGHT_HEADERS, "Origin": "https://example.com"},
        )
        assert response.headers.get("access-control-allow-origin") != "*"
