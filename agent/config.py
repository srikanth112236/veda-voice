"""Agent configuration, multi-tenant registry, and client data loading."""

import json
import logging
import os
import re
import time
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, Field

logger = logging.getLogger("receptionist.config")

# Phone normalization regex: extracts digits
_DIGITS_ONLY = re.compile(r"\D")

# In-memory tenant configuration cache with 60-second TTL for distributed workers
_TENANT_CACHE: dict[str, tuple[float, "TenantConfig"]] = {}
_CACHE_TTL_SECONDS = 60.0


def invalidate_tenant_cache(key: str | None = None) -> None:
    """Invalidate all or a specific entry in the dynamic tenant cache."""
    global _TENANT_CACHE
    if key is None:
        _TENANT_CACHE.clear()
    else:
        _TENANT_CACHE.pop(key, None)
        norm = normalize_e164(key)
        if norm:
            _TENANT_CACHE.pop(norm, None)


class FAQItem(BaseModel):
    """FAQ question and answer pair with category tagging and caller phrasing triggers."""

    question: str
    answer: str
    category: str = "general"
    alternate_phrasings: list[str] = Field(default_factory=list)


class EmergencyConfig(BaseModel):
    """Emergency keywords and business-approved safety text."""

    keywords: list[str] = Field(default_factory=list)
    approved_safety_script: str = ""
    mode: str = "priority_message"


class TenantConfig(BaseModel):
    """Business configuration loaded per tenant keyed by dialed E.164 number.

    Adheres strictly to SRS 7.3 and M2-lite multi-tenant specifications.
    """

    tenant_id: str
    business: str
    numbers: list[str] = Field(default_factory=list)
    timezone: str = "America/New_York"
    hours: str
    greeting: str
    tone: Literal["direct", "warm", "formal"] = "direct"
    voice_id: str = "Alex"
    recording_disclosure: bool | str = True
    phonetic_glossary: list[dict[str, str]] = Field(default_factory=list)
    pricing_mode: Literal["no_quote", "listed", "range"] = "no_quote"
    price_items: list[Any] = Field(default_factory=list)
    services: list[str] = Field(default_factory=list)
    service_area: str = ""
    service_cities: list[str] = Field(default_factory=list)
    office_address: str = "10400 Metric Blvd, Suite 200, Austin, TX 78758"
    after_hours_policy: str = "take_message_all"
    out_of_area_policy: str = "polite_decline"
    faq: list[FAQItem] = Field(default_factory=list)
    emergency: EmergencyConfig = Field(default_factory=EmergencyConfig)
    tools_enabled: list[str] = Field(
        default_factory=lambda: ["take_message", "end_call", "booking"]
    )
    max_call_duration_seconds: int = 600
    business_notes: str = Field(default="", max_length=500)
    agent_name: str = "receptionist"
    transfer_number: str = ""
    notification_email: str = ""
    notification_phone: str = ""
    call_token: str = ""
    industry_pack_slug: str | None = None
    industry_pack_prompt: str | None = None
    location_id: str | None = None
    location_name: str | None = None
    location_city: str | None = None

    @property
    def emergency_keywords(self) -> list[str]:
        """Backward compatibility helper for emergency keywords."""
        return self.emergency.keywords


# Alias for backward compatibility across existing modules
BusinessConfig = TenantConfig


def _resolve_llm_model() -> str:
    """Resolve LiveKit Inference LLM model name with safe fallback for deprecated or unsupported models."""
    val = os.getenv("LLM_MODEL", "").strip()
    # google/gemma-2-9b-it is not hosted on LiveKit Inference and returns 404 (Error getting model definition).
    # LiveKit Inference actively serves google/gemini-2.5-flash and google/gemini-2.5-flash-lite.
    if not val or val == "google/gemma-2-9b-it":
        return "google/gemini-2.5-flash"
    return val


class AgentSettings(BaseModel):
    """LiveKit agent runtime model settings verified against LiveKit Inference.

    Model IDs & Pricing verified against LiveKit Inference:
      STT: deepgram/nova-3
      LLM: google/gemini-2.5-flash (LiveKit Cloud hosted inference default)
           Override: google/gemini-2.5-flash-lite or openai/gpt-4o-mini supported via LLM_MODEL env var
      TTS: inworld/inworld-tts-1
           Default Voice: "Alex"
    """

    # STT: Deepgram Nova-3
    stt_model: str = Field(default_factory=lambda: os.getenv("STT_MODEL", "deepgram/nova-3"))

    # LLM: Google Gemini 2.5 Flash (LiveKit Cloud Inference default)
    llm_model: str = Field(default_factory=_resolve_llm_model)

    # TTS: Inworld Realtime TTS (cheaper than Rime)
    tts_model: str = Field(default_factory=lambda: os.getenv("TTS_MODEL", "inworld/inworld-tts-1"))
    tts_voice_id: str = Field(default_factory=lambda: os.getenv("TTS_VOICE_ID", "Alex"))

    # VAD Latency Optimization (Sub-400ms end-of-utterance response)
    vad_min_silence_duration: float = Field(
        default_factory=lambda: float(os.getenv("VAD_MIN_SILENCE_DURATION", "0.38"))
    )
    vad_prefix_padding_duration: float = Field(
        default_factory=lambda: float(os.getenv("VAD_PREFIX_PADDING_DURATION", "0.30"))
    )


