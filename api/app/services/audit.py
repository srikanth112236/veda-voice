"""Agency and Tenant Audit Trail logging service.

Provides append-only, tamper-resistant logging for impersonation events,
sensitive tenant configuration edits, compliance changes, and supervisor interventions.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from api.app.models.audit import AgencyAuditLog
from api.app.models.user import User


def record_audit_event(
    db: Session,
    *,
    action: str,
    resource_type: str,
    actor_id: str,
    actor_email: str,
    actor_role: str,
    resource_id: str | None = None,
    tenant_id: str | None = None,
    is_impersonated: bool = False,
    impersonator_id: str | None = None,
    impersonator_email: str | None = None,
    session_id: str | None = None,
    details: dict[str, Any] | None = None,
    ip_address: str | None = None,
) -> AgencyAuditLog:
    """Record an immutable audit log entry."""
    entry = AgencyAuditLog(
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        actor_id=actor_id,
        actor_email=actor_email,
        actor_role=actor_role,
        tenant_id=tenant_id,
        is_impersonated=is_impersonated,
        impersonator_id=impersonator_id,
        impersonator_email=impersonator_email,
        session_id=session_id,
        details=details or {},
        ip_address=ip_address,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


def log_action_for_user(
    db: Session,
    user: User,
    *,
    action: str,
    resource_type: str,
    resource_id: str | None = None,
    tenant_id: str | None = None,
    details: dict[str, Any] | None = None,
    ip_address: str | None = None,
) -> AgencyAuditLog:
    """Record an audit log automatically extracting actor and impersonation state from User."""
    is_impersonated = getattr(user, "is_impersonated", False)
    impersonator_id = getattr(user, "impersonator_id", None)
    impersonator_email = getattr(user, "impersonator_email", None)
    session_id = getattr(user, "session_id", None)
    effective_tenant_id = tenant_id or user.tenant_id

    return record_audit_event(
        db,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        actor_id=user.id,
        actor_email=user.email,
        actor_role=user.role,
        tenant_id=effective_tenant_id,
        is_impersonated=is_impersonated,
        impersonator_id=impersonator_id,
        impersonator_email=impersonator_email,
        session_id=session_id,
        details=details,
        ip_address=ip_address,
    )
