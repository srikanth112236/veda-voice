"""Agent configuration, multi-tenant registry, and client data loading."""

import json
import logging
import os
import re
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, Field

logger = logging.getLogger("receptionist.config")

# Phone normalization regex: extracts digits
_DIGITS_ONLY = re.compile(r"\D")


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
    after_hours_policy: str = "take_message_all"
    out_of_area_policy: str = "polite_decline"
    faq: list[FAQItem] = Field(default_factory=list)
    emergency: EmergencyConfig = Field(default_factory=EmergencyConfig)
    tools_enabled: list[str] = Field(default_factory=lambda: ["take_message", "end_call"])
    max_call_duration_seconds: int = 600
    business_notes: str = Field(default="", max_length=500)
    agent_name: str = "receptionist"
    transfer_number: str = ""

    @property
    def emergency_keywords(self) -> list[str]:
        """Backward compatibility helper for emergency keywords."""
        return self.emergency.keywords


# Alias for backward compatibility across existing modules
BusinessConfig = TenantConfig


class AgentSettings(BaseModel):
    """LiveKit agent runtime model settings verified against LiveKit Inference.

    Model IDs & Pricing verified on 2026-11-13 against:
      - LiveKit Inference Models Catalog: https://docs.livekit.io/agents/models/
      - LiveKit Inference Pricing: https://livekit.com/pricing/inference

    Catalog Lines (Verified 2026-11-13):
      STT: deepgram/nova-3
           Rate on Scale: $0.0048 / min (monolingual English)
      LLM: google/gemma-2-9b-it
           Rate on Scale: $0.06 / 1M input tokens, $0.06 / 1M output tokens (Partner-credit eligible default)
           Override: google/gemini-2.5-flash supported via LLM_MODEL env var
      TTS: inworld/inworld-tts-1
           Rate on Scale: $20.00 / 1M characters (~$0.018/min at 900 chars/min), Default Voice: "Alex"
           Alternative: rime/arcana ($30.00 / 1M characters)
    """

    # STT: Deepgram Nova-3
    stt_model: str = Field(default_factory=lambda: os.getenv("STT_MODEL", "deepgram/nova-3"))

    # LLM: Google Gemma-2-9b-it (partner-credit default); override with Gemini 2.5 Flash via env
    llm_model: str = Field(default_factory=lambda: os.getenv("LLM_MODEL", "google/gemma-2-9b-it"))

    # TTS: Inworld Realtime TTS (cheaper than Rime)
    tts_model: str = Field(default_factory=lambda: os.getenv("TTS_MODEL", "inworld/inworld-tts-1"))
    tts_voice_id: str = Field(default_factory=lambda: os.getenv("TTS_VOICE_ID", "Alex"))


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
        # 1. Check real tenant directory data/tenants/ (gitignored)
        data_tenants_dir = Path("data/tenants")
        if data_tenants_dir.exists() and data_tenants_dir.is_dir():
            sources_to_check.extend(sorted(data_tenants_dir.glob("*.json")))

        # 2. Check agent/clients.json
        agent_clients = Path(__file__).parent / "clients.json"
        if agent_clients.exists():
            sources_to_check.append(agent_clients)
        else:
            # Fallback to example clients
            agent_example = Path(__file__).parent / "clients.example.json"
            if agent_example.exists():
                sources_to_check.append(agent_example)

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

            # Reject two tenants sharing a number at load time
            if norm_num in registry and registry[norm_num].tenant_id != tenant.tenant_id:
                raise ValueError(
                    f"Duplicate dialed number '{norm_num}' assigned to multiple tenants: "
                    f"'{registry[norm_num].tenant_id}' and '{tenant.tenant_id}'"
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
    import urllib.error
    import urllib.parse
    import urllib.request

    base_url = api_base_url or os.getenv("API_BASE_URL", "http://127.0.0.1:8000").rstrip("/")
    encoded_number = urllib.parse.quote(dialed_number)
    endpoint = f"{base_url}/api/v1/internal/tenants/by-number/{encoded_number}"

    try:
        req = urllib.request.Request(
            endpoint,
            headers={"User-Agent": "LiveKit-Agent-Worker/1.0", "Accept": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=3.0) as resp:
            if resp.status == 200:
                data = json.loads(resp.read().decode("utf-8"))
                pricing_mode = data.get("pricing_policy", "no_quote")
                if pricing_mode not in ("no_quote", "listed", "range"):
                    pricing_mode = "no_quote"

                tone = data.get("tone", "direct")
                if tone not in ("direct", "warm", "formal"):
                    tone = "direct"

                emergency_cfg = EmergencyConfig(
                    keywords=data.get("emergency_keywords", []),
                    approved_safety_script=data.get("emergency_advice", ""),
                    mode="priority_message",
                )

                price_items = data.get("pricing_details", {}).get("price_items", [])

                raw_faqs = data.get("faq", [])
                parsed_faqs: list[FAQItem] = []
                for f in raw_faqs:
                    if isinstance(f, dict) and "question" in f and "answer" in f:
                        parsed_faqs.append(
                            FAQItem(
                                question=f["question"],
                                answer=f["answer"],
                                category=f.get("category", "general"),
                                alternate_phrasings=f.get("alternate_phrasings", []),
                            )
                        )

                return TenantConfig(
                    tenant_id=data["tenant_id"],
                    business=data["business_name"],
                    numbers=[dialed_number],
                    timezone=data.get("timezone", "America/New_York"),
                    hours=data.get("hours", "Mon-Fri 8am-6pm"),
                    greeting=data.get("greeting", f"Thanks for calling {data['business_name']}."),
                    tone=tone,
                    voice_id=data.get("voice_id", "Alex"),
                    recording_disclosure=data.get("recording_disclosure", True),
                    pricing_mode=pricing_mode,
                    price_items=price_items,
                    services=data.get("services", []),
                    faq=parsed_faqs,
                    emergency=emergency_cfg,
                    agent_name=data.get("agent_name", "receptionist"),
                    transfer_number=data.get("transfer_number", ""),
                )
    except Exception as e:
        logger.debug("Dynamic API tenant lookup for %s failed: %s", dialed_number, e)
        return None

    return None


def resolve_tenant(
    dialed_number: str,
    registry: dict[str, TenantConfig] | None = None,
) -> TenantConfig:
    """Resolve a tenant by dialed E.164 phone number.

    If the number is not in static files, attempts dynamic lookup via internal API.
    If unknown or unassigned, returns a safe default tenant that takes no data and logs it.
    """
    if registry is None:
        registry = load_tenants_registry()

    norm_dialed = normalize_e164(dialed_number)
    if norm_dialed and norm_dialed in registry:
        return registry[norm_dialed]

    # Dynamic lookup: Query backend API if dialed number is not in static files
    if norm_dialed:
        api_tenant = fetch_tenant_from_api(norm_dialed)
        if api_tenant:
            registry[norm_dialed] = api_tenant
            registry[api_tenant.tenant_id] = api_tenant
            logger.info(
                "Dynamically resolved tenant '%s' for number '%s' via internal API",
                api_tenant.business,
                norm_dialed,
            )
            return api_tenant

    # Log unknown number and return safe default
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
    registry = load_tenants_registry(config_path)

    if client_key == "default":
        # Return Apex Plumbing (+18005550199) or the first registered tenant
        if "+18005550199" in registry:
            return registry["+18005550199"]
        for t in registry.values():
            if t.tenant_id != "unassigned":
                return t
        return get_safe_default_tenant()

    if client_key in registry:
        return registry[client_key]

    norm_key = normalize_e164(client_key)
    if norm_key in registry:
        return registry[norm_key]

    raise KeyError(f"Client key or phone number '{client_key}' not found in tenant registry")


def get_agent_settings() -> AgentSettings:
    """Load model and runtime settings from environment."""
    return AgentSettings()
