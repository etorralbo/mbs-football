from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings using pydantic-settings."""

    ENV: str = "local"
    DATABASE_URL: str

    # Supabase JWT settings
    SUPABASE_URL: str

    # AI settings
    OPENAI_API_KEY: str = ""   # empty string keeps startup safe without key
    AI_MODEL: str = "gpt-4o-mini"
    SUPABASE_JWT_AUD: str = "authenticated"
    SUPABASE_JWT_ISSUER: str = ""  # Will be derived from SUPABASE_URL if not set
    SUPABASE_JWKS_URL: str = ""  # Will be derived from SUPABASE_URL if not set

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
