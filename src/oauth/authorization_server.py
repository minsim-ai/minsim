"""OAuth 2.1 authorization server routes for remote MCP hosts."""

from __future__ import annotations

import html
import os
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import parse_qs, urlencode

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse

from src.api.auth import (
    auth_required,
    local_dev_auto_login_enabled,
    local_dev_user,
    read_session_user,
)
from src.jobs.store import SQLiteRunStore
from src.oauth.constants import (
    ACCESS_TOKEN_TTL_SECONDS,
    AUTH_CODE_TTL_SECONDS,
    MCP_SCOPE,
    MCP_TOOL_SUMMARIES,
    REFRESH_TOKEN_TTL_SECONDS,
)

router = APIRouter()


@router.get("/.well-known/oauth-authorization-server")
async def oauth_authorization_server_metadata(request: Request) -> dict[str, Any]:
    base = _base_url(request)
    return {
        "issuer": base,
        "authorization_endpoint": f"{base}/oauth/authorize",
        "token_endpoint": f"{base}/oauth/token",
        "registration_endpoint": f"{base}/oauth/register",
        "scopes_supported": [MCP_SCOPE],
        "response_types_supported": ["code"],
        "grant_types_supported": ["authorization_code", "refresh_token"],
        "code_challenge_methods_supported": ["S256"],
        "token_endpoint_auth_methods_supported": ["none"],
        "resource_indicators_supported": True,
    }


@router.post("/oauth/register")
async def oauth_register(request: Request) -> JSONResponse:
    try:
        payload = await request.json()
    except Exception:
        return _oauth_error(400, "invalid_request", "Request body must be JSON.")
    if not isinstance(payload, dict):
        return _oauth_error(400, "invalid_request", "Request body must be a JSON object.")

    redirect_uris = payload.get("redirect_uris")
    if not isinstance(redirect_uris, list) or not redirect_uris:
        return _oauth_error(400, "invalid_client_metadata", "redirect_uris is required.")
    clean_uris: list[str] = []
    for uri in redirect_uris:
        if not isinstance(uri, str) or not uri.strip():
            return _oauth_error(400, "invalid_client_metadata", "redirect_uris must be strings.")
        clean_uris.append(uri.strip())

    client_name = str(payload.get("client_name") or "MCP Client").strip()[:120] or "MCP Client"
    auth_method = str(payload.get("token_endpoint_auth_method") or "none")
    if auth_method != "none":
        return _oauth_error(
            400,
            "invalid_client_metadata",
            "Only public clients with token_endpoint_auth_method=none are supported.",
        )

    client_id = f"mcp_{secrets.token_urlsafe(18)}"
    store = _store(request)
    client = store.upsert_oauth_client(
        client_id=client_id,
        client_name=client_name,
        redirect_uris=clean_uris,
        grant_types=["authorization_code", "refresh_token"],
        token_endpoint_auth_method="none",
        is_dynamic=True,
    )
    return JSONResponse(
        status_code=201,
        content={
            "client_id": client["client_id"],
            "client_name": client["client_name"],
            "redirect_uris": client["redirect_uris"],
            "grant_types": client["grant_types"],
            "token_endpoint_auth_method": client["token_endpoint_auth_method"],
            "response_types": ["code"],
            "client_id_issued_at": int(datetime.now(UTC).timestamp()),
        },
    )


