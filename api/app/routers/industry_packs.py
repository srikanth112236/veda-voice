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
