"""비동기 배치 시뮬레이션 러너"""
from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Callable, Optional

from src.agent.prompt_builder import build_system_prompt
from src.config import CONCURRENCY, LLM_RETRY_ATTEMPTS, LLM_TIMEOUT_SECONDS
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


class BatchSimulator:
    def __init__(
        self,
        concurrency: int = CONCURRENCY,
        purpose: str = "marketing",
        llm_client: LLMClientProtocol | None = None,
        model_alias: str | None = None,
        task_type: str = "persona_response",
    ):
        self.concurrency = concurrency
        self.purpose = purpose
        self.client = llm_client or create_llm_client()
        self.route = resolve_model_route(task_type, model_alias)
        self.model_alias = self.route.model_alias

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

        try:
            results = await asyncio.gather(*[one(p) for p in personas])
        finally:
            close = getattr(self.client, "close", None)
            if close:
                await close()
        return results

    async def _generate_with_retry(self, request: LLMRequest) -> LLMResponse:
        attempts = max(1, LLM_RETRY_ATTEMPTS + 1)
        last_exc: Exception | None = None
        for attempt in range(attempts):
            try:
                return await asyncio.wait_for(
                    self.client.generate(request),
                    timeout=LLM_TIMEOUT_SECONDS,
                )
            except TimeoutError:
                last_exc = RuntimeError(
                    f"LLM_TIMEOUT after {LLM_TIMEOUT_SECONDS:g}s"
                    f" (attempt {attempt + 1}/{attempts})"
                )
            except Exception as exc:
                last_exc = exc
            if attempt + 1 < attempts:
                await asyncio.sleep(0)
        if last_exc is None:
            raise RuntimeError("LLM request failed without an exception.")
        raise last_exc
