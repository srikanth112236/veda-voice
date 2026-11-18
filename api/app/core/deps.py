"""FastAPI dependencies for database sessions and authentication guards."""

from typing import Annotated

from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from api.app.core.security import decode_access_token
from api.app.db.session import get_db
from api.app.models.tenant import Tenant
from api.app.models.user import User

security_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security_scheme)],
    db: Annotated[Session, Depends(get_db)],
) -> User:
    """Validate JWT token and return authenticated user model."""
    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials were not provided",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_access_token(credentials.credentials)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id: str | None = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Malformed authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    stmt = select(User).where(User.id == user_id, User.is_active.is_(True))
    user: User | None = db.scalar(stmt)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Attach impersonation context if token was issued for an agency impersonation session
    is_impersonated = bool(payload.get("is_impersonated", False))
    user.is_impersonated = is_impersonated
    if is_impersonated:
        impersonated_tenant_id = payload.get("tenant_id")
        user.impersonator_id = payload.get("impersonator_id")
        user.impersonator_email = payload.get("impersonator_email")
        user.session_id = payload.get("session_id")
        if impersonated_tenant_id:
            user.tenant_id = impersonated_tenant_id
            target_tenant = db.scalar(select(Tenant).where(Tenant.id == impersonated_tenant_id))
            if target_tenant:
                user.tenant = target_tenant
    else:
        user.impersonator_id = None
        user.impersonator_email = None
        user.session_id = None

    return user


def require_platform_admin(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    """Enforce platform super-admin role."""
    if current_user.role != "platform_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Platform administrator access required",
        )
    return current_user


def get_current_tenant(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    x_tenant_id: Annotated[str | None, Header()] = None,
) -> Tenant:
    """Enforce tenant scoping. Platform admin can impersonate with token or X-Tenant-ID header."""
    target_tenant_id = current_user.tenant_id

    # If this is an impersonation token session, always use the impersonated tenant
    if getattr(current_user, "is_impersonated", False) and current_user.tenant_id:
        target_tenant_id = current_user.tenant_id
    elif current_user.role == "platform_admin":
        if x_tenant_id:
            target_tenant_id = x_tenant_id
        elif not target_tenant_id:
            # If no tenant specified, return first active tenant or 400
            stmt = select(Tenant).where(Tenant.status == "active").order_by(Tenant.created_at.asc())
            fallback_tenant: Tenant | None = db.scalar(stmt)
            if fallback_tenant is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND, detail="No active tenants found"
                )
            return fallback_tenant

    if not target_tenant_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User is not associated with any tenant organization",
        )

    stmt_target = select(Tenant).where(Tenant.id == target_tenant_id)
    target_tenant: Tenant | None = db.scalar(stmt_target)
    if target_tenant is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Tenant organization not found"
        )

    return target_tenant
