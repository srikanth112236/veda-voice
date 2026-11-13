from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=(".env.local", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # API
    API_TITLE: str = "AI Voice Agent Platform API"
    API_VERSION: str = "0.1.0"
    API_BASE_URL: str = "http://localhost:8000"
    APP_BASE_URL: str = "http://localhost:3000"

    # Database
    DATABASE_URL: str = Field(
        default="postgresql+psycopg://postgres:fake-local-dev-postgres-password@127.0.0.1:5432/vagency",
        description="PostgreSQL database connection URL",
    )

    # Security
    JWT_SECRET: str = "fake-local-dev-jwt-secret-not-for-prod-use"
    INTERNAL_SIGNING_KEY: str = "fake-local-dev-signing-key-not-for-prod-32bytes-min"
    ENCRYPTION_KEY_ID: str = "fake-local-dev-encryption-key"

    # Limits
    GLOBAL_MAX_CONCURRENT: int = 40
    GLOBAL_MAX_OUTBOUND: int = 10


settings = Settings()
