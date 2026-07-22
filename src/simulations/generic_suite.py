"""Phase 5 simulation reference implementations built on the common runner."""
from __future__ import annotations

import re
from collections import Counter, defaultdict
from typing import Any, Callable

from src.simulations.common import (
    LETTERS,
    GenericPersonaSimulation,
    demographic_segments,
    parse_choice,
    parse_label,
    parse_line,
    parse_reason,
    parse_score,
    pct,
    top_counts,
)
from src.simulations.tagging import INTEREST_VALUES, RESIDUAL_TAG, SEGMENT_TAG_CAP, merge_similar_tags
from src.simulations.price_research_v2 import PriceResearchV2Simulation, PROTOCOL_ID
from src.simulations.product_qa_v1 import ProductQAV1Simulation, PRODUCT_QA_PROTOCOL_ID


SimulationRunner = Callable[..., Any]


def price_optimization_runner() -> GenericPersonaSimulation:
    return PriceOptimizationSimulation(
        simulation_type="price_optimization",
        purpose="pricing research",
        task_type="pricing_response",
        prompt_builder=_build_price_prompt,
        parser=_parse_price_response,
        aggregator=_aggregate_price,
        # demand_by_price는 가격 값 자체를 키로 쓰므로 회전에 안전하다.
        # 미적용 시 수용선 근처에서 앵커링으로 ±43%p 흔들린다 (2026-07-21 실측).
        rotation_field="price_points",
    )


class PriceOptimizationSimulation(GenericPersonaSimulation):
    async def run(self, input_data: dict[str, Any], *args: Any, **kwargs: Any) -> Any:
        if input_data.get("protocol_id") == PROTOCOL_ID:
            return await PriceResearchV2Simulation().run(input_data, *args, **kwargs)
        return await super().run(input_data, *args, **kwargs)


def product_launch_runner() -> GenericPersonaSimulation:
    return GenericPersonaSimulation(
        simulation_type="product_launch",
        purpose="product launch research",
        task_type="launch_response",
        prompt_builder=_build_product_launch_prompt,
        parser=_parse_product_launch_response,
        aggregator=_aggregate_product_launch,
    )


def value_proposition_runner() -> GenericPersonaSimulation:
    return ValuePropositionSimulation(
        simulation_type="value_proposition",
        purpose="value proposition research",
        task_type="value_prop_response",
        prompt_builder=_build_value_proposition_prompt,
        parser=_parse_value_proposition_response,
        aggregator=_aggregate_value_proposition,
    )


class ValuePropositionSimulation(GenericPersonaSimulation):
    async def run(self, input_data: dict[str, Any], *args: Any, **kwargs: Any) -> Any:
        if input_data.get("protocol_id") == PRODUCT_QA_PROTOCOL_ID:
            return await ProductQAV1Simulation().run(input_data, *args, **kwargs)
        return await super().run(input_data, *args, **kwargs)


def market_segmentation_runner() -> GenericPersonaSimulation:
    return GenericPersonaSimulation(
        simulation_type="market_segmentation",
        purpose="market segmentation research",
        task_type="segmentation_response",
        prompt_builder=_build_market_segmentation_prompt,
        parser=_parse_market_segmentation_response,
        aggregator=_aggregate_market_segmentation,
    )


def competitive_positioning_runner() -> GenericPersonaSimulation:
    return GenericPersonaSimulation(
        simulation_type="competitive_positioning",
        purpose="competitive positioning research",
        task_type="positioning_response",
        prompt_builder=_build_competitive_positioning_prompt,
        parser=_parse_competitive_positioning_response,
        aggregator=_aggregate_competitive_positioning,
    )


def brand_perception_runner() -> GenericPersonaSimulation:
    return GenericPersonaSimulation(
        simulation_type="brand_perception",
        purpose="brand perception research",
        task_type="brand_response",
        prompt_builder=_build_brand_perception_prompt,
        # score_counts/associations는 위치 라벨을 쓰지 않으므로 회전에 안전하다.
        rotation_field="attributes",
        parser=_parse_brand_perception_response,
        aggregator=_aggregate_brand_perception,
    )


