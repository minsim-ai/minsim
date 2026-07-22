"""One-sentence project autofill: prompt construction and response normalization.

Backs POST /api/intake/autofill (B-1). The LLM drafts every project field plus
a recommended simulation type and its input; everything generated is surfaced
as intake assumptions so the existing review gate keeps working.
"""
from __future__ import annotations

import re
from typing import Any

from pydantic import ValidationError

from src.api.schemas import (
    SIMULATION_INPUT_MODELS,
    IntakeAssumption,
    ProjectAutofillCurrentFields,
    ProjectAutofillFields,
    ProjectAutofillResponse,
    SimulationType,
)
from src.config import WEB_SEARCH_ENABLED
from src.llm.base import LLMMessage


def if_poll_hint(is_poll: bool) -> str:
    if is_poll:
        return (
            "안건에 가장 적합한 시뮬레이션 유형 1개를 recommended_simulation_type으로 고르세요. "
            "위 목록에 없는 유형은 절대 고르지 마세요. 찬반이 갈리는 정책 안건이면 campus_policy를, "
            "선택지를 직접 제시하는 질문이면 open_survey를 우선 추천하세요."
        )
    return (
        "아이템에 가장 적합한 시뮬레이션 유형 1개를 recommended_simulation_type으로 고르세요. "
        "새 아이템/사업 아이디어를 전반적으로 검토하려는 요청이면 startup_item_validation을 우선 추천하세요."
    )

_TYPE_GUIDE: dict[str, str] = {
    "startup_item_validation": "창업 아이템 통합 검증 (item_name, item_description, problem_statement, key_features≤8, price_hint?, alternatives≤6)",
    "creative_testing": "카피/크리에이티브 A-B 비교 (creatives: 문구 2~10개)",
    "price_optimization": "가격 수용도 (product_name, product_description, price_points: 정수 3~6개 오름차순)",
    "product_launch": "신제품 출시 반응 (product_concept, key_features 1~8, target_use_case, expected_price_range?, alternatives?)",
    "value_proposition": "가치 제안 문장 비교 (product_context, statements 2~5, criteria?)",
    "market_segmentation": "시장 세분화 (category, product_family?, core_questions 1~6, n_segments 3~8)",
    "competitive_positioning": "경쟁 포지셔닝 (category_context, products 2~5, attributes?)",
    "brand_perception": "브랜드 인식 (brand_name, category, attributes 3~15)",
    "churn_prediction": "이탈 예측 (service_name, current_situation, trigger_event, competitor_offer?)",
    "campaign_strategy": "캠페인 전략 (product_context, channels 2~5 [{name}], messages 2~4 [{name, creative}], budget)",
    "campus_policy": "학내 정책 찬반 (agenda, current_state, proposed_change, tradeoffs)",
    "campus_priority": "학내 예산·시설 우선순위 (items 3~8)",
    "open_survey": "자유 설문 (question, options 2~6, context?)",
}

_DEFAULT_RECOMMENDED = SimulationType.STARTUP_ITEM_VALIDATION

#: 학내 전용 유형 — 사업 검증 갈래에는 노출하지 않는다.
_CAMPUS_ONLY_KEYS = ("campus_policy", "campus_priority")

#: 여론조사 갈래에서 고를 수 있는 유형. 갈래를 안 넘기면 창업 검증 쪽으로 편향된다.
_POLL_TYPE_KEYS = (
    "open_survey",
    "campus_policy",
    "campus_priority",
    "creative_testing",
    "price_optimization",
    "product_launch",
    "market_segmentation",
    "churn_prediction",
    "value_proposition",
)

_FIELD_SLOT_IDS = {
    "product_context": "product_description",
    "prices": "price_points",
    "target_notes": "target_customers",
    "features": "key_features",
    "alternatives": "alternatives",
}

# User-facing labels — never surface raw JSON keys in notes shown on the project page.
_FIELD_LABELS_KO: dict[str, str] = {
    "product_context": "배경 정보",
    "features": "기능",
    "prices": "가격",
    "target_notes": "응답자 메모",
    "alternatives": "대안",
    "name": "이름",
    "description": "설명",
    "simulation_input": "시뮬레이션 입력",
    "recommended_simulation_type": "추천 시뮬레이션",
    "slot_id": "항목",
}


