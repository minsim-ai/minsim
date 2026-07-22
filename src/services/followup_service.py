from __future__ import annotations

import asyncio
from collections import Counter
from typing import Any

from src.agent.simulator import BatchSimulator
from src.data.persona_display import resolve_persona_name
from src.data.sampler import PersonaSampler

_STUDY_SCALAR_FIELDS = (
    ("category", "카테고리"),
    ("product_family", "제품군"),
    ("product_name", "제품명"),
    ("product", "제품"),
    ("brand", "브랜드"),
    ("category_context", "카테고리 맥락"),
    ("topic", "주제"),
    ("subject", "주제"),
    ("value_proposition", "가치 제안"),
    ("description", "설명"),
    ("research_goal", "조사 목표"),
)

_STUDY_LIST_FIELDS = (
    ("core_questions", "조사 질문"),
    ("creatives", "크리에이티브"),
    ("statements", "소구 문장"),
    ("products", "제품 후보"),
    ("price_points", "가격 후보"),
    ("attributes", "평가 속성"),
)


class _BorrowedLLMClient:
    """Keep request-scoped simulations from closing the app-owned LLM client."""

    def __init__(self, client: Any) -> None:
        self._client = client

    async def generate(self, request: Any) -> Any:
        return await self._client.generate(request)


def _simulator_client(client: Any | None) -> Any | None:
    return _BorrowedLLMClient(client) if client is not None else None


def select_cohort_subset(raw_results: list[dict[str, Any]], cohort: str) -> list[dict[str, Any]]:
    if cohort == "opposed":
        # campus_policy 전용. stance가 '반대'인 응답자만 고른다.
        return [
            item
            for item in raw_results
            if ((item.get("parsed") or {}).get("stance") or item.get("stance")) == "반대"
        ]
    if cohort in {"positive", "high-intent"}:
        return [item for item in raw_results if (_score(item) is not None and _score(item) >= 4)]
    if cohort == "negative":
        return [item for item in raw_results if (_score(item) is not None and _score(item) <= 2)]
    if cohort == "confused":
        return [
            item
            for item in raw_results
            if _score(item) is None and not ((item.get("parsed") or {}).get("choice") or item.get("choice"))
        ]
    if cohort and cohort not in {"all", "positive", "negative", "high-intent", "confused", "opposed"}:
        return [item for item in raw_results if item.get("uuid") == cohort]
    return raw_results


def build_study_context(original_run: dict[str, Any] | None) -> str:
    """Human-readable study/product context for follow-up and interview prompts."""

    run = original_run if isinstance(original_run, dict) else {}
    sim = str(run.get("simulation_type") or "").strip() or "simulation"
    lines = [f"조사 유형: {sim}"]
    input_data = run.get("input") if isinstance(run.get("input"), dict) else {}

    for key, label in _STUDY_SCALAR_FIELDS:
        value = input_data.get(key)
        if isinstance(value, str) and value.strip():
            lines.append(f"{label}: {value.strip()[:320]}")
        elif isinstance(value, (int, float)) and not isinstance(value, bool):
            lines.append(f"{label}: {value}")

    for key, label in _STUDY_LIST_FIELDS:
        value = input_data.get(key)
        if isinstance(value, list) and value:
            preview = "; ".join(str(item).strip()[:100] for item in value[:6] if str(item).strip())
            if preview:
                lines.append(f"{label}: {preview}")

    if len(lines) == 1:
        lines.append("조사 맥락 상세 없음 — 앞선 설문 발언의 주제를 유지하세요.")
    return "\n".join(lines)


def build_interview_anchor(subject: dict[str, Any], context_quote: str = "") -> str:
    """Merge stored quote with structured parsed fields and original response."""

    chunks: list[str] = []
    seen: set[str] = set()

    def _push(text: str) -> None:
        cleaned = text.strip()
        if not cleaned or cleaned in seen:
            return
        seen.add(cleaned)
        chunks.append(cleaned)

    if context_quote.strip():
        _push(context_quote)

    parsed = subject.get("parsed") if isinstance(subject.get("parsed"), dict) else {}
    for key, label in (
        ("segment", "세그먼트"),
        ("need", "니즈"),
        ("pain", "페인"),
        ("choice", "선택"),
        ("intent", "의향"),
        ("reason", "이유"),
    ):
        value = parsed.get(key)
        if isinstance(value, str) and value.strip():
            _push(f"{label}: {value.strip()}")

    response = str(subject.get("response") or "").strip()
    if response:
        # Prefer structured lines already captured; still add compact full response if richer.
        joined = "\n".join(chunks)
        if response not in joined and len(response) > 20:
            _push(response[:900])

    return "\n".join(chunks)[:1500] or "(기존 발언 없음)"


