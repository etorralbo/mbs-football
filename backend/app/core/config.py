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


@lru_cache
def get_settings() -> Settings:
    """
    Cached settings instance.

    Using lru_cache ensures we only create one Settings instance
    throughout the application lifecycle.
    """
    return Settings()
