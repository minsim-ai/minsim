import json

import pytest

from src.simulations.campus_priority import (
    INVERSION_THRESHOLD,
    aggregate_campus_priority,
    build_campus_priority_prompt,
    make_campus_priority_parser,
)

ITEMS = ["헬스장 확충", "스터디룸 증설", "심야 셔틀", "학식 질 개선"]
INPUT = {
    "question": "복지예산을 어디에 먼저 쓸까요?",
    "items": ITEMS,
    "context": "총 1억. 올해 안에 하나만 집행 가능.",
}


# ─── 프롬프트 ───

def test_prompt_includes_question_and_context():
    prompt = build_campus_priority_prompt(INPUT)
    assert INPUT["question"] in prompt
    assert INPUT["context"] in prompt
    assert "DGIST 구성원" in prompt


def test_prompt_nationwide_pool_drops_dgist_role():
    prompt = build_campus_priority_prompt({**INPUT, "_persona_pool": "nationwide"})
    assert "DGIST" not in prompt
    assert "일반 시민" in prompt


def test_prompt_omits_context_block_when_absent():
    prompt = build_campus_priority_prompt({**INPUT, "context": ""})
    assert "배경·제약" not in prompt


# ─── 파서 ───

def ranking_response(order, top="1위 이유", bottom="최하위 이유"):
    return json.dumps(
        {"ranking": order, "top_reason": top, "bottom_reason": bottom}, ensure_ascii=False
    )


def test_parses_complete_ranking():
    parse = make_campus_priority_parser(ITEMS)
    order = ["학식 질 개선", "심야 셔틀", "스터디룸 증설", "헬스장 확충"]
    assert parse(ranking_response(order))["ranking"] == order


def test_parses_through_markdown_fence():
    parse = make_campus_priority_parser(ITEMS)
    raw = "```json\n" + ranking_response(list(reversed(ITEMS))) + "\n```"
    assert parse(raw)["ranking"] == list(reversed(ITEMS))


def test_rejects_missing_item():
    """항목이 빠지면 Borda 점수가 조용히 왜곡되므로 실패로 처리한다."""
    parse = make_campus_priority_parser(ITEMS)
    assert parse(ranking_response(ITEMS[:3])) is None


def test_rejects_duplicate_item():
    parse = make_campus_priority_parser(ITEMS)
    assert parse(ranking_response([ITEMS[0], ITEMS[0], ITEMS[1], ITEMS[2]])) is None


def test_rejects_unknown_item():
    parse = make_campus_priority_parser(ITEMS)
    assert parse(ranking_response([*ITEMS[:3], "주차장 확충"])) is None


def test_rejects_missing_reasons():
    parse = make_campus_priority_parser(ITEMS)
    assert parse(json.dumps({"ranking": ITEMS}, ensure_ascii=False)) is None
    assert parse(ranking_response(ITEMS, top="")) is None


def test_rejects_garbage():
    parse = make_campus_priority_parser(ITEMS)
    assert parse("죄송합니다, 순위를 매길 수 없습니다.") is None
    assert parse("") is None


# ─── 집계 ───

class FakeSimResult:
    def __init__(self, persona):
        self.persona = persona


def persona(education_level):
    return {"uuid": education_level, "education_level": education_level, "occupation": "DGIST"}


UNDERGRAD = "학사 재학"
STAFF = "학사"


def make(rows):
    raw = [FakeSimResult(persona(level)) for level, _ in rows]
    parsed = [
        {"ranking": order, "top_reason": "top", "bottom_reason": "bottom"} if order else None
        for _, order in rows
    ]
    return raw, parsed


def test_borda_ranks_consistent_winner_first():
    order = ["학식 질 개선", "심야 셔틀", "스터디룸 증설", "헬스장 확충"]
    out = aggregate_campus_priority(INPUT, *make([(UNDERGRAD, order)] * 5))
    assert out["overall_order"][0] == "학식 질 개선"
    assert out["item_rows"][0]["item"] == "학식 질 개선"
    assert out["item_rows"][0]["overall_rank"] == 1


