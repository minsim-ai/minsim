import asyncio

from src.api.schemas import RunCreateRequest, RunResultEnvelope, StartupItemValidationInput
from src.jobs.models import RunRecord
from src.jobs.result_envelope import build_generic_result_envelope
from src.llm.base import LLMRequest, LLMResponse
from src.llm.fake import FakeLLMClient
from src.simulations.startup_item_validation import (
    StartupItemValidationSimulation,
    startup_item_validation_protocol,
)


_ITEM_INPUT = {
    "item_name": "슬립웨이브",
    "item_description": "뇌파 유도로 입면 시간을 줄여주는 웨어러블 수면 밴드.",
    "problem_statement": "약 없이 잠들기까지 오래 걸리는 입면 어려움.",
    "key_features": ["뇌파 유도 사운드", "수면 단계 측정", "앱 수면 리포트"],
    "price_hint": "129,000원",
    "alternatives": ["멜라토닌 보조제", "수면 유도 앱", "일반 안대"],
}


class StartupValidationFakeSampler:
    def sample(self, n: int, filter_=None, seed: int = 42) -> list[dict]:
        return [
            {
                "uuid": f"persona-{idx}",
                "age": 24 + idx,
                "sex": "여성" if idx % 2 else "남성",
                "province": "서울",
                "district": "서울-강남구",
                "occupation": "직장인",
                "education_level": "4년제 대학교",
                "marital_status": "미혼",
                "family_type": "1인가구",
                "housing_type": "아파트",
                "professional_persona": "수면 질 개선에 관심이 많은 직장인",
                "family_persona": "건강 지출을 신중하게 검토함",
                "culinary_persona": "새로운 제품을 비교해 봄",
                "persona": "실용적인 소비자",
            }
            for idx in range(n)
        ]


class GarbageValidationLLM:
    async def generate(self, request: LLMRequest) -> LLMResponse:
        return LLMResponse(
            content="관련 정보를 제공할 수 없습니다.",
            provider="fake",
            provider_model="fake-garbage",
            metadata={"task_type": request.task_type},
        )


def test_startup_item_validation_protocol_defines_ordered_conditional_steps() -> None:
    protocol = startup_item_validation_protocol()
    protocol.validate()

    assert protocol.protocol_id == "startup_item_validation_v1"
    assert [step.id for step in protocol.steps] == [
        "needs_segment",
        "competition_positioning",
        "acceptance_price",
        "adoption_barrier",
    ]
    assert protocol.steps[0].task_type == "validation_response"
    assert protocol.steps[3].task_type == "validation_objection"
    assert protocol.steps[3].condition == "headline_acceptance != '수용'"
    assert protocol.steps[0].condition is None


def test_startup_item_validation_input_accepts_booth_payload() -> None:
    request = RunCreateRequest.model_validate(
        {
            "simulation_type": "startup_item_validation",
            "input": _ITEM_INPUT,
            "sample_size": 5,
        }
    )

    assert isinstance(request.input, StartupItemValidationInput)
    assert request.input.item_name == "슬립웨이브"
    assert request.input.alternatives == ["멜라토닌 보조제", "수면 유도 앱", "일반 안대"]


def test_startup_item_validation_runs_multistep_and_aggregates() -> None:
    result = asyncio.run(
        StartupItemValidationSimulation().run(
            _ITEM_INPUT,
            sample_size=12,
            seed=7,
            llm_client=FakeLLMClient(),
            sampler=StartupValidationFakeSampler(),
        )
    )

    assert result.total_responses == 12
    assert result.parse_failed == 0

    metrics = result.metrics
    expected_keys = {
        "protocol_id",
        "intent_counts",
        "intent_pct",
        "segment_counts",
        "segment_pct",
        "problem_empathy_avg",
        "problem_empathy_distribution",
        "need_category_counts",
        "alternative_counts",
        "alternative_satisfaction_avg",
        "differentiation_counts",
        "differentiation_recognized_pct",
        "wtp_median",
        "wtp_p25",
        "wtp_p75",
        "barrier_counts",
        "condition_status_counts",
        "conditional_yes_count",
        "conditional_yes_rate",
    }
    assert expected_keys <= set(metrics)
    assert "choice_counts" not in metrics

    valid = [parsed for parsed in result.parsed_results if parsed]
    assert sum(metrics["intent_counts"].values()) == len(valid)
    assert set(metrics["problem_empathy_distribution"]) == {"1", "2", "3", "4", "5"}

    assert isinstance(metrics["wtp_median"], int)
    assert isinstance(metrics["wtp_p25"], int)
    assert isinstance(metrics["wtp_p75"], int)

    accepted = [parsed for parsed in valid if parsed["intent"] == "수용"]
    non_accepted = [parsed for parsed in valid if parsed["intent"] != "수용"]
    assert accepted, "weighted fake should produce at least one 수용 persona"
    assert non_accepted, "weighted fake should produce at least one non-수용 persona"
    for parsed in accepted:
        assert parsed["protocol_steps"]["adoption_barrier"] == {"skipped": True}
    for parsed in non_accepted:
        barrier = parsed["protocol_steps"]["adoption_barrier"]
        assert not barrier.get("skipped")
        assert barrier["barrier"]
        assert barrier["condition_status"]

    assert result.protocol["protocol_id"] == "startup_item_validation_v1"
    assert result.protocol["step_summaries"][0]["id"] == "needs_segment"
    assert result.protocol["interview_guide"]["schema_version"] == "interview-guide/v1"

    run = RunRecord(
        run_id="run-startup-1",
        simulation_type="startup_item_validation",
        input=_ITEM_INPUT,
        sample_size=12,
        total_count=12,
        seed=7,
    )
    envelope_dict = build_generic_result_envelope(run, result)
    envelope = RunResultEnvelope.model_validate(envelope_dict)
    assert envelope.simulation_type == "startup_item_validation"
    assert envelope.protocol["protocol_id"] == "startup_item_validation_v1"
    assert envelope.metrics["intent_counts"]


def test_startup_item_validation_usage_totals_count_calls() -> None:
    result = asyncio.run(
        StartupItemValidationSimulation().run(
            _ITEM_INPUT,
            sample_size=8,
            seed=3,
            llm_client=FakeLLMClient(),
            sampler=StartupValidationFakeSampler(),
        )
    )

    assert result.raw_results
    for raw in result.raw_results:
        assert raw.metadata["usage_totals"]["llm_calls"] >= 3


def test_startup_item_validation_parse_failure_still_aggregates() -> None:
    result = asyncio.run(
        StartupItemValidationSimulation().run(
            _ITEM_INPUT,
            sample_size=4,
            seed=11,
            llm_client=GarbageValidationLLM(),
            sampler=StartupValidationFakeSampler(),
        )
    )

    assert result.total_responses == 4
    assert result.parse_failed == 4
    assert result.metrics["protocol_id"] == "startup_item_validation_v1"
    assert result.metrics["intent_counts"] == {}
    assert result.metrics["wtp_median"] is None
