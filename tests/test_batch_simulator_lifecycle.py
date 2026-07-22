"""BatchSimulator 수명 주기 — 2026-07-20 회귀의 근본 원인.

소유한 클라이언트는 run() 종료 시 닫힌다. 재호출을 조용히 허용하면 닫힌 연결로
전건 실패가 나고, 호출자가 이를 파싱 실패로 오해한다(실제로 75/100 오진 발생).
"""
import pytest

from src.agent.simulator import BatchSimulator
from src.llm.base import LLMResponse

PERSONAS = [{"uuid": "p1", "age": 22, "sex": "여자", "occupation": "DGIST 학부생"}]


class SharedStubClient:
    """호출자가 주입한 클라이언트는 simulator가 닫지 않는다."""

    def __init__(self):
        self.calls = 0

    async def generate(self, request):
        self.calls += 1
        return LLMResponse(content='{"ok": true}', provider="stub", provider_model="s")


@pytest.mark.asyncio
async def test_second_run_on_owned_client_raises_instead_of_failing_every_call():
    class OwnedStub:
        closed = False

        async def generate(self, request):
            return LLMResponse(content="{}", provider="stub", provider_model="s")

        async def close(self):
            OwnedStub.closed = True

    sim = BatchSimulator(purpose="t", task_type="policy_response")
    sim.client = OwnedStub()
    sim._owns_client = True

    await sim.run(PERSONAS, "prompt")
    assert OwnedStub.closed is True

    with pytest.raises(RuntimeError, match="already called"):
        await sim.run(PERSONAS, "prompt")


@pytest.mark.asyncio
async def test_injected_client_survives_multiple_runs():
    """공유 클라이언트를 넘기면 여러 배치를 돌릴 수 있다."""
    client = SharedStubClient()
    sim = BatchSimulator(purpose="t", task_type="policy_response", llm_client=client)

    await sim.run(PERSONAS, "prompt-1")
    await sim.run(PERSONAS, "prompt-2")

    assert client.calls == 2


@pytest.mark.asyncio
async def test_fresh_instance_per_batch_works():
    """검증된 해법 — 배치마다 새 인스턴스."""
    for _ in range(3):
        class OwnedStub:
            async def generate(self, request):
                return LLMResponse(content="{}", provider="stub", provider_model="s")

            async def close(self):
                return None

        sim = BatchSimulator(purpose="t", task_type="policy_response")
        sim.client = OwnedStub()
        sim._owns_client = True
        assert len(await sim.run(PERSONAS, "prompt")) == 1
