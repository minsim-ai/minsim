"""9-person focus group protocol for open_survey (bias-aware round robin).

Opening turns run in parallel (no cross-talk) to reduce first-speaker anchoring.
Reaction turns run sequentially so participants hear each other. Final stances
are independent structured answers. Summary is rule-based (no extra LLM).
"""
from __future__ import annotations

import asyncio
import json
import random
import re
from collections import Counter
from collections.abc import Awaitable, Callable
from typing import Any

from src.agent.prompt_builder import build_system_prompt
from src.data.persona_display import resolve_persona_name
from src.llm.base import LLMClientProtocol, LLMMessage, LLMRequest

PROTOCOL_ID = "focus_group_round_robin_v1"
SCHEMA_VERSION = "focus-group/v1"
DEFAULT_PANEL_SIZE = 9
_FENCE = re.compile(r"^\s*```(?:json)?\s*|\s*```\s*$", re.MULTILINE)
_OBJECT = re.compile(r"\{.*\}", re.DOTALL)
_ORDINAL_PREFIX = re.compile(r"^\s*\d+\s*[.)]\s*")

ProgressCallback = Callable[[dict[str, Any]], Awaitable[None] | None]


class FocusGroupError(ValueError):
    """Domain validation error for focus-group setup or protocol inputs."""


def select_homogenous_panel(
    raw_results: list[dict[str, Any]],
    *,
    cohort_option: str,
    panel_size: int = DEFAULT_PANEL_SIZE,
    seed: int = 42,
    country_id: str = "kr",
) -> list[dict[str, Any]]:
    """Pick `panel_size` respondents who chose `cohort_option` (reproducible shuffle)."""
    option = str(cohort_option or "").strip()
    if not option:
        raise FocusGroupError("cohort_option is required")
    if panel_size < 2:
        raise FocusGroupError("panel_size must be at least 2")

    candidates: list[dict[str, Any]] = []
    for row in raw_results:
        if not isinstance(row, dict):
            continue
        parsed = row.get("parsed") if isinstance(row.get("parsed"), dict) else {}
        choice = parsed.get("choice") if parsed else row.get("choice")
        if str(choice or "").strip() != option:
            continue
        uuid = str(row.get("uuid") or (row.get("persona") or {}).get("uuid") or "").strip()
        if not uuid:
            continue
        persona = dict(row.get("persona") or {})
        persona.setdefault("uuid", uuid)
        persona.setdefault("_country_id", country_id)
        persona.setdefault("country_id", country_id)
        _fill_prompt_fields(persona)
        reason = ""
        if isinstance(parsed.get("reason"), str):
            reason = parsed["reason"].strip()
        elif isinstance(row.get("reason"), str):
            reason = row["reason"].strip()
        name = resolve_persona_name(persona, uuid)
        meta_bits = []
        if persona.get("age") is not None:
            meta_bits.append(f"{persona.get('age')}세")
        if persona.get("province"):
            meta_bits.append(str(persona.get("province")))
        candidates.append(
            {
                "uuid": uuid,
                "display_name": name,
                "meta": " · ".join(meta_bits),
                "persona": persona,
                "initial_choice": option,
                "initial_reason": reason[:400],
                "final_choice": None,
                "final_reason": None,
                "changed": None,
            }
        )

    # Stable unique by uuid (first wins)
    by_uuid: dict[str, dict[str, Any]] = {}
    for item in candidates:
        by_uuid.setdefault(item["uuid"], item)
    ordered = sorted(by_uuid.values(), key=lambda item: item["uuid"])
    rng = random.Random(int(seed))
    rng.shuffle(ordered)
    if len(ordered) < panel_size:
        raise FocusGroupError(
            f"Need at least {panel_size} respondents for option {option!r}; found {len(ordered)}"
        )
    return ordered[:panel_size]


