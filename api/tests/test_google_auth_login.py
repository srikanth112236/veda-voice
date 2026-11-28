"""Tests for Google OAuth 2.0 user sign-in and ID token validation."""

from __future__ import annotations

import uuid
from datetime import timedelta
from typing import Any
from urllib.parse import parse_qs, urlparse

from fastapi.testclient import TestClient

from api.app.core.config import settings
from api.app.core.security import create_access_token, decode_access_token, hash_password
from api.app.db.session import SessionLocal
from api.app.main import app
from api.app.models.user import User

client = TestClient(app)


class _DummyResponse:
    def __init__(self, status_code: int, payload: dict[str, Any]) -> None:
        self.status_code = status_code
        self._payload = payload
        self.text = str(payload)

    def json(self) -> dict[str, Any]:
        return self._payload


class _DummyAsyncClient:
    def __init__(self, token_payload: dict[str, Any], tokeninfo_payload: dict[str, Any]) -> None:
        self._token_payload = token_payload
        self._tokeninfo_payload = tokeninfo_payload

    async def __aenter__(self) -> _DummyAsyncClient:
        return self

    async def __aexit__(self, *args: Any) -> None:
        return None

    async def post(self, url: str, data: dict[str, Any] | None = None) -> _DummyResponse:
        return _DummyResponse(200, self._token_payload)

    async def get(self, url: str, params: dict[str, Any] | None = None) -> _DummyResponse:
        return _DummyResponse(200, self._tokeninfo_payload)


def test_google_login_url_requires_config(monkeypatch: Any) -> None:
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "")
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_SECRET", "")
    resp = client.get("/api/v1/auth/google")
    assert resp.status_code == 503


def test_google_login_url_and_state(monkeypatch: Any) -> None:
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "test-google-client-id")
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_SECRET", "test-google-secret")

    resp = client.get(
        "/api/v1/auth/google",
        params={
            "redirect_to": "https://dashboard.kindstone-eaab21b4.eastus2.azurecontainerapps.io"
        },
    )
    assert resp.status_code == 200
    auth_url = resp.json()["authorization_url"]
    parsed = urlparse(auth_url)
    qs = parse_qs(parsed.query)
    assert qs["client_id"] == ["test-google-client-id"]
    assert qs["redirect_uri"] == [settings.GOOGLE_AUTH_REDIRECT_URI]
    assert "openid email profile" in qs["scope"][0]

    state_payload = decode_access_token(qs["state"][0])
    assert state_payload is not None
    assert state_payload["flow"] == "google_login"
    assert (
        state_payload["redirect_to"]
        == "https://dashboard.kindstone-eaab21b4.eastus2.azurecontainerapps.io"
    )


def test_google_callback_rejects_invalid_state() -> None:
    resp = client.get(
        "/api/v1/auth/google/callback",
        params={"code": "abc", "state": "bad-state"},
        follow_redirects=False,
    )
    assert resp.status_code == 307
    assert "error=invalid_oauth_state" in resp.headers["location"]


def test_google_callback_rejects_audience_mismatch(monkeypatch: Any) -> None:
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "expected-client-id")
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_SECRET", "secret")
    state = create_access_token({"flow": "google_login", "redirect_to": settings.DASHBOARD_URL})

    monkeypatch.setattr(
        "api.app.routers.auth.httpx.AsyncClient",
        lambda **kwargs: _DummyAsyncClient(
            {"id_token": "fake-id-token"},
            {
                "aud": "wrong-client-id",
                "iss": "https://accounts.google.com",
                "email": "admin@vedavoice.io",
                "email_verified": "true",
            },
        ),
    )
    resp = client.get(
        "/api/v1/auth/google/callback",
        params={"code": "ok-code", "state": state},
        follow_redirects=False,
    )
    assert resp.status_code == 307
    assert "error=invalid_token_audience" in resp.headers["location"]


def test_google_callback_rejects_unverified_email(monkeypatch: Any) -> None:
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "expected-client-id")
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_SECRET", "secret")
    state = create_access_token({"flow": "google_login", "redirect_to": settings.DASHBOARD_URL})

    monkeypatch.setattr(
        "api.app.routers.auth.httpx.AsyncClient",
        lambda **kwargs: _DummyAsyncClient(
            {"id_token": "fake-id-token"},
            {
                "aud": "expected-client-id",
                "iss": "https://accounts.google.com",
                "email": "admin@vedavoice.io",
                "email_verified": "false",
            },
        ),
    )
    resp = client.get(
        "/api/v1/auth/google/callback",
        params={"code": "ok-code", "state": state},
        follow_redirects=False,
    )
    assert resp.status_code == 307
    assert "error=email_not_verified" in resp.headers["location"]


