import asyncio

from src.api.schemas import RunCreateRequest, ValuePropositionInput
from src.llm.base import LLMRequest, LLMResponse
from src.simulations.product_qa_v1 import ProductQAV1Simulation


class ProductQAFakeLLM:
    async def generate(self, request: LLMRequest) -> LLMResponse:
        persona_uuid = str(request.metadata["persona_uuid"])
        idx = int(persona_uuid.rsplit("-", 1)[1])
        top = "A" if idx == 0 else "B"
        bottom = "C"
        return LLMResponse(
            content=(
                f"순위: {top} > C > {'B' if top == 'A' else 'A'}\n"
                f"최상위: {top}\n"
                f"최하위: {bottom}\n"
                "명확성: 4\n"
                "신뢰도: 3\n"
                "행동가능성: 5\n"
                "이유: 업무 상황에서 바로 판단하기 쉽습니다."
            ),
            provider="fake",
            provider_model="fake-product-qa",
            metadata={"task_type": request.task_type},
        )


class ProductQAFakeSampler:
    def sample(self, n: int, filter_=None, seed: int = 42) -> list[dict]:
        return [
            {
                "uuid": f"persona-{idx}",
                "age": 34 + idx,
                "sex": "여성" if idx % 2 else "남성",
                "province": "서울",
                "district": "서울-강남구",
                "occupation": "기획자",
                "education_level": "4년제 대학교",
                "marital_status": "기혼",
                "family_type": "2인가구",
                "housing_type": "아파트",
                "professional_persona": "B2B SaaS 도입 문구를 꼼꼼히 비교하는 직장인",
                "family_persona": "지출 대비 효용을 따짐",
                "culinary_persona": "새로운 서비스를 비교해 봄",
                "persona": "실용적인 소비자",
            }
            for idx in range(n)
        ]


def test_value_proposition_accepts_product_qa_protocol() -> None:
    request = RunCreateRequest.model_validate(
        {
            "simulation_type": "value_proposition",
            "input": {
                "protocol_id": "product_qa_v1",
                "artifact_type": "landing_copy",
                "product_context": "AI persona research SaaS",
                "statements": ["빠른 리서치", "조건부 거절 분석", "인터뷰 가이드"],
                "criteria": ["명확성", "신뢰도", "행동가능성"],
            },
            "sample_size": 2,
        }
    )

    assert isinstance(request.input, ValuePropositionInput)
    assert request.input.protocol_id == "product_qa_v1"
    assert request.input.artifact_type == "landing_copy"


def test_product_qa_v1_ranks_artifacts_and_scores_criteria() -> None:
    result = asyncio.run(
        ProductQAV1Simulation().run(
            {
                "protocol_id": "product_qa_v1",
                "artifact_type": "landing_copy",
                "product_context": "AI persona research SaaS",
                "statements": ["빠른 리서치", "조건부 거절 분석", "인터뷰 가이드"],
                "criteria": ["명확성", "신뢰도", "행동가능성"],
            },
            sample_size=2,
            seed=77,
            llm_client=ProductQAFakeLLM(),
            sampler=ProductQAFakeSampler(),
        )
    )

    assert result.total_responses == 2
    assert result.parse_failed == 0
    assert result.metrics["protocol_id"] == "product_qa_v1"
    assert result.metrics["top_choice_counts"] == {"A": 1, "B": 1}
    assert result.metrics["bottom_choice_counts"] == {"C": 2}
    assert result.metrics["average_scores"] == {
        "clarity": 4.0,
        "credibility": 3.0,
        "actionability": 5.0,
    }
    assert result.protocol["protocol_id"] == "product_qa_v1"
    assert result.parsed_results[0]["ranking"][0] == "A"
