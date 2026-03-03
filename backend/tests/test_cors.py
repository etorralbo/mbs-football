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
    FRONTEND_URL="https://app.example.com",
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


def _prod_client(cors_origins: str = "", cors_regex: str = "") -> TestClient:
    """Return a TestClient whose app is configured for ENV=production.

    At least one of cors_origins or cors_regex must be non-empty; production
    startup validation rejects both being empty.
    OPENAI_API_KEY is supplied explicitly so this helper is hermetic and does
    not depend on the local .env file.
    """
    settings = Settings(
        ENV="production",
        OPENAI_API_KEY="sk-test-fake",
        CORS_ALLOW_ORIGINS=cors_origins,
        CORS_ALLOW_ORIGIN_REGEX=cors_regex,
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
    def test_startup_refuses_when_cors_origins_empty(self):
        """Startup must raise when ENV != local and CORS_ALLOW_ORIGINS is empty.

        Previously this was a silent no-op (no header returned).  With startup
        validation enabled, an empty allowlist is treated as a configuration
        error so the deployment fails loudly rather than allowing silent CORS
        lockout in production.
        """
        settings = Settings(
            ENV="production",
            OPENAI_API_KEY="sk-test-fake",
            CORS_ALLOW_ORIGINS="",
            **_FAKE_REQUIRED,
        )
        with pytest.raises(ValueError, match="CORS_ALLOW_ORIGINS"):
            create_app(settings=settings)

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


# ---------------------------------------------------------------------------
# Tests: OPTIONS preflight for /v1/me (authenticated endpoint)
# ---------------------------------------------------------------------------


class TestCorsPreflightMe:
    """/v1/me preflight must pass without auth and echo headers correctly.

    GET /v1/me requires Authorization: Bearer <jwt> on real requests,
    so browsers always send an OPTIONS preflight first.  The preflight
    itself must:
      - receive 200/204 (not 401/403)
      - echo Access-Control-Allow-Origin
      - declare authorization in Access-Control-Allow-Headers
      - declare GET in Access-Control-Allow-Methods
    """

    _PREFLIGHT_ME = {
        "Origin": "http://localhost:3001",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "authorization, content-type",
    }

    def test_preflight_me_returns_success(self):
        """OPTIONS /v1/me must not require a token and return 200/204."""
        response = _local_client().options("/v1/me", headers=self._PREFLIGHT_ME)
        assert response.status_code in (200, 204)

    def test_preflight_me_echoes_origin(self):
        """access-control-allow-origin must reflect the requesting origin."""
        response = _local_client().options("/v1/me", headers=self._PREFLIGHT_ME)
        assert response.headers.get("access-control-allow-origin") == "http://localhost:3001"

    def test_preflight_me_allows_authorization_header(self):
        """access-control-allow-headers must include authorization."""
        response = _local_client().options("/v1/me", headers=self._PREFLIGHT_ME)
        allowed = response.headers.get("access-control-allow-headers", "").lower()
        assert "authorization" in allowed

    def test_preflight_me_allows_get_method(self):
        """access-control-allow-methods must include GET."""
        response = _local_client().options("/v1/me", headers=self._PREFLIGHT_ME)
        allowed = response.headers.get("access-control-allow-methods", "").upper()
        assert "GET" in allowed

    def test_preflight_me_prod_origin_allowed(self):
        """OPTIONS /v1/me must also pass for a production Vercel origin."""
        client = _prod_client(cors_regex=r"https://.*\.vercel\.app")
        headers = {
            "Origin": "https://mbs-football-preview.vercel.app",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "authorization, content-type",
        }
        response = client.options("/v1/me", headers=headers)
        assert response.status_code in (200, 204)
        assert (
            response.headers.get("access-control-allow-origin")
            == "https://mbs-football-preview.vercel.app"
        )
        allowed_headers = response.headers.get("access-control-allow-headers", "").lower()
        assert "authorization" in allowed_headers


# ---------------------------------------------------------------------------
# Tests: CORS_ALLOW_ORIGIN_REGEX (Vercel preview support)
# ---------------------------------------------------------------------------


class TestCorsRegex:
    """CORS_ALLOW_ORIGIN_REGEX must match dynamic preview origins."""

    _VERCEL_PREVIEW = "https://mbs-football-abc123-myorg.vercel.app"
    _VERCEL_REGEX = r"https://.*\.vercel\.app"

    def test_vercel_preview_origin_allowed(self):
        """A Vercel preview URL must be echoed back when the regex matches."""
        client = _prod_client(cors_regex=self._VERCEL_REGEX)
        response = client.options(
            "/v1/onboarding",
            headers={**_PREFLIGHT_HEADERS, "Origin": self._VERCEL_PREVIEW},
        )
        assert response.headers.get("access-control-allow-origin") == self._VERCEL_PREVIEW

    def test_non_matching_origin_blocked(self):
        """An origin that doesn't match the regex must not receive ACAO header."""
        client = _prod_client(cors_regex=self._VERCEL_REGEX)
        response = client.options(
            "/v1/onboarding",
            headers={**_PREFLIGHT_HEADERS, "Origin": "https://evil.com"},
        )
        assert response.headers.get("access-control-allow-origin") is None

    def test_startup_accepts_regex_without_origins_list(self):
        """Startup must succeed with only CORS_ALLOW_ORIGIN_REGEX set (no exact list)."""
        settings = Settings(
            ENV="production",
            OPENAI_API_KEY="sk-test-fake",
            CORS_ALLOW_ORIGINS="",
            CORS_ALLOW_ORIGIN_REGEX=self._VERCEL_REGEX,
            **_FAKE_REQUIRED,
        )
        # Should not raise
        create_app(settings=settings)

    def test_regex_and_exact_origins_coexist(self):
        """Both exact origins list and regex can be active simultaneously."""
        client = _prod_client(
            cors_origins="https://app.example.com",
            cors_regex=self._VERCEL_REGEX,
        )
        # Exact origin works
        r1 = client.options(
            "/v1/onboarding",
            headers={**_PREFLIGHT_HEADERS, "Origin": "https://app.example.com"},
        )
        assert r1.headers.get("access-control-allow-origin") == "https://app.example.com"
        # Regex origin works
        r2 = client.options(
            "/v1/onboarding",
            headers={**_PREFLIGHT_HEADERS, "Origin": self._VERCEL_PREVIEW},
        )
        assert r2.headers.get("access-control-allow-origin") == self._VERCEL_PREVIEW