@router.get("/oauth/authorize", response_model=None)
async def oauth_authorize(
    request: Request,
    response_type: str | None = None,
    client_id: str | None = None,
    redirect_uri: str | None = None,
    scope: str | None = None,
    state: str | None = None,
    code_challenge: str | None = None,
    code_challenge_method: str | None = None,
    resource: str | None = None,
) -> HTMLResponse | RedirectResponse | JSONResponse:
    store = _store(request)
    if response_type != "code":
        return _oauth_error(400, "unsupported_response_type", "Only response_type=code is supported.")
    if not client_id or not redirect_uri or not code_challenge:
        return _oauth_error(400, "invalid_request", "client_id, redirect_uri, and code_challenge are required.")
    if (code_challenge_method or "S256") != "S256":
        return _oauth_error(400, "invalid_request", "Only code_challenge_method=S256 is supported.")

    client = store.get_oauth_client(client_id)
    if client is None:
        return _oauth_error(400, "invalid_client", "Unknown client_id. Register via /oauth/register first.")
    if redirect_uri not in client["redirect_uris"]:
        return _oauth_error(400, "invalid_request", "redirect_uri is not registered for this client.")

    requested_scope = (scope or MCP_SCOPE).strip() or MCP_SCOPE
    if requested_scope != MCP_SCOPE and MCP_SCOPE not in requested_scope.split():
        return _oauth_error(400, "invalid_scope", f"Supported scope is {MCP_SCOPE}.")
    requested_scope = MCP_SCOPE

    expected_resource = f"{_base_url(request)}/mcp"
    resource_value = (resource or expected_resource).rstrip("/")
    if resource_value != expected_resource:
        return _oauth_error(400, "invalid_target", f"resource must be {expected_resource}.")

    user = _session_user(request)
    if user is None:
        next_url = request.url.path
        if request.url.query:
            next_url = f"{next_url}?{request.url.query}"
        return RedirectResponse(
            url=f"/api/auth/google/login?{urlencode({'next': next_url})}",
            status_code=303,
        )

    user_record = store.upsert_user_from_auth(user, free_run_limit=_free_run_limit())
    client_name = html.escape(str(client["client_name"]))
    email = html.escape(user_record.email)
    safe_state = html.escape(state or "")
    safe_redirect = html.escape(redirect_uri)
    safe_resource = html.escape(resource_value)
    safe_challenge = html.escape(code_challenge)
    safe_client = html.escape(client_id)

    body = f"""<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>KoreaSim MCP 연결 승인</title>
  <style>
    body {{ font-family: system-ui, sans-serif; background: #f6f7f9; color: #111; margin: 0; padding: 32px 16px; }}
    .card {{ max-width: 480px; margin: 0 auto; background: #fff; border: 1px solid #e5e7eb; border-radius: 16px; padding: 24px; }}
    h1 {{ font-size: 1.25rem; margin: 0 0 8px; }}
    p {{ line-height: 1.5; color: #4b5563; }}
    .meta {{ font-size: 0.875rem; background: #f9fafb; border-radius: 10px; padding: 12px; margin: 16px 0; }}
    .actions {{ display: flex; gap: 10px; margin-top: 20px; }}
    button {{ border-radius: 999px; border: 0; padding: 10px 16px; font-weight: 600; cursor: pointer; }}
    .approve {{ background: #0066ff; color: #fff; }}
    .deny {{ background: #e5e7eb; color: #111; }}
  </style>
</head>
<body>
  <div class="card">
    <h1>MCP 호스트 연결 승인</h1>
    <p><strong>{client_name}</strong>이(가) KoreaSim 프로젝트와 시뮬레이션 도구에 접근하려고 합니다.</p>
    <div class="meta">
      <div>계정: {email}</div>
      <div>범위: {MCP_SCOPE}</div>
      <div>리소스: {safe_resource}</div>
    </div>
    <p>승인하면 Cursor/Claude Desktop 같은 호스트가 내 프로젝트 조회·실행·피드백 도구를 사용할 수 있습니다. 웹 실행 쿼터와 동일하게 적용됩니다.</p>
    <form method="post" action="/oauth/authorize/consent" class="actions">
      <input type="hidden" name="client_id" value="{safe_client}"/>
      <input type="hidden" name="redirect_uri" value="{safe_redirect}"/>
      <input type="hidden" name="scope" value="{MCP_SCOPE}"/>
      <input type="hidden" name="state" value="{safe_state}"/>
      <input type="hidden" name="code_challenge" value="{safe_challenge}"/>
      <input type="hidden" name="code_challenge_method" value="S256"/>
      <input type="hidden" name="resource" value="{safe_resource}"/>
      <button class="approve" name="decision" value="approve" type="submit">승인</button>
      <button class="deny" name="decision" value="deny" type="submit">거부</button>
    </form>
  </div>
</body>
</html>"""
    return HTMLResponse(content=body)


