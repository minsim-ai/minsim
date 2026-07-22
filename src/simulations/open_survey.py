"""open_survey — 자유 객관식 설문.

고정된 11종 유형에 들어맞지 않는 질문이 많다. 질문 한 개와 선택지 2~6개를
직접 써서 그대로 물어볼 수 있게 한다.

선택지 제시 순서는 응답을 바꾸므로(2026-07-21 실측) 정규 회전으로 상쇄한다.
"""
from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from typing import Any

from src.data.respondent_axes import (
    classify_primary,
    pool_from_input,
    primary_axis_label,
    primary_axis_order,
    respondent_role_line,
)
from src.simulations.common import GenericPersonaSimulation

MIN_OPTIONS = 2
MAX_OPTIONS = 6
LOW_CONFIDENCE_MIN_SAMPLE = 20

_FENCE = re.compile(r"^\s*```(?:json)?\s*|\s*```\s*$", re.MULTILINE)
_OBJECT = re.compile(r"\{.*\}", re.DOTALL)
# 모델이 "1. 선택지"처럼 순번을 붙여 돌려주는 경우가 있다. 서식 부산물이므로 정규화한다.
_ORDINAL_PREFIX = re.compile(r"^\s*\d+\s*[.)]\s*")


def survey_options(input_data: dict[str, Any]) -> list[str]:
    return [str(item).strip() for item in (input_data.get("options") or []) if str(item).strip()]


def build_open_survey_prompt(input_data: dict[str, Any]) -> str:
    question = (input_data.get("question") or "").strip()
    context = (input_data.get("context") or "").strip()
    options = survey_options(input_data)
    listed = "\n".join(f"- {option}" for option in options)
    context_block = f"\n■ 배경\n{context}\n" if context else "\n"
    pool = pool_from_input(input_data)
    role = respondent_role_line(pool, for_survey=True)
    context_hint = (
        "- 당신의 신분, 생활 여건, 하루 일과에 비추어 고르세요."
        if pool == "dgist"
        else "- 당신의 직업, 거주 지역, 생활 여건에 비추어 고르세요."
    )

    return f"""{role}

■ 질문
{question}
{context_block}
■ 선택지 (하나만 고르세요)
{listed}

■ 응답 지침
{context_hint}
- 일반론이 아니라 본인에게 무엇이 달라지는지를 이유로 쓰세요.
- 선택지 문구는 위에 적힌 그대로 쓰고 번호를 붙이지 마세요.

■ 출력 형식 (JSON만, 다른 텍스트 금지)
{{
  "choice": "위 선택지 중 하나를 그대로",
  "reason": "그 선택지를 고른 이유 한두 문장"
}}"""


def make_open_survey_parser(input_data: dict[str, Any]):
    """선택지 집합을 고정한 파서. 목록에 없는 답은 강등 없이 파싱 실패로 처리한다."""
    allowed = set(survey_options(input_data))

    def parse(response: str) -> dict[str, Any] | None:
        if not response:
            return None
        text = _FENCE.sub("", response).strip()
        match = _OBJECT.search(text)
        if not match:
            return None
        try:
            payload = json.loads(match.group(0))
        except (json.JSONDecodeError, ValueError):
            return None
        if not isinstance(payload, dict):
            return None

        choice = payload.get("choice")
        if not isinstance(choice, str):
            return None
        choice = _ORDINAL_PREFIX.sub("", choice).strip()
        if choice not in allowed:
            return None

        reason = payload.get("reason")
        if not isinstance(reason, str) or not reason.strip():
            return None

        return {"choice": choice, "reason": reason.strip()}

    return parse


def aggregate_open_survey(
    input_data: dict[str, Any],
    raw_results: list[Any],
    parsed_results: list[dict[str, Any] | None],
) -> dict[str, Any]:
    options = survey_options(input_data)
    pool = pool_from_input(input_data)
    tiers = primary_axis_order(pool)

    answers: list[dict[str, Any]] = []
    for raw, parsed in zip(raw_results, parsed_results, strict=False):
        if parsed is None:
            continue
        persona = getattr(raw, "persona", {}) or {}
        answers.append({**parsed, "_tier": classify_primary(persona, pool)})

    total = len(answers)
    counter = Counter(item["choice"] for item in answers)
    choice_rows = [
        {
            "option": option,
            "count": counter.get(option, 0),
            "pct": round(counter.get(option, 0) / total * 100, 1) if total else 0.0,
        }
        for option in options
    ]
    choice_rows.sort(key=lambda row: -row["count"])

    by_tier: dict[str, list[str]] = defaultdict(list)
    for item in answers:
        by_tier[item["_tier"]].append(item["choice"])
    tier_rows = []
    for tier in tiers:
        picks = by_tier.get(tier, [])
        tier_counter = Counter(picks)
        tier_rows.append(
            {
                "tier": tier,
                "n": len(picks),
                "top_option": tier_counter.most_common(1)[0][0] if picks else "",
                "low_confidence": len(picks) < LOW_CONFIDENCE_MIN_SAMPLE,
                "distribution": {option: tier_counter.get(option, 0) for option in options},
            }
        )

    reasons_by_choice = {
        option: [
            {"reason": reason, "count": count}
            for reason, count in Counter(
                item["reason"] for item in answers if item["choice"] == option
            ).most_common(5)
        ]
        for option in options
    }

    # GenericPersonaSimulation은 {"metrics": ...} 봉투를 기대한다.
    # 평평하게 돌려주면 결과 화면의 metrics가 통째로 빈다.
    return {
        "metrics": {
            "question": (input_data.get("question") or "").strip(),
            "options": options,
            # 결과 렌더러 공통 계약. 없으면 결과 화면 본문이 통째로 비고
            # 완료된 실행에서도 "결과를 해석 중입니다"가 남는다.
            "choice_counts": {row["option"]: row["count"] for row in choice_rows},
            "choice_pct": {row["option"]: row["pct"] for row in choice_rows},
            "choice_rows": choice_rows,
            "tier_rows": tier_rows,
            "tier_axis": list(tiers),
            "tier_axis_label": primary_axis_label(pool),
            "persona_pool": pool,
            "reasons_by_choice": reasons_by_choice,
            "low_confidence_min_sample": LOW_CONFIDENCE_MIN_SAMPLE,
        },
        "segments": {row["tier"]: row for row in tier_rows},
        "insights": [],
    }


def open_survey_runner() -> GenericPersonaSimulation:
    return GenericPersonaSimulation(
        simulation_type="open_survey",
        purpose="open survey",
        task_type="survey_response",
        prompt_builder=build_open_survey_prompt,
        parser=make_open_survey_parser({}),
        aggregator=aggregate_open_survey,
        # 선택지 이름 자체가 집계 키이므로 회전에 안전하다.
        rotation_field="options",
        parser_factory=make_open_survey_parser,
    )
