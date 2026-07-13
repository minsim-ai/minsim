from src.llm.base import LLMRequest, LLMResponse
from src.services.followup_service import run_followup, run_interview_turn, select_cohort_subset


class FakeFollowupLLM:
    async def generate(self, request: LLMRequest) -> LLMResponse:
        return LLMResponse(
            content="답변: 가격보다 가족에게 알림이 가는지가 더 중요합니다.",
            provider="fake",
            provider_model="fake-followup",
            trace_id="trace-followup",
            metadata={"task_type": request.task_type},
        )


class CapturingInterviewLLM:
    def __init__(self) -> None:
        self.requests: list[LLMRequest] = []
        self.closed = False

    async def generate(self, request: LLMRequest) -> LLMResponse:
        self.requests.append(request)
        return LLMResponse(
            content="답변: 3만 원대라면 가족과 상의해볼 수 있습니다.",
            provider="fake",
            provider_model="fake-interview",
            trace_id="trace-interview",
        )

    async def close(self) -> None:
        self.closed = True


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


def test_run_interview_turn_includes_original_quote_and_history() -> None:
    client = CapturingInterviewLLM()
    result = run_interview_turn(
        raw_results=[
            {
                "uuid": "persona-1",
                "persona": {
                    "uuid": "persona-1",
                    "age": 62,
                    "sex": "여자",
                    "province": "서울",
                    "district": "마포구",
                    "occupation": "자영업",
                    "education_level": "고등학교",
                    "marital_status": "기혼",
                    "family_type": "부부",
                    "housing_type": "아파트",
                },
                "response": "선택: B\n이유: 가격이 조금 부담스럽습니다.",
                "parsed": {"choice": "B", "reason": "가격이 조금 부담스럽습니다."},
            }
        ],
        subject_uuid="persona-1",
        question="어느 가격이면 괜찮나요?",
        history=[
            {"role": "user", "content": "왜 부담스러운가요?"},
            {"role": "assistant", "content": "기존 서비스보다 비싸게 느껴져요."},
        ],
        llm_client=client,
    )

    prompt = client.requests[0].messages[-1].content
    assert "가격이 조금 부담스럽습니다." in prompt
    assert "왜 부담스러운가요?" in prompt
    assert "기존 서비스보다 비싸게 느껴져요." in prompt
    assert "어느 가격이면 괜찮나요?" in prompt
    assert result["answer"] == "3만 원대라면 가족과 상의해볼 수 있습니다."
    assert result["provider_model"] == "fake-interview"
    assert client.closed is False
