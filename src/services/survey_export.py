"""시뮬레이션 결과를 실제 설문 문항으로 변환한다.

시뮬레이션은 사전 탐색이고 실제 설문이 검증이다. 이 다리가 없으면
합성 결과가 그대로 의사결정 근거로 쓰인다.
"""
from __future__ import annotations

from typing import Any

MAX_OPTIONS = 6


def build_survey_questions(agenda: str, metrics: dict[str, Any]) -> dict[str, Any]:
    questions: list[dict[str, Any]] = [
        {
            "kind": "stance",
            "text": f"{agenda}에 찬성하십니까?",
            "options": ["찬성", "조건부 찬성", "반대", "판단 유보"],
        }
    ]

    conditions = [
        item["condition"] for item in metrics.get("condition_clusters", [])[:MAX_OPTIONS]
    ]
    if conditions:
        questions.append(
            {
                "kind": "condition",
                "text": "다음 중 어떤 조건이 보장되면 찬성하시겠습니까? (복수 선택)",
                "options": [*conditions, "해당 없음"],
            }
        )

    reasons = [item["reason"] for item in metrics.get("opposition_reasons", [])[:MAX_OPTIONS]]
    if reasons:
        questions.append(
            {
                "kind": "opposition",
                "text": "우려되는 점을 중요한 순서대로 최대 3개 고르세요.",
                "options": [*reasons, "우려 없음"],
            }
        )

    questions.append(
        {
            "kind": "free_text",
            "text": "위 선택지에 없는 의견이 있다면 자유롭게 적어주세요.",
            "options": [],
        }
    )

    lines = [f"# {agenda} 설문", ""]
    for index, question in enumerate(questions, start=1):
        lines.append(f"## {index}. {question['text']}")
        for option in question["options"]:
            lines.append(f"- [ ] {option}")
        if not question["options"]:
            lines.append("(자유 서술)")
        lines.append("")
    markdown = "\n".join(lines)

    plain_lines: list[str] = []
    for index, question in enumerate(questions, start=1):
        plain_lines.append(f"{index}. {question['text']}")
        plain_lines.extend(question["options"])
        plain_lines.append("")
    plain_text = "\n".join(plain_lines)

    return {"markdown": markdown, "plain_text": plain_text, "questions": questions}