async def gather_market_context(prompt: str) -> str | None:
    """Fetch real market snippets via Serper for autofill grounding (C-4).

    Fully optional: disabled without a key, and any failure degrades to plain
    autofill. Never raises.
    """

    if not WEB_SEARCH_ENABLED:
        return None
    try:
        from src.serper import SerperClient

        async with SerperClient() as client:
            response = await client.search(f"{prompt[:120]} 가격 경쟁 제품", gl="kr", hl="ko", num=6)
        lines = [
            f"- {item.title}: {item.snippet}"
            for item in getattr(response, "organic", [])[:6]
            if getattr(item, "snippet", "")
        ]
        return "\n".join(lines) or None
    except Exception:
        return None


def build_autofill_messages(
    prompt: str,
    simulation_type: SimulationType | None,
    market_context: str | None = None,
    kind: str | None = None,
    current_fields: ProjectAutofillCurrentFields | None = None,
) -> list[LLMMessage]:
    is_poll = (kind or "").strip().lower() == "poll"
    guide = (
        {key: _TYPE_GUIDE[key] for key in _POLL_TYPE_KEYS if key in _TYPE_GUIDE}
        if is_poll
        # 학내 전용 유형은 사업 검증 갈래에서 고를 수 없다.
        else {k: v for k, v in _TYPE_GUIDE.items() if k not in _CAMPUS_ONLY_KEYS}
    )
    type_lines = "\n".join(f"- {key}: {value}" for key, value in guide.items())
    forced = (
        f"recommended_simulation_type은 반드시 '{simulation_type.value}'로 답하세요."
        if simulation_type
        else if_poll_hint(is_poll)
    )
    system = (
        (
            "당신은 대학 구성원 여론조사 설정 도우미입니다. 사용자의 한 문장 안건을 읽고 "
            "여론조사 프로젝트의 입력 필드를 초안으로 채웁니다. JSON만 반환하세요. "
            "이 프로젝트에는 판매 가격·타깃 고객·경쟁사 개념이 없습니다. "
            "기능·가격·대안 목록은 빈 배열로 두고, 응답자 메모에는 어떤 구성원에게 "
            "물을지를 적으세요. 검증 불가한 과장은 금지합니다.\n"
        )
        if is_poll
        else (
        "당신은 한국 시장 검증 프로젝트 설정 도우미입니다. 사용자의 한 문장 아이디어를 읽고 "
        "시뮬레이션 프로젝트의 모든 입력 필드를 그럴듯한 초안으로 채웁니다. JSON만 반환하세요. "
        "숫자 가격은 원화 기준 현실적인 수준으로 추정하고, 검증 불가한 과장(1위, 100% 보장)은 금지합니다.\n"
        )
    ) + (
        "시뮬레이션 유형 목록:\n"
        f"{type_lines}\n"
        f"{forced}\n"
        "JSON 스키마:\n"
        "{\"project\": {\"name\": \"짧은 프로젝트명\", \"description\": \"한 줄 설명\", "
        "\"product_context\": \"제품/서비스 상세 설명 3~5문장\", \"features\": [\"핵심 기능\"], "
        "\"prices\": [\"가격 후보 문자열\"], \"target_notes\": \"타깃 고객 설명\", "
        "\"alternatives\": [\"경쟁/대안\"]}, "
        "\"recommended_simulation_type\": \"유형 id\", "
        "\"simulation_input\": {선택한 유형의 입력 필드}, "
        "\"assumptions\": [{\"slot_id\": \"price_points|target_customers|key_features|alternatives|product_description\", "
        "\"value\": \"추정값\", \"confidence\": 0.5}], "
        "\"notes\": [\"사용자가 확인해야 할 추정 사항 한 줄\"]}\n"
        "notes 작성 규칙: 화면 사용자에게 그대로 보여 줍니다. "
        "product_context, features, prices, target_notes, alternatives, simulation_input 같은 "
        "영문 필드명·슬래시 나열을 쓰지 마세요. "
        "대신 '배경 정보', '기능', '가격', '응답자 메모', '대안' 같은 한국어 화면 용어만 쓰세요."
    )
    if market_context:
        system += (
            "\n실제 웹 검색 결과(참고용):\n"
            f"{market_context}\n"
            "위 검색 결과에 실제 시세나 경쟁 제품이 보이면 가격·대안 초안에 반영하세요. "
            "확실하지 않은 정보는 보수적으로 쓰고 notes에 확인 필요를 남기세요."
        )
    if current_fields is not None and _current_fields_have_content(current_fields):
        system += (
            "\n사용자가 이미 화면에 적어 둔 현재 초안 필드가 함께 제공됩니다. "
            "한 문장 프롬프트를 최우선 의도로 따르되, 현재 초안의 사실·수치·고유명사·톤 중 "
            "프롬프트와 충돌하지 않는 내용은 유지·보강하세요. 프롬프트와 모순되면 프롬프트 쪽으로 "
            "수정하고 notes에 바꾼 이유를 짧게 남기세요. 빈 칸만 새로 채우지 말고 전체 초안을 "
            "일관되게 다시 작성하세요. notes에 영문 필드 키를 쓰지 마세요."
        )
    return [
        LLMMessage(role="system", content=system),
        LLMMessage(role="user", content=_user_content(prompt, current_fields)),
    ]


