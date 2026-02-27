from functools import lru_cache
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings using pydantic-settings."""

    ENV: str = "local"
    DATABASE_URL: str

    # CORS — comma-separated list of allowed origins for non-local environments
    CORS_ALLOW_ORIGINS: list[str] = []

    # Regex matching dynamic origins (e.g. Vercel preview URLs).
    # Example: https://.*\.vercel\.app
    # Used alongside CORS_ALLOW_ORIGINS; at least one must be set in non-local envs.
    CORS_ALLOW_ORIGIN_REGEX: str = ""

    # Frontend base URL used to build invite join links
    FRONTEND_URL: str = "http://localhost:3000"

    # Supabase JWT settings
    SUPABASE_URL: str

    # AI settings
    OPENAI_API_KEY: str = ""   # empty string keeps startup safe without key
    AI_MODEL: str = "gpt-4o-mini"
    # Feature flag: set False to deploy without AI (OPENAI_API_KEY not required).
    AI_ENABLED: bool = True
    # Stub mode: replaces real OpenAI calls with deterministic fixtures.
    # Only active in local/test environments; AI_ENABLED still applies.
    AI_STUB: bool = False
    SUPABASE_JWT_AUD: str = "authenticated"
    SUPABASE_JWT_ISSUER: str = ""  # Will be derived from SUPABASE_URL if not set
    SUPABASE_JWKS_URL: str = ""  # Will be derived from SUPABASE_URL if not set

    @field_validator("CORS_ALLOW_ORIGINS", mode="before")
    @classmethod
    def _parse_cors_origins(cls, v: object) -> list[str]:
        """Accept both a JSON array and a plain comma-separated string."""
        if isinstance(v, str):
            return [o.strip() for o in v.split(",") if o.strip()]
        return v  # type: ignore[return-value]

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True
    )

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        # Derive issuer from SUPABASE_URL if not explicitly set
        if not self.SUPABASE_JWT_ISSUER:
            self.SUPABASE_JWT_ISSUER = f"{self.SUPABASE_URL}/auth/v1"
        # Derive JWKS URL from SUPABASE_URL if not explicitly set
        if not self.SUPABASE_JWKS_URL:
            self.SUPABASE_JWKS_URL = f"{self.SUPABASE_URL}/auth/v1/.well-known/jwks.json"

    def validate_production_env(self) -> None:
        """Fail fast on configuration that would break a production deployment.

        Called during app startup so misconfiguration is caught at boot time,
        not at the first request.  A no-op in local development.

        Rules enforced for ENV != 'local':
        - OPENAI_API_KEY must be set when AI_ENABLED=True and AI_STUB=False
          (without it every AI request will fail at runtime).
          AI_ENABLED=False → key not required (AI endpoints disabled).
          AI_STUB=True → key not required (stub replaces real calls).
        - CORS_ALLOW_ORIGINS must be non-empty so the frontend can reach
          the API from a browser (prevents silent CORS lockout).

        DATABASE_URL and SUPABASE_URL have no defaults, so pydantic already
        rejects a missing value at instantiation time before this is called.
        SUPABASE_JWKS_URL is auto-derived from SUPABASE_URL, so always present.
        """
        if self.ENV in ("local", "test"):
            return

        errors: list[str] = []

        if self.AI_ENABLED and not self.AI_STUB and not self.OPENAI_API_KEY:
            errors.append(
                "OPENAI_API_KEY must be set when AI_ENABLED=True and AI_STUB=False"
            )

        if not self.CORS_ALLOW_ORIGINS and not self.CORS_ALLOW_ORIGIN_REGEX:
            errors.append(
                "Set CORS_ALLOW_ORIGINS (comma-separated exact origins) and/or "
                "CORS_ALLOW_ORIGIN_REGEX (regex for dynamic origins such as Vercel previews)"
            )

        if errors:
            raise ValueError(
                "Application startup failed — missing or invalid configuration:\n"
                + "\n".join(f"  • {e}" for e in errors)
            )


@lru_cache
def get_settings() -> Settings:
    """
    Cached settings instance.

    Using lru_cache ensures we only create one Settings instance
    throughout the application lifecycle.
    """
    return Settings()