def normalize_e164(phone: str | None) -> str:
    """Normalize phone number to standard E.164 string format (+1XXXXXXXXXX)."""
    if not phone or not isinstance(phone, str):
        return ""
    clean = phone.strip()
    if not clean:
        return ""
    digits = _DIGITS_ONLY.sub("", clean)
    if not digits:
        return ""

    if clean.startswith("+"):
        return f"+{digits}"
    if len(digits) == 10 and digits[0] in "23456789":
        return f"+1{digits}"
    if len(digits) == 11 and digits.startswith("1"):
        return f"+{digits}"
    return f"+{digits}"


def get_safe_default_tenant(dialed_number: str = "") -> TenantConfig:
    """Return a safe fallback unassigned tenant that takes no data and terminates cleanly."""
    return TenantConfig(
        tenant_id="unassigned",
        business="Unassigned Service Line",
        numbers=[dialed_number] if dialed_number else [],
        timezone="UTC",
        hours="None",
        greeting="You have reached an unassigned number that has not been set up yet. Please check the number and try again. Goodbye.",
        tone="formal",
        pricing_mode="no_quote",
        price_items=[],
        services=[],
        service_area="",
        faq=[],
        emergency=EmergencyConfig(keywords=[], approved_safety_script=""),
        tools_enabled=["end_call"],  # Takes no data
        max_call_duration_seconds=60,
        recording_disclosure=False,
        business_notes="Unassigned line. Disconnect caller immediately.",
        agent_name="receptionist",
    )


def load_tenants_registry(
    config_source: Path | str | None = None,
) -> dict[str, TenantConfig]:
    """Load tenants from data/tenants/ or clients.json and build an E.164 indexed registry.

    Enforces that no two tenants share the same dialed E.164 number.
    """
    registry: dict[str, TenantConfig] = {}
    sources_to_check: list[Path] = []

    if config_source is not None:
        p = Path(config_source)
        if p.is_dir():
            sources_to_check.extend(sorted(p.glob("*.json")))
        elif p.is_file():
            sources_to_check.append(p)
    else:
        # 1. Check agent/clients.json (base tenant configurations)
        agent_clients = Path(__file__).parent / "clients.json"
        if agent_clients.exists():
            sources_to_check.append(agent_clients)
        else:
            agent_example = Path(__file__).parent / "clients.example.json"
            if agent_example.exists():
                sources_to_check.append(agent_example)

        # 2. Check dynamic tenant directory data/tenants/ (database-synced tenants)
        data_tenants_dir = Path("data/tenants")
        if data_tenants_dir.exists() and data_tenants_dir.is_dir():
            sources_to_check.extend(sorted(data_tenants_dir.glob("*.json")))

    raw_items: list[tuple[str, dict]] = []
    for filepath in sources_to_check:
        try:
            with open(filepath, encoding="utf-8") as f:
                content = json.load(f)
            if isinstance(content, dict):
                # Could be a map of { "+1800...": { ... } } or single tenant { "tenant_id": ... }
                if "tenant_id" in content and "business" in content:
                    raw_items.append((content.get("tenant_id", "tenant"), content))
                else:
                    for k, v in content.items():
                        if isinstance(v, dict):
                            raw_items.append((k, v))
        except Exception as err:
            logger.warning("Failed to load tenant config from %s: %s", filepath, err)

    # Process all raw items into registry
    for entry_key, item in raw_items:
        try:
            tenant = TenantConfig.model_validate(item)
        except Exception as err:
            logger.warning("Skipping invalid tenant config for key %s: %s", entry_key, err)
            continue

        # Gather all phone numbers for this tenant
        all_numbers: list[str] = list(tenant.numbers)
        norm_entry_key = normalize_e164(entry_key)
        if norm_entry_key and norm_entry_key not in all_numbers:
            all_numbers.append(norm_entry_key)

        for num in all_numbers:
            norm_num = normalize_e164(num)
            if not norm_num:
                continue

            # Reject duplicate dialed number across distinct tenants if explicit config file is passed; warn on cache
            if norm_num in registry and registry[norm_num].tenant_id != tenant.tenant_id:
                if registry[norm_num].business.strip().lower() == tenant.business.strip().lower():
                    # Same business name (e.g. database sync vs static config) - keep the current one without error
                    continue
                if config_source is not None:
                    raise ValueError(
                        f"Duplicate dialed number '{norm_num}' assigned to multiple tenants: "
                        f"'{registry[norm_num].tenant_id}' and '{tenant.tenant_id}'."
                    )
                logger.warning(
                    "Duplicate dialed number '%s' assigned to multiple tenants: "
                    "'%s' and '%s'. Overwriting with latest config.",
                    norm_num,
                    registry[norm_num].tenant_id,
                    tenant.tenant_id,
                )
            registry[norm_num] = tenant

        # Also index by tenant_id for direct lookups
        if tenant.tenant_id:
            registry[tenant.tenant_id] = tenant

    return registry