@router.post("/oauth/authorize/consent", response_model=None)
async def oauth_authorize_consent(request: Request) -> RedirectResponse | JSONResponse:
    form = await _read_form(request)
    client_id = form.get("client_id", "")
    redirect_uri = form.get("redirect_uri", "")
    state = form.get("state", "")
    code_challenge = form.get("code_challenge", "")
    code_challenge_method = form.get("code_challenge_method", "S256")
    resource = form.get("resource", "")
    decision = form.get("decision", "")

    store = _store(request)
    client = store.get_oauth_client(client_id)
    if client is None or redirect_uri not in client["redirect_uris"]:
        return _oauth_error(400, "invalid_request", "Invalid client or redirect_uri.")
    if not code_challenge:
        return _oauth_error(400, "invalid_request", "code_challenge is required.")
    if code_challenge_method != "S256":
        return _oauth_error(400, "invalid_request", "Only S256 PKCE is supported.")

    expected_resource = f"{_base_url(request)}/mcp"
    if resource.rstrip("/") != expected_resource:
        return _oauth_error(400, "invalid_target", f"resource must be {expected_resource}.")

    params: dict[str, str] = {}
    if state:
        params["state"] = state

    if decision != "approve":
        params["error"] = "access_denied"
        return RedirectResponse(url=_append_query(redirect_uri, params), status_code=303)

    user = _session_user(request)
    if user is None:
        return _oauth_error(401, "login_required", "Google login is required before consent.")

    user_record = store.upsert_user_from_auth(user, free_run_limit=_free_run_limit())
    grant = store.create_oauth_grant(
        user_id=user_record.user_id,
        client_id=client_id,
        client_name=str(client["client_name"]),
        scope=MCP_SCOPE,
        resource=expected_resource,
    )
    code = secrets.token_urlsafe(32)
    expires_at = (datetime.now(UTC) + timedelta(seconds=AUTH_CODE_TTL_SECONDS)).isoformat()
    store.create_oauth_auth_code(
        code=code,
        client_id=client_id,
        user_id=user_record.user_id,
        grant_id=grant["grant_id"],
        redirect_uri=redirect_uri,
        scope=MCP_SCOPE,
        resource=expected_resource,
        code_challenge=code_challenge,
        code_challenge_method="S256",
        expires_at=expires_at,
    )
    params["code"] = code
    return RedirectResponse(url=_append_query(redirect_uri, params), status_code=303)


@router.post("/oauth/token")
async def oauth_token(request: Request) -> JSONResponse:
    content_type = request.headers.get("content-type", "")
    if "application/x-www-form-urlencoded" in content_type:
        payload = await _read_form(request)
    else:
        try:
            body = await request.json()
        except Exception:
            return _oauth_error(400, "invalid_request", "Unsupported token request body.")
        if not isinstance(body, dict):
            return _oauth_error(400, "invalid_request", "Token request must be an object.")
        payload = {str(key): str(value) for key, value in body.items()}

    grant_type = payload.get("grant_type")
    store = _store(request)
    if grant_type == "authorization_code":
        return _issue_from_code(store, request, payload)
    if grant_type == "refresh_token":
        return _issue_from_refresh(store, request, payload)
    return _oauth_error(400, "unsupported_grant_type", "Supported grants: authorization_code, refresh_token.")


def mcp_connect_payload(request: Request, *, user_id: str | None) -> dict[str, Any]:
    base = _base_url(request)
    resource = f"{base}/mcp"
    grants = _store(request).list_oauth_grants(user_id) if user_id else []
    cursor_config = {
        "mcpServers": {
            "koresim": {
                "url": resource,
            }
        }
    }
    claude_config = {
        "mcpServers": {
            "koresim": {
                "type": "http",
                "url": resource,
            }
        }
    }
    return {
        "oauth_ready": True,
        "resource": resource,
        "issuer": base,
        "authorization_endpoint": f"{base}/oauth/authorize",
        "token_endpoint": f"{base}/oauth/token",
        "registration_endpoint": f"{base}/oauth/register",
        "protected_resource_metadata_url": f"{base}/.well-known/oauth-protected-resource",
        "authorization_server_metadata_url": f"{base}/.well-known/oauth-authorization-server",
        "scopes": [MCP_SCOPE],
        "tools": MCP_TOOL_SUMMARIES,
        "grants": grants,
        "configs": {
            "cursor": cursor_config,
            "claude_desktop": claude_config,
        },
        "notes": [
            "Cursor/Claude Desktop will open a browser OAuth consent flow.",
            "Do not paste browser session cookies into MCP host config.",
            "Run quota is shared with the web app.",
            "Export tools never return raw persona responses.",
        ],
    }


def _issue_from_code(store: SQLiteRunStore, request: Request, payload: dict[str, str]) -> JSONResponse:
    code = payload.get("code")
    client_id = payload.get("client_id")
    redirect_uri = payload.get("redirect_uri")
    code_verifier = payload.get("code_verifier")
    if not code or not client_id or not redirect_uri or not code_verifier:
        return _oauth_error(
            400,
            "invalid_request",
            "code, client_id, redirect_uri, and code_verifier are required.",
        )
    client = store.get_oauth_client(client_id)
    if client is None:
        return _oauth_error(400, "invalid_client", "Unknown client_id.")
    consumed = store.consume_oauth_auth_code(
        code=code,
        client_id=client_id,
        redirect_uri=redirect_uri,
        code_verifier=code_verifier,
    )
    if consumed is None:
        return _oauth_error(400, "invalid_grant", "Authorization code is invalid or expired.")
    return _token_response(
        store,
        client_id=client_id,
        user_id=str(consumed["user_id"]),
        grant_id=str(consumed["grant_id"]),
        scope=str(consumed["scope"]),
        resource=str(consumed["resource"]),
    )


