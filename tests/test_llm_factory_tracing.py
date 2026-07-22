import importlib
import asyncio
import sys
from types import SimpleNamespace

import pytest

from src.llm.base import LLMMessage, LLMRequest, LLMResponse
from src.llm.openai_compatible_adapter import OpenAICompatibleAdapter
from src.llm.tracing import request_summary, sanitize_metadata


class FakeClient:
    async def generate(self, request: LLMRequest) -> LLMResponse:
        return LLMResponse(
            content="ok",
            provider="fake",
            provider_model="fake-model",
            metadata=request.metadata,
        )


class FakeCompletions:
    def __init__(self) -> None:
        self.kwargs = None

    async def create(self, **kwargs):
        self.kwargs = kwargs
        return SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content="선택: A"))]
        )


class FakeOpenAIClient:
    def __init__(self) -> None:
        self.completions = FakeCompletions()
        self.chat = SimpleNamespace(completions=self.completions)
        self.closed = False

    async def close(self) -> None:
        self.closed = True


def test_sanitize_metadata_removes_persona_ids_and_secrets() -> None:
    metadata = sanitize_metadata(
        {
            "run_id": "run-1",
            "simulation_type": "creative_testing",
            "persona_uuid": "persona-1",
            "api_key": "secret",
            "nested": {"token": "secret", "safe": "value"},
        }
    )

    assert metadata == {
        "run_id": "run-1",
        "simulation_type": "creative_testing",
        "nested": {"safe": "value"},
    }


def test_request_summary_does_not_include_prompt_content() -> None:
    summary = request_summary(
        LLMRequest(
            task_type="persona_response",
            model_alias="persona_default",
            messages=[
                LLMMessage(role="system", content="sensitive persona prompt"),
                LLMMessage(role="user", content="sensitive user prompt"),
            ],
        )
    )

    assert summary["message_count"] == 2
    assert summary["input_chars"] == len("sensitive persona promptsensitive user prompt")
    assert "sensitive" not in str(summary)


@pytest.mark.parametrize(
    ("backend", "expected_class"),
    [
        ("gemini", "OpenAICompatibleAdapter"),
        ("litellm", "OpenAICompatibleAdapter"),
        ("upstage", "OpenAICompatibleAdapter"),
        ("fake", "FakeLLMClient"),
    ],
)
def test_llm_factory_selects_backend(monkeypatch, backend: str, expected_class: str) -> None:
    monkeypatch.setenv("LLM_BACKEND", backend)
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    monkeypatch.setenv("LLM_GATEWAY_API_KEY", "test-key")
    monkeypatch.setenv("UPSTAGE_API_KEY", "test-key")
    monkeypatch.setenv("OBSERVABILITY_PROVIDER", "none")
    # Ensure multi-key env vars are absent so single-key path is exercised.
    monkeypatch.setenv("UPSTAGE_API_KEY_1", "")
    monkeypatch.setenv("UPSTAGE_API_KEY_2", "")

    import src.config
    import src.llm.factory

    importlib.reload(src.config)
    factory = importlib.reload(src.llm.factory)

    client = factory.create_llm_client()

    assert client.__class__.__name__ == expected_class


def test_llm_factory_rejects_unknown_backend(monkeypatch) -> None:
    monkeypatch.setenv("LLM_BACKEND", "ollama")
    monkeypatch.setenv("OBSERVABILITY_PROVIDER", "none")

    import src.config
    import src.llm.factory

    importlib.reload(src.config)
    factory = importlib.reload(src.llm.factory)

    with pytest.raises(RuntimeError, match="Unsupported LLM_BACKEND"):
        factory.create_llm_client()


def test_model_router_rejects_unconfigured_override(monkeypatch) -> None:
    monkeypatch.setenv("MODEL_PERSONA_DEFAULT", "solar-pro2")
    monkeypatch.setenv("MODEL_PERSONA_STRONG", "solar-pro2")

    import src.config
    import src.llm.router

    importlib.reload(src.config)
    router = importlib.reload(src.llm.router)

    assert router.validate_requested_model_alias("solar-pro2") == "solar-pro2"
    with pytest.raises(ValueError, match="not allowed"):
        router.validate_requested_model_alias("unapproved-expensive-model")


def test_fake_llm_backend_returns_parseable_persona_response(monkeypatch) -> None:
    monkeypatch.setenv("LLM_BACKEND", "fake")
    monkeypatch.setenv("OBSERVABILITY_PROVIDER", "none")

    import src.config
    import src.llm.factory

    importlib.reload(src.config)
    factory = importlib.reload(src.llm.factory)

    client = factory.create_llm_client()
    response = asyncio.run(
        client.generate(
            LLMRequest(
                task_type="persona_response",
                messages=[LLMMessage(role="user", content="[A] 첫째\n[B] 둘째")],
                metadata={"persona_uuid": "persona-e2e-1"},
            )
        )
    )

    assert response.provider == "fake"
    assert "선택:" in response.content
    assert "이유:" in response.content