def count_option_respondents(raw_results: list[dict[str, Any]], cohort_option: str) -> int:
    option = str(cohort_option or "").strip()
    n = 0
    seen: set[str] = set()
    for row in raw_results:
        if not isinstance(row, dict):
            continue
        parsed = row.get("parsed") if isinstance(row.get("parsed"), dict) else {}
        choice = parsed.get("choice") if parsed else row.get("choice")
        if str(choice or "").strip() != option:
            continue
        uuid = str(row.get("uuid") or (row.get("persona") or {}).get("uuid") or "").strip()
        if not uuid or uuid in seen:
            continue
        seen.add(uuid)
        n += 1
    return n


def moderator_opening_text(*, question: str, cohort_option: str, moderator_prompt: str | None) -> str:
    base = (moderator_prompt or question or "").strip()
    if not base:
        base = "이 주제에 대해 서로의 이유를 나눠 주세요."
    return (
        f"{base}\n\n"
        f"여러분은 모두 「{cohort_option}」을(를) 선택했습니다. "
        "먼저 각자 그 이유를 말합니다(다른 사람의 말은 아직 보지 않습니다). "
        "한 사람당 2~4문장으로, 일반론보다 본인 생활·여건 기준으로 말해 주세요."
    )


def moderator_reaction_text() -> str:
    return (
        "이제 서로의 이유를 들었습니다. 순서대로 반응해 주세요. "
        "앞에서 나온 말 중 설득력 있었던 점 또는 불편했던 점을 말하고, "
        "앞에서와 겹치지 않는 본인 이유를 한 가지 더 보태 주세요. "
        "‘공감합니다/맞아요’로만 끝내지 마세요. 입장을 바꿔도 됩니다."
    )


def parse_final_stance(response: str, *, allowed_options: list[str]) -> dict[str, Any] | None:
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
    choice = payload.get("final_choice") or payload.get("choice")
    if not isinstance(choice, str):
        return None
    choice = _ORDINAL_PREFIX.sub("", choice).strip()
    allowed = set(allowed_options)
    if choice not in allowed:
        # soft match: substring / case fold
        lowered = {opt.lower(): opt for opt in allowed_options}
        choice = lowered.get(choice.lower(), choice)
        if choice not in allowed:
            return None
    reason = payload.get("reason") or payload.get("final_reason") or ""
    if not isinstance(reason, str) or not reason.strip():
        return None
    influenced = payload.get("influenced_by")
    if not isinstance(influenced, str):
        influenced = ""
    return {
        "final_choice": choice,
        "reason": reason.strip()[:400],
        "influenced_by": influenced.strip()[:120],
    }


def build_rule_summary(
    *,
    panel: list[dict[str, Any]],
    timeline: list[dict[str, Any]],
    cohort_option: str,
) -> dict[str, Any]:
    decided = [m for m in panel if m.get("final_choice")]
    changed = [m for m in decided if m.get("changed") is True]
    unchanged = [m for m in decided if m.get("changed") is False]
    first_uuid = panel[0]["uuid"] if panel else ""
    first_opening = next(
        (
            t["text"]
            for t in timeline
            if t.get("role") == "participant"
            and t.get("round") == "opening"
            and t.get("speaker_uuid") == first_uuid
        ),
        "",
    )
    echo_hits = 0
    reaction_turns = [
        t
        for t in timeline
        if t.get("role") == "participant" and t.get("round") == "reaction"
    ]
    tokens = _theme_tokens(first_opening)
    if tokens and reaction_turns:
        for turn in reaction_turns:
            text = str(turn.get("text") or "")
            if any(tok in text for tok in tokens):
                echo_hits += 1
        echo_rate = round(echo_hits / len(reaction_turns), 2)
    else:
        echo_rate = 0.0

    quotes: list[dict[str, str]] = []
    for turn in timeline:
        if turn.get("role") != "participant":
            continue
        text = str(turn.get("text") or "").strip()
        if len(text) < 24:
            continue
        quotes.append(
            {
                "uuid": str(turn.get("speaker_uuid") or ""),
                "name": str(turn.get("speaker_name") or ""),
                "text": text[:220],
            }
        )
        if len(quotes) >= 3:
            break

    final_counts = Counter(str(m.get("final_choice")) for m in decided)
    top_final = final_counts.most_common(1)[0][0] if final_counts else cohort_option
    headline = (
        f"{len(panel)}명 중 {len(changed)}명이 토론 후 입장을 바꿨습니다."
        if decided
        else f"{len(panel)}명 토론을 마쳤으나 최종 입장을 파싱하지 못했습니다."
    )
    agreement_note = (
        f"최종 다수 선택: {top_final}. "
        "순차 반응 구간에는 앞 발언 동조·앵커 편향이 있을 수 있습니다."
    )
    if echo_rate >= 0.5 and tokens:
        agreement_note += (
            f" 반응 발언의 약 {int(echo_rate * 100)}%가 첫 오프닝 화자 표현을 반복했습니다."
        )

    return {
        "headline": headline,
        "changed_count": len(changed),
        "unchanged_count": len(unchanged),
        "undecided_count": len(panel) - len(decided),
        "agreement_note": agreement_note,
        "first_speaker_echo_rate": echo_rate,
        "quotes": quotes,
        "warnings": [
            "포커스 그룹은 탐색용 대화 시뮬레이션입니다. 본 설문 분포를 대체하지 않습니다.",
            "오프닝은 병렬, 반응은 순차입니다. 반응 구간에서 동조 편향이 생길 수 있습니다.",
        ],
    }