def run_followup(
    *,
    original_run: dict[str, Any],
    question: str,
    cohort: str,
    raw_results: list[dict[str, Any]] | None = None,
    sample_size: int | None = None,
    llm_client: Any | None = None,
) -> dict[str, Any]:
    seed = int(original_run.get("seed") or 42)
    target_filter = _normalize_target_filter(original_run.get("target_filter") or {})
    panel = int(original_run.get("sample_size") or sample_size or 50)
    subset = select_cohort_subset(raw_results or [], cohort)
    country_id = str(original_run.get("country_id") or "kr").strip().lower() or "kr"

    # Prefer the original run panel so display names/regions match the results UI
    # (US runs must not fall back to KR synthetic names).
    personas = _personas_from_raw_results(subset, country_id=country_id)
    if not personas:
        subset_uuids = {item.get("uuid") for item in subset if item.get("uuid")}
        sampler = PersonaSampler(country_id=country_id)
        try:
            personas = sampler.sample(n=panel, filter_=target_filter or None, seed=seed)
        except ValueError:
            personas = sampler.sample(n=panel, filter_=None, seed=seed)
        if subset_uuids:
            narrowed = [persona for persona in personas if persona.get("uuid") in subset_uuids]
            if narrowed:
                personas = narrowed
        personas = [
            _stamp_country(persona, country_id) for persona in personas if isinstance(persona, dict)
        ]
    if sample_size is not None:
        personas = personas[: max(1, sample_size)]

    study_context = build_study_context(original_run)
    simulator = BatchSimulator(
        purpose="followup",
        llm_client=_simulator_client(llm_client),
        trace_metadata={
            "run_id": original_run.get("run_id"),
            "simulation_type": original_run.get("simulation_type"),
            "interactive_action": "project_followup",
        },
    )
    results = asyncio.run(simulator.run(personas, _followup_prompt(question, study_context)))

    answers: list[dict[str, Any]] = []
    for item in results:
        if item.error or not item.response:
            continue
        persona = item.persona or {}
        answers.append(
            {
                "uuid": item.uuid,
                "name": resolve_persona_name(persona, str(item.uuid or "")),
                "age": persona.get("age"),
                "sex": persona.get("sex", ""),
                "province": persona.get("province"),
                "answer": _parse_answer(item.response),
            }
        )
    return {
        "question": question,
        "cohort": cohort,
        "panel_seed": seed,
        "answers": answers,
        "summary": _summarize(answers, cohort),
    }


def run_interview_turn(
    *,
    raw_results: list[dict[str, Any]],
    subject_uuid: str,
    question: str,
    history: list[dict[str, Any]] | None = None,
    context_quote: str = "",
    original_run: dict[str, Any] | None = None,
    llm_client: Any | None = None,
    trace_metadata: dict[str, object] | None = None,
) -> dict[str, Any]:
    """Run one turn for a persisted interview with the same synthetic persona."""

    subject = next(
        (
            item
            for item in raw_results
            if str(item.get("uuid") or (item.get("persona") or {}).get("uuid") or "") == subject_uuid
        ),
        None,
    )
    if subject is None:
        raise ValueError(f"Unknown interview subject: {subject_uuid}")

    persona = dict(subject.get("persona") or {})
    persona.setdefault("uuid", subject_uuid)
    _fill_prompt_fields(persona)
    study_context = build_study_context(original_run)
    original_quote = build_interview_anchor(subject, context_quote)
    prompt = _interview_prompt(
        question=question,
        original_quote=original_quote,
        history=history or [],
        study_context=study_context,
    )

    simulator = BatchSimulator(
        purpose="interview",
        llm_client=_simulator_client(llm_client),
        trace_metadata={
            **(trace_metadata or {}),
            "interactive_action": "interview_message",
        },
    )
    results = asyncio.run(simulator.run([persona], prompt))
    if not results or results[0].error or not results[0].response:
        error = results[0].error if results else "No response"
        raise RuntimeError(f"Interview response failed: {error}")

    item = results[0]
    return {
        "subject_uuid": subject_uuid,
        "answer": _parse_answer(item.response),
        "provider": item.provider,
        "provider_model": item.provider_model,
        "trace_id": item.trace_id,
    }


def _score(raw: dict[str, Any]) -> float | None:
    score = raw.get("score")
    if score is None:
        score = (raw.get("parsed") or {}).get("score")
    try:
        return float(score)
    except (TypeError, ValueError):
        return None


def _normalize_target_filter(value: dict[str, Any]) -> dict[str, Any]:
    aliases = {
        "seoul": "서울",
        "busan": "부산",
        "incheon": "인천",
        "daegu": "대구",
        "daejeon": "대전",
        "gwangju": "광주",
        "ulsan": "울산",
        "jeju": "제주",
    }
    normalized = dict(value)
    provinces = normalized.get("province")
    if isinstance(provinces, list):
        normalized["province"] = [aliases.get(str(item).strip().lower(), item) for item in provinces]
    return normalized


