from src.agent.prompt_builder import build_system_prompt
from src.llm.base import LLMRequest, LLMResponse
from src.services.followup_service import (
    build_interview_anchor,
    build_study_context,
    run_followup,
    run_interview_turn,
    select_cohort_subset,
)


class FakeFollowupLLM:
    def __init__(self) -> None:
        self.requests: list[LLMRequest] = []

    async def generate(self, request: LLMRequest) -> LLMResponse:
        self.requests.append(request)
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


def test_build_study_context_includes_category_and_questions() -> None:
    context = build_study_context(
        {
            "simulation_type": "market_segmentation",
            "input": {
                "category": "캘리그래피 와 도장 서비스",
                "product_family": "감성 선물",
                "core_questions": ["누가 살까?", "왜 망설일까?"],
            },
        }
    )
    assert "조사 유형: market_segmentation" in context
    assert "캘리그래피 와 도장 서비스" in context
    assert "감성 선물" in context
    assert "누가 살까?" in context


def test_build_interview_anchor_merges_segment_fields_and_response() -> None:
    anchor = build_interview_anchor(
        {
            "parsed": {
                "segment": "추억선물 찾는 이웃",
                "need": "소중한 사람에게 정성 담긴 선물 전달",
                "pain": "시간/비용 부담에 대한 고민",
                "reason": "직접 만드는 과정이 번거롭지만 의미 있는 선물을 원하는 지역 주민들",
            },
            "response": (
                "세그먼트: 추억선물 찾는 이웃\n"
                "니즈: 소중한 사람에게 정성 담긴 선물 전달\n"
                "페인: 시간/비용 부담에 대한 고민\n"
                "이유: 직접 만드는 과정이 번거롭지만 의미 있는 선물을 원하는 지역 주민들\n"
                "부채/도장 등 전통 소재를 활용한 선물 수요"
            ),
        },
        "직접 만드는 과정이 번거롭지만 의미 있는 선물을 원하는 지역 주민들",
    )
    assert "세그먼트: 추억선물 찾는 이웃" in anchor
    assert "니즈: 소중한 사람에게 정성 담긴 선물 전달" in anchor
    assert "페인: 시간/비용 부담" in anchor
    assert "부채/도장" in anchor


def test_interview_system_prompt_excludes_culinary_persona() -> None:
    persona = {
        "age": 55,
        "sex": "여자",
        "province": "경상남",
        "district": "거제시",
        "occupation": "무직",
        "education_level": "고등학교",
        "marital_status": "이혼",
        "family_type": "1인",
        "housing_type": "다세대",
        "professional_persona": "지역 교류를 중시한다.",
        "family_persona": "전 직장 동료들과 정을 나눈다.",
        "culinary_persona": "된장찌개 같은 담백한 한식을 즐긴다.",
        "persona": "정성 있는 선물을 좋아한다.",
    }
    interview_prompt = build_system_prompt(persona, purpose="interview")
    marketing_prompt = build_system_prompt(persona, purpose="marketing")
    assert "된장찌개" not in interview_prompt
    assert "된장찌개" in marketing_prompt
    assert "조사 맥락" in interview_prompt
    assert "식습관" in interview_prompt


def test_run_followup_uses_original_seed_and_returns_answers() -> None:
    client = FakeFollowupLLM()
    result = run_followup(
        original_run={
            "seed": 42,
            "sample_size": 4,
            "target_filter": {"province": ["Seoul"]},
            "simulation_type": "creative_testing",
            "input": {"creatives": ["안심 연결", "외로움 해소"]},
            "country_id": "kr",
        },
        question="왜 그렇게 느꼈나요?",
        cohort="all",
        raw_results=[],
        sample_size=2,
        llm_client=client,
    )

    assert result["question"] == "왜 그렇게 느꼈나요?"
    assert result["cohort"] == "all"
    assert result["panel_seed"] == 42
    assert len(result["answers"]) == 2
    assert result["answers"][0]["answer"] == "가격보다 가족에게 알림이 가는지가 더 중요합니다."
    assert "전체 응답자 2명이 후속 질문에 응답" in result["summary"]
    prompt = client.requests[0].messages[-1].content
    assert "[조사 맥락]" in prompt
    assert "creative_testing" in prompt
    assert "안심 연결" in prompt