def churn_prediction_runner() -> GenericPersonaSimulation:
    return GenericPersonaSimulation(
        simulation_type="churn_prediction",
        purpose="retention and churn research",
        task_type="churn_response",
        prompt_builder=_build_churn_prediction_prompt,
        parser=_parse_churn_prediction_response,
        aggregator=_aggregate_churn_prediction,
    )


def campaign_strategy_runner() -> GenericPersonaSimulation:
    return GenericPersonaSimulation(
        simulation_type="campaign_strategy",
        purpose="campaign strategy research",
        task_type="campaign_response",
        prompt_builder=_build_campaign_strategy_prompt,
        # channel_counts는 모델이 돌려준 채널 '이름'을 키로 쓰므로 회전에 안전하다.
        rotation_field="channels",
        parser=_parse_campaign_strategy_response,
        aggregator=_aggregate_campaign_strategy,
    )


def _build_price_prompt(input_data: dict[str, Any]) -> str:
    prices = ", ".join(f"{price:,}원" for price in input_data["price_points"])
    return (
        f"제품명: {input_data['product_name']}\n"
        f"제품 설명: {input_data['product_description']}\n"
        f"가격 후보: {prices}\n"
        f"상황: {input_data.get('context_note') or '일반 소비 상황'}\n\n"
        "각 가격 후보를 비교해 본인이 실제 소비자라면 어떤 가격에서 구매할지 답하세요.\n"
        "선호가격은 반드시 위 가격 후보 중 하나를 그대로 적습니다. "
        "제품 설명에 다른 금액이 적혀 있어도 무시하고 후보 중에서만 고르세요.\n"
        "답변 형식:\n"
        "선호가격: 숫자만\n"
        "의향: 구매/관망/거부 중 하나\n"
        "지불의향가격: 숫자만\n"
        "이유: 한 문장"
    )


def _parse_price_response(response: str) -> dict[str, Any] | None:
    price = _parse_int_line(response, "선호가격")
    wtp = _parse_int_line(response, "지불의향가격")
    intent = parse_label(response, "의향", ["구매", "관망", "거부"])
    if price is None or intent is None:
        return None
    return {
        "primary": str(price),
        "preferred_price": price,
        "intent": intent,
        "willingness_to_pay": wtp or price,
        "reason": parse_reason(response),
    }


def _aggregate_price(
    input_data: dict[str, Any],
    raw_results: list[Any],
    parsed_results: list[dict[str, Any] | None],
) -> dict[str, Any]:
    parsed = _valid(parsed_results)
    total = len(parsed)
    preferred_counts = Counter(item["preferred_price"] for item in parsed)
    intent_counts = Counter(item["intent"] for item in parsed)
    prices = input_data["price_points"]
    demand = {
        str(price): {
            "count": sum(
                1
                for item in parsed
                if item["willingness_to_pay"] >= price and item["intent"] != "거부"
            ),
            "pct": pct(
                sum(
                    1
                    for item in parsed
                    if item["willingness_to_pay"] >= price and item["intent"] != "거부"
                ),
                total,
            ),
        }
        for price in prices
    }
    recommended = (
        max(prices, key=lambda price: demand[str(price)]["count"]) if prices else None
    )

    # 후보에 없는 금액을 답한 응답. 제품 설명에 남은 가격에 앵커링되면 대량 발생하고,
    # 그대로 두면 demand_by_price에서 조용히 빠져 소수 표본으로 추천가가 정해진다.
    allowed = {int(price) for price in prices}
    off_option = Counter(
        item["preferred_price"] for item in parsed if item["preferred_price"] not in allowed
    )
    off_option_count = sum(off_option.values())
    off_option_rate = pct(off_option_count, total)
    warnings: list[str] = []
    if off_option_count:
        top = ", ".join(f"{price:,}원 {count}명" for price, count in off_option.most_common(3))
        warnings.append(
            f"응답자 {off_option_count}명({off_option_rate}%)이 제시한 가격 후보에 없는 금액을 "
            f"골랐습니다 ({top}). 제품 설명에 다른 금액이 적혀 있으면 응답이 그 금액에 "
            f"쏠립니다. 설명에서 가격 문구를 빼고 다시 실행하세요."
        )

    return {
        "metrics": {
            "price_points": prices,
            "off_option_count": off_option_count,
            "off_option_rate": off_option_rate,
            "off_option_prices": {str(k): v for k, v in off_option.items()},
            "warnings": warnings,
            "preferred_price_counts": {str(k): v for k, v in preferred_counts.items()},
            "preferred_price_pct": {str(k): pct(v, total) for k, v in preferred_counts.items()},
            "intent_counts": dict(intent_counts),
            "intent_pct": {k: pct(v, total) for k, v in intent_counts.items()},
            "demand_by_price": demand,
            "recommended_price": recommended,
            "avg_willingness_to_pay": _avg([item["willingness_to_pay"] for item in parsed]),
            "top_reasons": top_counts([item["reason"] for item in parsed], limit=8),
        },
        "segments": demographic_segments(raw_results, parsed_results, key="intent"),
        "insights": _single_insight(
            "recommended_price",
            "Recommended price",
            f"{recommended:,}원" if recommended else "insufficient data",
            demand.get(str(recommended), {}) if recommended else {},
        ),
    }