def _current_fields_have_content(fields: ProjectAutofillCurrentFields) -> bool:
    if any(
        value.strip()
        for value in (
            fields.name,
            fields.description,
            fields.product_context,
            fields.target_notes,
        )
    ):
        return True
    return any(bool(items) for items in (fields.features, fields.prices, fields.alternatives))


def _user_content(prompt: str, current_fields: ProjectAutofillCurrentFields | None) -> str:
    parts = [f"아이디어: {prompt.strip()}"]
    if current_fields is None or not _current_fields_have_content(current_fields):
        return parts[0]

    draft_lines = [
        "현재 초안 필드(화면 값, 참고·유지 대상):",
        f"- 이름(name): {current_fields.name.strip() or '(비어 있음)'}",
        f"- 설명(description): {current_fields.description.strip() or '(비어 있음)'}",
        f"- 배경 정보(product_context): {current_fields.product_context.strip() or '(비어 있음)'}",
        f"- 기능(features): {_format_list_field(current_fields.features)}",
        f"- 가격(prices): {_format_list_field(current_fields.prices)}",
        f"- 응답자 메모(target_notes): {current_fields.target_notes.strip() or '(비어 있음)'}",
        f"- 대안(alternatives): {_format_list_field(current_fields.alternatives)}",
    ]
    parts.extend(draft_lines)
    parts.append(
        "위 현재 초안과 아이디어를 함께 반영해 project 필드를 전체 다시 작성하세요. "
        "notes에는 괄호 안 영문 키를 쓰지 말고 한글 화면 용어만 쓰세요."
    )
    return "\n".join(parts)


def _format_list_field(items: list[str]) -> str:
    cleaned = [item.strip() for item in items if item and item.strip()]
    return ", ".join(cleaned) if cleaned else "(비어 있음)"


def normalize_autofill(
    parsed: dict[str, Any],
    requested_type: SimulationType | None,
    *,
    provider: str,
    provider_model: str,
    trace_id: str | None,
) -> ProjectAutofillResponse:
    notes = [_humanize_autofill_note(note) for note in _string_list(parsed.get("notes"))]
    project_raw = parsed.get("project") if isinstance(parsed.get("project"), dict) else {}

    fields = ProjectAutofillFields(
        name=_clip(project_raw.get("name"), 120) or "새 프로젝트",
        description=_clip(project_raw.get("description"), 800),
        product_context=_clip(project_raw.get("product_context"), 1200),
        features=_clip_list(project_raw.get("features"), 30, 200),
        prices=_clip_list(project_raw.get("prices"), 20, 120),
        target_notes=_clip(project_raw.get("target_notes"), 1200),
        alternatives=_clip_list(project_raw.get("alternatives"), 30, 200),
    )

    recommended = requested_type or _parse_simulation_type(
        parsed.get("recommended_simulation_type")
    )
    if recommended is None:
        recommended = _DEFAULT_RECOMMENDED
        notes.append("추천 시뮬레이션 유형을 해석하지 못해 기본 유형을 사용했습니다.")

    simulation_input: dict[str, Any] = {}
    raw_input = parsed.get("simulation_input")
    if isinstance(raw_input, dict):
        try:
            model = SIMULATION_INPUT_MODELS[recommended].model_validate(raw_input)
            simulation_input = model.model_dump(mode="json", exclude_none=True)
        except (ValidationError, KeyError):
            simulation_input = {}
            notes.append("추천 시뮬레이션 입력 검증에 실패해 프로젝트 정보만 채웠습니다.")

    assumptions = _normalize_autofill_assumptions(parsed.get("assumptions"))
    if not assumptions:
        assumptions = _derived_assumptions(fields)

    return ProjectAutofillResponse(
        project_fields=fields,
        recommended_simulation_type=recommended,
        simulation_input=simulation_input,
        assumptions=assumptions,
        notes=[note for note in notes if note],
        provider=provider,
        provider_model=provider_model,
        trace_id=trace_id,
    )


