"""
Tests for RequestLoggingMiddleware.

Verifies:
- Every response carries an X-Request-ID header (UUID format)
- Distinct requests get distinct request IDs
- Middleware does not crash on unauthenticated requests
- Middleware does not crash on 404 paths
- Authenticated requests populate user context in the log record
- Secrets (Authorization header value) do not appear in log output
"""
import json
import logging
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Role, Team, UserProfile

HEADERS = {"Authorization": "Bearer test-token"}


# ---------------------------------------------------------------------------
# X-Request-ID header presence + format
# ---------------------------------------------------------------------------


class TestRequestId:
    """Every response must carry a valid UUID in X-Request-ID."""

    def test_health_has_request_id_header(self, client: TestClient):
        response = client.get("/health")
        assert "x-request-id" in response.headers

    def test_request_id_is_valid_uuid(self, client: TestClient):
        response = client.get("/health")
        rid = response.headers["x-request-id"]
        uuid.UUID(rid)  # raises ValueError if not a valid UUID

    def test_authenticated_request_has_request_id(
        self, client: TestClient, mock_jwt, coach_a: UserProfile
    ):
        mock_jwt(str(coach_a.supabase_user_id))
        response = client.get("/v1/exercises", headers=HEADERS)
        assert "x-request-id" in response.headers
        uuid.UUID(response.headers["x-request-id"])

    def test_distinct_requests_get_distinct_ids(self, client: TestClient):
        rid1 = client.get("/health").headers["x-request-id"]
        rid2 = client.get("/health").headers["x-request-id"]
        assert rid1 != rid2

    def test_404_path_still_has_request_id(self, client: TestClient):
        """Even unknown paths get a request ID — middleware runs for all routes."""
        response = client.get("/no-such-path")
        assert "x-request-id" in response.headers

    def test_unauthenticated_protected_route_has_request_id(
        self, client: TestClient
    ):
        """401 responses from auth guard still get an X-Request-ID."""
        response = client.get("/v1/exercises")
        assert response.status_code == 401
        assert "x-request-id" in response.headers


# ---------------------------------------------------------------------------
# Log record contents
# ---------------------------------------------------------------------------


class TestLogContents:
    """The structured log record must contain required fields and no secrets."""

    def _capture_log(self, client: TestClient, caplog, method: str, path: str, **kwargs):
        """Helper: make a request and return the parsed log record."""
        with caplog.at_level(logging.INFO, logger="app.requests"):
            getattr(client, method)(path, **kwargs)

        log_records = [r for r in caplog.records if r.name == "app.requests"]
        assert log_records, "No log record emitted by RequestLoggingMiddleware"
        return json.loads(log_records[-1].getMessage())

    def test_log_has_required_fields(self, client: TestClient, caplog):
        record = self._capture_log(client, caplog, "get", "/health")
        for field in ("request_id", "method", "path", "status_code", "latency_ms"):
            assert field in record, f"Missing field: {field}"

    def test_log_method_and_path_are_correct(self, client: TestClient, caplog):
        record = self._capture_log(client, caplog, "get", "/health")
        assert record["method"] == "GET"
        assert record["path"] == "/health"

    def test_log_status_code_matches_response(self, client: TestClient, caplog):
        record = self._capture_log(client, caplog, "get", "/health")
        assert record["status_code"] == 200

    def test_log_unauthenticated_has_null_user_fields(
        self, client: TestClient, caplog
    ):
        """Requests that fail auth must log None for user fields."""
        record = self._capture_log(client, caplog, "get", "/v1/exercises")
        assert record["user_id"] is None
        assert record["team_id"] is None
        assert record["role"] is None

    def test_log_authenticated_has_user_fields(
        self,
        client: TestClient,
        caplog,
        mock_jwt,
        coach_a: UserProfile,
    ):
        """Successful auth must populate user_id, team_id, role in the log."""
        mock_jwt(str(coach_a.supabase_user_id))
        record = self._capture_log(
            client, caplog, "get", "/v1/exercises", headers=HEADERS
        )
        assert record["user_id"] == str(coach_a.id)
        assert record["team_id"] == str(coach_a.team_id)
        assert record["role"] == Role.COACH.value

    def test_log_latency_is_non_negative(self, client: TestClient, caplog):
        record = self._capture_log(client, caplog, "get", "/health")
        assert record["latency_ms"] >= 0

    def test_authorization_header_value_not_in_log(
        self, client: TestClient, caplog
    ):
        """The raw Bearer token must never appear in the log record."""
        secret_token = "super-secret-bearer-value"
        with caplog.at_level(logging.INFO, logger="app.requests"):
            client.get(
                "/v1/exercises",
                headers={"Authorization": f"Bearer {secret_token}"},
            )
        all_log_text = " ".join(r.getMessage() for r in caplog.records)
        assert secret_token not in all_log_text