def _build_product_launch_prompt(input_data: dict[str, Any]) -> str:
    features = "\n".join(f"- {feature}" for feature in input_data["key_features"])
    alternatives = ", ".join(input_data.get("alternatives") or ["기존 대안"])
    return (
        f"제품 컨셉:\n{input_data['product_concept']}\n\n"
        f"핵심 기능:\n{features}\n"
        f"사용 상황: {input_data.get('target_use_case') or input_data['product_concept']}\n"
        f"예상 가격대: {input_data.get('expected_price_range') or '미정'}\n"
        f"대안: {alternatives}\n\n"
        "이 제품이 출시되면 본인에게 얼마나 매력적인지 답하세요.\n"
        "답변 형식:\n"
        "점수: 1~5\n"
        "의향: 구매/관망/거부 중 하나\n"
        "포지셔닝: 짧은 문구\n"
        "이유: 한 문장"
    )


def _parse_product_launch_response(response: str) -> dict[str, Any] | None:
    score = parse_score(response)
    intent = parse_label(response, "의향", ["구매", "관망", "거부"])
    if score is None or intent is None:
        return None
    return {
        "primary": intent,
        "score": score,
        "intent": intent,
        "positioning": parse_line(response, "포지셔닝"),
        "reason": parse_reason(response),
    }


def _aggregate_product_launch(
    input_data: dict[str, Any],
    raw_results: list[Any],
    parsed_results: list[dict[str, Any] | None],
) -> dict[str, Any]:
    parsed = _valid(parsed_results)
    total = len(parsed)
    scores = Counter(item["score"] for item in parsed)
    intents = Counter(item["intent"] for item in parsed)
    return {
        "metrics": {
            "score_counts": {str(k): v for k, v in scores.items()},
            "score_pct": {str(k): pct(v, total) for k, v in scores.items()},
            "average_score": _avg([item["score"] for item in parsed]),
            "intent_counts": dict(intents),
            "intent_pct": {k: pct(v, total) for k, v in intents.items()},
            "positioning_angles": top_counts(
                [item["positioning"] for item in parsed], limit=8
            ),
            "top_reasons": top_counts([item["reason"] for item in parsed], limit=8),
        },
        "segments": demographic_segments(raw_results, parsed_results, key="intent"),
        "insights": _top_count_insight("launch_intent", "Top launch intent", intents, total),
    }


def _build_value_proposition_prompt(input_data: dict[str, Any]) -> str:
    options = "\n".join(
        f"[{LETTERS[index]}] {statement}"
        for index, statement in enumerate(input_data["statements"])
    )
    return (
        f"제품/서비스 맥락:\n{input_data['product_context']}\n\n"
        f"가치 제안 후보:\n{options}\n\n"
        "가장 설득력 있는 후보를 고르세요.\n"
        "답변 형식:\n"
        "선택: A/B/C 중 하나\n"
        "설득력: 1~5\n"
        "명확성: 1~5\n"
        "공감도: 1~5\n"
        "이유: 한 문장"
    )


