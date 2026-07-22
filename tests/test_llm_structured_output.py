import asyncio
from types import SimpleNamespace

from src.llm.base import LLMMessage, LLMRequest
from src.llm.openai_compatible_adapter import OpenAICompatibleAdapter


class FakeCompletions:
    def __init__(self) -> None:
        self.kwargs = None

    async def create(self, **kwargs):
        self.kwargs = kwargs
        return SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content='{"ok": true}'))],
            usage=None,
        )


class FakeOpenAIClient:
    def __init__(self) -> None:
        self.completions = FakeCompletions()
        self.chat = SimpleNamespace(completions=self.completions)

    async def close(self) -> None:
        return None


def test_openai_compatible_adapter_forwards_structured_response_format() -> None:
    adapter = OpenAICompatibleAdapter(
        provider="upstage",
        model="solar-pro2",
        base_url="https://api.upstage.ai/v1/solar",
        api_key="test-key",
    )
    fake_client = FakeOpenAIClient()
    adapter.client = fake_client

    asyncio.run(
        adapter.generate(
            LLMRequest(
                task_type="validation_structured_response",
                messages=[LLMMessage(role="user", content="Return JSON.")],
                response_format={"type": "json_object"},
            )
        )
    )

    assert fake_client.completions.kwargs["response_format"] == {"type": "json_object"}
    assert "extra_body" not in fake_client.completions.kwargs
