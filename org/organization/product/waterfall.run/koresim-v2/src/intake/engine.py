"""Legacy deterministic intake planner kept for API compatibility.

The V2 product flow uses the React planner as its single planning policy and
persists snapshots through ``/api/intake/sessions``. ``/api/intake/advance``
remains available only for older clients and should not gain new policy.
"""
from __future__ import annotations

from copy import deepcopy
from hashlib import sha256
from typing import Any

from src.api.schemas import SafeIntakeSummary, SimulationType

PLANNER_VERSION = "intake-planner:v2-20260513"
ROUTER_VERSION = "goal-router:v1"

_INITIAL_MESSAGE = "어떤 결정을 돕고 싶으신가요? 제품, 캠페인, 가격, 메시지 고민을 편하게 적어주세요."

_ROUTE_HINTS: dict[str, tuple[str, ...]] = {
    "creative_testing": ("헤드라인", "상세페이지", "랜딩", "광고", "카피", "문구"),
    "price_optimization": ("가격", "가격대", "얼마", "요금", "구독료"),
    "product_launch": ("신제품", "출시", "런칭", "시장 반응", "컨셉", "먹힐"),
    "value_proposition": ("가치 제안", "장점", "소구점", "usp", "어필"),
    "market_segmentation": ("고객군", "세그먼트", "타겟", "분류", "나누"),
    "competitive_positioning": ("경쟁", "포지션", "포지셔닝", "대비", "비교"),
    "brand_perception": ("브랜드", "인지도", "평판", "이미지", "인식"),
    "churn_prediction": ("이탈", "해지", "떠날", "전환", "구독 취소"),
    "campaign_strategy": ("캠페인", "채널", "매체", "예산"),
}

_FIRST_CRITICAL_SLOT: dict[str, str] = {
    "creative_testing": "product_description",
    "price_optimization": "product_description",
    "product_launch": "product_concept",
    "value_proposition": "product_context",
    "market_segmentation": "category",
    "competitive_positioning": "category_context",
    "brand_perception": "brand_name",
    "churn_prediction": "service_name",
    "campaign_strategy": "product_context",
}

_SLOT_LABELS: dict[str, str] = {
    "product_description": "제품 설명",
    "product_concept": "제품 컨셉",
    "product_context": "제품/캠페인 맥락",
    "category": "카테고리",
    "category_context": "시장/카테고리 설명",
    "brand_name": "브랜드명",
    "service_name": "서비스명",
}


def advance_intake(
    *,
    session_id: str,
    snapshot: dict[str, Any],
    event: dict[str, Any],
) -> dict[str, Any]:
    """Advance one intake turn and return a persisted snapshot contract."""

    state = _initial_state(session_id) if not snapshot else deepcopy(snapshot)
    event_type = str(event.get("type") or "")

    if event_type == "reset":
        state = _initial_state(session_id)
    elif event_type == "user_message":
        content = str(event.get("content") or "").strip()
        if content:
            task_frame = state.get("taskFrame") or _route_intent(content)
            state["taskFrame"] = task_frame
            state["messages"] = [*state.get("messages", []), {"role": "user", "content": content}]
            state["slots"] = _extract_slots(content, task_frame, state.get("slots", {}))
            state["turnCount"] = int(state.get("turnCount") or 0) + 1
    elif event_type == "form_submit":
        values = event.get("values") if isinstance(event.get("values"), dict) else {}
        state["slots"] = _merge_form_values(values, state.get("slots", {}))
        state["messages"] = [*state.get("messages", []), {"role": "user", "content": "추가 정보를 반영했습니다."}]
        state["turnCount"] = int(state.get("turnCount") or 0) + 1

    action = _plan_action(state)
    state["action"] = action
    state["status"] = "ready" if action.get("type") == "run_ready" else "collecting"
    if action.get("type") in {"ask_question", "show_form"}:
        state["messages"] = [*state.get("messages", []), {"role": "assistant", "content": action["message"]}]

    safe_summary = _safe_summary(state)
    checkpoint = _checkpoint(state, safe_summary)
    state["checkpoint"] = checkpoint
    return {
        "session_id": session_id,
        "status": state["status"],
        "snapshot": state,
        "action": action,
        "safe_intake_summary": safe_summary.model_dump(mode="json"),
        "checkpoint": checkpoint,
    }


def _initial_state(session_id: str) -> dict[str, Any]:
    return {
        "id": session_id,
        "status": "collecting",
        "messages": [{"role": "assistant", "content": _INITIAL_MESSAGE}],
        "taskFrame": None,
        "slots": {},
        "action": {"type": "ask_question", "message": _INITIAL_MESSAGE, "slotIds": ["goal"]},
        "turnCount": 0,
    }


def _route_intent(message: str) -> dict[str, Any]:
    normalized = message.lower()
    scored = sorted(
        (
            (simulation_type, sum(1 for hint in hints if hint.lower() in normalized))
            for simulation_type, hints in _ROUTE_HINTS.items()
        ),
        key=lambda item: item[1],
        reverse=True,
    )
    primary, score = next((item for item in scored if item[1] > 0), ("creative_testing", 0))
    return {
        "taskId": f"{primary}.goal_first_intake",
        "userGoal": message,
        "decisionQuestion": _decision_question(primary),
        "likelySimulationTypes": [item[0] for item in scored if item[1] > 0][:3] or [primary],
        "primarySimulationType": primary,
        "preSimulationActions": ["generate_creative_candidates"] if primary == "creative_testing" else [],
        "confidence": min(0.96, 0.58 + score * 0.12) if score else 0.45,
        "evidence": [f"{item[0]}:{item[1]}" for item in scored if item[1] > 0][:3],
    }