def _parse_value_proposition_response(response: str) -> dict[str, Any] | None:
    choice = parse_choice(response, list(LETTERS))
    persuasiveness = parse_score(response, "설득력")
    clarity = parse_score(response, "명확성")
    resonance = parse_score(response, "공감도")
    if choice is None or persuasiveness is None:
        return None
    return {
        "primary": choice,
        "choice": choice,
        "persuasiveness": persuasiveness,
        "clarity": clarity or persuasiveness,
        "resonance": resonance or persuasiveness,
        "reason": parse_reason(response),
    }


def _aggregate_value_proposition(
    input_data: dict[str, Any],
    raw_results: list[Any],
    parsed_results: list[dict[str, Any] | None],
) -> dict[str, Any]:
    parsed = _valid(parsed_results)
    total = len(parsed)
    choices = Counter(item["choice"] for item in parsed)
    return {
        "metrics": {
            "statements": _lettered(input_data["statements"]),
            "choice_counts": dict(choices),
            "choice_pct": {k: pct(v, total) for k, v in choices.items()},
            "average_persuasiveness": _avg([item["persuasiveness"] for item in parsed]),
            "average_clarity": _avg([item["clarity"] for item in parsed]),
            "average_resonance": _avg([item["resonance"] for item in parsed]),
            "top_reasons": top_counts([item["reason"] for item in parsed], limit=8),
        },
        "segments": demographic_segments(raw_results, parsed_results, key="choice"),
        "insights": _top_count_insight("winning_statement", "Winning statement", choices, total),
    }


SEGMENTATION_PROMPT_VERSION = "market-segmentation-prompt:v2-20260716"


def _build_market_segmentation_prompt(input_data: dict[str, Any]) -> str:
    questions = "\n".join(f"- {question}" for question in input_data["core_questions"])
    return (
        f"카테고리: {input_data['category']}\n"
        f"제품군: {input_data.get('product_family') or '미정'}\n"
        f"조사 질문:\n{questions}\n\n"
        "본인의 태도, 구매 상황, 장벽을 기준으로 가장 가까운 고객군 이름을 만드세요.\n"
        "아래 형식의 설명 문구나 예시 문구를 그대로 복사하지 마세요.\n"
        "이 카테고리에 관심이 없거나 가격 때문에 고려하지 않는다면 관심 항목에 그렇게 답하고,\n"
        "세그먼트 이름 대신 그 이유를 페인에 쓰세요.\n"
        "답변 형식:\n"
        "관심: 관심있음/관심없음/가격저항 중 하나\n"
        "세그먼트: 예시를 복사하지 말고 2~5단어 한국어 고객군 이름 (예: 바쁜 건강관리족)\n"
        "니즈: 본인이 원하는 핵심 효용 1개\n"
        "페인: 구매를 망설이게 하는 장벽 1개\n"
        "이유: 한 문장"
    )


def _parse_market_segmentation_response(response: str) -> dict[str, Any] | None:
    segment = _clean_market_segmentation_label(parse_line(response, "세그먼트", limit=80))
    interest_raw = parse_line(response, "관심", limit=20)
    interest = next(
        (value for value in INTEREST_VALUES if value in interest_raw),
        "관심있음",  # legacy responses without the 관심 line stay valid
    )
    if not segment:
        if interest == "관심있음":
            return None
        segment = interest
    need = _clean_market_segmentation_label(parse_line(response, "니즈", limit=120))
    pain = _clean_market_segmentation_label(parse_line(response, "페인", limit=120))
    return {
        "primary": segment,
        "segment": segment,
        "interest": interest,
        "need": need,
        "pain": pain,
        "reason": parse_reason(response),
    }


MARKET_SEGMENTATION_TEMPLATE_RE = re.compile(
    r"(답하세요|답변\s*형식|짧은\s*(이름|표현)|한\s*문장|예시를\s*복사|복사됨|^\s*와\s*핵심\s*니즈|^\s*를\s*답하세요|\*\*)"
)


def _clean_market_segmentation_label(value: str) -> str:
    cleaned = re.sub(r"\s+", " ", value).strip(" \t\r\n`*_\"'“”‘’")
    if not cleaned:
        return ""
    if MARKET_SEGMENTATION_TEMPLATE_RE.search(cleaned):
        return ""
    return cleaned[:120]


