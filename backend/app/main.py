from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.v1.router import api_router
from app.core.config import Settings, get_settings
from app.db.session import get_db

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
    app = FastAPI(title="Football MVP API")

    _configure_cors(app, cfg)
    app.include_router(api_router)

    @app.get("/health")
    def health():
        return {"status": "ok"}

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
