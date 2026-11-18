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
    API_BASE_URL: str = "http://localhost:8001"
    APP_BASE_URL: str = "http://localhost:3000"
    CORS_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "http://localhost:8001",
        "http://127.0.0.1:8001",
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
    LIVEKIT_URL: str = "wss://steyzi-xvk89l73.livekit.cloud"
    LIVEKIT_API_KEY: str = ""
    LIVEKIT_API_SECRET: str = ""
    LIVEKIT_SIP_INBOUND_TRUNK_ID: str = "ST_inbound_livekit_scale"
    LIVEKIT_SIP_OUTBOUND_TRUNK_ID: str = "ST_outbound_twilio_elastic"
    LIVEKIT_SIP_DISPATCH_RULE_NAME: str = "all-tenants-inbound"
    CARRIER_PRIMARY_PROVIDER: str = "Twilio Elastic SIP Trunk"
    CARRIER_HOT_STANDBY_PROVIDER: str = "Telnyx SIP (Hot Standby)"

    # Google Calendar OAuth & Integrations
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI: str = "http://localhost:8000/api/v1/portal/calendar/callback"
    ENCRYPTION_SECRET: str = "envelope-secret-key-vedavoice-32bytes-min!"

    # HubSpot OAuth 2.0 App
    HUBSPOT_CLIENT_ID: str = ""
    HUBSPOT_CLIENT_SECRET: str = ""
    HUBSPOT_REDIRECT_URI: str = "http://localhost:8000/api/v1/integrations/hubspot/callback"

    # GoHighLevel OAuth 2.0 App
    GHL_CLIENT_ID: str = ""
    GHL_CLIENT_SECRET: str = ""
    GHL_REDIRECT_URI: str = "http://localhost:8000/api/v1/integrations/gohighlevel/callback"

    # Pipedrive OAuth 2.0 App
    PIPEDRIVE_CLIENT_ID: str = ""
    PIPEDRIVE_CLIENT_SECRET: str = ""
    PIPEDRIVE_REDIRECT_URI: str = "http://localhost:8000/api/v1/integrations/pipedrive/callback"

    # Meta (Facebook & Instagram) Lead Ads
    META_VERIFY_TOKEN: str = "vedavoice_meta_verify_token"
    META_APP_SECRET: str = ""

    # Notifications (Email & SMS)
    NOTIFICATION_ENABLED: bool = True
    RESEND_API_KEY: str = ""
    RESEND_FROM_EMAIL: str = "alerts@updates.vedasynk.com"
    SENDGRID_API_KEY: str = ""
    TWILIO_ACCOUNT_SID: str = ""
    TWILIO_AUTH_TOKEN: str = ""
    TWILIO_FROM_NUMBER: str = ""

    # Telnyx Carrier Telephony & Messaging (Cost-Optimization & 1-Click DID Orders)
    TELNYX_API_KEY: str = ""
    TELNYX_SIP_CONNECTION_ID: str = ""
    TELNYX_MESSAGING_PROFILE_ID: str = ""
    TELNYX_PUBLIC_KEY: str = ""
    TELNYX_AUTO_ASSIGN_SIP: bool = True
    TELNYX_DEFAULT_COUNTRY_CODE: str = "US"


settings = Settings()
