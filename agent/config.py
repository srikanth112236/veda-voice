"""Agent configuration and client data loading."""

import json
import os
from pathlib import Path

from pydantic import BaseModel, Field


class FAQItem(BaseModel):
    """FAQ question and answer pair."""

    question: str
    answer: str


class BusinessConfig(BaseModel):
    """Business configuration loaded per tenant/client."""

    business: str
    agent_name: str = "receptionist"
    greeting: str
    timezone: str = "America/New_York"
    hours: str
    services: list[str] = Field(default_factory=list)
    emergency_keywords: list[str] = Field(default_factory=list)
    transfer_number: str
    faq: list[FAQItem] = Field(default_factory=list)


class AgentSettings(BaseModel):
    """LiveKit agent runtime model settings."""

    # LiveKit Inference model strings (SRS 7.4)
    stt_model: str = Field(default_factory=lambda: os.getenv("STT_MODEL", "deepgram/nova-3"))
    llm_model: str = Field(
        default_factory=lambda: os.getenv("LLM_MODEL", "google/gemini-2.5-flash")
    )
    tts_model: str = Field(default_factory=lambda: os.getenv("TTS_MODEL", "rime/arcana"))


def load_business_config(
    client_key: str = "default",
    config_path: Path | str | None = None,
) -> BusinessConfig:
    """Load and validate a business config from clients.json."""
    if config_path is None:
        config_path = Path(__file__).parent / "clients.json"
    else:
        config_path = Path(config_path)

    if not config_path.exists():
        raise FileNotFoundError(f"Configuration file not found: {config_path}")

    with open(config_path, encoding="utf-8") as f:
        data = json.load(f)

    if client_key not in data:
        raise KeyError(f"Client key '{client_key}' not found in {config_path}")

    return BusinessConfig.model_validate(data[client_key])


def get_agent_settings() -> AgentSettings:
    """Load model and runtime settings from environment."""
    return AgentSettings()