def estimate_total_calls(panel_size: int = DEFAULT_PANEL_SIZE) -> int:
    # opening N + reaction N + final N
    return panel_size * 3


async def run_focus_group_protocol(
    *,
    panel: list[dict[str, Any]],
    question: str,
    options: list[str],
    cohort_option: str,
    moderator_prompt: str | None,
    llm_client: LLMClientProtocol,
    model_alias: str | None = None,
    on_progress: ProgressCallback | None = None,
    trace_metadata: dict[str, object] | None = None,
) -> dict[str, Any]:
    """Execute focus_group_round_robin_v1. Mutates panel final_* fields; returns payload parts."""
    if not panel:
        raise FocusGroupError("panel is empty")
    total_calls = estimate_total_calls(len(panel))
    done_calls = 0
    timeline: list[dict[str, Any]] = []
    seq = 0

    async def emit(phase: str, **extra: Any) -> None:
        if on_progress is None:
            return
        payload = {
            "phase": phase,
            "round": extra.get("round"),
            "speaker_index": extra.get("speaker_index"),
            "speakers_total": len(panel),
            "done_calls": done_calls,
            "total_calls_est": total_calls,
            "timeline": list(timeline),
            "panel": list(panel),
        }
        result = on_progress(payload)
        if asyncio.iscoroutine(result) or isinstance(result, Awaitable):
            await result

    # --- Opening moderator (system, no LLM) ---
    timeline.append(
        {
            "seq": seq,
            "role": "moderator",
            "round": "opening",
            "speaker_uuid": None,
            "speaker_name": "모더레이터",
            "text": moderator_opening_text(
                question=question,
                cohort_option=cohort_option,
                moderator_prompt=moderator_prompt,
            ),
        }
    )
    seq += 1
    await emit("opening", round="opening", speaker_index=0)

    # --- Parallel opening speeches ---
    opening_prompts = [
        _opening_user_prompt(
            question=question,
            cohort_option=cohort_option,
            initial_reason=str(member.get("initial_reason") or ""),
            options=options,
        )
        for member in panel
    ]
    opening_results = await asyncio.gather(
        *[
            _generate_persona(
                llm_client,
                persona=member["persona"],
                user_prompt=prompt,
                model_alias=model_alias,
                trace_metadata={**(trace_metadata or {}), "phase": "opening", "uuid": member["uuid"]},
            )
            for member, prompt in zip(panel, opening_prompts, strict=True)
        ]
    )
    for index, (member, text) in enumerate(zip(panel, opening_results, strict=True)):
        done_calls += 1
        timeline.append(
            {
                "seq": seq,
                "role": "participant",
                "round": "opening",
                "speaker_uuid": member["uuid"],
                "speaker_name": member["display_name"],
                "text": text.strip()[:800],
            }
        )
        seq += 1
        await emit("opening", round="opening", speaker_index=index + 1)

    # --- Reaction moderator ---
    timeline.append(
        {
            "seq": seq,
            "role": "moderator",
            "round": "reaction",
            "speaker_uuid": None,
            "speaker_name": "모더레이터",
            "text": moderator_reaction_text(),
        }
    )
    seq += 1
    await emit("reaction", round="reaction", speaker_index=0)

    # --- Sequential reaction ---
    for index, member in enumerate(panel):
        history = _format_timeline_for_prompt(timeline)
        prompt = _reaction_user_prompt(
            question=question,
            cohort_option=cohort_option,
            initial_reason=str(member.get("initial_reason") or ""),
            history=history,
            speaker_name=str(member["display_name"]),
        )
        text = await _generate_persona(
            llm_client,
            persona=member["persona"],
            user_prompt=prompt,
            model_alias=model_alias,
            trace_metadata={**(trace_metadata or {}), "phase": "reaction", "uuid": member["uuid"]},
        )
        done_calls += 1
        timeline.append(
            {
                "seq": seq,
                "role": "participant",
                "round": "reaction",
                "speaker_uuid": member["uuid"],
                "speaker_name": member["display_name"],
                "text": text.strip()[:800],
            }
        )
        seq += 1
        await emit("reaction", round="reaction", speaker_index=index + 1)

    # --- Final stances (parallel) ---
    await emit("final_stance", round="final", speaker_index=0)
    history = _format_timeline_for_prompt(timeline)
    final_prompts = [
        _final_user_prompt(
            question=question,
            options=options,
            initial_choice=str(member.get("initial_choice") or ""),
            initial_reason=str(member.get("initial_reason") or ""),
            history=history,
        )
        for member in panel
    ]
    final_raw = await asyncio.gather(
        *[
            _generate_persona(
                llm_client,
                persona=member["persona"],
                user_prompt=prompt,
                model_alias=model_alias,
                trace_metadata={**(trace_metadata or {}), "phase": "final_stance", "uuid": member["uuid"]},
            )
            for member, prompt in zip(panel, final_prompts, strict=True)
        ]
    )
    stance_table: list[dict[str, Any]] = []
    for member, raw in zip(panel, final_raw, strict=True):
        done_calls += 1
        parsed = parse_final_stance(raw, allowed_options=options)
        if parsed is None:
            member["final_choice"] = None
            member["final_reason"] = None
            member["changed"] = None
            stance_table.append(
                {
                    "uuid": member["uuid"],
                    "name": member["display_name"],
                    "initial_choice": member["initial_choice"],
                    "final_choice": None,
                    "changed": None,
                    "final_reason": None,
                    "influenced_by": None,
                }
            )
            continue
        member["final_choice"] = parsed["final_choice"]
        member["final_reason"] = parsed["reason"]
        member["changed"] = parsed["final_choice"] != member["initial_choice"]
        stance_table.append(
            {
                "uuid": member["uuid"],
                "name": member["display_name"],
                "initial_choice": member["initial_choice"],
                "final_choice": parsed["final_choice"],
                "changed": member["changed"],
                "final_reason": parsed["reason"],
                "influenced_by": parsed.get("influenced_by") or None,
            }
        )
    await emit("final_stance", round="final", speaker_index=len(panel))

    summary = build_rule_summary(panel=panel, timeline=timeline, cohort_option=cohort_option)
    await emit("summarize", round="summary", speaker_index=len(panel))

    return {
        "panel": panel,
        "timeline": timeline,
        "stance_table": stance_table,
        "summary": summary,
        "done_calls": done_calls,
        "total_calls_est": total_calls,
    }