def test_openai_compatible_adapter_requires_api_key() -> None:
    with pytest.raises(RuntimeError):
        OpenAICompatibleAdapter(
            provider="gemini",
            model="gemini-3-flash-preview",
            base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
            api_key="",
        )


def test_openai_compatible_adapter_uses_provider_model_by_default() -> None:
    adapter = OpenAICompatibleAdapter(
        provider="gemini",
        model="gemini-3-flash-preview",
        base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
        api_key="test-key",
    )
    fake_client = FakeOpenAIClient()
    adapter.client = fake_client

    response = asyncio.run(
        adapter.generate(
            LLMRequest(
                task_type="persona_response",
                model_alias="persona_default",
                messages=[LLMMessage(role="user", content="hello")],
            )
        )
    )

    assert fake_client.completions.kwargs["model"] == "gemini-3-flash-preview"
    assert response.provider == "gemini"
    assert response.provider_model == "gemini-3-flash-preview"
    assert response.content == "선택: A"


def test_openai_compatible_adapter_can_route_with_request_alias() -> None:
    adapter = OpenAICompatibleAdapter(
        provider="litellm",
        model="koresim/gemini-persona-default",
        base_url="http://127.0.0.1:4000/v1",
        api_key="test-key",
        use_request_model_alias=True,
    )
    fake_client = FakeOpenAIClient()
    adapter.client = fake_client

    response = asyncio.run(
        adapter.generate(
            LLMRequest(
                task_type="persona_response",
                model_alias="koresim/gemini-persona-strong",
                messages=[LLMMessage(role="user", content="hello")],
            )
        )
    )

    assert fake_client.completions.kwargs["model"] == "koresim/gemini-persona-strong"
    assert response.provider_model == "koresim/gemini-persona-strong"


def test_tracing_client_is_passthrough_when_disabled(monkeypatch) -> None:
    monkeypatch.setenv("OBSERVABILITY_PROVIDER", "none")

    import src.config
    import src.llm.tracing

    importlib.reload(src.config)
    tracing = importlib.reload(src.llm.tracing)

    client = tracing.TracingLLMClient(FakeClient())
    response = asyncio.run(
        client.generate(
            LLMRequest(
                task_type="persona_response",
                messages=[LLMMessage(role="user", content="hello")],
            )
        )
    )

    assert response.content == "ok"
    assert response.trace_id is None


def test_tracing_client_records_metadata_only_without_prompt_content(monkeypatch) -> None:
    class FakeGeneration:
        def __init__(self) -> None:
            self.updates: list[dict] = []

        def update(self, **kwargs) -> None:
            self.updates.append(kwargs)

    class FakeObservationContext:
        def __init__(self, generation: FakeGeneration, kwargs: dict) -> None:
            self.generation = generation
            self.kwargs = kwargs

        def __enter__(self) -> FakeGeneration:
            return self.generation

        def __exit__(self, exc_type, exc, traceback) -> None:
            return None

    class FakeLangfuseClient:
        def __init__(self) -> None:
            self.generation = FakeGeneration()
            self.observation_kwargs = None
            self.flushed = False

        def start_as_current_observation(self, **kwargs):
            self.observation_kwargs = kwargs
            return FakeObservationContext(self.generation, kwargs)

        def get_current_trace_id(self) -> str:
            return "trace-123"

        def flush(self) -> None:
            self.flushed = True

    fake_langfuse = FakeLangfuseClient()
    monkeypatch.setenv("OBSERVABILITY_PROVIDER", "langfuse")
    monkeypatch.setenv("LLM_TRACE_MODE", "metadata_only")
    monkeypatch.setenv("LANGFUSE_PUBLIC_KEY", "pk-test")
    monkeypatch.setenv("LANGFUSE_SECRET_KEY", "sk-test")
    monkeypatch.setitem(
        sys.modules,
        "langfuse",
        SimpleNamespace(get_client=lambda: fake_langfuse),
    )

    import src.config
    import src.llm.tracing

    importlib.reload(src.config)
    tracing = importlib.reload(src.llm.tracing)

    client = tracing.TracingLLMClient(FakeClient())
    response = asyncio.run(
        client.generate(
            LLMRequest(
                task_type="persona_response",
                messages=[LLMMessage(role="system", content="secret prompt")],
                metadata={"run_id": "run-1", "persona_uuid": "persona-1"},
            )
        )
    )
    asyncio.run(client.close())

    assert response.trace_id == "trace-123"
    assert fake_langfuse.observation_kwargs["input"] is None
    assert fake_langfuse.observation_kwargs["metadata"]["run_id"] == "run-1"
    assert "persona_uuid" not in fake_langfuse.observation_kwargs["metadata"]
    assert fake_langfuse.generation.updates[-1]["output"] is None
    assert fake_langfuse.flushed is True
