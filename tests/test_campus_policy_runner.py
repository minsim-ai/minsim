import json

import pytest

from src.data.sampler import PersonaSampler
from src.llm.base import LLMResponse
from src.simulations.registry import SIMULATION_SPECS

AGENDA_INPUT = {
    "agenda": "중앙도서관 24시간 개방",
    "current_state": "평일 09-23시, 주말 10-18시 운영.",
    "proposed_change": "1층 열람실만 연중 24시간 개방.",
    "tradeoffs": "연간 운영비 1.2억 증가.",
}


class StubLLMClient:
    """계층에 따라 다른 입장을 돌려주어 교차표가 실제로 갈리게 한다."""

    async def generate(self, request):
        content = request.messages[-1].content
        stance = "반대" if "행정" in content or "교수" in content else "찬성"
        payload = {
            "stance": stance,
            "reason": "본인 일과에 비추어 판단함",
            "condition": None,
            "intensity": 4,
        }
        return LLMResponse(
            content=json.dumps(payload, ensure_ascii=False),
            provider="fake",
            provider_model="stub",
        )


def test_campus_policy_is_registered():
    spec = SIMULATION_SPECS["campus_policy"]
    assert spec.simulation_type == "campus_policy"
    assert spec.task_type == "policy_response"
    assert spec.enabled is True


def test_runner_factory_builds_simulation():
    assert SIMULATION_SPECS["campus_policy"].runner_factory().simulation_type == "campus_policy"


@pytest.mark.asyncio
async def test_run_uses_stratified_sampling_and_records_meta():
    """DGIST 풀에서는 층화 추출 메타가 결과에 남아야 한다."""
    sim = SIMULATION_SPECS["campus_policy"].runner_factory()
    result = await sim.run(
        AGENDA_INPUT,
        sample_size=200,
        seed=42,
        llm_client=StubLLMClient(),
        sampler=PersonaSampler(pool="dgist"),
    )
    assert result.total_responses == 200
    assert result.parse_failed == 0
    assert result.metrics["sampling"]["sampling"] == "stratified"
    assert result.metrics["sampling"]["tier_counts"]["교직원"] >= 30
    assert result.metrics["bias_warning"] is None


@pytest.mark.asyncio
async def test_run_on_nationwide_pool_uses_random_age_axis():
    """전 국민 선택을 존중한다. 층화·DGIST 강제 없음."""
    sim = SIMULATION_SPECS["campus_policy"].runner_factory()
    result = await sim.run(
        AGENDA_INPUT,
        sample_size=30,
        seed=42,
        llm_client=StubLLMClient(),
        sampler=PersonaSampler(pool="nationwide"),
    )
    assert result.metrics["sampling"]["sampling"] == "random"
    assert result.metrics["persona_pool"] == "nationwide"
    assert result.metrics.get("tier_axis_label") in ("연령대", None) or "20대" in (
        result.metrics.get("tier_axis") or []
    )
    warnings = " ".join(result.metrics["sampling"].get("warnings") or [])
    assert "DGIST" not in warnings