def _issue_from_refresh(store: SQLiteRunStore, request: Request, payload: dict[str, str]) -> JSONResponse:
    refresh_token = payload.get("refresh_token")
    client_id = payload.get("client_id")
    if not refresh_token or not client_id:
        return _oauth_error(400, "invalid_request", "refresh_token and client_id are required.")
    access_token = secrets.token_urlsafe(32)
    new_refresh = secrets.token_urlsafe(32)
    access_expires = (datetime.now(UTC) + timedelta(seconds=ACCESS_TOKEN_TTL_SECONDS)).isoformat()
    refresh_expires = (datetime.now(UTC) + timedelta(seconds=REFRESH_TOKEN_TTL_SECONDS)).isoformat()
    rotated = store.rotate_oauth_refresh_token(
        refresh_token=refresh_token,
        client_id=client_id,
        new_access_token=access_token,
        new_refresh_token=new_refresh,
        access_expires_at=access_expires,
        refresh_expires_at=refresh_expires,
    )
    if rotated is None:
        return _oauth_error(400, "invalid_grant", "Refresh token is invalid or revoked.")
    return JSONResponse(
        {
            "access_token": access_token,
            "token_type": "Bearer",
            "expires_in": ACCESS_TOKEN_TTL_SECONDS,
            "refresh_token": new_refresh,
            "scope": rotated["scope"],
            "resource": rotated["resource"],
        }
    )


def _token_response(
    store: SQLiteRunStore,
    *,
    client_id: str,
    user_id: str,
    grant_id: str,
    scope: str,
    resource: str,
) -> JSONResponse:
    access_token = secrets.token_urlsafe(32)
    refresh_token = secrets.token_urlsafe(32)
    access_expires = (datetime.now(UTC) + timedelta(seconds=ACCESS_TOKEN_TTL_SECONDS)).isoformat()
    refresh_expires = (datetime.now(UTC) + timedelta(seconds=REFRESH_TOKEN_TTL_SECONDS)).isoformat()
    store.issue_oauth_token_pair(
        client_id=client_id,
        user_id=user_id,
        grant_id=grant_id,
        scope=scope,
        resource=resource,
        access_token=access_token,
        refresh_token=refresh_token,
        access_expires_at=access_expires,
        refresh_expires_at=refresh_expires,
    )
    return JSONResponse(
        {
            "access_token": access_token,
            "token_type": "Bearer",
            "expires_in": ACCESS_TOKEN_TTL_SECONDS,
            "refresh_token": refresh_token,
            "scope": scope,
            "resource": resource,
        }
    )


def _session_user(request: Request) -> dict[str, Any] | None:
    user = read_session_user(request)
    if user is None and auth_required() and local_dev_auto_login_enabled(request):
        return local_dev_user()
    return user


def _store(request: Request) -> SQLiteRunStore:
    return request.app.state.run_store


def _base_url(request: Request) -> str:
    configured = os.getenv("KORESIM_AUTH_BASE_URL") or os.getenv("BETTER_AUTH_URL")
    if configured:
        return configured.rstrip("/")
    return str(request.base_url).rstrip("/")


def _free_run_limit() -> int:
    # Prefer live config so import-time and env defaults stay aligned (0 = unlimited).
    try:
        from src.config import KORESIM_FREE_RUN_LIMIT

        return max(0, int(KORESIM_FREE_RUN_LIMIT))
    except Exception:
        raw_value = os.getenv("KORESIM_FREE_RUN_LIMIT", "0")
        try:
            return max(0, int(raw_value))
        except ValueError:
            return 0


def _append_query(url: str, params: dict[str, str]) -> str:
    if not params:
        return url
    separator = "&" if "?" in url else "?"
    return f"{url}{separator}{urlencode(params)}"


def _oauth_error(status_code: int, error: str, description: str) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"error": error, "error_description": description},
    )


async def _read_form(request: Request) -> dict[str, str]:
    raw = (await request.body()).decode("utf-8")
    parsed = parse_qs(raw, keep_blank_values=True)
    return {key: values[-1] if values else "" for key, values in parsed.items()}
