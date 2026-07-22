import asyncio

from src.agent import simulator as simulator_module
from src.agent.simulator import BatchSimulator
from src.llm.base import LLMRequest, LLMResponse


class SlowThenSuccessfulLLM:
    def __init__(self) -> None:
        self.calls = 0
        self.model_aliases: list[str | None] = []

    async def generate(self, request: LLMRequest) -> LLMResponse:
        self.calls += 1
        self.model_aliases.append(request.model_alias)
        if self.calls == 1:
            await asyncio.sleep(0.05)
        return LLMResponse(
            content="선택: A\n이유: 명확합니다.",
            provider="fake",
            provider_model="fake-model",
        )


class BorrowedLLM(SlowThenSuccessfulLLM):
    def __init__(self) -> None:
        super().__init__()
        self.closed = False

    async def close(self) -> None:
        self.closed = True


class RateLimitResponse:
    headers = {"retry-after": "2"}


class RateLimitError(Exception):
    response = RateLimitResponse()


class RateLimitedThenSuccessfulLLM(SlowThenSuccessfulLLM):
    async def generate(self, request: LLMRequest) -> LLMResponse:
        self.calls += 1
        self.model_aliases.append(request.model_alias)
        if self.calls == 1:
            raise RateLimitError("rate limited")
        return LLMResponse(
            content="선택: A\n이유: 재시도 후 성공했습니다.",
            provider="fake",
            provider_model="fake-model",
        )


def _persona() -> dict:
    return {
        "uuid": "persona-1",
        "age": 32,
        "sex": "여성",
        "province": "서울",
        "district": "강남구",
        "occupation": "마케터",
        "education_level": "대졸",
        "marital_status": "미혼",
        "family_type": "1인가구",
        "housing_type": "아파트",
        "professional_persona": "브랜드 메시지에 민감합니다.",
        "family_persona": "가족 구매를 비교합니다.",
        "culinary_persona": "신제품을 자주 시도합니다.",
        "persona": "실용적인 소비자입니다.",
    }


def test_batch_simulator_retries_once_after_timeout(monkeypatch) -> None:
    monkeypatch.setattr(simulator_module, "LLM_TIMEOUT_SECONDS", 0.01)
    monkeypatch.setattr(simulator_module, "LLM_RETRY_ATTEMPTS", 1)
    monkeypatch.setattr(simulator_module, "LLM_RETRY_BACKOFF_SECONDS", 0)
    llm = SlowThenSuccessfulLLM()
    partials = []
    progress = []

    results = asyncio.run(
        BatchSimulator(concurrency=1, llm_client=llm, model_alias="koresim/test-alias").run(
            [_persona()],
            "테스트",
            on_progress=lambda done, total: progress.append((done, total)),
            on_result=partials.append,
        )
    )

    assert llm.calls == 2
    assert llm.model_aliases == ["koresim/test-alias", "koresim/test-alias"]
    assert results[0].response == "선택: A\n이유: 명확합니다."
    assert partials == results
    assert progress == [(1, 1)]


def test_batch_simulator_does_not_close_injected_client(monkeypatch) -> None:
    monkeypatch.setattr(simulator_module, "LLM_RETRY_ATTEMPTS", 0)
    llm = BorrowedLLM()

    results = asyncio.run(
        BatchSimulator(concurrency=1, llm_client=llm).run([_persona()], "테스트")
    )

    assert results[0].error is None
    assert llm.closed is False


def test_batch_simulator_respects_provider_retry_after(monkeypatch) -> None:
    """As an operator, provider throttling should recover instead of failing a large run."""
    monkeypatch.setattr(simulator_module, "LLM_RETRY_ATTEMPTS", 1)
    monkeypatch.setattr(simulator_module, "LLM_RETRY_BACKOFF_SECONDS", 0.5, raising=False)
    sleeps: list[float] = []

    async def record_sleep(delay: float) -> None:
        sleeps.append(delay)

    monkeypatch.setattr(simulator_module.asyncio, "sleep", record_sleep)
    llm = RateLimitedThenSuccessfulLLM()

    results = asyncio.run(BatchSimulator(concurrency=1, llm_client=llm).run([_persona()], "테스트"))

    assert results[0].error is None
    assert llm.calls == 2
    assert sleeps == [2.0]
