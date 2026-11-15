from pathlib import Path

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
    API_TITLE: str = "VedaVoice API"
    API_VERSION: str = "0.1.0"
    API_BASE_URL: str = "http://localhost:8000"
    APP_BASE_URL: str = "http://localhost:3000"
    CORS_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ]

    # Database: Default to local SQLite file for standalone local dev when PostgreSQL is unavailable
    DATABASE_URL: str = Field(
        default=f"sqlite:///{Path(__file__).resolve().parents[3]}/data/vagency.db",
        description="Database connection URL (PostgreSQL or SQLite)",
    )

    # Security
    JWT_SECRET: str = "fake-local-dev-jwt-secret-not-for-prod-use-minimum-32-chars"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours
    INTERNAL_SIGNING_KEY: str = "fake-local-dev-signing-key-not-for-prod-32bytes-min"
    ENCRYPTION_KEY_ID: str = "fake-local-dev-encryption-key"

    # Default platform admin credentials for local seed
    PLATFORM_ADMIN_EMAIL: str = "admin@vedavoice.io"
    PLATFORM_ADMIN_PASSWORD: str = "Admin@VedaVoice2026!"
    PLATFORM_ADMIN_NAME: str = "VedaVoice Platform Admin"

    # Limits
    GLOBAL_MAX_CONCURRENT: int = 40
    GLOBAL_MAX_OUTBOUND: int = 10

    # LiveKit SIP Trunking & Carrier Telephony
    LIVEKIT_SIP_INBOUND_TRUNK_ID: str = "ST_inbound_livekit_scale"
    LIVEKIT_SIP_OUTBOUND_TRUNK_ID: str = "ST_outbound_twilio_elastic"
    LIVEKIT_SIP_DISPATCH_RULE_NAME: str = "all-tenants-inbound"
    CARRIER_PRIMARY_PROVIDER: str = "Twilio Elastic SIP Trunk"
    CARRIER_HOT_STANDBY_PROVIDER: str = "Telnyx SIP (Hot Standby)"

    # Notifications (Email & SMS)
    NOTIFICATION_ENABLED: bool = True
    RESEND_API_KEY: str = ""
    RESEND_FROM_EMAIL: str = "alerts@updates.vedasynk.com"
    SENDGRID_API_KEY: str = ""
    TWILIO_ACCOUNT_SID: str = ""
    TWILIO_AUTH_TOKEN: str = ""
    TWILIO_FROM_NUMBER: str = ""


settings = Settings()
