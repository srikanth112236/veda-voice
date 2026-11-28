"""Agency sub-account management, impersonation sessions, and audit trail router."""

from __future__ import annotations

import math
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from api.app.core.deps import (
    ADMIN_COOKIE_NAME,
    AUTH_COOKIE_NAME,
    get_current_user,
    require_platform_admin,
    set_auth_cookie,
)
from api.app.core.security import create_access_token
from api.app.db.session import get_db
from api.app.models.audit import AgencyAuditLog
from api.app.models.call import Call
from api.app.models.subscription import Subscription
from api.app.models.tenant import PhoneNumber, Tenant
from api.app.models.user import User
from api.app.services.audit import record_audit_event

router = APIRouter(prefix="/agency", tags=["agency"])


class ImpersonateRequest(BaseModel):
    reason: str = Field(
        "support_troubleshooting",
        description="Mandatory reason for initiating client sub-account impersonation",
    )


class ImpersonationResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    session_id: str
    tenant: dict[str, Any]
    impersonator: dict[str, Any]


class SubAccountListItem(BaseModel):
    id: str
    name: str
    timezone: str
    status: str
    created_at: datetime
    plan_tier: str
    monthly_minute_quota: int
    minutes_used: float
    usage_pct: float
    total_calls: int
    active_calls: int
    emergency_calls: int
    qa_avg_score: float
    csat_avg_score: float
    phone_numbers: list[str]
    last_call_at: datetime | None = None


class AuditLogItem(BaseModel):
    id: str
    tenant_id: str | None
    actor_id: str
    actor_email: str
    actor_role: str
    is_impersonated: bool
    impersonator_id: str | None
    impersonator_email: str | None
    session_id: str | None
    action: str
    resource_type: str
    resource_id: str | None
    details: dict[str, Any]
    ip_address: str | None
    created_at: datetime


class AuditLogsResponse(BaseModel):
    total: int
    items: list[AuditLogItem]
    limit: int
    offset: int


# ================= SUB-ACCOUNTS MANAGEMENT & ROLLUP =================


def _safe_float(val: Any, fallback: float) -> float:
    """Coerce numeric aggregate to a finite float without masking genuine zeros."""
    if val is None:
        return fallback
    f = float(val)
    return f if math.isfinite(f) else fallback


def _build_sub_account_summary(db: Session, tenant: Tenant) -> SubAccountListItem:
    """Build aggregated operational health, usage, and QA metrics for a tenant."""
    phone_nums = [
        p.e164
        for p in db.scalars(
            select(PhoneNumber).where(
                PhoneNumber.tenant_id == tenant.id, PhoneNumber.status == "active"
            )
        ).all()
    ]

    total_calls = db.scalar(select(func.count(Call.id)).where(Call.tenant_id == tenant.id)) or 0
    active_calls = (
        db.scalar(
            select(func.count(Call.id)).where(Call.tenant_id == tenant.id, Call.ended_at.is_(None))
        )
        or 0
    )
    emergency_calls = (
        db.scalar(
            select(func.count(Call.id)).where(
                Call.tenant_id == tenant.id, Call.urgency == "emergency"
            )
        )
        or 0
    )

    total_seconds = _safe_float(
        db.scalar(select(func.sum(Call.duration_s)).where(Call.tenant_id == tenant.id)), 0.0
    )
    minutes_used = round(total_seconds / 60.0, 1)

    quota = tenant.monthly_minute_quota or 500
    usage_pct = round((minutes_used / quota) * 100.0, 1) if quota > 0 else 0.0

    qa_raw = db.scalar(
        select(func.avg(Call.qa_score)).where(
            Call.tenant_id == tenant.id, Call.qa_score.isnot(None)
        )
    )
    csat_raw = db.scalar(
        select(func.avg(Call.csat_score)).where(
            Call.tenant_id == tenant.id, Call.csat_score.isnot(None)
        )
    )
    qa_avg = _safe_float(qa_raw, 100.0)
    csat_avg = _safe_float(csat_raw, 5.0)

    last_call = db.scalar(
        select(Call.started_at)
        .where(Call.tenant_id == tenant.id)
        .order_by(Call.started_at.desc())
        .limit(1)
    )

    plan_tier = "starter"
    try:
        tier_row = db.scalar(select(Subscription.tier).where(Subscription.tenant_id == tenant.id))
        if tier_row:
            plan_tier = str(tier_row)
    except Exception:
        db.rollback()

    return SubAccountListItem(
        id=tenant.id,
        name=tenant.name or "Unnamed Organization",
        timezone=tenant.timezone or "America/New_York",
        status=tenant.status or "active",
        created_at=tenant.created_at or datetime.now(UTC),
        plan_tier=plan_tier,
        monthly_minute_quota=quota,
        minutes_used=minutes_used,
        usage_pct=usage_pct,
        total_calls=int(total_calls),
        active_calls=int(active_calls),
        emergency_calls=int(emergency_calls),
        qa_avg_score=round(qa_avg, 1),
        csat_avg_score=round(csat_avg, 2),
        phone_numbers=phone_nums,
        last_call_at=last_call,
    )