def _theme_tokens(text: str) -> list[str]:
    # crude Korean/English content tokens for echo heuristic
    parts = re.findall(r"[가-힣]{2,}|[A-Za-z]{4,}", text or "")
    stop = {
        "그리고",
        "하지만",
        "그래서",
        "있습니다",
        "합니다",
        "생각",
        "때문",
        "정도",
        "사람",
        "우리",
        "이번",
        "선택",
        "이유",
    }
    out: list[str] = []
    for part in parts:
        if part in stop or len(part) < 2:
            continue
        if part not in out:
            out.append(part)
        if len(out) >= 6:
            break
    return out


def _format_timeline_for_prompt(timeline: list[dict[str, Any]]) -> str:
    lines: list[str] = []
    for turn in timeline:
        role = turn.get("role")
        name = turn.get("speaker_name") or ("모더레이터" if role == "moderator" else "참가자")
        rnd = turn.get("round") or ""
        text = str(turn.get("text") or "").strip()
        lines.append(f"[{rnd}] {name}: {text}")
    return "\n".join(lines)[:6000]


def _opening_user_prompt(
    *,
    question: str,
    cohort_option: str,
    initial_reason: str,
    options: list[str],
) -> str:
    listed = ", ".join(options)
    reason_line = initial_reason or "(기록된 이유 없음 — 본인 관점으로 새로 말하세요)"
    return f"""당신은 설문에서 「{cohort_option}」을(를) 골랐습니다.

■ 설문 질문
{question}

■ 선택지 목록
{listed}

■ 설문 때 적은 이유 (참고, 그대로 복붙 금지)
{reason_line}

■ 지침
- 다른 참가자 발언은 아직 없습니다. 본인 이야기만 하세요.
- 2~4문장, 구어체.
- 선택지 이름을 나열하지 말고 이유에 집중하세요.
- 출력은 발언 본문만 (JSON/머리말 금지)."""


