"""Streamable HTTP-style MCP endpoint backed by FastAPI JSON-RPC."""
from __future__ import annotations

import os
from json import JSONDecodeError
from typing import Any

from fastapi import APIRouter, Request
from pydantic import ValidationError
from starlette.responses import JSONResponse, Response

from src.api.auth import auth_required, local_dev_auto_login_enabled, local_dev_user, read_session_user
from src.jobs.store import SQLiteRunStore
from src.mcp.registry import (
    McpExecutionContext,
    call_tool,
    get_prompt,
    list_prompts,
    list_resources,
    list_tools,
    read_resource,
    validation_error_message,
)
from src.mcp.schemas import JsonRpcRequest, json_rpc_error, json_rpc_result
from src.services.errors import ServiceError

router = APIRouter()

PROTOCOL_VERSION = "2025-11-25"


@router.get("/.well-known/oauth-protected-resource")
async def oauth_protected_resource_metadata(request: Request) -> dict[str, Any]:
    base_url = _base_url(request)
    return {
        "resource": f"{base_url}/mcp",
        "resource_name": "KoreaSim MCP",
        "authorization_servers": [base_url],
        "scopes_supported": ["koresim:mcp"],
        "bearer_methods_supported": ["header", "cookie"],
        "koresim_login_url": f"{base_url}/api/auth/google/login?next=/app",
    }


@router.get("/mcp")
async def mcp_get(request: Request) -> Response:
    if _user_record(request) is None:
        return _unauthorized(request)
    return Response(status_code=405, headers={"Allow": "POST"})


@router.post("/mcp")
async def mcp_post(request: Request) -> Response:
    user = _user_record(request)
    if user is None:
        return _unauthorized(request)

    try:
        payload = await request.json()
    except (JSONDecodeError, ValueError):
        return JSONResponse(
            status_code=400,
            content=json_rpc_error(None, code=-32700, message="Parse error"),
        )

    ctx = McpExecutionContext(
        store=_store(request),
        user=user,
        enqueue_run=getattr(request.app.state, "enqueue_run", None),
        llm_client=getattr(request.app.state, "llm_client", None),
    )

    if isinstance(payload, list):
        responses = [_handle_json_rpc_payload(ctx, item) for item in payload]
        responses = [item for item in responses if item is not None]
        if not responses:
            return Response(status_code=202)
        return JSONResponse(content=responses)
    response = _handle_json_rpc_payload(ctx, payload)
    if response is None:
        return Response(status_code=202)
    return JSONResponse(content=response)


def _handle_json_rpc_payload(ctx: McpExecutionContext, payload: Any) -> dict[str, Any] | None:
    if not isinstance(payload, dict):
        return json_rpc_error(None, code=-32600, message="Invalid Request")
    is_notification = "id" not in payload
    try:
        request = JsonRpcRequest.model_validate(payload)
    except ValidationError as exc:
        return json_rpc_error(payload.get("id"), code=-32600, message=validation_error_message(exc))
    if is_notification:
        _handle_notification(request)
        return None
    try:
        return json_rpc_result(request.id, _handle_request(ctx, request))
    except KeyError as exc:
        return json_rpc_error(request.id, code=-32602, message=f"Unknown MCP item: {exc.args[0]}")
    except ValidationError as exc:
        return json_rpc_error(request.id, code=-32602, message=validation_error_message(exc))
    except ValueError as exc:
        return json_rpc_error(request.id, code=-32602, message=str(exc))
    except ServiceError as exc:
        return json_rpc_error(
            request.id,
            code=-32000,
            message=exc.message,
            data={"code": str(exc.code), **(exc.details or {})},
        )


def _handle_notification(request: JsonRpcRequest) -> None:
    if request.method in {"notifications/initialized", "notifications/cancelled"}:
        return
    return


def _handle_request(ctx: McpExecutionContext, request: JsonRpcRequest) -> dict[str, Any] | list[Any] | None:
    if request.method == "initialize":
        return {
            "protocolVersion": PROTOCOL_VERSION,
            "capabilities": {
                "tools": {},
                "resources": {},
                "prompts": {},
            },
            "serverInfo": {
                "name": "koresim-v2",
                "version": "0.1.0",
            },
            "instructions": "Authenticated KoreaSim project simulation server. Use resources for read-only context and tools for project runs, export, feedback, follow-up, and interview actions.",
        }
    if request.method == "ping":
        return {}
    if request.method == "tools/list":
        return {"tools": list_tools()}
    if request.method == "tools/call":
        name = str(request.params.get("name") or "")
        arguments = request.params.get("arguments")
        return call_tool(ctx, name, arguments if isinstance(arguments, dict) else {})
    if request.method == "resources/list":
        return {"resources": list_resources(ctx)}
    if request.method == "resources/read":
        uri = str(request.params.get("uri") or "")
        return read_resource(ctx, uri)
    if request.method == "prompts/list":
        return {"prompts": list_prompts()}
    if request.method == "prompts/get":
        name = str(request.params.get("name") or "")
        arguments = request.params.get("arguments")
        return get_prompt(name, arguments if isinstance(arguments, dict) else {})
    raise KeyError(request.method)


def _unauthorized(request: Request) -> JSONResponse:
    metadata_url = f"{_base_url(request)}/.well-known/oauth-protected-resource"
    return JSONResponse(
        status_code=401,
        content={
            "error": "AUTH_REQUIRED",
            "message": "Google login is required to use the KoreaSim MCP server.",
            "login_url": f"{_base_url(request)}/api/auth/google/login?next=/app",
        },
        headers={
            "WWW-Authenticate": (
                f'Bearer resource_metadata="{metadata_url}", scope="koresim:mcp"'
            )
        },
    )


def _user_record(request: Request):
    user = read_session_user(request)
    if user is None and auth_required() and local_dev_auto_login_enabled(request):
        user = local_dev_user()
    if user is None:
        return None
    return _store(request).upsert_user_from_auth(user, free_run_limit=_free_run_limit())


def _store(request: Request) -> SQLiteRunStore:
    return request.app.state.run_store


def _free_run_limit() -> int:
    raw_value = os.getenv("KORESIM_FREE_RUN_LIMIT", "5")
    try:
        return max(0, int(raw_value))
    except ValueError:
        return 5


def _base_url(request: Request) -> str:
    configured = os.getenv("KORESIM_AUTH_BASE_URL") or os.getenv("BETTER_AUTH_URL")
    if configured:
        return configured.rstrip("/")
    return str(request.base_url).rstrip("/")
