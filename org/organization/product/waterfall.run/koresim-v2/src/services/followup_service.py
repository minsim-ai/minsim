from __future__ import annotations

import asyncio
import hashlib
from collections import Counter
from typing import Any

from src.agent.simulator import BatchSimulator
from src.data.sampler import PersonaSampler

_NAMES_F = ["강순녀", "나순희", "장화영", "유복연", "안혜영", "박미정", "조승희", "오은숙"]
_NAMES_M = ["이재호", "임병태", "손동하", "봉수훈", "오민영", "이성기", "권상운", "백용일"]


class _BorrowedLLMClient:
    """Keep request-scoped simulations from closing the app-owned LLM client."""

    def __init__(self, client: Any) -> None:
        self._client = client

    async def generate(self, request: Any) -> Any:
        return await self._client.generate(request)


def _simulator_client(client: Any | None) -> Any | None:
    return _BorrowedLLMClient(client) if client is not None else None


def select_cohort_subset(raw_results: list[dict[str, Any]], cohort: str) -> list[dict[str, Any]]:
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
    if cohort and cohort not in {"all", "positive", "negative", "high-intent", "confused"}:
        return [item for item in raw_results if item.get("uuid") == cohort]
    return raw_results


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
    subset_uuids = {item.get("uuid") for item in subset if item.get("uuid")}

    sampler = PersonaSampler()
    try:
        personas = sampler.sample(n=panel, filter_=target_filter or None, seed=seed)
    except ValueError:
        personas = sampler.sample(n=panel, filter_=None, seed=seed)
    if subset_uuids:
        narrowed = [persona for persona in personas if persona.get("uuid") in subset_uuids]
        if narrowed:
            personas = narrowed
    if sample_size is not None:
        personas = personas[: max(1, sample_size)]

    simulator = BatchSimulator(
        purpose="marketing",
        llm_client=_simulator_client(llm_client),
        trace_metadata={
            "run_id": original_run.get("run_id"),
            "simulation_type": original_run.get("simulation_type"),
            "interactive_action": "project_followup",
        },
    )
    results = asyncio.run(simulator.run(personas, _followup_prompt(question)))

    answers: list[dict[str, Any]] = []
    for item in results:
        if item.error or not item.response:
            continue
        persona = item.persona or {}
        answers.append(
            {
                "uuid": item.uuid,
                "name": _display_name(persona, str(item.uuid or "")),
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
    original_quote = context_quote.strip() or _original_quote(subject)
    prompt = _interview_prompt(
        question=question,
        original_quote=original_quote,
        history=history or [],
    )

    simulator = BatchSimulator(
        purpose="marketing",
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


def _display_name(persona: dict[str, Any], uuid: str) -> str:
    names = _NAMES_F if persona.get("sex") == "여자" else _NAMES_M
    if not uuid:
        return names[0]
    digest = int(hashlib.md5(uuid.encode("utf-8")).hexdigest(), 16)
    return names[digest % len(names)]


def _followup_prompt(question: str) -> str:
    return f"앞선 설문에 이어 추가 질문입니다.\n\n{question}\n\n답변 형식:\n답변: 한두 문장으로 솔직하게"


def _interview_prompt(*, question: str, original_quote: str, history: list[dict[str, Any]]) -> str:
    recent = history[-16:]
    transcript_lines: list[str] = []
    for message in recent:
        content = str(message.get("content") or "").strip()
        if not content:
            continue
        speaker = "인터뷰어" if message.get("role") == "user" else "응답자"
        transcript_lines.append(f"{speaker}: {content[:500]}")
    transcript = "\n".join(transcript_lines) or "(첫 질문)"
    quote = original_quote[:1000] or "(기존 발언 없음)"
    return (
        "앞선 설문에 참여한 동일한 응답자와 이어지는 심층 인터뷰입니다.\n"
        "이전 발언과 지금까지의 대화를 일관되게 이어가세요. "
        "프로필에 없는 구체적 사실은 지어내지 말고, 질문에 한두 문장으로 솔직하게 답하세요.\n\n"
        f"[앞선 설문 발언]\n{quote}\n\n"
        f"[지금까지의 인터뷰]\n{transcript}\n\n"
        f"[새 질문]\n{question.strip()}\n\n"
        "답변 형식:\n답변: 한두 문장으로 자연스럽게"
    )


def _original_quote(subject: dict[str, Any]) -> str:
    parsed = subject.get("parsed") or {}
    reason = parsed.get("reason") if isinstance(parsed, dict) else None
    if isinstance(reason, str) and reason.strip():
        return reason.strip()
    return str(subject.get("response") or "").strip()[:1000]


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


def _summarize(answers: list[dict[str, Any]], cohort: str) -> str:
    if not answers:
        return f"'{cohort}' 코호트에서 유효한 후속 응답이 없습니다."
    ages = [answer["age"] for answer in answers if isinstance(answer.get("age"), int)]
    age_note = ""
    if ages:
        age_note = f" (주 연령 {Counter(f'{age // 10 * 10}대' for age in ages).most_common(1)[0][0]})"
    return f"'{cohort}' 코호트 {len(answers)}명이 후속 질문에 응답했습니다{age_note}."
