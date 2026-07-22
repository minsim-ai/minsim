"""Connection-error recovery for the shared OpenAI-compatible adapter."""
from __future__ import annotations

import asyncio
from types import SimpleNamespace

import httpx
import pytest
from openai import APIConnectionError

from src.llm.base import LLMMessage, LLMRequest
from src.llm.openai_compatible_adapter import OpenAICompatibleAdapter


def _ok_response(content: str = '{"ok": true}'):
    return SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content=content))],
        usage=None,
    )


class _FlakyCompletions:
    def __init__(self, fail_times: int) -> None:
        self.fail_times = fail_times
        self.calls = 0

    async def create(self, **kwargs):
        self.calls += 1
        if self.calls <= self.fail_times:
            raise APIConnectionError(
                message="Connection error.",
                request=httpx.Request("POST", "https://example.test/v1/chat/completions"),
            )
        return _ok_response("선택: A")


class _FlakyOpenAIClient:
    def __init__(self, fail_times: int) -> None:
        self.completions = _FlakyCompletions(fail_times)
        self.chat = SimpleNamespace(completions=self.completions)
        self.closed = False

    async def close(self) -> None:
        self.closed = True


def test_adapter_retries_once_after_connection_error() -> None:
    adapter = OpenAICompatibleAdapter(
        provider="upstage",
        model="solar-pro2",
        base_url="https://api.upstage.ai/v1/solar",
        api_key="test-key",
    )
    clients: list[_FlakyOpenAIClient] = []

    def build_client() -> _FlakyOpenAIClient:
        # First client fails once; after reset the second client succeeds.
        client = _FlakyOpenAIClient(fail_times=1 if not clients else 0)
        clients.append(client)
        return client

    adapter._build_client = build_client  # type: ignore[method-assign]
    adapter.client = build_client()

    response = asyncio.run(
        adapter.generate(
            LLMRequest(
                task_type="intake_autofill",
                messages=[LLMMessage(role="user", content="hello")],
            )
        )
    )

    assert response.content == "선택: A"
    assert response.provider == "upstage"
    assert len(clients) == 2
    assert clients[0].closed is True
    assert clients[0].completions.calls == 1
    assert clients[1].completions.calls == 1


def test_adapter_raises_after_retry_exhausted() -> None:
    adapter = OpenAICompatibleAdapter(
        provider="upstage",
        model="solar-pro2",
        base_url="https://api.upstage.ai/v1/solar",
        api_key="test-key",
    )

    def build_client() -> _FlakyOpenAIClient:
        return _FlakyOpenAIClient(fail_times=99)

    adapter._build_client = build_client  # type: ignore[method-assign]
    adapter.client = build_client()

    with pytest.raises(RuntimeError, match="upstage connection failed"):
        asyncio.run(
            adapter.generate(
                LLMRequest(
                    task_type="intake_autofill",
                    messages=[LLMMessage(role="user", content="hello")],
                )
            )
        )
