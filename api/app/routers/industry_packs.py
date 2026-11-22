"""Portal endpoints for Industry Packs catalog, tenant pack applications, overrides, and scenario test execution (Milestone M4c)."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from api.app.core.deps import get_current_tenant
from api.app.db.session import get_db
from api.app.models.industry_pack import IndustryPack, IndustryPackVersion
from api.app.models.tenant import Tenant
from api.app.services.industry_packs import (
    apply_pack_to_tenant,
    evaluate_pack_test_scenarios,
    get_tenant_effective_pack,
    seed_default_industry_packs,
)

logger = logging.getLogger("vedavoice.portal.industry_packs")

router = APIRouter(prefix="/portal/industry-packs", tags=["industry-packs"])


# --- Pydantic Request / Response Models ---


class ApplyPackRequest(BaseModel):
    pack_slug: str = Field(..., min_length=2, max_length=64)
    version_semver: str | None = None
    overrides: dict[str, Any] | None = None


class UpdateOverridesRequest(BaseModel):
    vars: dict[str, Any] | None = None
    emergency_keywords: list[str] | None = None
    custom_safety_script: str | None = None
    custom_notes: str | None = None


class PreviewPromptRequest(BaseModel):
    pack_slug: str = Field(..., min_length=2, max_length=64)
    vars: dict[str, Any] = Field(default_factory=dict)
    emergency_keywords: list[str] = Field(default_factory=list)
    custom_safety_script: str = ""
    custom_intake_schema: dict[str, Any] = Field(default_factory=dict)


class SandboxTurnRequest(BaseModel):
    pack_slug: str = Field(..., min_length=2, max_length=64)
    message: str = Field(..., min_length=1)
    history: list[dict[str, str]] = Field(default_factory=list)
    vars: dict[str, Any] = Field(default_factory=dict)
    emergency_keywords: list[str] = Field(default_factory=list)
    custom_safety_script: str = ""
    custom_intake_schema: dict[str, Any] = Field(default_factory=dict)


class PackSummaryResponse(BaseModel):
    id: str
    slug: str
    name: str
    description: str
    category: str
    icon: str
    latest_version: str
    is_active: bool
    requires_hipaa_baa: bool
    allowed_outbound_categories: list[str]


class PackDetailResponse(BaseModel):
    id: str
    slug: str
    name: str
    description: str
    category: str
    icon: str
    is_active: bool
    version_semver: str
    prompt_base: str
    prompt_vars_schema: dict[str, Any]
    faq_seed: list[dict[str, Any]]
    appointment_types: list[dict[str, Any]]
    intake_questions: list[dict[str, Any]]
    intake_schema: dict[str, Any] = Field(default_factory=dict)
    pipeline_stages: list[str]
    emergency_rules: dict[str, Any]
    outbound_scripts: dict[str, Any]
    test_scenarios: list[dict[str, Any]]
    allowed_outbound_categories: list[str]
    requires_hipaa_baa: bool


# --- Endpoints ---


@router.get("", response_model=list[PackSummaryResponse])
def list_industry_packs(
    db: Session = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
) -> list[PackSummaryResponse]:
    """Browse all available global industry packs with version and compliance constraints."""
    packs = db.scalars(
        select(IndustryPack).where(IndustryPack.is_active.is_(True)).order_by(IndustryPack.name)
    ).all()
    if not packs:
        packs = seed_default_industry_packs(db)

    results: list[PackSummaryResponse] = []
    for p in packs:
        latest_ver = db.scalar(
            select(IndustryPackVersion)
            .where(IndustryPackVersion.pack_id == p.id)
            .order_by(IndustryPackVersion.created_at.desc())
        )
        ver_str = latest_ver.version_semver if latest_ver else "1.0.0"
        requires_hipaa = latest_ver.requires_hipaa_baa if latest_ver else False
        allowed_cats = (
            latest_ver.allowed_outbound_categories if latest_ver else ["A", "B", "C", "D", "E"]
        )

        results.append(
            PackSummaryResponse(
                id=p.id,
                slug=p.slug,
                name=p.name,
                description=p.description,
                category=p.category,
                icon=p.icon,
                latest_version=ver_str,
                is_active=p.is_active,
                requires_hipaa_baa=requires_hipaa,
                allowed_outbound_categories=allowed_cats,
            )
        )
    return results


@router.get("/current", response_model=dict[str, Any])
def get_current_applied_pack(
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Retrieve tenant's currently active industry pack, version, and custom overrides."""
    pack_data = get_tenant_effective_pack(tenant.id, db)
    if not pack_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No industry pack configured for this tenant.",
        )
    return pack_data


