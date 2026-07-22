"""Round-robin adapter that distributes requests across multiple LLM clients.

Each ``OpenAICompatibleAdapter`` uses a separate API key, so distributing calls
round-robin raises the aggregate rate ceiling when a provider enforces per-key
rate limits (e.g. Upstage ~400-500 RPM per key).
"""
from __future__ import annotations

import asyncio
import itertools

from src.llm.base import LLMClientProtocol, LLMRequest, LLMResponse
from src.llm.openai_compatible_adapter import OpenAICompatibleAdapter


class RoundRobinAdapter(LLMClientProtocol):
    """Holds N adapters (one per API key) and cycles through them.

    Thread-safe for asyncio single-event-loop usage via an internal lock around
    the cycle iterator.
    """

    def __init__(self, adapters: list[OpenAICompatibleAdapter]) -> None:
        if not adapters:
            raise ValueError("RoundRobinAdapter requires at least one adapter.")
        self._adapters = adapters
        self._cycle = itertools.cycle(range(len(adapters)))
        self._lock = asyncio.Lock()

    async def generate(self, request: LLMRequest) -> LLMResponse:
        async with self._lock:
            idx = next(self._cycle)
        return await self._adapters[idx].generate(request)

    async def close(self) -> None:
        for adapter in self._adapters:
            await adapter.close()
