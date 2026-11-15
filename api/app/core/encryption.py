"""Envelope encryption for tenant credentials and OAuth refresh tokens.

Uses AES-128 CBC / HMAC-SHA256 authenticated encryption via Fernet with key derivation.
"""

from __future__ import annotations

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from api.app.core.config import settings


def _get_fernet() -> Fernet:
    """Derive standard urlsafe 32-byte base64 Fernet key from encryption secret."""
    secret = settings.ENCRYPTION_SECRET.encode("utf-8")
    derived_key = base64.urlsafe_b64encode(hashlib.sha256(secret).digest())
    return Fernet(derived_key)


def encrypt_token(plain_text: str) -> str:
    """Encrypt a plain text token into an authenticated ciphertext string."""
    if not plain_text:
        return ""
    f = _get_fernet()
    res = f.encrypt(plain_text.encode("utf-8")).decode("utf-8")
    return str(res)


def decrypt_token(cipher_text: str) -> str:
    """Decrypt authenticated ciphertext string back into plain text token."""
    if not cipher_text:
        return ""
    f = _get_fernet()
    try:
        res = f.decrypt(cipher_text.encode("utf-8")).decode("utf-8")
        return str(res)
    except InvalidToken as err:
        raise ValueError(
            "Failed to decrypt token: invalid ciphertext or secret key mismatch"
        ) from err