def _decision_question(simulation_type: str) -> str:
    if simulation_type == "creative_testing":
        return "어떤 문구가 핵심 고객에게 가장 설득력 있는가?"
    return "이 의사결정을 어떤 조건으로 시뮬레이션할 것인가?"


def _extract_slots(
    message: str,
    task_frame: dict[str, Any],
    current_slots: dict[str, Any],
) -> dict[str, Any]:
    slots = dict(current_slots)
    simulation_type = str(task_frame.get("primarySimulationType") or "creative_testing")
    first_slot = _FIRST_CRITICAL_SLOT.get(simulation_type)
    if first_slot and _looks_like_object_answer(message):
        slots[first_slot] = _slot(first_slot, message, "user", 0.82, message, False)
    return slots


def _merge_form_values(values: dict[str, Any], current_slots: dict[str, Any]) -> dict[str, Any]:
    slots = dict(current_slots)
    for slot_id, value in values.items():
        normalized = [item.strip() for item in value if str(item).strip()] if isinstance(value, list) else value
        if isinstance(normalized, str):
            normalized = normalized.strip()
        if normalized in ("", [], None):
            continue
        slots[slot_id] = _slot(slot_id, normalized, "user", 0.95, "form_submit", False)
    return slots


def _plan_action(state: dict[str, Any]) -> dict[str, Any]:
    task_frame = state.get("taskFrame")
    if not isinstance(task_frame, dict):
        return {"type": "ask_question", "message": _INITIAL_MESSAGE, "slotIds": ["goal"]}

    simulation_type = str(task_frame.get("primarySimulationType") or "creative_testing")
    first_slot = _FIRST_CRITICAL_SLOT.get(simulation_type, "product_description")
    slots = state.get("slots") if isinstance(state.get("slots"), dict) else {}
    if first_slot not in slots:
        label = _SLOT_LABELS.get(first_slot, first_slot)
        return {
            "type": "ask_question",
            "message": f"시뮬레이션을 실행하려면 먼저 {label}이 필요합니다. 어떤 내용인지 알려주세요.",
            "slotIds": [first_slot],
        }

    return {
        "type": "show_form",
        "message": "좋습니다. 실행 품질을 높이기 위해 필요한 구조화 정보를 더 입력해주세요.",
        "form": {"id": f"{simulation_type}_intake_v2", "fields": [], "primaryAction": "다음"},
    }


def _safe_summary(state: dict[str, Any]) -> SafeIntakeSummary:
    task_frame = state.get("taskFrame") if isinstance(state.get("taskFrame"), dict) else {}
    slots = state.get("slots") if isinstance(state.get("slots"), dict) else {}
    grouped = {
        "user": {},
        "inferred": {},
        "generated": {},
        "default": {},
    }
    reviewed: dict[str, Any] = {}
    for slot_id, slot in slots.items():
        if not isinstance(slot, dict):
            continue
        source = str(slot.get("source") or "user")
        grouped.setdefault(source, {})[slot_id] = slot.get("value")
        if slot.get("needsUserReview") and slot.get("reviewed"):
            reviewed[slot_id] = slot.get("value")
    return SafeIntakeSummary(
        user_goal=str(task_frame.get("userGoal") or ""),
        decision_question=str(task_frame.get("decisionQuestion") or ""),
        simulation_type=SimulationType(str(task_frame.get("primarySimulationType") or "creative_testing")),
        user_provided=grouped["user"],
        inferred=grouped["inferred"],
        generated=grouped["generated"],
        defaults=grouped["default"],
        reviewed_assumptions=reviewed,
        generated_candidates=[],
        constraints={key: value for key, value in grouped["user"].items() if "price" in key or "budget" in key},
        source_counts={key: len(value) for key, value in grouped.items()},
        unreviewed_assumption_count=sum(
            1
            for slot in slots.values()
            if isinstance(slot, dict) and slot.get("needsUserReview") and not slot.get("reviewed")
        ),
    )


def _checkpoint(state: dict[str, Any], safe_summary: SafeIntakeSummary) -> dict[str, Any]:
    state_digest = sha256(repr(sorted((state.get("slots") or {}).keys())).encode("utf-8")).hexdigest()
    return {
        "graph_name": "intake_v2",
        "checkpoint_name": "plan_next_action",
        "planner_version": PLANNER_VERSION,
        "router_version": ROUTER_VERSION,
        "state_digest": state_digest,
        "awaiting_human_input": state.get("status") != "ready",
        "safe_intake_summary": safe_summary.model_dump(mode="json"),
    }


def _slot(
    slot_id: str,
    value: Any,
    source: str,
    confidence: float,
    evidence: str,
    needs_review: bool,
) -> dict[str, Any]:
    return {
        "slotId": slot_id,
        "value": value,
        "source": source,
        "confidence": confidence,
        "evidence": evidence,
        "needsUserReview": needs_review,
        "reviewed": source in {"user", "default"},
    }


def _looks_like_object_answer(message: str) -> bool:
    normalized = message.strip()
    if len(normalized) < 4:
        return False
    return not normalized.endswith("?")