def _followup_prompt(question: str, study_context: str) -> str:
    return (
        "앞선 설문에 이어 추가 질문입니다.\n"
        "아래 [조사 맥락] 주제 안에서만 답하고, 조사 대상과 무관한 새로운 선물·제품·행동을 지어내지 마세요.\n"
        "프로필 취미(음식, 운동 등)를 이번 조사의 구매/선물 대상으로 바꾸지 마세요.\n\n"
        f"[조사 맥락]\n{study_context}\n\n"
        f"[추가 질문]\n{question.strip()}\n\n"
        "답변 형식:\n답변: 한두 문장으로 솔직하게"
    )


def _interview_prompt(
    *,
    question: str,
    original_quote: str,
    history: list[dict[str, Any]],
    study_context: str,
) -> str:
    recent = history[-16:]
    transcript_lines: list[str] = []
    for message in recent:
        content = str(message.get("content") or "").strip()
        if not content:
            continue
        speaker = "인터뷰어" if message.get("role") == "user" else "응답자"
        transcript_lines.append(f"{speaker}: {content[:500]}")
    transcript = "\n".join(transcript_lines) or "(첫 질문)"
    quote = original_quote[:1500] or "(기존 발언 없음)"
    return (
        "앞선 설문에 참여한 동일한 응답자와 이어지는 심층 인터뷰입니다.\n"
        "이전 발언과 지금까지의 대화를 일관되게 이어가세요.\n"
        "반드시 [조사 맥락]의 제품/서비스/주제 범위 안에서만 답하세요.\n"
        "프로필에 없는 구체적 사실을 지어내지 말고, "
        "식습관·취미를 이번 조사의 선물/구매 대상으로 확장하지 마세요.\n"
        "질문에 한두 문장으로 솔직하게 답하세요.\n\n"
        f"[조사 맥락]\n{study_context}\n\n"
        f"[앞선 설문 발언]\n{quote}\n\n"
        f"[지금까지의 인터뷰]\n{transcript}\n\n"
        f"[새 질문]\n{question.strip()}\n\n"
        "답변 형식:\n답변: 한두 문장으로 자연스럽게"
    )


def _original_quote(subject: dict[str, Any]) -> str:
    return build_interview_anchor(subject, "")


def _fill_prompt_fields(persona: dict[str, Any]) -> None:
    defaults: dict[str, Any] = {
        "age": 0,
        "sex": "미상",
        "province": "미상",
        "district": "",
        "occupation": "미상",
        "education_level": "미상",
        "marital_status": "미상",
        "family_type": "미상",
        "housing_type": "미상",
    }
    for key, value in defaults.items():
        persona.setdefault(key, value)


def _parse_answer(response: str) -> str:
    for line in response.splitlines():
        stripped = line.strip()
        if stripped.startswith("답변"):
            return stripped.split(":", 1)[-1].strip()[:240]
    return response.strip()[:240]


_COHORT_LABELS = {
    "all": "전체",
    "positive": "긍정",
    "negative": "부정",
    "high-intent": "고의향",
    "confused": "혼동",
    "opposed": "반대",
}


def _cohort_label(cohort: str) -> str:
    key = str(cohort or "").strip()
    if key in _COHORT_LABELS:
        return _COHORT_LABELS[key]
    if key:
        return "선택 응답자"
    return "전체"


def _stamp_country(persona: dict[str, Any], country_id: str) -> dict[str, Any]:
    stamped = dict(persona)
    stamped.setdefault("_country_id", country_id)
    stamped.setdefault("country_id", country_id)
    return stamped


def _personas_from_raw_results(
    subset: list[dict[str, Any]],
    *,
    country_id: str,
) -> list[dict[str, Any]]:
    """Rebuild follow-up panel from stored raw results when persona payloads exist."""
    personas: list[dict[str, Any]] = []
    for item in subset:
        persona = item.get("persona")
        if not isinstance(persona, dict) or not persona:
            continue
        stamped = _stamp_country(persona, country_id)
        uuid = item.get("uuid") or stamped.get("uuid")
        if uuid:
            stamped.setdefault("uuid", uuid)
        # Preserve explicit display name from original panel if present on the row.
        if not stamped.get("name"):
            row_name = item.get("name")
            if isinstance(row_name, str) and row_name.strip():
                stamped["name"] = row_name.strip()
        personas.append(stamped)
    return personas


def _summarize(answers: list[dict[str, Any]], cohort: str) -> str:
    label = _cohort_label(cohort)
    if not answers:
        return f"{label} 응답자에서 유효한 후속 응답이 없습니다."
    ages = [answer["age"] for answer in answers if isinstance(answer.get("age"), int)]
    age_note = ""
    if ages:
        age_note = f" (주 연령 {Counter(f'{age // 10 * 10}대' for age in ages).most_common(1)[0][0]})"
    return f"{label} 응답자 {len(answers)}명이 후속 질문에 응답했습니다{age_note}."