def _humanize_autofill_note(note: str) -> str:
    """Rewrite internal field keys in LLM notes to Korean UI labels."""
    text = note.strip()
    if not text:
        return ""

    # Common slash-joined key dumps from the model.
    text = text.replace(
        "product_context/features/prices/target_notes/alternatives",
        "배경 정보·기능·가격·응답자 메모·대안",
    )
    text = text.replace(
        "features/prices/alternatives",
        "기능·가격·대안",
    )
    text = text.replace(
        "product_context/features/prices",
        "배경 정보·기능·가격",
    )

    # Word-boundary replace so short keys like "name" do not corrupt other text.
    for key in sorted(_FIELD_LABELS_KO, key=len, reverse=True):
        text = re.sub(rf"\b{re.escape(key)}\b", _FIELD_LABELS_KO[key], text)

    # Only rewrite remaining slash-joined technical chains, not normal prose.
    text = re.sub(
        r"(배경 정보|기능|가격|응답자 메모|대안|이름|설명)(?:/(?:배경 정보|기능|가격|응답자 메모|대안|이름|설명))+",
        lambda match: match.group(0).replace("/", "·"),
        text,
    )
    while "··" in text:
        text = text.replace("··", "·")
    return text.strip()[:300]


def _derived_assumptions(fields: ProjectAutofillFields) -> list[IntakeAssumption]:
    derived: list[IntakeAssumption] = []
    for field_name, slot_id in _FIELD_SLOT_IDS.items():
        value = getattr(fields, field_name)
        if isinstance(value, str) and value.strip():
            derived.append(IntakeAssumption(slot_id=slot_id, value=value, confidence=0.5))
        elif isinstance(value, list) and value:
            derived.append(IntakeAssumption(slot_id=slot_id, value=value, confidence=0.5))
    return derived


def _normalize_autofill_assumptions(raw: Any) -> list[IntakeAssumption]:
    if not isinstance(raw, list):
        return []
    normalized: list[IntakeAssumption] = []
    for item in raw[:12]:
        if not isinstance(item, dict):
            continue
        slot_id = item.get("slot_id")
        if not isinstance(slot_id, str) or not slot_id.strip():
            continue
        confidence = item.get("confidence")
        try:
            confidence_value = min(1.0, max(0.0, float(confidence)))
        except (TypeError, ValueError):
            confidence_value = 0.5
        normalized.append(
            IntakeAssumption(
                slot_id=slot_id.strip()[:80],
                value=item.get("value"),
                confidence=confidence_value,
            )
        )
    return normalized


def _parse_simulation_type(value: Any) -> SimulationType | None:
    if not isinstance(value, str):
        return None
    try:
        return SimulationType(value.strip())
    except ValueError:
        return None


def _clip(value: Any, limit: int) -> str:
    if not isinstance(value, str):
        return ""
    return value.strip()[:limit]


def _clip_list(value: Any, max_items: int, item_limit: int) -> list[str]:
    if not isinstance(value, list):
        return []
    items = [
        str(item).strip()[:item_limit]
        for item in value
        if isinstance(item, str | int | float) and str(item).strip()
    ]
    return items[:max_items]


def _string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item).strip()[:300] for item in value if str(item).strip()][:8]