def _reaction_user_prompt(
    *,
    question: str,
    cohort_option: str,
    initial_reason: str,
    history: str,
    speaker_name: str,
) -> str:
    return f"""당신은 포커스 그룹 참가자 「{speaker_name}」입니다. 설문에서는 「{cohort_option}」을(를) 골랐습니다.

■ 질문
{question}

■ 본인 초기 이유
{initial_reason or "(없음)"}

■ 지금까지 대화
{history}

■ 지침
- 앞 발언 중 한 가지에 구체적으로 반응하세요.
- 앞에서 이미 나온 이유를 되풀이만 하지 말고, 본인 여건에서 오는 점을 추가하세요.
- ‘공감합니다/맞아요/동의합니다’로 시작하지 마세요.
- 2~4문장, 발언 본문만 출력."""


def _final_user_prompt(
    *,
    question: str,
    options: list[str],
    initial_choice: str,
    initial_reason: str,
    history: str,
) -> str:
    listed = "\n".join(f"- {opt}" for opt in options)
    return f"""토론을 모두 들었습니다. 최종 입장을 고르세요.

■ 질문
{question}

■ 선택지 (하나만, 문구 그대로)
{listed}

■ 본인 초기 선택
{initial_choice}
초기 이유: {initial_reason or "(없음)"}

■ 대화 요약 원문
{history}

■ 출력 형식 (JSON만)
{{
  "final_choice": "위 선택지 중 하나를 그대로",
  "reason": "최종 이유 한두 문장",
  "influenced_by": "영향 준 참가자 이름 또는 없음"
}}"""


async def _generate_persona(
    client: LLMClientProtocol,
    *,
    persona: dict[str, Any],
    user_prompt: str,
    model_alias: str | None,
    trace_metadata: dict[str, object],
) -> str:
    system = build_system_prompt(persona, purpose="interview")
    response = await client.generate(
        LLMRequest(
            task_type="focus_group_turn",
            model_alias=model_alias,
            messages=[
                LLMMessage(role="system", content=system),
                LLMMessage(role="user", content=user_prompt),
            ],
            metadata=trace_metadata,
        )
    )
    return str(response.content or "")


def _fill_prompt_fields(persona: dict[str, Any]) -> None:
    defaults = {
        "age": "미상",
        "sex": "미상",
        "province": "미상",
        "occupation": "미상",
        "education_level": "미상",
        "marital_status": "미상",
        "family_type": "미상",
        "housing_type": "미상",
    }
    for key, value in defaults.items():
        persona.setdefault(key, value)
