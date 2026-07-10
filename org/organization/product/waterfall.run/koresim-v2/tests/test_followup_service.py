from src.llm.base import LLMRequest, LLMResponse
from src.services.followup_service import run_followup, select_cohort_subset


class FakeFollowupLLM:
    async def generate(self, request: LLMRequest) -> LLMResponse:
        return LLMResponse(
            content="답변: 가격보다 가족에게 알림이 가는지가 더 중요합니다.",
            provider="fake",
            provider_model="fake-followup",
            trace_id="trace-followup",
            metadata={"task_type": request.task_type},
        )


def test_select_cohort_subset_uses_raw_results_only_for_selection() -> None:
    raw = [
        {"uuid": "p1", "parsed": {"score": 5}},
        {"uuid": "p2", "parsed": {"score": 1}},
        {"uuid": "p3", "parsed": {}},
    ]

    assert [item["uuid"] for item in select_cohort_subset(raw, "positive")] == ["p1"]
    assert [item["uuid"] for item in select_cohort_subset(raw, "negative")] == ["p2"]
    assert [item["uuid"] for item in select_cohort_subset(raw, "confused")] == ["p3"]
    assert [item["uuid"] for item in select_cohort_subset(raw, "all")] == ["p1", "p2", "p3"]


def test_run_followup_uses_original_seed_and_returns_answers() -> None:
    result = run_followup(
        original_run={
            "seed": 42,
            "sample_size": 4,
            "target_filter": {"province": ["Seoul"]},
        },
        question="왜 그렇게 느꼈나요?",
        cohort="all",
        raw_results=[],
        sample_size=2,
        llm_client=FakeFollowupLLM(),
    )

    assert result["question"] == "왜 그렇게 느꼈나요?"
    assert result["cohort"] == "all"
    assert result["panel_seed"] == 42
    assert len(result["answers"]) == 2
    assert result["answers"][0]["answer"] == "가격보다 가족에게 알림이 가는지가 더 중요합니다."
    assert "2명이 후속 질문에 응답" in result["summary"]
