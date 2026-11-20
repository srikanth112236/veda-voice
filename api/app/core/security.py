"""Cryptographic security utilities for password hashing and JWT access tokens."""

import base64
import hashlib
import json
import os
from datetime import UTC, datetime, timedelta
from typing import Any, cast

import bcrypt
import jwt
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

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
    """Decrypt OAuth token ciphertext, supporting both modern v2:gcm: and legacy Fernet."""
    clean_ciphertext = (ciphertext or "").strip()
    if clean_ciphertext.startswith("v2:gcm:"):
        parts = clean_ciphertext.split(":", 4)
        if len(parts) == 5:
            _, _, enc_tenant, enc_provider, _ = parts
            return decrypt_crm_credentials(enc_tenant, enc_provider, clean_ciphertext)

    cipher = _get_encryption_cipher()
    decrypted_bytes = cipher.decrypt(clean_ciphertext.encode("utf-8"))
    decrypted_str = str(decrypted_bytes.decode("utf-8"))
    try:
        parsed = json.loads(decrypted_str)
        if isinstance(parsed, dict):
            return parsed
        return decrypted_str
    except json.JSONDecodeError:
        return decrypted_str


# ============================================================================
# ENTERPRISE PER-TENANT AES-256-GCM ENVELOPE ENCRYPTION VAULT (ZERO-TRUST)
# ============================================================================


def _derive_tenant_dek(tenant_id: str, provider: str) -> bytes:
    """Derive a dedicated 256-bit AES-GCM data encryption key (DEK) per tenant and provider.

    Uses HKDF with SHA-256 using the platform master secret, tenant ID as cryptographic salt,
    and provider as domain separation context.
    """
    master_key = settings.JWT_SECRET.encode()
    salt = tenant_id.strip().encode()
    info = f"vedavoice-crm-vault:{provider.lower().strip()}".encode()

    hkdf = HKDF(
        algorithm=hashes.SHA256(),
        length=32,  # 256 bits
        salt=salt,
        info=info,
    )
    derived_key: bytes = hkdf.derive(master_key)
    return derived_key


def compute_key_fingerprint(secret_data: dict[str, Any] | str) -> str:
    """Derive non-reversible masked display fingerprint (e.g. ••••3a9f) for safe UI visualization."""
    if isinstance(secret_data, dict):
        key_val = str(
            secret_data.get("access_token")
            or secret_data.get("api_key")
            or secret_data.get("token")
            or secret_data.get("refresh_token")
            or list(secret_data.values())[0]
            if secret_data
            else ""
        )
    else:
        key_val = str(secret_data).strip()

    if len(key_val) >= 4:
        return f"••••{key_val[-4:]}"
    return "••••"


def encrypt_crm_credentials(
    tenant_id: str,
    provider: str,
    secret_data: dict[str, Any] | str,
) -> tuple[str, str]:
    """Encrypt CRM secrets using authenticated AES-256-GCM with per-tenant HKDF key derivation.

    Returns:
        (ciphertext_bundle, masked_fingerprint)
        where ciphertext_bundle is formatted as: 'v2:gcm:<base64(12_byte_nonce + ciphertext + 16_byte_tag)>'
    """
    raw_str = json.dumps(secret_data) if isinstance(secret_data, dict) else str(secret_data)
    dek = _derive_tenant_dek(tenant_id=tenant_id, provider=provider)
    aesgcm = AESGCM(dek)

    # Fresh 96-bit (12 byte) Initialization Vector (Nonce) per encryption
    nonce = os.urandom(12)
    # Authenticated encryption (ciphertext includes 128-bit authentication tag)
    encrypted_bytes = aesgcm.encrypt(nonce, raw_str.encode("utf-8"), None)

    bundle_b64 = base64.b64encode(nonce + encrypted_bytes).decode("utf-8")
    versioned_ciphertext = f"v2:gcm:{tenant_id}:{provider}:{bundle_b64}"
    fingerprint = compute_key_fingerprint(secret_data)

    return versioned_ciphertext, fingerprint


def decrypt_crm_credentials(
    tenant_id: str,
    provider: str,
    ciphertext: str,
) -> dict[str, Any] | str:
    """Decrypt CRM credentials with dual-read backward compatibility.

    Supports:
    1. v2:gcm:<tenant_id>:<provider>:<base64> -> Tenant-isolated AES-256-GCM decryption with auth-tag validation.
    2. Legacy Fernet -> Platform-level Fernet token decryption.
    3. Plaintext fallback if unencrypted legacy record.
    """
    clean_ciphertext = (ciphertext or "").strip()
    if not clean_ciphertext:
        return ""

    # Path 1: Modern AES-256-GCM with Tenant Isolation
    if clean_ciphertext.startswith("v2:gcm:"):
        parts = clean_ciphertext.split(":", 4)
        if len(parts) == 5:
            _, _, enc_tenant, enc_provider, payload_b64 = parts
            if enc_tenant != tenant_id or enc_provider.lower() != provider.lower():
                raise PermissionError(
                    f"Cryptographic context violation: token belongs to {enc_tenant}/{enc_provider}, not {tenant_id}/{provider}"
                )
        elif len(parts) == 3:
            payload_b64 = parts[2]
        else:
            payload_b64 = clean_ciphertext[7:]

        raw_bundle = base64.b64decode(payload_b64.encode("utf-8"))
        if len(raw_bundle) < 28:  # 12 byte nonce + 16 byte tag
            raise ValueError("Malformed AES-256-GCM ciphertext bundle.")

        nonce = raw_bundle[:12]
        ciphertext_with_tag = raw_bundle[12:]

        dek = _derive_tenant_dek(tenant_id=tenant_id, provider=provider)
        aesgcm = AESGCM(dek)

        decrypted_bytes = aesgcm.decrypt(nonce, ciphertext_with_tag, None)
        decrypted_str = decrypted_bytes.decode("utf-8")

        try:
            parsed = json.loads(decrypted_str)
            if isinstance(parsed, dict):
                return cast(dict[str, Any], parsed)
            return str(decrypted_str)
        except json.JSONDecodeError:
            return str(decrypted_str)

    # Path 2: Legacy Fernet Decryption Fallback (Dual-Read Engine)
    try:
        return decrypt_token(clean_ciphertext)
    except Exception:
        pass

    # Path 3: Plaintext string fallback
    try:
        parsed = json.loads(clean_ciphertext)
        if isinstance(parsed, dict):
            return cast(dict[str, Any], parsed)
        return str(clean_ciphertext)
    except Exception:
        return str(clean_ciphertext)
