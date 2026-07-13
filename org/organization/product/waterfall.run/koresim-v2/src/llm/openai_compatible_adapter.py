"""OpenAI-compatible LLM adapter for Upstage, Gemini, and gateway backends."""
from __future__ import annotations

from time import perf_counter

from openai import APIConnectionError, AsyncOpenAI

from src.llm.base import LLMClientProtocol, LLMRequest, LLMResponse


class OpenAICompatibleAdapter(LLMClientProtocol):
    def __init__(
        self,
        *,
        provider: str,
        model: str,
        base_url: str,
        api_key: str,
        use_request_model_alias: bool = False,
    ) -> None:
        if not api_key:
            raise RuntimeError(f"{provider} API key is not configured.")
        self.provider = provider
        self.model = model
        self.use_request_model_alias = use_request_model_alias
        self.client = AsyncOpenAI(base_url=base_url, api_key=api_key)

    async def generate(self, request: LLMRequest) -> LLMResponse:
        provider_model = (
            request.model_alias if self.use_request_model_alias and request.model_alias else self.model
        )
        started = perf_counter()
        try:
            response = await self.client.chat.completions.create(
                model=provider_model,
                messages=[
                    {"role": message.role, "content": message.content}
                    for message in request.messages
                    if message.role in {"system", "user", "assistant"}
                ],
                temperature=request.temperature,
            )
        except APIConnectionError as exc:
            raise RuntimeError(f"{self.provider} connection failed.") from exc

        latency_ms = round((perf_counter() - started) * 1000, 1)
        usage = getattr(response, "usage", None)
        usage_metadata = {
            "input_tokens": getattr(usage, "prompt_tokens", None),
            "output_tokens": getattr(usage, "completion_tokens", None),
            "total_tokens": getattr(usage, "total_tokens", None),
        }

        return LLMResponse(
            content=response.choices[0].message.content or "",
            provider=self.provider,
            provider_model=provider_model,
            trace_id=None,
            metadata={
                **request.metadata,
                "task_type": request.task_type,
                "model_alias": request.model_alias,
                "latency_ms": latency_ms,
                **{key: value for key, value in usage_metadata.items() if value is not None},
            },
        )

    async def close(self) -> None:
        await self.client.close()