def test_borda_beats_plurality_when_second_choices_matter():
    """1위 지목률만 보면 2~3위 선호가 통째로 버려진다."""
    polarizing = ["헬스장 확충", "스터디룸 증설", "심야 셔틀", "학식 질 개선"]
    against = ["학식 질 개선", "심야 셔틀", "스터디룸 증설", "헬스장 확충"]
    rows = [(UNDERGRAD, polarizing)] * 3 + [(UNDERGRAD, against)] * 4
    out = aggregate_campus_priority(INPUT, *make(rows))
    # 헬스장이 1위 지목 3표로 최다는 아니지만, 최하위 지목도 4표라 Borda에서 밀린다
    healthclub = next(row for row in out["item_rows"] if row["item"] == "헬스장 확충")
    assert healthclub["top_choice_count"] == 3
    assert healthclub["overall_rank"] > 1


def test_parse_failures_excluded():
    order = ["학식 질 개선", "심야 셔틀", "스터디룸 증설", "헬스장 확충"]
    out = aggregate_campus_priority(INPUT, *make([(UNDERGRAD, order), (UNDERGRAD, None)]))
    assert out["item_rows"][0]["top_choice_count"] == 1


def test_zero_parse_does_not_invent_alphabetical_winner():
    """0점 Borda + 사전순 1위는 가짜 의사결정이다 (AGE-1226)."""
    out = aggregate_campus_priority(INPUT, *make([(UNDERGRAD, None)] * 5))
    assert out["ranking_available"] is False
    assert out["item_rows"] == []
    assert out["overall_order"] == []
    assert out["ranking_suppressed_reason"] == "zero_parse"


def test_low_parse_yield_on_large_panel_suppresses_winner():
    order = ["학식 질 개선", "심야 셔틀", "스터디룸 증설", "헬스장 확충"]
    # 1 success among 40 responses → low yield
    rows = [(UNDERGRAD, order)] + [(UNDERGRAD, None)] * 39
    out = aggregate_campus_priority(INPUT, *make(rows))
    assert out["ranking_available"] is False
    assert out["item_rows"] == []
    assert out["valid_answer_count"] == 1


def test_validate_priority_items_rejects_prose_fragments():
    from src.simulations.campus_priority import validate_priority_items

    with pytest.raises(ValueError, match="짧은 후보"):
        validate_priority_items(
            [
                "대학 내 복지 항목(학생 할인 혜택",
                "기숙사 환경 개선",
                "건강 검진 지원",
                "심리 상담 서비스",
                "취업 지원 프로그램 등)에 대한 수요 및 우선순위를 파악하기 위한 조사입니다.",
            ]
        )


def test_validate_priority_items_accepts_short_labels():
    from src.simulations.campus_priority import validate_priority_items

    items = validate_priority_items(
        ["학생 할인 혜택", "기숙사 환경 개선", "건강 검진 지원", "심리 상담 서비스", "취업 지원 프로그램"]
    )
    assert len(items) == 5


def test_mean_rank_is_reported_per_item():
    order = ["학식 질 개선", "심야 셔틀", "스터디룸 증설", "헬스장 확충"]
    out = aggregate_campus_priority(INPUT, *make([(UNDERGRAD, order)] * 3))
    rows = {row["item"]: row["mean_rank"] for row in out["item_rows"]}
    assert rows["학식 질 개선"] == 1.0
    assert rows["헬스장 확충"] == 4.0


def test_detects_rank_inversion_between_tiers():
    """평균 순위 하나만 보면 계층 간 집행 갈등이 묻힌다."""
    student_view = ["심야 셔틀", "학식 질 개선", "스터디룸 증설", "헬스장 확충"]
    staff_view = ["헬스장 확충", "스터디룸 증설", "학식 질 개선", "심야 셔틀"]
    rows = [(UNDERGRAD, student_view)] * 4 + [(STAFF, staff_view)] * 4
    out = aggregate_campus_priority(INPUT, *make(rows))

    shuttle = next(row for row in out["rank_inversions"] if row["item"] == "심야 셔틀")
    assert shuttle["highest_tier"] == "학부생"
    assert shuttle["lowest_tier"] == "교직원"
    assert shuttle["gap"] >= INVERSION_THRESHOLD


def test_no_inversion_when_tiers_agree():
    order = ["학식 질 개선", "심야 셔틀", "스터디룸 증설", "헬스장 확충"]
    rows = [(UNDERGRAD, order)] * 4 + [(STAFF, order)] * 4
    out = aggregate_campus_priority(INPUT, *make(rows))
    assert out["rank_inversions"] == []


def test_tier_with_thin_sample_is_flagged_not_hidden():
    order = ["학식 질 개선", "심야 셔틀", "스터디룸 증설", "헬스장 확충"]
    out = aggregate_campus_priority(INPUT, *make([(STAFF, order)] * 3))
    staff = out["tier_rankings"]["교직원"]
    assert staff["n"] == 3
    assert staff["low_confidence"] is True
    assert staff["order"], "표본이 얇아도 순위를 숨기지 않는다"


