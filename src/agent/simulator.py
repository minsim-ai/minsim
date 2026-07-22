"""비동기 배치 시뮬레이션 러너"""
from __future__ import annotations

import asyncio
from dataclasses import dataclass, replace
from typing import Callable, Optional

from src.agent.prompt_builder import build_system_prompt
from src.config import (
    CONCURRENCY,
    LLM_RETRY_ATTEMPTS,
    LLM_RETRY_BACKOFF_SECONDS,
    LLM_RETRY_MAX_BACKOFF_SECONDS,
    LLM_TIMEOUT_SECONDS,
)
from src.llm.base import LLMClientProtocol, LLMMessage, LLMRequest, LLMResponse
from src.llm.factory import create_llm_client
from src.llm.router import resolve_model_route


@dataclass
class SimResult:
    uuid: str
    persona: dict
    response: str
    error: Optional[str] = None
    provider: str | None = None
    provider_model: str | None = None
    trace_id: str | None = None
    model_alias: str | None = None
    metadata: dict[str, object] | None = None


def _retry_delay_seconds(exc: Exception, attempt: int) -> float:
    response = getattr(exc, "response", None)
    headers = getattr(response, "headers", None)
    if headers is not None:
        retry_after_ms = headers.get("retry-after-ms")
        retry_after = headers.get("retry-after")
        try:
            if retry_after_ms is not None:
                return max(0.0, float(retry_after_ms) / 1000)
            if retry_after is not None:
                return max(0.0, float(retry_after))
        except (TypeError, ValueError):
            pass
    return min(
        max(0.0, LLM_RETRY_BACKOFF_SECONDS) * (2**attempt),
        max(0.0, LLM_RETRY_MAX_BACKOFF_SECONDS),
    )


class BatchSimulator:
    def __init__(
        self,
        concurrency: int = CONCURRENCY,
        purpose: str = "marketing",
        llm_client: LLMClientProtocol | None = None,
        model_alias: str | None = None,
        task_type: str = "persona_response",
        trace_metadata: dict[str, object] | None = None,
    ):
        self.concurrency = concurrency
        self.purpose = purpose
        self._owns_client = llm_client is None
        self.client = llm_client or create_llm_client()
        # 소유한 클라이언트는 run() 종료 시 닫힌다. 재호출을 조용히 허용하면
        # 닫힌 연결로 전건 실패가 나면서 파싱 실패로 위장된다(2026-07-20 회귀).
        self._client_closed = False
        self.route = resolve_model_route(task_type, model_alias)
        self.model_alias = self.route.model_alias
        self.trace_metadata = trace_metadata or {}

    async def run(
        self,
        personas: list[dict],
        user_prompt: str,
        on_progress: Optional[Callable[[int, int], None]] = None,
        on_result: Optional[Callable[[SimResult], None]] = None,
    ) -> list[SimResult]:
        sem = asyncio.Semaphore(self.concurrency)
        completed = {"n": 0}
        total = len(personas)

        async def one(persona: dict) -> SimResult:
            async with sem:
                system = build_system_prompt(persona, purpose=self.purpose)
                try:
                    response = await self._generate_with_retry(
                        LLMRequest(
                            task_type=self.route.task_type,
                            model_alias=self.model_alias,
                            messages=[
                                LLMMessage(role="system", content=system),
                                LLMMessage(role="user", content=user_prompt),
                            ],
                            metadata={
                                **self.trace_metadata,
                                "purpose": self.purpose,
                                "persona_uuid": persona["uuid"],
                            },
                        )
                    )
                    result = SimResult(
                        uuid=persona["uuid"],
                        persona=persona,
                        response=response.content,
                        provider=response.provider,
                        provider_model=response.provider_model,
                        trace_id=response.trace_id,
                        model_alias=(
                            response.metadata.get("model_alias")
                            if isinstance(response.metadata.get("model_alias"), str)
                            else self.model_alias
                        ),
                        metadata=response.metadata,
                    )
                except Exception as e:
                    result = SimResult(
                        uuid=persona["uuid"], persona=persona, response="", error=str(e)
                    )
                completed["n"] += 1
                if on_result:
                    on_result(result)
                if on_progress:
                    on_progress(completed["n"], total)
                return result

        if self._client_closed:
            raise RuntimeError(
                "BatchSimulator.run() was already called and its owned LLM client is closed. "
                "Create a new BatchSimulator per batch, or pass a shared llm_client in."
            )

        try:
            results = await asyncio.gather(*[one(p) for p in personas])
        finally:
            if self._owns_client:
                close = getattr(self.client, "close", None)
                if close:
                    await close()
                self._client_closed = True
        return results

    async def _generate_with_retry(self, request: LLMRequest) -> LLMResponse:
        attempts = max(1, LLM_RETRY_ATTEMPTS + 1)
        last_exc: Exception | None = None
        for attempt in range(attempts):
            try:
                attempted_request = replace(
                    request,
                    metadata={**request.metadata, "retry_count": attempt},
                )
                response = await asyncio.wait_for(
                    self.client.generate(attempted_request),
                    timeout=LLM_TIMEOUT_SECONDS,
                )
                return replace(
                    response,
                    metadata={**response.metadata, "retry_count": attempt},
                )
            except TimeoutError:
                last_exc = RuntimeError(
                    f"LLM_TIMEOUT after {LLM_TIMEOUT_SECONDS:g}s"
                    f" (attempt {attempt + 1}/{attempts})"
                )
            except Exception as exc:
                last_exc = exc
            if attempt + 1 < attempts:
                await asyncio.sleep(_retry_delay_seconds(last_exc, attempt))
        if last_exc is None:
            raise RuntimeError("LLM request failed without an exception.")
        raise last_exc
