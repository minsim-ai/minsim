"""Tests for the round-robin LLM adapter."""
from __future__ import annotations

import importlib

import pytest

from src.llm.base import LLMMessage, LLMRequest, LLMResponse
from src.llm.openai_compatible_adapter import OpenAICompatibleAdapter
from src.llm.round_robin_adapter import RoundRobinAdapter


class CountingAdapter:
    """Fake adapter that records how many times each index was called."""

    def __init__(self, label: str) -> None:
        self.label = label
        self.call_count = 0
        self.closed = False

    async def generate(self, request: LLMRequest) -> LLMResponse:
        self.call_count += 1
        return LLMResponse(
            content=f"from-{self.label}",
            provider="test",
            provider_model="test-model",
        )

    async def close(self) -> None:
        self.closed = True


class TestRoundRobinAdapter:
    def test_rejects_empty_adapter_list(self) -> None:
        with pytest.raises(ValueError, match="requires at least one adapter"):
            RoundRobinAdapter([])

    @pytest.mark.asyncio
    async def test_cycles_through_adapters(self) -> None:
        a1 = CountingAdapter("key-1")
        a2 = CountingAdapter("key-2")
        adapter = RoundRobinAdapter([a1, a2])

        r1 = await adapter.generate(
            LLMRequest(task_type="test", messages=[LLMMessage(role="user", content="hello")])
        )
        r2 = await adapter.generate(
            LLMRequest(task_type="test", messages=[LLMMessage(role="user", content="hello")])
        )
        r3 = await adapter.generate(
            LLMRequest(task_type="test", messages=[LLMMessage(role="user", content="hello")])
        )

        assert r1.content == "from-key-1"
        assert r2.content == "from-key-2"
        assert r3.content == "from-key-1"
        assert a1.call_count == 2
        assert a2.call_count == 1

    @pytest.mark.asyncio
    async def test_single_adapter_passthrough(self) -> None:
        a1 = CountingAdapter("only-key")
        adapter = RoundRobinAdapter([a1])

        r1 = await adapter.generate(
            LLMRequest(task_type="test", messages=[LLMMessage(role="user", content="hello")])
        )
        r2 = await adapter.generate(
            LLMRequest(task_type="test", messages=[LLMMessage(role="user", content="hello")])
        )

        assert r1.content == "from-only-key"
        assert r2.content == "from-only-key"
        assert a1.call_count == 2

    @pytest.mark.asyncio
    async def test_close_closes_all_adapters(self) -> None:
        a1 = CountingAdapter("key-1")
        a2 = CountingAdapter("key-2")
        adapter = RoundRobinAdapter([a1, a2])

        await adapter.close()

        assert a1.closed is True
        assert a2.closed is True


class TestFactoryMultiKey:
    """Verify the factory creates RoundRobinAdapter when multiple Upstage keys
    are configured."""

    @pytest.mark.asyncio
    async def test_factory_returns_round_robin_with_two_keys(self, monkeypatch) -> None:
        monkeypatch.setenv("LLM_BACKEND", "upstage")
        monkeypatch.setenv("UPSTAGE_BASE_URL", "https://api.upstage.ai/v1")
        monkeypatch.setenv("UPSTAGE_MODEL", "solar-pro2")
        monkeypatch.setenv("OBSERVABILITY_PROVIDER", "none")
        # Drop the single key; set two explicit per-key vars.
        monkeypatch.setenv("UPSTAGE_API_KEY", "")
        monkeypatch.setenv("UPSTAGE_API_KEY_1", "key-a")
        monkeypatch.setenv("UPSTAGE_API_KEY_2", "key-b")

        import src.config
        import src.llm.factory

        importlib.reload(src.config)
        factory = importlib.reload(src.llm.factory)

        client = factory.create_llm_client()
        assert isinstance(client, RoundRobinAdapter)
        assert len(client._adapters) == 2
        assert all(isinstance(a, OpenAICompatibleAdapter) for a in client._adapters)

    def test_factory_returns_single_adapter_with_one_key(self, monkeypatch) -> None:
        monkeypatch.setenv("LLM_BACKEND", "upstage")
        monkeypatch.setenv("UPSTAGE_BASE_URL", "https://api.upstage.ai/v1")
        monkeypatch.setenv("UPSTAGE_MODEL", "solar-pro2")
        monkeypatch.setenv("UPSTAGE_API_KEY", "single-key")
        monkeypatch.setenv("UPSTAGE_API_KEY_1", "")
        monkeypatch.setenv("UPSTAGE_API_KEY_2", "")
        monkeypatch.setenv("OBSERVABILITY_PROVIDER", "none")

        import src.config
        import src.llm.factory

        importlib.reload(src.config)
        factory = importlib.reload(src.llm.factory)

        client = factory.create_llm_client()
        assert isinstance(client, OpenAICompatibleAdapter)

    def test_factory_raises_without_upstage_key(self, monkeypatch) -> None:
        monkeypatch.setenv("LLM_BACKEND", "upstage")
        monkeypatch.setenv("UPSTAGE_API_KEY", "")
        monkeypatch.setenv("UPSTAGE_API_KEY_1", "")
        monkeypatch.setenv("UPSTAGE_API_KEY_2", "")
        monkeypatch.setenv("OBSERVABILITY_PROVIDER", "none")

        import src.config
        import src.llm.factory

        importlib.reload(src.config)
        factory = importlib.reload(src.llm.factory)

        with pytest.raises(RuntimeError, match="Upstage API key is not configured"):
            factory.create_llm_client()