def _aggregate_market_segmentation(
    input_data: dict[str, Any],
    raw_results: list[Any],
    parsed_results: list[dict[str, Any] | None],
) -> dict[str, Any]:
    parsed = _valid(parsed_results)
    total = len(parsed)
    interest_breakdown = Counter(item.get("interest", "관심있음") for item in parsed)
    interested = [item for item in parsed if item.get("interest", "관심있음") == "관심있음"]
    raw_segments = Counter(item["segment"] for item in interested)
    bounded_counts, tag_aliases = merge_similar_tags(raw_segments, cap=SEGMENT_TAG_CAP)
    segments = Counter(bounded_counts)
    named = Counter(
        {label: count for label, count in segments.items() if label != RESIDUAL_TAG}
    )
    return {
        "metrics": {
            "category": input_data["category"],
            "segment_counts": dict(segments),
            "segment_pct": {k: pct(v, total) for k, v in segments.items()},
            "interest_breakdown": {
                value: interest_breakdown.get(value, 0) for value in INTEREST_VALUES
            },
            "tag_aliases": tag_aliases,
            "needs": top_counts([item["need"] for item in interested], limit=10),
            "pains": top_counts([item["pain"] for item in parsed], limit=10),
            "recommended_first_target": named.most_common(1)[0][0] if named else None,
        },
        "segments": demographic_segments(raw_results, parsed_results, key="segment"),
        "insights": _top_count_insight("first_target", "Recommended first target", named, total),
    }


def _build_competitive_positioning_prompt(input_data: dict[str, Any]) -> str:
    products = "\n".join(
        f"[{LETTERS[index]}] {product}" for index, product in enumerate(input_data["products"])
    )
    attributes = ", ".join(input_data.get("attributes") or ["가격", "품질", "신뢰", "편의"])
    return (
        f"카테고리 맥락:\n{input_data['category_context']}\n\n"
        f"제품 후보:\n{products}\n"
        f"평가 속성: {attributes}\n\n"
        "가장 선택할 가능성이 높은 제품과 이유를 답하세요.\n"
        "답변 형식:\n"
        "선택: A/B/C 중 하나\n"
        "강점: 짧은 표현\n"
        "약점: 짧은 표현\n"
        "이유: 한 문장"
    )


def _parse_competitive_positioning_response(response: str) -> dict[str, Any] | None:
    choice = parse_choice(response, list(LETTERS))
    if choice is None:
        return None
    return {
        "primary": choice,
        "choice": choice,
        "strength": parse_line(response, "강점", limit=120),
        "weakness": parse_line(response, "약점", limit=120),
        "reason": parse_reason(response),
    }


def _aggregate_competitive_positioning(
    input_data: dict[str, Any],
    raw_results: list[Any],
    parsed_results: list[dict[str, Any] | None],
) -> dict[str, Any]:
    parsed = _valid(parsed_results)
    total = len(parsed)
    choices = Counter(item["choice"] for item in parsed)
    return {
        "metrics": {
            "products": _lettered(input_data["products"]),
            "preference_counts": dict(choices),
            "preference_pct": {k: pct(v, total) for k, v in choices.items()},
            "strengths": top_counts([item["strength"] for item in parsed], limit=10),
            "weaknesses": top_counts([item["weakness"] for item in parsed], limit=10),
            "top_reasons": top_counts([item["reason"] for item in parsed], limit=8),
        },
        "segments": demographic_segments(raw_results, parsed_results, key="choice"),
        "insights": _top_count_insight("preferred_product", "Preferred product", choices, total),
    }


def _build_brand_perception_prompt(input_data: dict[str, Any]) -> str:
    attributes = ", ".join(input_data["attributes"])
    return (
        f"브랜드명: {input_data['brand_name']}\n"
        f"카테고리: {input_data['category']}\n"
        f"평가 속성: {attributes}\n"
        f"상황: {input_data.get('context_note') or '일반 인지 상황'}\n\n"
        "이 브랜드를 어떻게 인식하는지 답하세요.\n"
        "답변 형식:\n"
        "점수: 1~5\n"
        "연상어: 쉼표로 2~3개\n"
        "긍정: 짧은 표현\n"
        "부정: 짧은 표현\n"
        "이유: 한 문장"
    )


