from __future__ import annotations

import asyncio
import hashlib
from collections import Counter
from typing import Any

from src.agent.simulator import BatchSimulator
from src.data.sampler import PersonaSampler

_NAMES_F = ["강순녀", "나순희", "장화영", "유복연", "안혜영", "박미정", "조승희", "오은숙"]
_NAMES_M = ["이재호", "임병태", "손동하", "봉수훈", "오민영", "이성기", "권상운", "백용일"]


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

    simulator = BatchSimulator(purpose="marketing", llm_client=llm_client)
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
