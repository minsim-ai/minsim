"""가격 후보에 없는 답을 조용히 흘려보내지 않는다.

프로덕션 run 7a6184c8: 후보가 30,000/40,000/50,000원인데 설명문에 남아 있던
"한달 이용료 3천원"에 앵커링되어 200명 중 170명이 3,000원을 답했다.
집계는 이를 걸러내지 않았고, 화면에는 '구매 반응률 77.5%'만 표시됐다.
"""
from dataclasses import dataclass, field
from typing import Any

from src.simulations.generic_suite import _aggregate_price, _build_price_prompt


@dataclass
class _Raw:
    persona: dict[str, Any] = field(default_factory=lambda: {"age": 24, "sex": "여", "province": "대구"})
    response: str = ""
    error: str | None = None

INPUT = {
    "product_name": "택시 합승 앱",
    "product_description": "한달 이용료 3천원 정도면 괜찮을까?",
    "price_points": [30000, 40000, 50000],
}


def _parsed(price: int, intent: str = "구매") -> dict:
    return {
        "primary": str(price),
        "preferred_price": price,
        "intent": intent,
        "willingness_to_pay": price,
        "reason": "테스트",
    }


def test_off_option_answers_are_counted_and_surfaced():
    parsed = [_parsed(3000) for _ in range(170)] + [_parsed(30000) for _ in range(30)]
    metrics = _aggregate_price(INPUT, [_Raw() for _ in range(200)], parsed)["metrics"]

    assert metrics["off_option_count"] == 170
    assert metrics["off_option_rate"] == 85.0
    assert metrics["off_option_prices"] == {"3000": 170}
    assert metrics["warnings"], "후보 밖 응답이 다수면 경고가 있어야 한다"


def test_clean_run_has_no_off_option_warning():
    parsed = [_parsed(30000) for _ in range(50)] + [_parsed(40000) for _ in range(50)]
    metrics = _aggregate_price(INPUT, [_Raw() for _ in range(100)], parsed)["metrics"]

    assert metrics["off_option_count"] == 0
    assert metrics["off_option_rate"] == 0.0
    assert metrics["warnings"] == []


def test_prompt_forbids_prices_outside_the_candidate_list():
    prompt = _build_price_prompt(INPUT)
    assert "가격 후보" in prompt
    # 설명문에 다른 금액이 있어도 후보 중에서만 고르도록 지시해야 한다.
    assert "제품 설명에 다른 금액" in prompt
