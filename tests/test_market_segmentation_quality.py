from src.simulations.common import parse_line
from src.simulations.generic_suite import (
    _build_market_segmentation_prompt,
    _parse_market_segmentation_response,
)


def test_parse_line_does_not_extract_instruction_fragment_as_label() -> None:
    response = (
        "**시장 세그먼트와 핵심 니즈를 답하세요.**\n"
        "니즈: 간편한 건강관리\n"
        "페인: 맛과 가격 불신\n"
        "이유: 바쁜 일상에서 빠르게 먹을 수 있어야 합니다."
    )

    assert parse_line(response, "세그먼트") == ""


def test_market_segmentation_parser_rejects_template_residue_labels() -> None:
    for response in (
        "세그먼트: 짧은 이름\n니즈: 짧은 표현\n페인: 짧은 표현\n이유: 한 문장",
        "세그먼트: 와 핵심 니즈를 답하세요.**\n니즈: 를 답하세요.**\n페인: 없음\n이유: 복사됨",
        "세그먼트: 답변 형식\n니즈: 간편함\n페인: 가격\n이유: 템플릿 복사",
    ):
        assert _parse_market_segmentation_response(response) is None


def test_market_segmentation_parser_accepts_clean_segment_label() -> None:
    parsed = _parse_market_segmentation_response(
        "세그먼트: 바쁜 건강관리족\n"
        "니즈: 간편한 단백질 보충\n"
        "페인: 맛과 가격 불신\n"
        "이유: 업무 중 빠르게 먹을 수 있는 건강 간식이 필요합니다."
    )

    assert parsed == {
        "primary": "바쁜 건강관리족",
        "segment": "바쁜 건강관리족",
        "interest": "관심있음",
        "need": "간편한 단백질 보충",
        "pain": "맛과 가격 불신",
        "reason": "업무 중 빠르게 먹을 수 있는 건강 간식이 필요합니다.",
    }


def test_market_segmentation_parser_splits_interest_buckets() -> None:
    no_interest = _parse_market_segmentation_response(
        "관심: 관심없음\n세그먼트:\n니즈:\n페인: 이 카테고리를 쓰지 않습니다\n이유: 필요를 느끼지 못합니다."
    )
    assert no_interest is not None
    assert no_interest["segment"] == "관심없음"
    assert no_interest["interest"] == "관심없음"

    price_block = _parse_market_segmentation_response(
        "관심: 가격저항\n세그먼트: 가성비 중시 직장인\n니즈: 저렴한 대안\n페인: 가격\n이유: 지금 가격은 부담됩니다."
    )
    assert price_block is not None
    assert price_block["interest"] == "가격저항"
    assert price_block["segment"] == "가성비 중시 직장인"


def test_market_segmentation_prompt_avoids_ambiguous_instruction_phrase() -> None:
    prompt = _build_market_segmentation_prompt(
        {
            "category": "저당 고단백 간식",
            "product_family": "간식",
            "core_questions": ["누가 가장 필요로 하나요?", "구매 장벽은 무엇인가요?"],
        }
    )

    assert "시장 세그먼트와 핵심 니즈를 답하세요" not in prompt
    assert "세그먼트: 예시를 복사하지 말고" in prompt