def test_absent_tier_reports_zero_not_missing_key():
    order = ["학식 질 개선", "심야 셔틀", "스터디룸 증설", "헬스장 확충"]
    out = aggregate_campus_priority(INPUT, *make([(UNDERGRAD, order)] * 3))
    assert out["tier_rankings"]["박사후연구원"]["n"] == 0
    assert out["tier_rankings"]["박사후연구원"]["low_confidence"] is True


# ─── 러너 ───

@pytest.mark.asyncio
async def test_run_rejects_item_count_out_of_range():
    from src.simulations.registry import SIMULATION_SPECS

    sim = SIMULATION_SPECS["campus_priority"].runner_factory()
    with pytest.raises(ValueError, match="3~6개"):
        await sim.run({**INPUT, "items": ["하나", "둘"]}, sample_size=2)


def test_strips_ordinal_prefix_from_ranking():
    """모델이 '1. 항목'처럼 순번을 붙여도 항목 정체성은 같다. 서식 정규화 대상."""
    parse = make_campus_priority_parser(ITEMS)
    numbered = [f"{index}. {item}" for index, item in enumerate(ITEMS, start=1)]
    assert parse(ranking_response(numbered))["ranking"] == ITEMS


def test_strips_paren_ordinal_prefix():
    parse = make_campus_priority_parser(ITEMS)
    numbered = [f"{index}) {item}" for index, item in enumerate(ITEMS, start=1)]
    assert parse(ranking_response(numbered))["ranking"] == ITEMS


def test_prompt_does_not_number_items():
    """번호를 매겨 제시하면 모델이 그 번호를 응답에 복사한다 (2026-07-20 라이브에서 30/30 실패)."""
    prompt = build_campus_priority_prompt(INPUT)
    for item in ITEMS:
        assert f"- {item}" in prompt
    assert "1. 헬스장 확충" not in prompt


def test_rotate_groups_is_deterministic():
    from src.simulations.campus_priority import _rotate_groups

    people = [{"uuid": str(i)} for i in range(10)]
    a = [[p["uuid"] for p in g] for _, g in _rotate_groups(people, 4)]
    b = [[p["uuid"] for p in g] for _, g in _rotate_groups(people, 4)]
    assert a == b
    assert sum(len(g) for g in a) == 10


@pytest.mark.asyncio
async def test_run_survives_multiple_rotation_batches():
    """회전 배치는 여러 번 run()을 돈다. 클라이언트 수명 회귀를 여기서 잡는다."""
    import json

    from src.data.sampler import PersonaSampler
    from src.llm.base import LLMResponse
    from src.simulations.registry import SIMULATION_SPECS

    class RotationEchoStub:
        """프롬프트에 실린 순서 그대로 답한다 — 실제 모델 행동을 모사."""

        async def generate(self, request):
            content = request.messages[-1].content
            order = [item for item in ITEMS if f"- {item}" in content]
            return LLMResponse(
                content=json.dumps(
                    {"ranking": order, "top_reason": "t", "bottom_reason": "b"},
                    ensure_ascii=False,
                ),
                provider="stub",
                provider_model="s",
            )

    sim = SIMULATION_SPECS["campus_priority"].runner_factory()
    result = await sim.run(
        INPUT, sample_size=20, seed=42,
        llm_client=RotationEchoStub(), sampler=PersonaSampler(pool="dgist"),
    )
    assert result.total_responses == 20
    assert result.parse_failed == 0, "회전 배치에서 파싱이 깨지면 안 된다"


def test_rotation_set_is_independent_of_input_order():
    """입력 순서가 달라도 같은 회전 집합을 써야 순서효과가 상쇄된다.

    정규 정렬 없이 입력 순서로 회전하면 [A,B,C,D]와 [D,C,B,A]가 서로 겹치지
    않는 회전 집합을 쓰게 되어 상쇄가 일어나지 않는다 (2026-07-21 실측).
    """
    from src.simulations.campus_priority import build_campus_priority_prompt

    def rotation_prompts(order):
        canonical = sorted(order)
        return {
            build_campus_priority_prompt(
                {"question": "q", "items": canonical[i:] + canonical[:i], "context": ""}
            )
            for i in range(len(canonical))
        }

    assert rotation_prompts(ITEMS) == rotation_prompts(list(reversed(ITEMS)))