def test_google_callback_issues_jwt_for_active_user(monkeypatch: Any) -> None:
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "expected-client-id")
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_SECRET", "secret")
    email = "google-oauth-test@vedavoice.io"

    with SessionLocal() as db:
        existing = db.query(User).filter(User.email == email).first()
        if not existing:
            db.add(
                User(
                    email=email,
                    hashed_password=hash_password("TempPass123!"),
                    full_name="Google OAuth Tester",
                    role="platform_admin",
                    is_active=True,
                )
            )
            db.commit()

    state = create_access_token({"flow": "google_login", "redirect_to": settings.DASHBOARD_URL})
    monkeypatch.setattr(
        "api.app.routers.auth.httpx.AsyncClient",
        lambda **kwargs: _DummyAsyncClient(
            {"id_token": "valid-id-token"},
            {
                "aud": "expected-client-id",
                "iss": "https://accounts.google.com",
                "email": email,
                "email_verified": "true",
            },
        ),
    )
    resp = client.get(
        "/api/v1/auth/google/callback",
        params={"code": "ok-code", "state": state},
        follow_redirects=False,
    )
    assert resp.status_code == 307
    loc = resp.headers["location"]
    assert "#token=" in loc
    jwt_token = loc.split("#token=", 1)[1]

    me_resp = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {jwt_token}"})
    assert me_resp.status_code == 200
    assert me_resp.json()["email"] == email


def test_google_callback_new_user_redirects_to_onboarding_with_profile(monkeypatch: Any) -> None:
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "expected-client-id")
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_SECRET", "secret")
    new_email = f"new-google-{uuid.uuid4().hex[:8]}@example.com"
    state = create_access_token({"flow": "google_login", "redirect_to": settings.DASHBOARD_URL})

    monkeypatch.setattr(
        "api.app.routers.auth.httpx.AsyncClient",
        lambda **kwargs: _DummyAsyncClient(
            {"id_token": "valid-id-token"},
            {
                "aud": "expected-client-id",
                "iss": "https://accounts.google.com",
                "email": new_email,
                "name": "Jane Founder",
                "picture": "https://lh3.googleusercontent.com/a/avatar.png",
                "email_verified": "true",
            },
        ),
    )
    resp = client.get(
        "/api/v1/auth/google/callback",
        params={"code": "ok-code", "state": state},
        follow_redirects=False,
    )
    assert resp.status_code == 307
    loc = resp.headers["location"]
    assert "/onboarding?google_code=" in loc
    g_code = loc.split("google_code=", 1)[1]

    exch_resp = client.post("/api/v1/auth/google/onboarding-exchange", json={"code": g_code})
    assert exch_resp.status_code == 200
    exch_data = exch_resp.json()
    g_token = exch_data["google_token"]
    assert exch_data["email"] == new_email
    assert exch_data["name"] == "Jane Founder"
    assert exch_data["picture"] == "https://lh3.googleusercontent.com/a/avatar.png"

    sess_resp = client.get("/api/v1/auth/google/onboarding-session", params={"token": g_token})
    assert sess_resp.status_code == 200

    reg_resp = client.post(
        "/api/v1/auth/register",
        json={
            "business_name": "Jane Dental",
            "owner_name": "Jane Founder",
            "email": "spoofed@example.com",
            "google_token": g_token,
            "phone_number": f"+1512555{uuid.uuid4().int % 10000:04d}",
        },
    )
    assert reg_resp.status_code == 200
    assert reg_resp.json()["user"]["email"] == new_email
    assert reg_resp.json()["access_token"]


def test_google_onboarding_session_rejects_expired_token() -> None:
    expired = create_access_token(
        {
            "flow": "google_onboarding",
            "email": "expired@example.com",
            "email_verified": True,
        },
        expires_delta=timedelta(minutes=-1),
    )
    resp = client.get("/api/v1/auth/google/onboarding-session", params={"token": expired})
    assert resp.status_code == 401
