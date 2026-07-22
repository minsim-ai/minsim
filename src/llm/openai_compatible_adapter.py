"""OpenAI-compatible LLM adapter for Upstage, Gemini, and gateway backends."""
from __future__ import annotations

from contextlib import suppress
from time import perf_counter

import httpx
from openai import APIConnectionError, AsyncOpenAI

from src.config import LLM_MAX_CONNECTIONS, LLM_SDK_MAX_RETRIES, LLM_TIMEOUT_SECONDS
from src.llm.base import LLMClientProtocol, LLMRequest, LLMResponse
from src.llm.rate_limiter import acquire_llm_slot


def model_allows_custom_temperature(model: str) -> bool:
    """Return whether the provider model accepts a non-default temperature.

    OpenAI GPT-5.5/5.6 family models currently reject custom temperature and
    only accept the default (1). Persona fanout models like gpt-5.4-nano/mini
    still accept temperature and keep the existing sampling behavior.
    """

    name = model.strip().lower()
    if name.startswith("gpt-5.6") or name.startswith("gpt-5.5"):
        return False
    return True


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
        self.base_url = base_url
        self.api_key = api_key
        self.use_request_model_alias = use_request_model_alias
        # App-level retry in BatchSimulator is the single retry authority for
        # persona fanout. Interactive paths still need one local reconnect for
        # stale keep-alive pools ("Event loop is closed" / connection drop).
        self.client = self._build_client()

    def _build_client(self) -> AsyncOpenAI:
        return AsyncOpenAI(
            base_url=self.base_url,
            api_key=self.api_key,
            max_retries=LLM_SDK_MAX_RETRIES,
            http_client=httpx.AsyncClient(
                limits=httpx.Limits(
                    max_connections=LLM_MAX_CONNECTIONS,
                    max_keepalive_connections=LLM_MAX_CONNECTIONS,
                ),
                timeout=httpx.Timeout(LLM_TIMEOUT_SECONDS + 10),
            ),
        )

    async def _reset_client(self) -> None:
        """Drop a broken httpx pool and open a fresh client."""

        old = self.client
        self.client = self._build_client()
        with suppress(Exception):
            await old.close()

    async def generate(self, request: LLMRequest) -> LLMResponse:
        provider_model = (
            request.model_alias if self.use_request_model_alias and request.model_alias else self.model
        )
        await acquire_llm_slot()
        started = perf_counter()
        try:
            response = await self._create_completion(request, provider_model)
        except APIConnectionError:
            # Stale keep-alive connections can raise "Event loop is closed" under
            # the connection-error wrapper. Rebuild once and retry.
            await self._reset_client()
            try:
                response = await self._create_completion(request, provider_model)
            except APIConnectionError as retry_exc:
                raise RuntimeError(f"{self.provider} connection failed.") from retry_exc

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

    async def _create_completion(self, request: LLMRequest, provider_model: str):
        kwargs: dict[str, object] = {
            "model": provider_model,
            "messages": [
                {"role": message.role, "content": message.content}
                for message in request.messages
                if message.role in {"system", "user", "assistant"}
            ],
        }
        if model_allows_custom_temperature(provider_model):
            kwargs["temperature"] = request.temperature
        if request.response_format:
            kwargs["response_format"] = request.response_format
        if request.extra_body:
            kwargs["extra_body"] = request.extra_body
        return await self.client.chat.completions.create(**kwargs)

    async def close(self) -> None:
        await self.client.close()
