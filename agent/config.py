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
    """LiveKit agent runtime model settings verified against LiveKit Inference.

    Model IDs & Pricing verified on 2026-11-13 against:
      - https://docs.livekit.io/agents/models/
      - https://livekit.com/pricing/inference
    """

    # STT: Deepgram Nova-3 (Monolingual)
    # Rate on Scale: $0.0048/minute usage (as of 2026-10-28 / 2026-11-13).
    # Covered by: LiveKit partner startup credit.
    stt_model: str = Field(default_factory=lambda: os.getenv("STT_MODEL", "deepgram/nova-3"))

    # LLM: Google Gemini 2.0 Flash (Cheapest suitable model on LiveKit Inference)
    # Rate on Scale: $0.10/1M input tokens, $0.40/1M output tokens (~$0.00023/min conversational).
    # Alternative LiveKit-hosted model: "google/gemma-4-31b-it" ($0.40/1M input, $0.80/1M output).
    # Covered by: LiveKit partner startup credit.
    llm_model: str = Field(
        default_factory=lambda: os.getenv("LLM_MODEL", "google/gemini-2.0-flash")
    )

    # TTS: Inworld Realtime TTS (or Rime Arcana)
    # Rate on Scale: Inworld is $20.00/1M characters (~$0.018/min at 900 chars/min).
    # (Rime Arcana is $30.00/1M characters on Scale tier).
    # Default Voice ID: "Alex" (documented default in LiveKit Inference catalog).
    # Covered by: LiveKit partner startup credit.
    tts_model: str = Field(default_factory=lambda: os.getenv("TTS_MODEL", "inworld/inworld-tts-1"))
    tts_voice_id: str = Field(default_factory=lambda: os.getenv("TTS_VOICE_ID", "Alex"))


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
