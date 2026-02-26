"""
Structured request logging middleware.

Logs one JSON line per request containing:
  - request_id   unique UUID per request (also echoed as X-Request-ID header)
  - method, path, status_code, latency_ms
  - user_id, team_id, role  — populated by get_current_user if authenticated
                               None for unauthenticated / failed auth requests

Intentionally NOT logged:
  - Authorization header value
  - Request / response bodies
  - Query-string parameters (may contain sensitive data in edge cases)
"""
import json
import logging
import time
import uuid

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger("app.requests")


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Emit one structured log line after every HTTP request completes."""

    async def dispatch(self, request: Request, call_next) -> Response:
        request_id = str(uuid.uuid4())
        # Make request_id available to downstream code (e.g. error handlers)
        request.state.request_id = request_id

        start = time.perf_counter()
        response = await call_next(request)
        latency_ms = round((time.perf_counter() - start) * 1000, 1)

        # Auth context is set by get_current_user dependency (if it ran)
        user_id = getattr(request.state, "user_id", None)
        team_id = getattr(request.state, "team_id", None)
        role = getattr(request.state, "role", None)

        logger.info(
            json.dumps(
                {
                    "request_id": request_id,
                    "method": request.method,
                    "path": request.url.path,
                    "status_code": response.status_code,
                    "latency_ms": latency_ms,
                    "user_id": str(user_id) if user_id is not None else None,
                    "team_id": str(team_id) if team_id is not None else None,
                    "role": role.value if role is not None else None,
                }
            )
        )

        # Surface request_id to callers so they can correlate logs
        response.headers["X-Request-ID"] = request_id
        return response
