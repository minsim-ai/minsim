"""안건 한 줄에서 campus_policy 구조화 필드 초안을 생성한다.

current_state 같은 필드는 LLM이 모르는 사실이라 그럴듯하게 지어낸다.
어느 칸이 AI 초안인지 호출자에게 명시적으로 돌려주어 UI가 사실 확인을
요구할 수 있게 한다. 마크 없이 채우면 사용자가 검증 없이 실행한다.
"""
from __future__ import annotations

import json
import re
from typing import Any

from src.llm.base import LLMClientProtocol, LLMMessage, LLMRequest

DRAFT_FIELDS = ("current_state", "proposed_change", "tradeoffs")
DRAFT_TASK_TYPE = "policy_draft"

_FENCE = re.compile(r"^\s*```(?:json)?\s*|\s*```\s*$", re.MULTILINE)
_OBJECT = re.compile(r"\{.*\}", re.DOTALL)

_PROMPT = """DGIST 캠퍼스 정책 안건에 대한 여론조사 입력 초안을 작성하세요.

■ 안건
{agenda}

■ 작성 지침
- current_state: 현재 어떻게 운영되고 있는지. 당신은 DGIST의 실제 운영 현황을
  모릅니다. 일반적인 대학 기준으로 그럴듯한 초안을 쓰되, 사용자의 확인이 필요한
  내용임을 전제로 간결하게 쓰세요.
- proposed_change: 안건이 실행되면 무엇이 달라지는지 구체적으로.
- tradeoffs: 무엇을 감수해야 하는지. 비용, 인력, 대체 예산, 부작용을 포함하세요.
  이 칸이 비면 응답이 찬성으로 쏠리므로 반드시 채우세요.

■ 출력 형식 (JSON만, 다른 텍스트 금지)
{{"current_state": "...", "proposed_change": "...", "tradeoffs": "..."}}"""


def _parse_draft(response: str) -> dict[str, Any]:
    text = _FENCE.sub("", response or "").strip()
    match = _OBJECT.search(text)
    if not match:
        return {}
    try:
        payload = json.loads(match.group(0))
    except (json.JSONDecodeError, ValueError):
        return {}
    return payload if isinstance(payload, dict) else {}


async def draft_policy_fields(
    agenda: str,
    existing: dict[str, Any],
    llm_client: LLMClientProtocol,
) -> dict[str, Any]:
    """비어 있는 칸만 채우고, 채운 칸 목록을 함께 돌려준다.

    사용자가 직접 쓴 값은 절대 덮어쓰지 않는다.
    """
    response = await llm_client.generate(
        LLMRequest(
            task_type=DRAFT_TASK_TYPE,
            messages=[LLMMessage(role="user", content=_PROMPT.format(agenda=agenda.strip()))],
            metadata={"purpose": "campus_policy_draft"},
        )
    )
    payload = _parse_draft(response.content)

    fields: dict[str, str] = {}
    ai_generated: list[str] = []
    for name in DRAFT_FIELDS:
        user_value = (existing.get(name) or "").strip()
        if user_value:
            fields[name] = user_value
            continue
        drafted = payload.get(name)
        if isinstance(drafted, str) and drafted.strip():
            fields[name] = drafted.strip()
            ai_generated.append(name)
        else:
            fields[name] = ""

    return {"fields": fields, "ai_generated": ai_generated}


_TAXONOMY_PROMPT = """DGIST 캠퍼스 정책 안건에 대해, 사람들이 걸 만한 조건을 범주로 정리하세요.

■ 안건
{agenda}

■ 예상 비용·부작용
{tradeoffs}

■ 작성 지침
- 서로 겹치지 않는 범주 4~6개. 각 범주는 8자 내외의 짧은 명사구.
- 자유서술 조건을 이 범주 중 하나로 분류할 수 있어야 합니다.
- 동시에 만족할 수 없는 범주 쌍이 있으면 conflicts에 적으세요.
  (예: "학생부담 없이"와 "타 예산 삭감"은 재원이 상충)

■ 출력 형식 (JSON만)
{{"categories": ["...", "..."], "conflicts": [["범주A", "범주B"]]}}"""

MIN_CATEGORIES = 4
MAX_CATEGORIES = 6


async def draft_condition_taxonomy(
    agenda: str,
    tradeoffs: str,
    llm_client: LLMClientProtocol,
) -> dict[str, Any]:
    """조건 범주와 상충 쌍을 만든다.

    자유서술 조건은 문자열 완전일치로 세면 영원히 안 묶인다(30명 → 30개).
    실행 전에 범주를 고정해야 시드 재현성을 유지하면서 집계가 성립한다.
    """
    response = await llm_client.generate(
        LLMRequest(
            task_type=DRAFT_TASK_TYPE,
            messages=[
                LLMMessage(
                    role="user",
                    content=_TAXONOMY_PROMPT.format(
                        agenda=agenda.strip(), tradeoffs=(tradeoffs or "미입력").strip()
                    ),
                )
            ],
            metadata={"purpose": "campus_policy_taxonomy"},
        )
    )
    payload = _parse_draft(response.content)

    categories: list[str] = []
    for item in payload.get("categories") or []:
        text = str(item).strip()
        if text and text not in categories:
            categories.append(text)
    categories = categories[:MAX_CATEGORIES]

    allowed = set(categories)
    conflicts: list[list[str]] = []
    for pair in payload.get("conflicts") or []:
        if not isinstance(pair, (list, tuple)) or len(pair) != 2:
            continue
        left, right = str(pair[0]).strip(), str(pair[1]).strip()
        # 범주에 없는 이름을 상충 쌍으로 두면 영원히 발화하지 않는다.
        if left in allowed and right in allowed and left != right:
            conflicts.append([left, right])

    return {"categories": categories, "conflicts": conflicts}
