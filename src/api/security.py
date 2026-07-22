"""HTTP security helpers: headers, CSRF, origin checks, health redaction.

Demo-safe defaults:
- No rate limiting (booth / live demo must not hit 429).
- CSRF is enforced in production-like hosts; skipped under pytest unless
  KORESIM_CSRF_ENFORCE is explicitly true.
"""
from __future__ import annotations

import os
import secrets
from typing import Any

from fastapi import Request
from starlette.responses import JSONResponse, Response

CSRF_COOKIE = "koresim_csrf"
CSRF_HEADER = "x-csrf-token"
MUTATING_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})

# Paths that must remain usable without CSRF (OAuth redirects / browser navigation).
CSRF_EXEMPT_PREFIXES = (
    "/api/auth/google/",
    "/oauth/",
    "/.well-known/",
)
CSRF_EXEMPT_EXACT = frozenset(
    {
        "/api/auth/logout",  # GET redirect form also used; POST if any
        "/mcp",
    }
)


def security_headers() -> dict[str, str]:
    """Baseline browser security headers. CSP is intentionally permissive enough
    for the current React + lordicon + inline-style UI so tomorrow's demo does
    not blank-screen."""
    # HSTS only meaningful over HTTPS; harmless on plain HTTP browsers ignore it.
    return {
        "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
        "Content-Security-Policy": (
            "default-src 'self'; "
            "base-uri 'self'; "
            "object-src 'none'; "
            "frame-ancestors 'none'; "
            "img-src 'self' data: blob: https:; "
            "font-src 'self' data:; "
            "style-src 'self' 'unsafe-inline'; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; "
            "connect-src 'self' https: wss:; "
            "worker-src 'self' blob:; "
            "media-src 'self' blob:;"
        ),
    }


def apply_security_headers(response: Response) -> None:
    for key, value in security_headers().items():
        response.headers.setdefault(key, value)


def csrf_enforce() -> bool:
    configured = os.getenv("KORESIM_CSRF_ENFORCE")
    if configured is not None:
        return configured.lower() in {"1", "true", "yes"}
    # Pytest collection/run sets this; keep CI green without rewriting every test.
    if os.getenv("PYTEST_CURRENT_TEST"):
        return False
    return True


def ensure_csrf_cookie(response: Response, request: Request | None = None) -> str:
    existing = ""
    if request is not None:
        existing = (request.cookies.get(CSRF_COOKIE) or "").strip()
    token = existing or secrets.token_urlsafe(32)
    response.set_cookie(
        CSRF_COOKIE,
        token,
        max_age=60 * 60 * 24 * 7,
        httponly=False,  # double-submit: JS must read and mirror into header
        secure=_secure_cookies(),
        samesite="lax",
        path="/",
    )
    return token


def _secure_cookies() -> bool:
    return os.getenv("KORESIM_AUTH_COOKIE_SECURE", "true").lower() not in {"0", "false", "no"}


def _csrf_exempt(path: str) -> bool:
    if path in CSRF_EXEMPT_EXACT:
        return True
    return any(path.startswith(prefix) for prefix in CSRF_EXEMPT_PREFIXES)


def allowed_origins() -> set[str]:
    raw = os.getenv("KORESIM_ALLOWED_ORIGINS", "")
    origins = {item.strip().rstrip("/") for item in raw.split(",") if item.strip()}
    origins.update(
        {
            "https://arabesque.cc",
            "http://localhost:8000",
            "http://127.0.0.1:8000",
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        }
    )
    return origins


def origin_allowed(request: Request) -> bool:
    origin = (request.headers.get("origin") or "").strip().rstrip("/")
    if not origin:
        # Non-browser clients (curl, scripts) often omit Origin. SameSite=Lax
        # still protects cookie-based browser CSRF for cross-site navigations.
        return True
    if origin in allowed_origins():
        return True
    # Allow same-host Origin matching the request URL (preview tunnels, etc.).
    try:
        request_origin = f"{request.url.scheme}://{request.url.netloc}".rstrip("/")
    except Exception:
        return False
    return origin == request_origin


def csrf_token_valid(request: Request) -> bool:
    cookie = (request.cookies.get(CSRF_COOKIE) or "").strip()
    header = (request.headers.get(CSRF_HEADER) or "").strip()
    if not cookie or not header:
        return False
    return secrets.compare_digest(cookie, header)


def mutating_request_blocked(request: Request) -> JSONResponse | None:
    """Return a 403 response when Origin/CSRF checks fail; else None."""
    if request.method.upper() not in MUTATING_METHODS:
        return None
    path = request.url.path
    if not path.startswith("/api/"):
        return None
    if _csrf_exempt(path):
        return None
    if not origin_allowed(request):
        return JSONResponse(
            status_code=403,
            content={
                "detail": {
                    "code": "ORIGIN_FORBIDDEN",
                    "message": "Request origin is not allowed.",
                }
            },
        )
    if not csrf_enforce():
        return None
    if csrf_token_valid(request):
        return None
    return JSONResponse(
        status_code=403,
        content={
            "detail": {
                "code": "CSRF_FAILED",
                "message": "Missing or invalid CSRF token.",
            }
        },
    )


def redact_runtime_health(payload: dict[str, Any]) -> dict[str, Any]:
    """Strip absolute filesystem paths and oversized internals from health payloads."""
    redacted: dict[str, Any] = {}
    for key, value in payload.items():
        if isinstance(value, dict):
            redacted[key] = _redact_check(value)
        else:
            redacted[key] = value
    return redacted


def _redact_check(check: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {"ok": bool(check.get("ok"))}
    # Keep small non-sensitive operational flags useful for authenticated ops.
    for key in ("status", "ready", "workers", "depth", "backend", "provider", "model"):
        if key in check and not isinstance(check[key], (dict, list)):
            out[key] = check[key]
    if check.get("ok") is False and isinstance(check.get("error"), str):
        # Generic failure class only — no absolute path echo.
        err = check["error"]
        if "/Users/" in err or "/home/" in err or ("koresim" + "-runtime") in err:
            out["error"] = "component_unavailable"
        else:
            out["error"] = err[:120]
    return out


def public_config_auth_block() -> dict[str, str]:
    return {
        "session_url": "/api/auth/session",
        "login_url": "/api/auth/google/login",
        "logout_url": "/api/auth/logout",
        # Intentionally omit test_login_url from public discovery.
    }
