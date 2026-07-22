"""App-level auth helpers for the React + FastAPI demo."""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
from datetime import UTC, datetime
from typing import Any
from urllib.parse import urlencode

import httpx
from fastapi import HTTPException, Request
from starlette.responses import RedirectResponse, Response

SESSION_COOKIE = "koresim_session"
OAUTH_STATE_COOKIE = "koresim_oauth_state"
SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7
STATE_MAX_AGE_SECONDS = 60 * 10


def auth_enabled() -> bool:
    return bool(_auth_secret() and _google_client_id() and _google_client_secret())


def auth_required() -> bool:
    configured = os.getenv("KORESIM_AUTH_REQUIRED")
    if configured is not None:
        return configured.lower() in {"1", "true", "yes"}
    return auth_enabled()


def test_login_enabled() -> bool:
    """Env flag only. Host gating is applied in test_login_allowed_for_request()."""
    return os.getenv("KORESIM_AUTH_TEST_LOGIN_ENABLED", "").lower() in {"1", "true", "yes"}


def test_login_allowed_for_request(request: Request) -> bool:
    """Test login is off by default and always blocked on the public demo apex.

    Even if KORESIM_AUTH_TEST_LOGIN_ENABLED=true is mis-set on arabesque.cc,
    the route stays disabled there so the E2E bypass cannot be used live.
    Staging/test hosts may enable the flag; production apex never can.
    """
    if not test_login_enabled():
        return False
    host = (request.url.hostname or "").lower()
    blocked = {
        item.strip().lower()
        for item in os.getenv(
            "KORESIM_AUTH_TEST_LOGIN_BLOCKED_HOSTS",
            "arabesque.cc,www.arabesque.cc",
        ).split(",")
        if item.strip()
    }
    if host in blocked:
        return False
    return True


def local_dev_auto_login_enabled(request: Request) -> bool:
    configured = os.getenv("KORESIM_AUTH_LOCAL_DEV_AUTO_LOGIN")
    enabled = configured.lower() in {"1", "true", "yes"} if configured is not None else True
    return enabled and _is_local_dev_host(request.url.hostname)


def local_dev_user() -> dict[str, Any]:
    return {
        "id": "local-dev-user",
        "email": os.getenv("KORESIM_AUTH_LOCAL_DEV_EMAIL", "local-dev@arabesque.test"),
        "name": os.getenv("KORESIM_AUTH_LOCAL_DEV_NAME", "Local Dev User"),
        "picture": None,
        "provider": "local_dev",
    }


def session_summary(request: Request) -> dict[str, Any]:
    user = read_session_user(request)
    if user is None and auth_required() and local_dev_auto_login_enabled(request):
        user = local_dev_user()
    # Never advertise test-login availability on the public demo host.
    test_enabled = test_login_allowed_for_request(request)
    return {
        "authenticated": user is not None,
        "user": user,
        "provider": user.get("provider") if user else None,
        "auth_enabled": auth_enabled(),
        "auth_required": auth_required(),
        "test_login_enabled": test_enabled,
        "login_url": "/api/auth/google/login",
        "logout_url": "/api/auth/logout",
    }


def read_session_user(request: Request) -> dict[str, Any] | None:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        return None
    return _loads_signed(token, purpose="session", max_age_seconds=SESSION_MAX_AGE_SECONDS)


def build_test_login_response(
    next_url: str = "/app",
    *,
    request: Request | None = None,
) -> RedirectResponse:
    if request is not None:
        allowed = test_login_allowed_for_request(request)
    else:
        allowed = test_login_enabled()
    if not allowed:
        raise HTTPException(status_code=404, detail="Test login is disabled.")
    user = {
        "id": "test-user",
        "email": os.getenv("KORESIM_AUTH_TEST_EMAIL", "test@example.com"),
        "name": os.getenv("KORESIM_AUTH_TEST_NAME", "Arabesque Test User"),
        "picture": None,
        "provider": "test",
    }
    response = RedirectResponse(url=_safe_next(next_url), status_code=303)
    _set_session_cookie(response, user)
    return response


def set_local_dev_session_cookie(response: Response) -> None:
    _set_session_cookie(response, local_dev_user())


def build_google_login_response(request: Request, next_url: str = "/app") -> RedirectResponse:
    client_id = _google_client_id()
    if not auth_enabled() or not client_id:
        raise HTTPException(
            status_code=503,
            detail={
                "code": "AUTH_NOT_CONFIGURED",
                "message": "Google login is not configured for this environment.",
            },
        )
    redirect_uri = _redirect_uri(request)
    state = _dumps_signed(
        {
            "nonce": base64.urlsafe_b64encode(os.urandom(18)).decode("ascii"),
            "next": _safe_next(next_url),
        },
        purpose="oauth_state",
    )
    params = urlencode(
        {
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": "openid email profile",
            "state": state,
            "access_type": "offline",
            "prompt": "select_account",
        }
    )
    response = RedirectResponse(
        url=f"https://accounts.google.com/o/oauth2/v2/auth?{params}",
        status_code=303,
    )
    response.set_cookie(
        OAUTH_STATE_COOKIE,
        state,
        max_age=STATE_MAX_AGE_SECONDS,
        httponly=True,
        secure=_secure_cookies(),
        samesite="lax",
    )
    return response


