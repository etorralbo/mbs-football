from functools import lru_cache
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings using pydantic-settings."""

    ENV: str = "local"
    DATABASE_URL: str

    # CORS — comma-separated list of allowed origins for non-local environments
    CORS_ALLOW_ORIGINS: list[str] = []

    # Supabase JWT settings
    SUPABASE_URL: str

    # AI settings
    OPENAI_API_KEY: str = ""   # empty string keeps startup safe without key
    AI_MODEL: str = "gpt-4o-mini"
    # Stub mode: only active when ENV=="local" AND AI_STUB=="true".
    # Guards against accidental activation in non-local environments.
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
        - OPENAI_API_KEY must be set when AI_STUB is False
          (without it every AI request will fail at runtime).
        - CORS_ALLOW_ORIGINS must be non-empty so the frontend can reach
          the API from a browser (prevents silent CORS lockout).

        DATABASE_URL and SUPABASE_URL have no defaults, so pydantic already
        rejects a missing value at instantiation time before this is called.
        SUPABASE_JWKS_URL is auto-derived from SUPABASE_URL, so always present.
        """
        if self.ENV == "local":
            return

        errors: list[str] = []

        if not self.OPENAI_API_KEY and not self.AI_STUB:
            errors.append(
                "OPENAI_API_KEY must be set when ENV != 'local' and AI_STUB is False"
            )

        if not self.CORS_ALLOW_ORIGINS:
            errors.append(
                "CORS_ALLOW_ORIGINS must be set in non-local environments "
                "(comma-separated frontend origins, e.g. https://app.example.com)"
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
