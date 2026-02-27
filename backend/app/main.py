import json as _json
import logging

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.v1.router import api_router
from app.core.config import Settings, get_settings
from app.db.session import get_db
from app.middleware.logging import RequestLoggingMiddleware

_startup_logger = logging.getLogger("app.startup")


def _parse_origins(raw: str) -> list[str]:
    """Parse CORS origins from a CSV or JSON array string.

    Accepts:
      - CSV:        "https://a.com,https://b.com"
      - JSON array: '["https://a.com","https://b.com"]'
      - Empty:      "" → []
    """
    raw = raw.strip()
    if not raw:
        return []
    if raw.startswith("["):
        try:
            parsed = _json.loads(raw)
            if isinstance(parsed, list):
                return [str(o).strip() for o in parsed if str(o).strip()]
        except _json.JSONDecodeError:
            pass
    return [o.strip() for o in raw.split(",") if o.strip()]


_LOCAL_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:3001",
]


def _configure_cors(app: FastAPI, settings: Settings) -> None:
    """Attach CORSMiddleware with environment-appropriate origins.

    - ENV == "local"  → allow the two standard localhost dev origins
    - otherwise       → exact origins from CORS_ALLOW_ORIGINS and/or a regex
                        pattern from CORS_ALLOW_ORIGIN_REGEX (for dynamic
                        origins such as Vercel preview URLs)
    """
    if settings.ENV == "local":
        origins = _LOCAL_ORIGINS
        origin_regex = None
    else:
        origins = _parse_origins(settings.CORS_ALLOW_ORIGINS)
        origin_regex = settings.CORS_ALLOW_ORIGIN_REGEX or None

    if not origins and not origin_regex:
        return

    _startup_logger.info(
        "CORS configured — "
        "ENV=%r  "
        "CORS_ALLOW_ORIGINS(raw)=%r  "
        "origins(parsed)=%r  "
        "origin_regex=%r",
        settings.ENV,
        settings.CORS_ALLOW_ORIGINS,
        origins,
        origin_regex,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_origin_regex=origin_regex,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )


def create_app(settings: Settings | None = None) -> FastAPI:
    """Application factory.

    Accepts an optional Settings instance so tests can inject custom
    configuration (e.g. ENV="local") without touching global state.
    """
    cfg = settings or get_settings()

    # Fail fast if critical env vars are missing in non-local environments.
    cfg.validate_production_env()

    app = FastAPI(title="Football MVP API")

    _configure_cors(app, cfg)

    # Logging middleware runs outermost so every request — including those
    # that fail CORS or auth — gets a log line and an X-Request-ID header.
    app.add_middleware(RequestLoggingMiddleware)

    app.include_router(api_router)

    @app.get("/", tags=["ops"])
    def root() -> dict:
        """Root liveness probe — no auth required."""
        return {"status": "ok"}

    @app.get("/health", tags=["ops"])
    def health() -> dict:
        """Liveness probe — no auth required."""
        return {"status": "ok", "service": "mbs-football-api", "env": cfg.ENV}

    @app.get("/db/ping")
    def db_ping(db: Session = Depends(get_db)):
        """
        Database connectivity check.

        Executes SELECT 1 to verify the database connection is working.
        """
        result = db.execute(text("SELECT 1")).scalar()
        return {"status": "ok", "db_ping": result}

    return app


app = create_app()
