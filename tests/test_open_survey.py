"""open_survey — 자유 객관식 설문.

고정 11종에 안 맞는 질문이 많다는 실사용 피드백으로 추가했다.
"""
import json

import pytest

from src.simulations.open_survey import (  # noqa: I001
    aggregate_open_survey,
    build_open_survey_prompt,
    make_open_survey_parser,
)

OPTIONS = ["금요일 저녁", "토요일 오후", "토요일 저녁"]
INPUT = {"question": "가을 축제를 언제 열까요?", "options": OPTIONS, "context": "귀향 패턴이 다르다."}


def test_prompt_lists_options_without_numbering():
    """번호를 붙여 제시하면 모델이 응답에 번호를 복사한다 (campus_priority 전례)."""
    prompt = build_open_survey_prompt(INPUT)
    for option in OPTIONS:
        assert f"- {option}" in prompt
    assert "1. 금요일 저녁" not in prompt
    assert "DGIST" not in prompt


def test_prompt_uses_dgist_role_only_for_dgist_pool():
    prompt = build_open_survey_prompt({**INPUT, "_persona_pool": "dgist"})
    assert "DGIST 구성원" in prompt


def test_prompt_omits_context_when_absent():
    assert "■ 배경" not in build_open_survey_prompt({**INPUT, "context": ""})


def response(choice, reason="이유"):
    return json.dumps({"choice": choice, "reason": reason}, ensure_ascii=False)


def test_parses_valid_choice():
    parse = make_open_survey_parser(INPUT)
    assert parse(response("토요일 오후"))["choice"] == "토요일 오후"


def test_strips_ordinal_prefix():
    parse = make_open_survey_parser(INPUT)
    assert parse(response("2. 토요일 오후"))["choice"] == "토요일 오후"


def test_rejects_option_outside_the_list():
    """목록에 없는 답을 흡수하면 분포가 조용히 왜곡된다."""
    assert make_open_survey_parser(INPUT)(response("일요일")) is None


def test_rejects_missing_reason():
    parse = make_open_survey_parser(INPUT)
    assert parse(json.dumps({"choice": "금요일 저녁"}, ensure_ascii=False)) is None


def test_rejects_garbage():
    assert make_open_survey_parser(INPUT)("답변할 수 없습니다") is None


def _metrics(*args, **kwargs):
    """집계는 {"metrics": ...} 봉투로 돌려준다."""
    return aggregate_open_survey(*args, **kwargs)["metrics"]


class FakeSimResult:
    def __init__(self, education_level=None, age=None, sex=None):
        self.persona = {
            "education_level": education_level,
            "age": age,
            "sex": sex,
            "occupation": "DGIST" if education_level else "시민",
        }


def make(rows, *, key="education"):
    """rows: (bucket_source, choice). key=education uses education_level, key=age uses age."""
    raw = []
    parsed = []
    for source, choice in rows:
        if key == "age":
            raw.append(FakeSimResult(age=source))
        else:
            raw.append(FakeSimResult(education_level=source))
        parsed.append({"choice": choice, "reason": f"{choice} 이유"} if choice else None)
    return raw, parsed


def test_choice_distribution_sorted_by_count():
    rows = [("학사 재학", "토요일 오후")] * 3 + [("학사 재학", "금요일 저녁")]
    out = _metrics({**INPUT, "_persona_pool": "dgist"}, *make(rows))
    assert out["choice_rows"][0]["option"] == "토요일 오후"
    assert out["choice_rows"][0]["count"] == 3
    assert out["choice_rows"][0]["pct"] == 75.0


def test_unselected_option_still_appears_with_zero():
    """0표 선택지를 숨기면 '아무도 안 골랐다'는 정보가 사라진다."""
    out = _metrics({**INPUT, "_persona_pool": "dgist"}, *make([("학사 재학", "금요일 저녁")]))
    assert {row["option"] for row in out["choice_rows"]} == set(OPTIONS)


def test_parse_failures_excluded():
    out = _metrics(
        {**INPUT, "_persona_pool": "dgist"},
        *make([("학사 재학", "금요일 저녁"), ("학사 재학", None)]),
    )
    assert sum(row["count"] for row in out["choice_rows"]) == 1


def test_tier_rows_flag_thin_samples():
    out = _metrics({**INPUT, "_persona_pool": "dgist"}, *make([("학사", "토요일 저녁")]))
    staff = next(row for row in out["tier_rows"] if row["tier"] == "교직원")
    assert staff["n"] == 1
    assert staff["low_confidence"] is True
    assert staff["top_option"] == "토요일 저녁"


def test_absent_tier_reports_zero():
    out = _metrics({**INPUT, "_persona_pool": "dgist"}, *make([("학사 재학", "금요일 저녁")]))
    postdoc = next(row for row in out["tier_rows"] if row["tier"] == "박사후연구원")
    assert postdoc["n"] == 0
    assert postdoc["top_option"] == ""


def test_nationwide_pool_uses_age_axis_not_campus_tiers():
    """전국민 풀에 학내 계층 축을 쓰면 전원이 교직원으로 뭉개진다."""
    out = _metrics(
        {**INPUT, "_persona_pool": "nationwide"},
        *make([(24, "금요일 저녁"), (35, "토요일 오후")], key="age"),
    )
    assert out["persona_pool"] == "nationwide"
    assert out["tier_axis_label"] == "연령대"
    assert "20대" in out["tier_axis"]
    twenties = next(row for row in out["tier_rows"] if row["tier"] == "20대")
    thirties = next(row for row in out["tier_rows"] if row["tier"] == "30대")
    assert twenties["n"] == 1
    assert thirties["n"] == 1
    assert twenties["top_option"] == "금요일 저녁"
    assert all(row["tier"] != "교직원" or row["n"] == 0 for row in out["tier_rows"])


@pytest.mark.asyncio
async def test_run_rotates_options_without_breaking_parsing():
    """회전 배치가 파싱을 깨뜨렸던 전례가 있다. stub으로 고정한다."""
    from src.data.sampler import PersonaSampler
    from src.llm.base import LLMResponse
    from src.simulations.registry import SIMULATION_SPECS

    class RotationEchoStub:
        async def generate(self, request):
            content = request.messages[-1].content
            picked = next(option for option in OPTIONS if f"- {option}" in content)
            return LLMResponse(
                content=response(picked), provider="stub", provider_model="s"
            )

    sim = SIMULATION_SPECS["open_survey"].runner_factory()
    result = await sim.run(
        INPUT, sample_size=12, seed=42,
        llm_client=RotationEchoStub(), sampler=PersonaSampler(pool="dgist"),
    )
    assert result.total_responses == 12
    assert result.parse_failed == 0
