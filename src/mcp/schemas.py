"""Small JSON-RPC/MCP schema helpers used by the HTTP transport."""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class JsonRpcRequest(BaseModel):
    jsonrpc: str = "2.0"
    id: str | int | None = None
    method: str
    params: dict[str, Any] = Field(default_factory=dict)


class JsonRpcError(BaseModel):
    code: int
    message: str
    data: dict[str, Any] | None = None


class JsonRpcResponse(BaseModel):
    jsonrpc: str = "2.0"
    id: str | int | None = None
    result: dict[str, Any] | list[Any] | None = None
    error: JsonRpcError | None = None


def json_rpc_result(request_id: str | int | None, result: dict[str, Any] | list[Any] | None) -> dict[str, Any]:
    return JsonRpcResponse(id=request_id, result=result).model_dump(mode="json", exclude_none=True)


def json_rpc_error(
    request_id: str | int | None,
    *,
    code: int,
    message: str,
    data: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return JsonRpcResponse(
        id=request_id,
        error=JsonRpcError(code=code, message=message, data=data),
    ).model_dump(mode="json", exclude_none=True)
