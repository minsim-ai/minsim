"""반대파 설득 시뮬 — 반대한 페르소나에게만 조건을 제시해 재질문한다.

조건 클러스터의 자동화 버전이며, 1:1 인터뷰를 코호트 전체에 한 번에
돌리는 것에 해당한다.
"""
from __future__ import annotations

from typing import Any

_CONVERTED = {"찬성", "조건부찬성"}
_HELD = {"반대"}

_PROMPT = """당신은 앞서 아래 안건에 반대했습니다.

■ 안건
{agenda}

■ 당신이 밝힌 반대 이유
{original_reason}

■ 새로 제시된 조건
{condition}

이 조건이 실제로 보장된다면 입장을 바꾸시겠습니까?
입장을 바꾸지 않아도 됩니다. 본인 맥락에 근거해 솔직하게 답하세요.

■ 출력 형식 (JSON만, 다른 텍스트 금지)
{{
  "stance": "찬성" 또는 "조건부찬성" 또는 "반대" 또는 "판단유보",
  "reason": "입장을 바꾼 또는 바꾸지 않은 이유 한두 문장",
  "condition": "조건부찬성일 때만 추가 전제 조건. 그 외에는 null",
  "intensity": 1~5 정수
}}"""


def build_persuasion_prompt(agenda: str, original_reason: str, condition: str) -> str:
    return _PROMPT.format(
        agenda=agenda.strip(),
        original_reason=original_reason.strip(),
        condition=condition.strip(),
    )


def summarize_persuasion(
    before: list[dict[str, Any]],
    after: list[dict[str, Any] | None],
) -> dict[str, Any]:
    """전환/유지 집계. 파싱 실패는 양쪽 어디에도 넣지 않는다."""
    converted: list[str] = []
    held: list[str] = []

    for answer in after:
        if answer is None:
            continue
        if answer["stance"] in _CONVERTED:
            converted.append(answer["reason"])
        elif answer["stance"] in _HELD:
            held.append(answer["reason"])

    decided = len(converted) + len(held)
    rate = round(len(converted) / decided * 100, 1) if decided else 0.0

    return {
        "cohort_size": len(before),
        "converted": len(converted),
        "held": len(held),
        "conversion_rate": rate,
        "conversion_reasons": converted,
        "holdout_reasons": held,
    }


def run_persuasion(
    *,
    original_run: dict[str, Any],
    condition: str,
    raw_results: list[dict[str, Any]] | None = None,
    sample_size: int | None = None,
    llm_client: Any | None = None,
) -> dict[str, Any]:
    """반대자에게만 조건을 제시해 재질문한다.

    각 응답자의 **원래 반대 이유**를 프롬프트에 실어야 설득 여부가 의미를 갖는다.
    코호트 전체에 같은 질문을 던지는 run_followup과 다른 지점이다.
    """
    import asyncio

    from src.agent.simulator import BatchSimulator
    from src.data.sampler import PersonaSampler
    from src.services.followup_service import select_cohort_subset
    from src.simulations.campus_policy import parse_campus_policy_response

    agenda = str((original_run.get("input") or {}).get("agenda") or "이 안건")
    seed = int(original_run.get("seed") or 42)
    opposers = select_cohort_subset(raw_results or [], "opposed")
    if sample_size is not None:
        opposers = opposers[: max(1, sample_size)]
    if not opposers:
        return {
            "condition": condition,
            "cohort_size": 0,
            "converted": 0,
            "held": 0,
            "conversion_rate": 0.0,
            "conversion_reasons": [],
            "holdout_reasons": [],
        }

    by_uuid = {str(item.get("uuid")): item for item in opposers if item.get("uuid")}
    sampler = PersonaSampler(country_id=str(original_run.get("country_id") or "kr"))
    pool = sampler.sample(n=int(original_run.get("sample_size") or 200), seed=seed)
    personas = [p for p in pool if str(p.get("uuid")) in by_uuid]

    after: list[dict[str, Any] | None] = []
    for persona in personas:
        source = by_uuid[str(persona["uuid"])]
        reason = str((source.get("parsed") or {}).get("reason") or source.get("reason") or "")
        # BatchSimulator는 run() 후 소유 클라이언트를 닫으므로 매번 새로 만든다.
        simulator = BatchSimulator(
            purpose="persuasion",
            llm_client=llm_client,
            trace_metadata={
                "run_id": original_run.get("run_id"),
                "interactive_action": "project_persuasion",
            },
        )
        results = asyncio.run(
            simulator.run([persona], build_persuasion_prompt(agenda, reason, condition))
        )
        item = results[0] if results else None
        after.append(
            parse_campus_policy_response(item.response) if item and not item.error else None
        )

    summary = summarize_persuasion([{"reason": ""} for _ in personas], after)
    summary["condition"] = condition
    return summary
