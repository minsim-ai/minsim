import asyncio

from src.api.schemas import PriceOptimizationInput, RunCreateRequest
from src.llm.base import LLMRequest, LLMResponse
from src.simulations.price_research_v2 import PriceResearchV2Simulation


class PriceResearchFakeLLM:
    async def generate(self, request: LLMRequest) -> LLMResponse:
        persona_uuid = str(request.metadata["persona_uuid"])
        task_type = request.task_type
        idx = int(persona_uuid.rsplit("-", 1)[1])

        if task_type == "pricing_response":
            if idx == 0:
                content = (
                    "가격별의향:\n"
                    "9900원: 구매\n"
                    "14900원: 구매\n"
                    "19900원: 관망\n"
                    "선호가격: 14900\n"
                    "지불의향가격: 19900\n"
                    "대표의향: 구매\n"
                    "이유: 실습 결과물이 확실하면 결제할 수 있습니다."
                )
            else:
                content = (
                    "가격별의향:\n"
                    "9900원: 관망\n"
                    "14900원: 거부\n"
                    "19900원: 거부\n"
                    "선호가격: 9900\n"
                    "지불의향가격: 9900\n"
                    "대표의향: 거부\n"
                    "이유: 가격보다 실제 업무 적용 증거가 부족합니다."
                )
        elif task_type == "pricing_objection":
            content = (
                "조건: 결과물증명\n"
                "조건상태: 조건부구매\n"
                "이유: 내 업무 산출물 예시를 보면 결제할 수 있습니다."
            )
        elif task_type == "pricing_anchor":
            content = (
                "유사서비스: 업무 자동화 강의\n"
                "월지출: 12000\n"
                "앵커범주: AI학습\n"
                "이유: 업무에 바로 쓰는 교육과 같은 분류로 봅니다."
            )
        elif task_type == "pricing_hesitation":
            content = (
                "망설임: 신뢰부족\n"
                "이유: 결과 품질을 먼저 확인하고 싶습니다."
            )
        else:
            raise AssertionError(task_type)

        return LLMResponse(
            content=content,
            provider="fake",
            provider_model=f"fake-{task_type}",
            metadata={"task_type": task_type},
        )


class PriceResearchFakeSampler:
    def sample(self, n: int, filter_=None, seed: int = 42) -> list[dict]:
        return [
            {
                "uuid": f"persona-{idx}",
                "age": 31 + idx,
                "sex": "여성" if idx else "남성",
                "province": "서울",
                "district": "서울-강남구",
                "occupation": "마케터",
                "education_level": "4년제 대학교",
                "marital_status": "미혼",
                "family_type": "1인가구",
                "housing_type": "아파트",
                "professional_persona": "업무 효율 도구에 관심이 많은 직장인",
                "family_persona": "구독 지출을 신중하게 검토함",
                "culinary_persona": "새로운 상품을 비교해 봄",
                "persona": "실용적인 소비자",
            }
            for idx in range(n)
        ]


def test_price_optimization_accepts_price_research_v2_protocol() -> None:
    request = RunCreateRequest.model_validate(
        {
            "simulation_type": "price_optimization",
            "input": {
                "protocol_id": "price_research_v2",
                "product_name": "로나",
                "product_description": "업무 맞춤 AI 실습 서비스",
                "price_points": [19900, 9900, 14900],
            },
            "sample_size": 2,
        }
    )

    assert isinstance(request.input, PriceOptimizationInput)
    assert request.input.protocol_id == "price_research_v2"
    assert request.input.price_points == [9900, 14900, 19900]


def test_price_research_v2_runs_multistep_protocol_and_aggregates() -> None:
    result = asyncio.run(
        PriceResearchV2Simulation().run(
            {
                "protocol_id": "price_research_v2",
                "product_name": "로나",
                "product_description": "업무 맞춤 AI 실습 서비스",
                "price_points": [9900, 14900, 19900],
                "calibration": {
                    "dimensions": {
                        "occupation": {
                            "마케터": 1.0,
                        }
                    }
                },
            },
            sample_size=2,
            seed=77,
            llm_client=PriceResearchFakeLLM(),
            sampler=PriceResearchFakeSampler(),
        )
    )

    assert result.total_responses == 2
    assert result.parse_failed == 0
    assert result.metrics["headline_intent_counts"] == {"구매": 1, "거부": 1}
    assert result.metrics["conditional_yes_count"] == 1
    assert result.metrics["conditional_yes_rate"] == 50.0
    assert result.metrics["condition_category_counts"] == {"결과물증명": 1}
    assert result.metrics["anchor_category_counts"] == {"AI학습": 1}
    assert result.metrics["hesitation_reason_counts"] == {"신뢰부족": 1}
    assert result.metrics["calibration"]["dimension"] == "occupation"
    assert result.protocol["protocol_id"] == "price_research_v2"
    assert result.protocol["interview_guide"]["questions"][0]["question"].startswith("최근 1년에")
    assert [step["id"] for step in result.protocol["step_summaries"]] == [
        "price_ladder",
        "rejection_conditions",
        "comparison_anchor",
        "non_price_hesitation",
    ]
    assert result.parsed_results[1]["protocol_steps"]["rejection_conditions"]["condition_status"] == "조건부구매"
