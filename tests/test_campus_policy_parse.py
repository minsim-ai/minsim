import json

from src.simulations.campus_policy import (
    STANCES,
    build_campus_policy_prompt,
    parse_campus_policy_response,
)

INPUT = {
    "agenda": "중앙도서관 24시간 개방",
    "current_state": "평일 09-23시, 주말 10-18시 운영.",
    "proposed_change": "1층 열람실만 연중 24시간 개방.",
    "tradeoffs": "연간 운영비 1.2억 증가. 학생회비 인상 또는 타 예산 삭감.",
}


def test_prompt_includes_every_input_field():
    prompt = build_campus_policy_prompt(INPUT)
    for value in INPUT.values():
        assert value in prompt


def test_prompt_lists_all_four_stances():
    prompt = build_campus_policy_prompt(INPUT)
    for stance in STANCES:
        assert stance in prompt


def test_prompt_warns_when_tradeoffs_missing():
    """비용이 비면 모델이 스스로 유리한 비용을 상상하게 두면 안 된다."""
    prompt = build_campus_policy_prompt({**INPUT, "tradeoffs": ""})
    assert "비용 정보가 제공되지 않았" in prompt


def test_parse_valid_json():
    raw = json.dumps(
        {
            "stance": "반대",
            "reason": "새벽에 혼자 있기 무섭다",
            "condition": "경비 상주",
            "intensity": 3,
        },
        ensure_ascii=False,
    )
    assert parse_campus_policy_response(raw) == {
        "stance": "반대",
        "reason": "새벽에 혼자 있기 무섭다",
        "condition": "경비 상주",
        "condition_category": "없음",
        "negated": False,
        "intensity": 3,
    }


def test_parse_strips_markdown_fence():
    raw = '```json\n{"stance":"찬성","reason":"방에선 집중이 안 된다","intensity":5}\n```'
    parsed = parse_campus_policy_response(raw)
    assert parsed["stance"] == "찬성"
    assert parsed["condition"] is None


def test_parse_rejects_unknown_stance():
    """알 수 없는 입장을 판단유보로 강등하면 찬반 비율이 왜곡된다."""
    assert parse_campus_policy_response('{"stance":"글쎄요","reason":"몰라","intensity":3}') is None


def test_parse_rejects_out_of_range_intensity():
    assert parse_campus_policy_response('{"stance":"반대","reason":"비용","intensity":9}') is None


def test_parse_rejects_missing_reason():
    assert parse_campus_policy_response('{"stance":"반대","intensity":4}') is None


def test_parse_rejects_garbage():
    assert parse_campus_policy_response("죄송합니다, 답변할 수 없습니다.") is None


def test_stance_no_longer_offers_a_hedge_option():
    """조건부찬성이 있으면 200명 전원이 그리로 몰려 계층 비교가 죽는다 (2026-07-21 실측)."""
    assert "조건부찬성" not in STANCES
    assert parse_campus_policy_response('{"stance":"조건부찬성","reason":"r","intensity":3}') is None


def test_condition_is_collected_from_supporters_too():
    """찬성자의 조건도 실행 조건이다. stance와 무관하게 모은다."""
    raw = '{"stance":"찬성","reason":"가깝다","condition":"경비 상주 시","intensity":4}'
    parsed = parse_campus_policy_response(raw)
    assert parsed["condition"] == "경비 상주 시"



def test_negated_condition_is_flagged_not_downgraded():
    """부정문 조건은 반대를 조건부찬성으로 흡수한다(원문 14번). 강등 대신 표시한다."""
    raw = json.dumps(
        {
            "stance": "반대",
            "reason": "r",
            "condition": "타 예산 삭감 없이 시행 시 반대",
            "intensity": 4,
        },
        ensure_ascii=False,
    )
    parsed = parse_campus_policy_response(raw)
    assert parsed is not None
    assert parsed["negated"] is True


def test_prompt_lists_taxonomy_and_forbids_negation():
    prompt = build_campus_policy_prompt({**INPUT, "condition_taxonomy": ["재원", "안전"]})
    assert "재원" in prompt and "기타" in prompt and "없음" in prompt
    assert "부정문으로 쓰지 마세요" in prompt


def test_taxonomy_parser_rejects_unknown_category():
    from src.simulations.campus_policy import make_campus_policy_parser

    parse = make_campus_policy_parser({"condition_taxonomy": ["재원"]})
    ok = json.dumps({"stance": "찬성", "reason": "r", "condition_category": "재원", "intensity": 3}, ensure_ascii=False)
    bad = json.dumps({"stance": "찬성", "reason": "r", "condition_category": "우주", "intensity": 3}, ensure_ascii=False)
    assert parse(ok) is not None
    assert parse(bad) is None