async def build_google_callback_response(request: Request) -> RedirectResponse:
    error = request.query_params.get("error")
    if error:
        return RedirectResponse(url=f"/app?auth_error={error}", status_code=303)

    code = request.query_params.get("code")
    state = request.query_params.get("state")
    expected_state = request.cookies.get(OAUTH_STATE_COOKIE)
    state_payload = _loads_signed(state or "", purpose="oauth_state", max_age_seconds=STATE_MAX_AGE_SECONDS)
    if not code or not state or not expected_state or not hmac.compare_digest(state, expected_state):
        raise HTTPException(status_code=400, detail="Invalid OAuth callback state.")
    if not state_payload:
        raise HTTPException(status_code=400, detail="Expired OAuth callback state.")

    token = await _exchange_google_code(request, code)
    userinfo = await _fetch_google_userinfo(token["access_token"])
    user = {
        "id": userinfo.get("sub") or userinfo.get("email"),
        "email": userinfo.get("email"),
        "name": userinfo.get("name") or userinfo.get("email"),
        "picture": userinfo.get("picture"),
        "provider": "google",
    }
    if not user["email"]:
        raise HTTPException(status_code=400, detail="Google account did not return an email.")

    response = RedirectResponse(url=_safe_next(str(state_payload.get("next") or "/app")), status_code=303)
    _set_session_cookie(response, user)
    response.delete_cookie(OAUTH_STATE_COOKIE)
    return response


def build_logout_response(next_url: str = "/") -> RedirectResponse:
    response = RedirectResponse(url=_safe_next(next_url), status_code=303)
    response.delete_cookie(SESSION_COOKIE)
    return response


def _set_session_cookie(response: Response, user: dict[str, Any]) -> None:
    response.set_cookie(
        SESSION_COOKIE,
        _dumps_signed(user, purpose="session"),
        max_age=SESSION_MAX_AGE_SECONDS,
        httponly=True,
        secure=_secure_cookies(),
        samesite="lax",
    )


async def _exchange_google_code(request: Request, code: str) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": _google_client_id(),
                "client_secret": _google_client_secret(),
                "redirect_uri": _redirect_uri(request),
                "grant_type": "authorization_code",
            },
        )
    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail="Google token exchange failed.")
    return response.json()


async def _fetch_google_userinfo(access_token: str) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.get(
            "https://openidconnect.googleapis.com/v1/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
        )
    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail="Google userinfo request failed.")
    return response.json()


def _redirect_uri(request: Request) -> str:
    base_url = os.getenv("KORESIM_AUTH_BASE_URL") or os.getenv("BETTER_AUTH_URL")
    if base_url:
        return f"{base_url.rstrip('/')}/api/auth/google/callback"
    return str(request.url_for("auth_google_callback"))


def _safe_next(value: str) -> str:
    if not value.startswith("/") or value.startswith("//"):
        return "/app"
    return value


def _dumps_signed(payload: dict[str, Any], *, purpose: str) -> str:
    now = int(datetime.now(UTC).timestamp())
    body = {"iat": now, "exp": now + _max_age_for_purpose(purpose), **payload}
    encoded = _b64(json.dumps(body, ensure_ascii=False, sort_keys=True).encode("utf-8"))
    signature = _sign(encoded, purpose=purpose)
    return f"{encoded}.{signature}"


def _loads_signed(token: str, *, purpose: str, max_age_seconds: int) -> dict[str, Any] | None:
    try:
        encoded, signature = token.split(".", 1)
    except ValueError:
        return None
    expected = _sign(encoded, purpose=purpose)
    if not hmac.compare_digest(signature, expected):
        return None
    try:
        payload = json.loads(_unb64(encoded))
    except (ValueError, json.JSONDecodeError):
        return None
    now = int(datetime.now(UTC).timestamp())
    if int(payload.get("exp", 0)) < now:
        return None
    if now - int(payload.get("iat", 0)) > max_age_seconds:
        return None
    return {key: value for key, value in payload.items() if key not in {"iat", "exp"}}


def _sign(encoded: str, *, purpose: str) -> str:
    secret = _auth_secret()
    if not secret:
        raise HTTPException(status_code=503, detail="Auth session secret is not configured.")
    return hmac.new(
        secret.encode("utf-8"),
        f"{purpose}.{encoded}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def _b64(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _unb64(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def _auth_secret() -> str:
    return os.getenv("KORESIM_AUTH_SECRET") or os.getenv("BETTER_AUTH_SECRET", "")


def _google_client_id() -> str:
    return os.getenv("GOOGLE_OAUTH_CLIENT_ID") or os.getenv("GOOGLE_CLIENT_ID", "")


def _google_client_secret() -> str:
    return os.getenv("GOOGLE_OAUTH_CLIENT_SECRET") or os.getenv("GOOGLE_CLIENT_SECRET", "")


def _secure_cookies() -> bool:
    return os.getenv("KORESIM_AUTH_COOKIE_SECURE", "true").lower() not in {"0", "false", "no"}


def _is_local_dev_host(hostname: str | None) -> bool:
    return hostname in {"localhost", "127.0.0.1", "::1"}


def _max_age_for_purpose(purpose: str) -> int:
    if purpose == "oauth_state":
        return STATE_MAX_AGE_SECONDS
    return SESSION_MAX_AGE_SECONDS