@router.get("/{slug}", response_model=PackDetailResponse)
def get_industry_pack_details(
    slug: str,
    db: Session = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
) -> PackDetailResponse:
    """Inspect full industry pack blueprints, prompt base, schema, intake questions, and test scenarios."""
    pack = db.scalar(select(IndustryPack).where(IndustryPack.slug == slug))
    if not pack:
        # Check if seeding needed
        seed_default_industry_packs(db)
        pack = db.scalar(select(IndustryPack).where(IndustryPack.slug == slug))

    if not pack:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Industry pack '{slug}' not found",
        )

    latest_ver = db.scalar(
        select(IndustryPackVersion)
        .where(IndustryPackVersion.pack_id == pack.id)
        .order_by(IndustryPackVersion.created_at.desc())
    )
    if not latest_ver:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No versions found for industry pack '{slug}'",
        )

    return PackDetailResponse(
        id=pack.id,
        slug=pack.slug,
        name=pack.name,
        description=pack.description,
        category=pack.category,
        icon=pack.icon,
        is_active=pack.is_active,
        version_semver=latest_ver.version_semver,
        prompt_base=latest_ver.prompt_base,
        prompt_vars_schema=latest_ver.prompt_vars_schema,
        faq_seed=latest_ver.faq_seed,
        appointment_types=latest_ver.appointment_types,
        intake_questions=latest_ver.intake_questions,
        intake_schema=latest_ver.intake_schema or {},
        pipeline_stages=latest_ver.pipeline_stages,
        emergency_rules=latest_ver.emergency_rules,
        outbound_scripts=latest_ver.outbound_scripts,
        test_scenarios=latest_ver.test_scenarios,
        allowed_outbound_categories=latest_ver.allowed_outbound_categories,
        requires_hipaa_baa=latest_ver.requires_hipaa_baa,
    )