def fetch_tenant_from_api(
    dialed_number: str,
    api_base_url: str | None = None,
) -> TenantConfig | None:
    """Fetch tenant configuration dynamically from FastAPI internal endpoint via HTTP."""
    if api_base_url:
        from agent.config_client import InternalApiClient

        return InternalApiClient(base_url=api_base_url).fetch_tenant_by_number(dialed_number)
    from agent.config_client import default_api_client

    return default_api_client.fetch_tenant_by_number(dialed_number)


def fetch_tenant_from_api_by_id(
    tenant_id: str,
    api_base_url: str | None = None,
) -> TenantConfig | None:
    """Fetch tenant configuration dynamically by tenant_id via HTTP or in-process fallback."""
    if api_base_url:
        from agent.config_client import InternalApiClient

        return InternalApiClient(base_url=api_base_url).fetch_tenant_by_id(tenant_id)
    from agent.config_client import default_api_client

    return default_api_client.fetch_tenant_by_id(tenant_id)


def resolve_tenant(
    dialed_number: str,
    registry: dict[str, TenantConfig] | None = None,
) -> TenantConfig:
    """Resolve a tenant by dialed E.164 phone number with API-First distributed resolution.

    Priority:
      1. Provided mock registry (if non-empty and matching).
      2. In-memory TTL cache (60s).
      3. Live internal API (/api/v1/internal/tenants/by-number/{e164}).
      4. Fallback to local static JSON registry (if API unavailable).
      5. Safe default tenant if unknown/unassigned.
    """
    norm_dialed = normalize_e164(dialed_number)

    # 1. If explicit registry was passed (e.g. unit tests) and matches, honor it
    if registry is not None and norm_dialed and norm_dialed in registry:
        return registry[norm_dialed]

    # 2. In-memory cache check
    now = time.time()
    if norm_dialed and norm_dialed in _TENANT_CACHE:
        expiry, cached_tenant = _TENANT_CACHE[norm_dialed]
        if now < expiry:
            return cached_tenant

    # 3. Dynamic API-First Lookup: Query backend API for real-time config
    if norm_dialed:
        api_tenant = fetch_tenant_from_api(norm_dialed)
        if api_tenant:
            _TENANT_CACHE[norm_dialed] = (now + _CACHE_TTL_SECONDS, api_tenant)
            _TENANT_CACHE[api_tenant.tenant_id] = (now + _CACHE_TTL_SECONDS, api_tenant)
            if registry is not None:
                registry[norm_dialed] = api_tenant
                registry[api_tenant.tenant_id] = api_tenant
            logger.info(
                "API-First dynamic resolution: resolved tenant '%s' for number '%s'",
                api_tenant.business,
                norm_dialed,
            )
            return api_tenant

    # 4. Fallback to static JSON files if API is unreachable
    if registry is None:
        registry = load_tenants_registry()

    if norm_dialed and norm_dialed in registry:
        logger.warning("API lookup failed for '%s'; fell back to static disk registry", norm_dialed)
        return registry[norm_dialed]

    # 5. Log unknown number and return safe default
    logger.warning(
        "Call received on unknown or unassigned dialed number: '%s' (normalized: '%s'); using safe default tenant",
        dialed_number,
        norm_dialed,
    )
    return get_safe_default_tenant(dialed_number=dialed_number)


def load_business_config(
    client_key: str = "default",
    config_path: Path | str | None = None,
) -> TenantConfig:
    """Load business/tenant config by tenant_id, dialed number, or 'default' fallback."""
    if client_key == "default":
        registry = load_tenants_registry(config_path)
        if "+18005550199" in registry:
            return registry["+18005550199"]
        for t in registry.values():
            if t.tenant_id != "unassigned":
                return t
        return get_safe_default_tenant()

    # Check cache
    now = time.time()
    if client_key in _TENANT_CACHE:
        expiry, cached_tenant = _TENANT_CACHE[client_key]
        if now < expiry:
            return cached_tenant

    # Try API-first resolution by tenant_id
    api_tenant = fetch_tenant_from_api_by_id(client_key)
    if not api_tenant:
        norm_key = normalize_e164(client_key)
        if norm_key:
            api_tenant = fetch_tenant_from_api(norm_key)

    if api_tenant:
        _TENANT_CACHE[client_key] = (now + _CACHE_TTL_SECONDS, api_tenant)
        _TENANT_CACHE[api_tenant.tenant_id] = (now + _CACHE_TTL_SECONDS, api_tenant)
        return api_tenant

    # Fallback to local static registry
    registry = load_tenants_registry(config_path)
    if client_key in registry:
        return registry[client_key]

    norm_key = normalize_e164(client_key)
    if norm_key in registry:
        return registry[norm_key]

    raise KeyError(f"Client key or phone number '{client_key}' not found in tenant registry")


def get_agent_settings() -> AgentSettings:
    """Load model and runtime settings from environment."""
    return AgentSettings()
