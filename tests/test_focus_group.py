"""Unit tests for open_survey focus-group panel selection and protocol."""
from __future__ import annotations

import asyncio

from src.llm.base import LLMResponse
from src.simulations.focus_group import (
    build_rule_summary,
    count_option_respondents,
    parse_final_stance,
    run_focus_group_protocol,
    select_homogenous_panel,
)


def _row(uuid: str, choice: str, reason: str = "이유") -> dict:
    return {
        "uuid": uuid,
        "parsed": {"choice": choice, "reason": reason},
        "persona": {
            "uuid": uuid,
            "age": 24,
            "sex": "여",
            "province": "서울",
            "occupation": "학생",
            "education_level": "대학교",
            "persona": f"{uuid} 학생입니다.",
        },
    }


def test_select_panel_requires_nine_same_choice():
    rows = [_row(f"u{i}", "찬성") for i in range(8)]
    try:
        select_homogenous_panel(rows, cohort_option="찬성", panel_size=9, seed=1)
        assert False, "expected FocusGroupError"
    except Exception as exc:
        assert "Need at least 9" in str(exc) or "found 8" in str(exc)


def test_select_panel_is_seed_stable_and_homogenous():
    rows = [_row(f"u{i:02d}", "찬성" if i < 12 else "반대") for i in range(20)]
    a = select_homogenous_panel(rows, cohort_option="찬성", panel_size=9, seed=7)
    b = select_homogenous_panel(rows, cohort_option="찬성", panel_size=9, seed=7)
    assert [m["uuid"] for m in a] == [m["uuid"] for m in b]
    assert all(m["initial_choice"] == "찬성" for m in a)
    assert len(a) == 9


def test_count_option_respondents_dedupes_uuid():
    rows = [_row("same", "찬성"), _row("same", "찬성"), _row("other", "찬성")]
    assert count_option_respondents(rows, "찬성") == 2


def test_parse_final_stance_validates_options():
    ok = parse_final_stance(
        '{"final_choice":"찬성","reason":"여전히 필요합니다","influenced_by":"없음"}',
        allowed_options=["찬성", "반대"],
    )
    assert ok is not None
    assert ok["final_choice"] == "찬성"
    bad = parse_final_stance(
        '{"final_choice":"모름","reason":"x"}',
        allowed_options=["찬성", "반대"],
    )
    assert bad is None


def test_rule_summary_counts_changes_and_echo():
    panel = [
        {
            "uuid": "u1",
            "display_name": "A",
            "initial_choice": "찬성",
            "final_choice": "반대",
            "changed": True,
        },
        {
            "uuid": "u2",
            "display_name": "B",
            "initial_choice": "찬성",
            "final_choice": "찬성",
            "changed": False,
        },
    ]
    timeline = [
        {
            "role": "participant",
            "round": "opening",
            "speaker_uuid": "u1",
            "speaker_name": "A",
            "text": "야간 학습 공간이 절실합니다.",
        },
        {
            "role": "participant",
            "round": "reaction",
            "speaker_uuid": "u2",
            "speaker_name": "B",
            "text": "야간 학습 이야기 듣고 동의 쪽으로 기운다.",
        },
    ]
    summary = build_rule_summary(panel=panel, timeline=timeline, cohort_option="찬성")
    assert summary["changed_count"] == 1
    assert summary["unchanged_count"] == 1
    assert summary["first_speaker_echo_rate"] >= 0.5
    assert summary["warnings"]


class _FakeLLM:
    def __init__(self) -> None:
        self.calls = 0

    async def generate(self, request) -> LLMResponse:
        self.calls += 1
        phase = (request.metadata or {}).get("phase")
        uuid = (request.metadata or {}).get("uuid") or "x"
        if phase == "final_stance":
            content = (
                '{"final_choice":"찬성","reason":"토론 후에도 찬성합니다","influenced_by":"없음"}'
            )
        else:
            content = f"{uuid} 발언 내용입니다. 생활 여건상 이 선택이 맞습니다."
        return LLMResponse(content=content, provider="fake", provider_model="fake")


class _CapturingLLM(_FakeLLM):
    def __init__(self) -> None:
        super().__init__()
        self.user_prompts: list[tuple[str, str]] = []

    async def generate(self, request) -> LLMResponse:
        phase = str((request.metadata or {}).get("phase") or "")
        user_text = ""
        for message in request.messages:
            if getattr(message, "role", None) == "user":
                user_text = str(message.content or "")
        self.user_prompts.append((phase, user_text))
        return await super().generate(request)


def test_opening_prompts_are_isolated_from_other_speakers():
    panel = select_homogenous_panel(
        [_row(f"p{i}", "찬성", f"고유이유{i}번") for i in range(9)],
        cohort_option="찬성",
        panel_size=9,
        seed=3,
    )
    client = _CapturingLLM()
    asyncio.run(
        run_focus_group_protocol(
            panel=panel,
            question="연장할까요?",
            options=["찬성", "반대"],
            cohort_option="찬성",
            moderator_prompt=None,
            llm_client=client,
        )
    )
    opening_prompts = [text for phase, text in client.user_prompts if phase == "opening"]
    assert len(opening_prompts) == 9
    for text in opening_prompts:
        assert "다른 참가자 발언은 아직 없습니다" in text
        assert "지금까지 대화" not in text
        matches = [
            m for m in panel if str(m.get("initial_reason") or "") and str(m["initial_reason"]) in text
        ]
        assert len(matches) == 1, "opening prompt must include only the speaker's own initial reason"
    reaction_prompts = [text for phase, text in client.user_prompts if phase == "reaction"]
    assert reaction_prompts
    assert any("지금까지 대화" in text for text in reaction_prompts)


def test_protocol_runs_parallel_opening_and_sequential_reaction():
    panel = select_homogenous_panel(
        [_row(f"p{i}", "찬성", f"이유{i}") for i in range(9)],
        cohort_option="찬성",
        panel_size=9,
        seed=3,
    )
    client = _FakeLLM()
    phases_seen: list[str] = []

    async def on_progress(payload):
        phases_seen.append(str(payload.get("phase")))

    result = asyncio.run(
        run_focus_group_protocol(
            panel=panel,
            question="연장할까요?",
            options=["찬성", "반대"],
            cohort_option="찬성",
            moderator_prompt=None,
            llm_client=client,
            on_progress=on_progress,
        )
    )
    assert client.calls == 27  # 9 opening + 9 reaction + 9 final
    roles_rounds = [(t["role"], t["round"]) for t in result["timeline"]]
    assert ("moderator", "opening") in roles_rounds
    assert ("moderator", "reaction") in roles_rounds
    assert sum(1 for r, rnd in roles_rounds if r == "participant" and rnd == "opening") == 9
    assert sum(1 for r, rnd in roles_rounds if r == "participant" and rnd == "reaction") == 9
    # All opening participant turns complete before any reaction participant turn.
    last_opening = max(
        t["seq"] for t in result["timeline"] if t["role"] == "participant" and t["round"] == "opening"
    )
    first_reaction = min(
        t["seq"] for t in result["timeline"] if t["role"] == "participant" and t["round"] == "reaction"
    )
    assert last_opening < first_reaction
    assert "opening" in phases_seen and "reaction" in phases_seen and "final_stance" in phases_seen
    assert result["summary"]["changed_count"] == 0
    assert all(row["final_choice"] == "찬성" for row in result["stance_table"])