def _parse_brand_perception_response(response: str) -> dict[str, Any] | None:
    score = parse_score(response)
    associations = parse_line(response, "연상어", limit=160)
    if score is None:
        return None
    return {
        "primary": str(score),
        "score": score,
        "associations": [item.strip() for item in associations.split(",") if item.strip()],
        "positive": parse_line(response, "긍정", limit=120),
        "negative": parse_line(response, "부정", limit=120),
        "reason": parse_reason(response),
    }


def _aggregate_brand_perception(
    input_data: dict[str, Any],
    raw_results: list[Any],
    parsed_results: list[dict[str, Any] | None],
) -> dict[str, Any]:
    parsed = _valid(parsed_results)
    total = len(parsed)
    scores = Counter(item["score"] for item in parsed)
    associations = [association for item in parsed for association in item["associations"]]
    return {
        "metrics": {
            "brand_name": input_data["brand_name"],
            "score_counts": {str(k): v for k, v in scores.items()},
            "score_pct": {str(k): pct(v, total) for k, v in scores.items()},
            "average_score": _avg([item["score"] for item in parsed]),
            "associations": top_counts(associations, limit=12),
            "positive_themes": top_counts([item["positive"] for item in parsed], limit=10),
            "negative_themes": top_counts([item["negative"] for item in parsed], limit=10),
        },
        "segments": demographic_segments(raw_results, parsed_results, key="score"),
        "insights": _single_insight(
            "brand_score",
            "Average brand perception score",
            _avg([item["score"] for item in parsed]),
            {"sample": total},
        ),
    }


def _build_churn_prediction_prompt(input_data: dict[str, Any]) -> str:
    return (
        f"서비스명: {input_data['service_name']}\n"
        f"현재 상황:\n{input_data['current_situation']}\n"
        f"이탈 촉발 이벤트:\n{input_data['trigger_event']}\n"
        f"경쟁 제안: {input_data.get('competitor_offer') or '없음'}\n\n"
        "본인이라면 이 서비스를 유지할지 이탈할지 답하세요.\n"
        "답변 형식:\n"
        "의향: 유지/관망/이탈 중 하나\n"
        "확신도: 1~5\n"
        "나를 잡으려면: 짧은 표현\n"
        "이유: 한 문장"
    )


def _parse_churn_prediction_response(response: str) -> dict[str, Any] | None:
    intent = parse_label(response, "의향", ["유지", "관망", "이탈"])
    confidence = parse_score(response, "확신도")
    if intent is None:
        return None
    return {
        "primary": intent,
        "intent": intent,
        "confidence": confidence or 3,
        "retention_hook": parse_line(response, "나를 잡으려면", limit=160),
        "reason": parse_reason(response),
    }


def _aggregate_churn_prediction(
    input_data: dict[str, Any],
    raw_results: list[Any],
    parsed_results: list[dict[str, Any] | None],
) -> dict[str, Any]:
    parsed = _valid(parsed_results)
    total = len(parsed)
    intents = Counter(item["intent"] for item in parsed)
    return {
        "metrics": {
            "service_name": input_data["service_name"],
            "intent_counts": dict(intents),
            "intent_pct": {k: pct(v, total) for k, v in intents.items()},
            "churn_risk_pct": pct(intents.get("이탈", 0), total),
            "retention_pct": pct(intents.get("유지", 0), total),
            "watch_pct": pct(intents.get("관망", 0), total),
            "average_confidence": _avg([item["confidence"] for item in parsed]),
            "top_reasons": top_counts([item["reason"] for item in parsed], limit=8),
            "retention_hooks": top_counts(
                [item["retention_hook"] for item in parsed], limit=10
            ),
        },
        "segments": demographic_segments(raw_results, parsed_results, key="intent"),
        "insights": _top_count_insight("churn_intent", "Top churn intent", intents, total),
    }