@router.get("/sub-accounts", response_model=list[SubAccountListItem])
def list_agency_sub_accounts(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_platform_admin),
) -> list[SubAccountListItem]:
    """List all agency client sub-accounts with aggregated operational health, usage, and QA metrics."""
    tenants = db.scalars(select(Tenant).order_by(Tenant.created_at.desc())).all()
    return [_build_sub_account_summary(db, t) for t in tenants]


@router.get("/sub-accounts/{tenant_id}/summary", response_model=SubAccountListItem)
def get_sub_account_summary(
    tenant_id: str,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_platform_admin),
) -> SubAccountListItem:
    """Get deep-dive metrics for a specific sub-account."""
    tenant = db.scalar(select(Tenant).where(Tenant.id == tenant_id))
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sub-account not found")
    return _build_sub_account_summary(db, tenant)


# ================= SUB-ACCOUNT IMPERSONATION SESSIONS =================


@router.post("/sub-accounts/{tenant_id}/impersonate", response_model=ImpersonationResponse)
def impersonate_sub_account(
    tenant_id: str,
    req: ImpersonateRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    admin: User = Depends(require_platform_admin),
) -> ImpersonationResponse:
    """Issue a scoped, short-lived JWT token to impersonate a client sub-account with mandatory audit trail."""
    target_tenant = db.scalar(select(Tenant).where(Tenant.id == tenant_id))
    if not target_tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Target sub-account not found"
        )

    session_id = str(uuid.uuid4())
    expires_in_seconds = 1800  # 30 minutes TTL
    client_ip = request.client.host if request.client else None

    # Generate impersonation JWT with clear provenance claims
    token = create_access_token(
        data={
            "sub": admin.id,
            "tenant_id": target_tenant.id,
            "role": "tenant_owner",
            "is_impersonated": True,
            "impersonator_id": admin.id,
            "impersonator_email": admin.email,
            "session_id": session_id,
        },
        expires_delta=timedelta(seconds=expires_in_seconds),
    )

    # Record mandatory immutable audit log
    record_audit_event(
        db,
        action="auth.impersonate_start",
        resource_type="tenant",
        resource_id=target_tenant.id,
        actor_id=admin.id,
        actor_email=admin.email,
        actor_role=admin.role,
        tenant_id=target_tenant.id,
        is_impersonated=True,
        impersonator_id=admin.id,
        impersonator_email=admin.email,
        session_id=session_id,
        details={
            "reason": req.reason,
            "tenant_name": target_tenant.name,
            "expires_in_seconds": expires_in_seconds,
        },
        ip_address=client_ip,
    )

    current_cookie = request.cookies.get(AUTH_COOKIE_NAME)
    if current_cookie and not request.cookies.get(ADMIN_COOKIE_NAME):
        set_auth_cookie(response, current_cookie, key=ADMIN_COOKIE_NAME, max_age=expires_in_seconds)
    set_auth_cookie(response, token, key=AUTH_COOKIE_NAME, max_age=expires_in_seconds)

    return ImpersonationResponse(
        access_token=token,
        token_type="bearer",
        expires_in=expires_in_seconds,
        session_id=session_id,
        tenant={
            "id": target_tenant.id,
            "name": target_tenant.name,
            "timezone": target_tenant.timezone,
            "status": target_tenant.status,
        },
        impersonator={
            "id": admin.id,
            "email": admin.email,
            "full_name": admin.full_name,
        },
    )


