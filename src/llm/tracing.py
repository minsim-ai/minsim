"""Optional Langfuse tracing around provider-agnostic LLM calls."""
from __future__ import annotations

import os
from dataclasses import replace
from time import perf_counter

from src.llm.base import LLMClientProtocol, LLMRequest, LLMResponse

SECRET_MARKERS = ("key", "token", "secret", "credential", "password")
REDACTED_METADATA_KEYS = {
    "persona",
    "personas",
    "persona_uuid",
    "uuid",
    "raw_results",
    "prompt",
    "system_prompt",
    "user_prompt",
    "messages",
}


def langfuse_enabled() -> bool:
    trace_mode = os.getenv("LLM_TRACE_MODE", "metadata_only")
    return (
        os.getenv("OBSERVABILITY_PROVIDER", "none") == "langfuse"
        and trace_mode != "off"
        and bool(os.getenv("LANGFUSE_PUBLIC_KEY"))
        and bool(os.getenv("LANGFUSE_SECRET_KEY"))
    )


def trace_mode() -> str:
    return os.getenv("LLM_TRACE_MODE", "metadata_only")


def sanitize_metadata(metadata: dict[str, object]) -> dict[str, object]:
    safe: dict[str, object] = {}
    for key, value in metadata.items():
        lowered = key.lower()
        if lowered in REDACTED_METADATA_KEYS:
            continue
        if any(marker in lowered for marker in SECRET_MARKERS):
            continue
        if isinstance(value, str | int | float | bool) or value is None:
            safe[key] = value
        elif isinstance(value, list):
            safe[key] = [
                item for item in value if isinstance(item, str | int | float | bool) or item is None
            ][:20]
        elif isinstance(value, dict):
            safe[key] = sanitize_metadata(value)
        else:
            safe[key] = str(type(value).__name__)
    return safe


def request_summary(request: LLMRequest) -> dict[str, object]:
    return {
        "task_type": request.task_type,
        "model_alias": request.model_alias,
        "temperature": request.temperature,
        "message_count": len(request.messages),
        "message_roles": [message.role for message in request.messages],
        "input_chars": sum(len(message.content) for message in request.messages),
    }


class TracingLLMClient(LLMClientProtocol):
    def __init__(self, wrapped: LLMClientProtocol) -> None:
        self.wrapped = wrapped

    async def generate(self, request: LLMRequest) -> LLMResponse:
        if not langfuse_enabled():
            return await self.wrapped.generate(request)

        from langfuse import get_client

        langfuse = get_client()
        metadata = {
            **request_summary(request),
            **sanitize_metadata(request.metadata),
            "trace_mode": trace_mode(),
        }
        with langfuse.start_as_current_observation(
            as_type="generation",
            name=f"koresim-{request.task_type}",
            model=request.model_alias,
            metadata=metadata,
            input=request_summary(request) if trace_mode() != "metadata_only" else None,
        ) as generation:
            started = perf_counter()
            try:
                response = await self.wrapped.generate(request)
            except Exception as exc:
                safe_status = (
                    type(exc).__name__
                    if trace_mode() == "metadata_only"
                    else str(exc)[:500]
                )
                generation.update(
                    level="ERROR",
                    status_message=safe_status,
                    metadata={**metadata, "error_type": type(exc).__name__},
                )
                raise

            latency_ms = response.metadata.get("latency_ms")
            if not isinstance(latency_ms, int | float):
                latency_ms = round((perf_counter() - started) * 1000, 1)
                response = replace(
                    response,
                    metadata={**response.metadata, "latency_ms": latency_ms},
                )
            output_summary = {
                "output_chars": len(response.content),
                "provider": response.provider,
                "provider_model": response.provider_model,
                "latency_ms": latency_ms,
            }
            response_metadata = sanitize_metadata(response.metadata)
            generation.update(
                model=response.provider_model,
                metadata={
                    **metadata,
                    **response_metadata,
                    "provider": response.provider,
                    "provider_model": response.provider_model,
                    "latency_ms": latency_ms,
                },
                output=output_summary if trace_mode() != "metadata_only" else None,
            )
            trace_id = langfuse.get_current_trace_id()
            return LLMResponse(
                content=response.content,
                provider=response.provider,
                provider_model=response.provider_model,
                trace_id=trace_id or response.trace_id,
                metadata={**response.metadata, "latency_ms": latency_ms},
            )

    async def close(self) -> None:
        close = getattr(self.wrapped, "close", None)
        if close:
            await close()
        if langfuse_enabled():
            from langfuse import get_client

            get_client().flush()


def with_tracing(client: LLMClientProtocol) -> LLMClientProtocol:
    return TracingLLMClient(client) if langfuse_enabled() else client
