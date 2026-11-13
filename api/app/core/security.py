"""Cryptographic security utilities for password hashing and JWT access tokens."""

from datetime import UTC, datetime, timedelta
from typing import Any

import bcrypt
import jwt

from api.app.core.config import settings


def hash_password(password: str) -> str:
    """Generate secure bcrypt password hash."""
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")
    return str(hashed)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify plain password against hashed password."""
    try:
        result = bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
        return bool(result)
    except Exception:
        return False


def create_access_token(data: dict[str, Any], expires_delta: timedelta | None = None) -> str:
    """Generate signed JWT access token."""
    to_encode = data.copy()
    now = datetime.now(UTC)
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode.update({"iat": now, "exp": expire})
    encoded = jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
    return str(encoded)


def decode_access_token(token: str) -> dict[str, Any] | None:
    """Decode and validate JWT access token."""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        return dict(payload) if isinstance(payload, dict) else None
    except jwt.PyJWTError:
        return None
