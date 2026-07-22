"""B-3 persona pools and C-3 mono/extra_body plumbing."""
import polars as pl
import pytest
from pydantic import ValidationError

import src.llm.factory as llm_factory
from src.api.schemas import RunCreateRequest, SimulationType
from src.data.loader import ParquetLoader
from src.data.pools import PERSONA_POOLS, pool_metadata, resolve_pool
from src.data.sampler import PersonaSampler
from src.llm.base import LLMMessage, LLMRequest
from src.llm.openai_compatible_adapter import OpenAICompatibleAdapter


def _persona_frame(rows: int) -> pl.DataFrame:
    return pl.DataFrame(
        {
            "uuid": [f"p-{index}" for index in range(rows)],
            "age": [30 + index for index in range(rows)],
            "sex": ["여성" if index % 2 else "남성" for index in range(rows)],
            "province": ["대구"] * rows,
            "district": ["대구-달성군"] * rows,
            "occupation": ["연구원"] * rows,
            "education_level": ["대학원졸"] * rows,
            "marital_status": ["미혼"] * rows,
            "family_type": ["1인가구"] * rows,
            "housing_type": ["아파트"] * rows,
            "persona": ["연구 중심 생활"] * rows,
            "professional_persona": ["실험 설계에 몰두"] * rows,
            "family_persona": ["주말에는 가족과 통화"] * rows,
            "culinary_persona": ["구내식당 위주"] * rows,
            "cultural_background": ["대구 지역 연구단지 생활"] * rows,
        }
    )


def test_resolve_pool_defaults_and_normalizes() -> None:
    assert resolve_pool(None).pool_id == "nationwide"
    assert resolve_pool("DGIST").pool_id == "dgist"
    with pytest.raises(ValueError):
        resolve_pool("moon-base")


def test_pool_metadata_reports_availability() -> None:
    metadata = {item["id"]: item for item in pool_metadata()}
    assert set(metadata) == set(PERSONA_POOLS)
    assert {"id", "label", "description", "available"} <= set(metadata["dgist"])


def test_sampler_uses_injected_pool_loader_and_clamps(tmp_path) -> None:
    path = tmp_path / "dgist.parquet"
    _persona_frame(5).write_parquet(path)

    sampler = PersonaSampler(pool="dgist", loader=ParquetLoader(path))
    personas = sampler.sample(n=50, seed=7)

    assert sampler.pool == "dgist"
    assert len(personas) == 5
    assert personas[0]["province"] == "대구"


def test_run_create_request_validates_persona_pool() -> None:
    request = RunCreateRequest(
        simulation_type=SimulationType.CREATIVE_TESTING,
        input={"creatives": ["A안", "B안"]},
        persona_pool="DGIST",
    )
    assert request.persona_pool == "dgist"

    with pytest.raises(ValidationError):
        RunCreateRequest(
            simulation_type=SimulationType.CREATIVE_TESTING,
            input={"creatives": ["A안", "B안"]},
            persona_pool="moon-base",
        )


def test_mono_backend_errors_only_when_selected_without_key(monkeypatch) -> None:
    monkeypatch.setattr(llm_factory, "LLM_BACKEND", "mono")
    monkeypatch.setattr(llm_factory, "MONO_API_KEY", "")
    with pytest.raises(RuntimeError, match="mono API key"):
        llm_factory.create_llm_client()

    monkeypatch.setattr(llm_factory, "MONO_API_KEY", "test-key")
    monkeypatch.setattr(llm_factory, "MONO_BASE_URL", "https://mono.example/v1")
    client = llm_factory.create_llm_client()
    assert client is not None


def test_model_allows_custom_temperature_for_openai_families() -> None:
    from src.llm.openai_compatible_adapter import model_allows_custom_temperature

    assert model_allows_custom_temperature("gpt-5.4-nano") is True
    assert model_allows_custom_temperature("gpt-5.4-mini") is True
    assert model_allows_custom_temperature("solar-pro2") is True
    assert model_allows_custom_temperature("gpt-5.6-luna") is False
    assert model_allows_custom_temperature("gpt-5.6-terra") is False
    assert model_allows_custom_temperature("gpt-5.5") is False


@pytest.mark.anyio
async def test_adapter_omits_temperature_for_gpt56_models() -> None:
    adapter = OpenAICompatibleAdapter(
        provider="openai",
        model="gpt-5.6-luna",
        base_url="https://api.openai.com/v1",
        api_key="test-key",
    )
    captured: list[dict] = []

    class _Message:
        content = "ok"

    class _Choice:
        message = _Message()

    class _Response:
        choices = [_Choice()]
        usage = None

    class _Completions:
        async def create(self, **kwargs):
            captured.append(kwargs)
            return _Response()

    class _Chat:
        completions = _Completions()

    adapter.client.chat = _Chat()  # type: ignore[assignment]
    await adapter.generate(
        LLMRequest(
            task_type="analysis",
            model_alias="gpt-5.6-luna",
            messages=[LLMMessage(role="user", content="hi")],
            temperature=0.2,
        )
    )
    assert "temperature" not in captured[0]
    assert captured[0]["model"] == "gpt-5.6-luna"


def test_openai_backend_alias_uses_mono_credentials(monkeypatch) -> None:
    monkeypatch.setattr(llm_factory, "LLM_BACKEND", "openai")
    monkeypatch.setattr(llm_factory, "MONO_API_KEY", "")
    with pytest.raises(RuntimeError, match="openai API key"):
        llm_factory.create_llm_client()

    monkeypatch.setattr(llm_factory, "MONO_API_KEY", "test-key")
    monkeypatch.setattr(llm_factory, "MONO_BASE_URL", "https://api.openai.com/v1")
    monkeypatch.setattr(llm_factory, "MONO_MODEL", "gpt-5.4-nano")
    client = llm_factory.create_llm_client()
    assert client is not None


@pytest.mark.anyio
async def test_adapter_forwards_extra_body_only_when_present() -> None:
    adapter = OpenAICompatibleAdapter(
        provider="mono",
        model="gpt-test",
        base_url="https://mono.example/v1",
        api_key="test-key",
    )
    captured: list[dict] = []

    class _Message:
        content = "ok"

    class _Choice:
        message = _Message()

    class _Response:
        choices = [_Choice()]
        usage = None

    class _Completions:
        async def create(self, **kwargs):
            captured.append(kwargs)
            return _Response()

    class _Chat:
        completions = _Completions()

    adapter.client.chat = _Chat()  # type: ignore[assignment]

    request = LLMRequest(
        task_type="analysis",
        messages=[LLMMessage(role="user", content="hi")],
        extra_body={"reasoning_effort": "medium"},
    )
    await adapter.generate(request)
    assert captured[-1]["extra_body"] == {"reasoning_effort": "medium"}

    await adapter.generate(
        LLMRequest(task_type="analysis", messages=[LLMMessage(role="user", content="hi")])
    )
    assert "extra_body" not in captured[-1]


@pytest.mark.anyio
async def test_sliding_window_limiter_allows_under_cap_and_disabled() -> None:
    from src.llm.rate_limiter import SlidingWindowLimiter

    disabled = SlidingWindowLimiter(0)
    await disabled.acquire()
    assert not disabled._times

    limiter = SlidingWindowLimiter(5)
    for _ in range(5):
        await limiter.acquire()
    assert len(limiter._times) == 5


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"