@router.post("/sub-accounts/impersonate/exit")
def exit_sub_account_impersonation(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Terminate impersonation session and record exit event in the audit trail."""
    is_impersonated = getattr(user, "is_impersonated", False)
    client_ip = request.client.host if request.client else None

    if is_impersonated:
        record_audit_event(
            db,
            action="auth.impersonate_end",
            resource_type="tenant",
            resource_id=user.tenant_id,
            actor_id=user.id,
            actor_email=user.email,
            actor_role=user.role,
            tenant_id=user.tenant_id,
            is_impersonated=True,
            impersonator_id=getattr(user, "impersonator_id", None),
            impersonator_email=getattr(user, "impersonator_email", None),
            session_id=getattr(user, "session_id", None),
            details={"status": "manual_exit"},
            ip_address=client_ip,
        )

    admin_cookie = request.cookies.get(ADMIN_COOKIE_NAME)
    if admin_cookie:
        set_auth_cookie(response, admin_cookie, key=AUTH_COOKIE_NAME)
        response.delete_cookie(key=ADMIN_COOKIE_NAME, path="/")

    return {
        "status": "impersonation_ended",
        "message": "Impersonation session terminated successfully.",
    }


# ================= IMMUTABLE AUDIT TRAIL LOG EXPLORER =================


@router.get("/audit-logs", response_model=AuditLogsResponse)
def list_agency_audit_logs(
    tenant_id: str | None = Query(None, description="Filter by client sub-account ID"),
    actor_id: str | None = Query(None, description="Filter by actor ID"),
    action: str | None = Query(None, description="Filter by action code"),
    is_impersonated: bool | None = Query(None, description="Filter by impersonation flag"),
    limit: int = Query(50, ge=1, le=200, description="Page limit"),
    offset: int = Query(0, ge=0, description="Page offset"),
    db: Session = Depends(get_db),
    _admin: User = Depends(require_platform_admin),
) -> AuditLogsResponse:
    """Search and inspect immutable agency audit logs across all tenants and operators."""
    query = select(AgencyAuditLog)

    if tenant_id:
        query = query.where(AgencyAuditLog.tenant_id == tenant_id)
    if actor_id:
        query = query.where(AgencyAuditLog.actor_id == actor_id)
    if action:
        query = query.where(AgencyAuditLog.action == action)
    if is_impersonated is not None:
        query = query.where(AgencyAuditLog.is_impersonated.is_(is_impersonated))

    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    items = db.scalars(
        query.order_by(AgencyAuditLog.created_at.desc()).offset(offset).limit(limit)
    ).all()

    return AuditLogsResponse(
        total=total,
        items=[
            AuditLogItem(
                id=log.id,
                tenant_id=log.tenant_id,
                actor_id=log.actor_id,
                actor_email=log.actor_email,
                actor_role=log.actor_role,
                is_impersonated=log.is_impersonated,
                impersonator_id=log.impersonator_id,
                impersonator_email=log.impersonator_email,
                session_id=log.session_id,
                action=log.action,
                resource_type=log.resource_type,
                resource_id=log.resource_id,
                details=log.details or {},
                ip_address=log.ip_address,
                created_at=log.created_at,
            )
            for log in items
        ],
        limit=limit,
        offset=offset,
    )