def _build_campaign_strategy_prompt(input_data: dict[str, Any]) -> str:
    channels = "\n".join(
        f"- {channel['name']}: {channel.get('description') or ''}"
        for channel in input_data["channels"]
    )
    messages = "\n".join(
        f"- {message['name']}: {message['creative']}" for message in input_data["messages"]
    )
    return (
        f"제품/서비스 맥락:\n{input_data['product_context']}\n"
        f"예산: {input_data['budget']:,}원\n\n"
        f"채널 후보:\n{channels}\n\n"
        f"메시지 후보:\n{messages}\n\n"
        "본인에게 가장 반응이 좋을 채널과 메시지를 고르세요.\n"
        "답변 형식:\n"
        "채널: 후보 이름\n"
        "메시지: 후보 이름\n"
        "반응: 클릭/관심/무시/거부 중 하나\n"
        "의향: 1~5\n"
        "이유: 한 문장"
    )


def _parse_campaign_strategy_response(response: str) -> dict[str, Any] | None:
    channel = parse_line(response, "채널", limit=80)
    message = parse_line(response, "메시지", limit=80)
    reaction = parse_label(response, "반응", ["클릭", "관심", "무시", "거부"])
    score = parse_score(response, "의향")
    if not channel or not message or reaction is None:
        return None
    return {
        "primary": f"{channel} / {message}",
        "channel": channel,
        "message": message,
        "reaction": reaction,
        "score": score or 3,
        "reason": parse_reason(response),
    }


def _aggregate_campaign_strategy(
    input_data: dict[str, Any],
    raw_results: list[Any],
    parsed_results: list[dict[str, Any] | None],
) -> dict[str, Any]:
    parsed = _valid(parsed_results)
    total = len(parsed)
    channel_counts = Counter(item["channel"] for item in parsed)
    message_counts = Counter(item["message"] for item in parsed)
    reaction_counts = Counter(item["reaction"] for item in parsed)
    combo_scores: dict[str, list[int]] = defaultdict(list)
    for item in parsed:
        combo_scores[f"{item['channel']} / {item['message']}"].append(item["score"])
    combos = sorted(
        (
            {"label": combo, "average_score": _avg(scores), "count": len(scores)}
            for combo, scores in combo_scores.items()
        ),
        key=lambda row: (row["average_score"], row["count"]),
        reverse=True,
    )
    return {
        "metrics": {
            "budget": input_data["budget"],
            # 결과 렌더러는 choice_counts/intent_counts/segment_counts 중 하나를 요구한다.
            # 없으면 완료된 실행에서도 "1위 항목"이 영원히 N/A로 남는다.
            "choice_counts": dict(channel_counts),
            "choice_pct": {k: pct(v, total) for k, v in channel_counts.items()},
            "channel_counts": dict(channel_counts),
            "channel_pct": {k: pct(v, total) for k, v in channel_counts.items()},
            "message_counts": dict(message_counts),
            "message_pct": {k: pct(v, total) for k, v in message_counts.items()},
            "reaction_counts": dict(reaction_counts),
            "reaction_pct": {k: pct(v, total) for k, v in reaction_counts.items()},
            "best_combinations": combos[:8],
            "top_reasons": top_counts([item["reason"] for item in parsed], limit=8),
        },
        "segments": demographic_segments(raw_results, parsed_results, key="reaction"),
        "insights": combos[:1],
    }


def _parse_int_line(response: str, label: str) -> int | None:
    match = re.search(rf"{label}[:\s]*([0-9,]+)", response)
    if not match:
        return None
    return int(match.group(1).replace(",", ""))


def _valid(parsed_results: list[dict[str, Any] | None]) -> list[dict[str, Any]]:
    return [item for item in parsed_results if item is not None]


def _lettered(values: list[str]) -> dict[str, str]:
    return {LETTERS[index]: value for index, value in enumerate(values)}


def _avg(values: list[int | float]) -> float:
    return round(sum(values) / len(values), 2) if values else 0.0


def _single_insight(
    insight_type: str, title: str, value: Any, details: dict[str, Any]
) -> list[dict[str, Any]]:
    return [{"type": insight_type, "title": title, "value": value, "details": details}]


def _top_count_insight(
    insight_type: str, title: str, counts: Counter, total: int
) -> list[dict[str, Any]]:
    if not counts:
        return []
    label, count = counts.most_common(1)[0]
    return [
        {
            "type": insight_type,
            "title": title,
            "label": label,
            "count": count,
            "pct": pct(count, total),
        }
    ]
