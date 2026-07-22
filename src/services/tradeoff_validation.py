"""미확정 택일 감지 — 찬반 질문이 아닌 것을 찬반 스키마로 받는 것을 막는다.

"학생회비 인상 또는 타 복지예산 삭감 중 택일"은 찬반 질문이 아니라 갈래
질문이다. 재원이 미확정이면 "어느 쪽이냐에 따라 다르다"가 정직한 답이고,
그 결과가 200명 전원 조건부찬성이었다(2026-07-20 라이브).

주의: 이것만으로 조건부 쏠림이 해결되지는 않는다. 재원을 확정한 입력(E1/E2)
에서도 10/10 조건부찬성이었다. 필요조건이지 충분조건이 아니다.
"""
from __future__ import annotations

import re
from typing import Any

# "A 또는 B" / "A 아니면 B" 뒤에 선택을 미룬다는 표지가 붙을 때만 잡는다.
_CHOICE_SPLIT = re.compile(r"\s*(?:또는|혹은|아니면)\s*")
_DEFERRAL_MARKERS = ("중 택일", "중 하나", "중에서 선택", "중 결정", "미정", "아직 정해지지", "검토 중")
_MIN_BRANCH_LEN = 2


def detect_unresolved_choice(tradeoffs: str | None) -> dict[str, Any]:
    text = (tradeoffs or "").strip()
    if not text:
        return {"unresolved": False, "branches": [], "reason": ""}

    marker = next((m for m in _DEFERRAL_MARKERS if m in text), None)
    if marker is None:
        return {"unresolved": False, "branches": [], "reason": ""}

    # 선택 표지가 있어도 실제 갈래가 둘 이상이어야 분기 질문이다.
    clause = text
    for sentence in re.split(r"[.。\n]", text):
        if marker in sentence:
            clause = sentence
            break
    branches = [part.strip(" ,·") for part in _CHOICE_SPLIT.split(clause)]
    branches = [b for b in branches if len(b) >= _MIN_BRANCH_LEN]
    if len(branches) < 2:
        return {"unresolved": False, "branches": [], "reason": ""}

    return {
        "unresolved": True,
        "branches": branches,
        "reason": (
            "재원·조건이 확정되지 않은 갈래 질문입니다. 이대로 실행하면 대부분 "
            "'어느 쪽이냐에 따라 다르다'로 답해 찬반이 나오지 않습니다. "
            "안을 하나로 확정하거나, A안·B안을 따로 조사하세요."
        ),
    }