@router.post("/apply", status_code=status.HTTP_200_OK)
def apply_industry_pack(
    req: ApplyPackRequest,
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Apply or upgrade an industry pack for the authenticated tenant."""
    try:
        app_record = apply_pack_to_tenant(
            tenant_id=tenant.id,
            pack_slug=req.pack_slug,
            version_semver=req.version_semver,
            overrides=req.overrides,
            db=db,
        )
        return {
            "success": True,
            "tenant_id": tenant.id,
            "pack_id": app_record.pack_id,
            "version_id": app_record.version_id,
            "message": f"Successfully applied pack '{req.pack_slug}' to tenant",
        }
    except PermissionError as err:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(err)) from err
    except KeyError as err:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(err)) from err


@router.put("/overrides", status_code=status.HTTP_200_OK)
def update_tenant_overrides(
    req: UpdateOverridesRequest,
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Update tenant customizations without modifying the immutable upstream pack version."""
    pack_data = get_tenant_effective_pack(tenant.id, db)
    if not pack_data or not pack_data.get("pack_slug"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tenant must have an applied pack before updating overrides.",
        )

    current_overrides = dict(pack_data.get("overrides", {}))
    new_data = req.model_dump(exclude_unset=True)

    for k, v in new_data.items():
        if v is not None:
            current_overrides[k] = v

    apply_pack_to_tenant(
        tenant_id=tenant.id,
        pack_slug=pack_data["pack_slug"],
        version_semver=pack_data["version_semver"],
        overrides=current_overrides,
        db=db,
    )

    return {
        "success": True,
        "tenant_id": tenant.id,
        "overrides": current_overrides,
        "message": "Custom overrides updated successfully",
    }


@router.post("/test", status_code=status.HTTP_200_OK)
def run_pack_test_scenarios(
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Run automated 10-scenario validation evaluation suite against tenant's active pack."""
    evaluation = evaluate_pack_test_scenarios(tenant.id, db)
    return evaluation


@router.post("/preview-prompt", status_code=status.HTTP_200_OK)
def preview_pack_prompt(
    req: PreviewPromptRequest,
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Compile and preview industry pack prompt in real-time with variable overrides and intake trees."""
    pack = db.scalar(select(IndustryPack).where(IndustryPack.slug == req.pack_slug))
    latest_ver = None
    if pack:
        latest_ver = db.scalar(
            select(IndustryPackVersion)
            .where(IndustryPackVersion.pack_id == pack.id)
            .order_by(IndustryPackVersion.created_at.desc())
        )

    if latest_ver:
        prompt_base = latest_ver.prompt_base
        schema = latest_ver.prompt_vars_schema or {}
        emergencies = latest_ver.emergency_rules or {}
        intake_schema = req.custom_intake_schema or latest_ver.intake_schema or {}
    else:
        from api.app.services.industry_packs import LAUNCH_PACKS

        blueprint = next((p for p in LAUNCH_PACKS if p["slug"] == req.pack_slug), None)
        if not blueprint:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail=f"Pack '{req.pack_slug}' not found"
            )
        prompt_base = blueprint["prompt_base"]
        schema = blueprint["prompt_vars_schema"]
        emergencies = blueprint.get("emergency_rules", {})
        intake_schema = req.custom_intake_schema or blueprint.get("intake_schema", {})

    substitutions: dict[str, str] = {
        "business_name": str(
            req.vars.get("business_name") or req.vars.get("practice_name") or tenant.name
        )
    }
    for var_name, spec in schema.items():
        if var_name in req.vars:
            substitutions[var_name] = str(req.vars[var_name])
        elif var_name not in substitutions:
            substitutions[var_name] = str(spec.get("default", ""))

    compiled_prompt = prompt_base
    for k, v in substitutions.items():
        compiled_prompt = compiled_prompt.replace(f"{{{{{k}}}}}", v)

    merged_keywords = list(emergencies.get("keywords", []))
    for ck in req.emergency_keywords:
        if ck and ck not in merged_keywords:
            merged_keywords.append(ck)

    safety_advice = req.custom_safety_script or emergencies.get("safety_advice", "")
    if merged_keywords:
        compiled_prompt += (
            f"\nEmergency Triggers: {', '.join(merged_keywords)}. Safety guidance: {safety_advice}"
        )

    fields = intake_schema.get("fields", [])
    if fields:
        title = intake_schema.get("title", "Caller Intake & Triage")
        intake_lines = [f"\n\n# {title.upper()} PROTOCOL:"]
        intake_lines.append(
            "Before confirming an appointment booking, you must conversationally ask the caller the following triage intake questions and extract the answers into structured intake details:"
        )
        for fld in fields:
            req_str = "Required" if fld.get("required") else "Optional"
            opts = f" (Options: {', '.join(fld['options'])})" if fld.get("options") else ""
            intake_lines.append(
                f"- [{fld.get('key')}] ({req_str}){opts}: {fld.get('prompt') or fld.get('label')}"
            )
        intake_lines.append(
            "When calling the booking tool, provide these triage answers in the 'intake_details' parameter."
        )
        compiled_prompt += "\n".join(intake_lines)

    return {
        "pack_slug": req.pack_slug,
        "compiled_prompt": compiled_prompt,
        "substitutions": substitutions,
        "emergency_triggers": merged_keywords,
        "safety_advice": safety_advice,
        "intake_tree_active": bool(fields),
        "fields_count": len(fields),
    }


@router.post("/sandbox/turn", status_code=status.HTTP_200_OK)
def simulate_sandbox_turn(
    req: SandboxTurnRequest,
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Execute interactive conversational turn in studio sandbox against compiled pack rules."""
    pack = db.scalar(select(IndustryPack).where(IndustryPack.slug == req.pack_slug))
    latest_ver = None
    if pack:
        latest_ver = db.scalar(
            select(IndustryPackVersion)
            .where(IndustryPackVersion.pack_id == pack.id)
            .order_by(IndustryPackVersion.created_at.desc())
        )

    from api.app.services.industry_packs import LAUNCH_PACKS

    blueprint = next((p for p in LAUNCH_PACKS if p["slug"] == req.pack_slug), None)
    msg_low = req.message.lower().strip()

    # 1. Evaluate emergency detection
    keywords: list[str] = []
    if latest_ver and latest_ver.emergency_rules:
        keywords = list(latest_ver.emergency_rules.get("keywords", []))
    elif blueprint:
        keywords = list(blueprint.get("emergency_rules", {}).get("keywords", []))

    for ck in req.emergency_keywords:
        if ck and ck not in keywords:
            keywords.append(ck)
    if not keywords:
        keywords = ["gas leak", "burst pipe", "flooding", "abscess", "arrested"]

    matched_kw = next((kw for kw in keywords if kw.lower() in msg_low), None)
    is_emergency = matched_kw is not None

    safety_script = req.custom_safety_script
    if not safety_script and latest_ver and latest_ver.emergency_rules:
        safety_script = latest_ver.emergency_rules.get("safety_advice", "")
    if not safety_script and blueprint:
        safety_script = blueprint.get("emergency_rules", {}).get("safety_advice", "")
    if not safety_script:
        safety_script = (
            "Please stay in a safe location outdoors and call 911 if in immediate danger."
        )

    biz_name = str(req.vars.get("business_name") or req.vars.get("practice_name") or tenant.name)
    escalated_to = str(req.vars.get("emergency_phone") or "+18005550199")

    # 2. Extract structured intake answers
    intake_schema = (
        req.custom_intake_schema
        or (latest_ver.intake_schema if latest_ver and latest_ver.intake_schema else None)
        or (blueprint.get("intake_schema", {}) if blueprint else {})
    )
    fields = intake_schema.get("fields", [])
    extracted_intake: dict[str, Any] = {}

    for fld in fields:
        k = fld.get("key")
        opts = fld.get("options", [])
        if opts:
            for opt in opts:
                if opt.lower() in msg_low:
                    extracted_intake[k] = opt
                    break
        elif k == "issue_summary" and len(msg_low) > 8:
            extracted_intake[k] = req.message
        elif k == "chief_complaint" and any(
            w in msg_low for w in ("pain", "tooth", "molar", "swelling", "ache", "clean")
        ):
            extracted_intake[k] = req.message
        elif k == "practice_area":
            for area in ("personal injury", "employment", "criminal", "litigation", "estate"):
                if area in msg_low:
                    extracted_intake[k] = area.title()
                    break

    # 3. Conversational response generation
    if is_emergency:
        reply = (
            f"I understand this is an urgent emergency regarding {matched_kw}. "
            f"{safety_script} "
            f"I am connecting you directly with our on-call technician at {biz_name} now."
        )
    elif any(g in msg_low for g in ("hello", "hi", "hey", "good morning", "good afternoon")):
        specialties = req.vars.get("specialties") or "professional commercial services"
        reply = (
            f"Thanks for calling {biz_name}! We specialize in {specialties}. "
            "How can I assist you with scheduling or service today?"
        )
    elif any(
        b in msg_low
        for b in ("book", "schedule", "appointment", "opening", "slot", "tomorrow", "friday")
    ):
        pending_field = next(
            (
                fld
                for fld in fields
                if fld.get("required") and fld.get("key") not in extracted_intake
            ),
            None,
        )
        if pending_field and len(req.history) < 2:
            reply = f"I would be glad to help schedule that for you. {pending_field.get('prompt') or pending_field.get('label')}"
        else:
            reply = (
                f"I have conflict-free openings tomorrow at 10:00 AM or 2:00 PM for {biz_name}. "
                "Which of those times works best for you?"
            )
    elif any(p in msg_low for p in ("fee", "price", "cost", "how much", "rate")):
        fee = (
            req.vars.get("diagnostic_fee")
            or req.vars.get("consultation_fee")
            or "standard competitive pricing"
        )
        reply = f"For our service visits, {biz_name} has {fee}. Would you like to check open appointment slots?"
    else:
        reply = (
            f"Thank you for contacting {biz_name}. I can assist with scheduling an appointment, "
            "answering questions about our services, or having an on-call team member follow up. What can I help you with?"
        )

    return {
        "reply": reply,
        "role": "assistant",
        "detected_emergency": is_emergency,
        "emergency_trigger": matched_kw,
        "safety_advice": safety_script if is_emergency else "",
        "escalated_to": escalated_to if is_emergency else None,
        "extracted_intake": extracted_intake,
        "turn_count": len(req.history) + 1,
    }
