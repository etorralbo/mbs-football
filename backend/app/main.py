from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.v1.router import api_router
from app.core.config import Settings, get_settings
from app.db.session import get_db
from app.middleware.logging import RequestLoggingMiddleware

_LOCAL_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:3001",
]


def _configure_cors(app: FastAPI, settings: Settings) -> None:
    """Attach CORSMiddleware with environment-appropriate origins.

    - ENV == "local"  → allow the two standard localhost dev origins
    - otherwise       → read comma-separated origins from CORS_ALLOW_ORIGINS
                        (empty list = CORS middleware is not added at all)
    """
    if settings.ENV == "local":
        origins = _LOCAL_ORIGINS
    else:
        origins = settings.CORS_ALLOW_ORIGINS

    if not origins:
        return

    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
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