def test_run_followup_keeps_us_names_from_raw_results() -> None:
    """US panel follow-up must not invent Korean names/provinces."""
    client = FakeFollowupLLM()
    result = run_followup(
        original_run={
            "seed": 7,
            "sample_size": 2,
            "simulation_type": "churn_prediction",
            "country_id": "us",
            "input": {"product": "SaaS tool"},
        },
        question="What would make you reconsider?",
        cohort="all",
        raw_results=[
            {
                "uuid": "us-1",
                "persona": {
                    "uuid": "us-1",
                    "name": "Don Simmons",
                    "age": 51,
                    "sex": "Male",
                    "province": "FL",
                    "district": "Ocala",
                    "occupation": "paralegal_or_legal_assistant",
                    "_country_id": "us",
                    "persona": "Don Simmons is a careful paralegal in Ocala.",
                },
            },
            {
                "uuid": "us-2",
                "persona": {
                    "uuid": "us-2",
                    "name": "Jessica Irvin",
                    "age": 67,
                    "sex": "Female",
                    "province": "NC",
                    "district": "Jackson Springs",
                    "occupation": "mechanic",
                    "_country_id": "us",
                    "persona": "Jessica Irvin is a pragmatic mechanic.",
                },
            },
        ],
        sample_size=2,
        llm_client=client,
    )

    names = {answer["name"] for answer in result["answers"]}
    provinces = {answer["province"] for answer in result["answers"]}
    assert names == {"Don Simmons", "Jessica Irvin"}
    assert provinces == {"FL", "NC"}
    assert not any(
        any("\uac00" <= ch <= "\ud7a3" for ch in str(answer["name"]))
        for answer in result["answers"]
    )
    assert "전체 응답자 2명이 후속 질문에 응답" in result["summary"]


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


def test_run_interview_turn_injects_study_context_and_omits_culinary_from_system() -> None:
    client = CapturingInterviewLLM()
    run_interview_turn(
        raw_results=[
            {
                "uuid": "persona-geoje",
                "persona": {
                    "uuid": "persona-geoje",
                    "age": 55,
                    "sex": "여자",
                    "province": "경상남",
                    "district": "거제시",
                    "occupation": "무직",
                    "education_level": "고등학교",
                    "marital_status": "이혼",
                    "family_type": "1인",
                    "housing_type": "다세대",
                    "culinary_persona": "된장찌개 같은 담백한 한식을 즐긴다.",
                    "family_persona": "전 직장 동료들과 정을 나눈다.",
                    "persona": "정성 있는 선물을 좋아한다.",
                },
                "response": (
                    "세그먼트: 추억선물 찾는 이웃\n"
                    "니즈: 소중한 사람에게 정성 담긴 선물 전달\n"
                    "페인: 시간/비용 부담\n"
                    "이유: 의미 있는 선물을 원함\n"
                    "부채/도장 등 전통 소재 선물"
                ),
                "parsed": {
                    "segment": "추억선물 찾는 이웃",
                    "need": "소중한 사람에게 정성 담긴 선물 전달",
                    "pain": "시간/비용 부담",
                    "reason": "직접 만드는 과정이 번거롭지만 의미 있는 선물을 원하는 지역 주민들",
                },
            }
        ],
        subject_uuid="persona-geoje",
        question="누구에게 선물해주실건가요? 언제?",
        context_quote="직접 만드는 과정이 번거롭지만 의미 있는 선물을 원하는 지역 주민들",
        original_run={
            "simulation_type": "market_segmentation",
            "input": {
                "category": "캘리그래피 와 도장 서비스",
                "product_family": "감성 선물",
            },
        },
        llm_client=client,
    )

    system = client.requests[0].messages[0].content
    user = client.requests[0].messages[-1].content
    assert "된장찌개" not in system
    assert "[조사 맥락]" in user
    assert "캘리그래피 와 도장 서비스" in user
    assert "market_segmentation" in user
    assert "세그먼트: 추억선물 찾는 이웃" in user
    assert "부채/도장" in user
    assert "무관한 새로운 선물" in user or "조사 맥락" in user
