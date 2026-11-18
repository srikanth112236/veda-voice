"""Cryptographic security utilities for password hashing and JWT access tokens."""

import base64
import hashlib
import json
from datetime import UTC, datetime, timedelta
from typing import Any

import bcrypt
import jwt
from cryptography.fernet import Fernet

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


def _get_encryption_cipher() -> Fernet:
    """Derive 32-byte Fernet key from platform JWT secret."""
    key = base64.urlsafe_b64encode(hashlib.sha256(settings.JWT_SECRET.encode("utf-8")).digest())
    return Fernet(key)


def encrypt_token(token_data: dict[str, Any] | str) -> str:
    """Encrypt OAuth token or credentials using AES-128-CBC with HMAC-SHA256 (envelope encryption)."""
    cipher = _get_encryption_cipher()
    raw_str = json.dumps(token_data) if isinstance(token_data, dict) else str(token_data)
    encrypted = cipher.encrypt(raw_str.encode("utf-8"))
    return str(encrypted.decode("utf-8"))


def decrypt_token(ciphertext: str) -> dict[str, Any] | str:
    """Decrypt OAuth token ciphertext."""
    cipher = _get_encryption_cipher()
    decrypted_bytes = cipher.decrypt(ciphertext.encode("utf-8"))
    decrypted_str = str(decrypted_bytes.decode("utf-8"))
    try:
        parsed = json.loads(decrypted_str)
        if isinstance(parsed, dict):
            return parsed
        return decrypted_str
    except json.JSONDecodeError:
        return decrypted_str
