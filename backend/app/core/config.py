from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings using pydantic-settings."""

    ENV: str = "local"
    DATABASE_URL: str

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True
    )


@lru_cache
def get_settings() -> Settings:
    """
    Cached settings instance.

    Using lru_cache ensures we only create one Settings instance
    throughout the application lifecycle.
    """
    return Settings()
