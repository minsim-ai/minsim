from src.services.persuasion_service import build_persuasion_prompt, summarize_persuasion


def test_prompt_includes_original_reason_and_condition():
    prompt = build_persuasion_prompt(
        "중앙도서관 24시간 개방", "야간 근무 부담이 크다", "야간 경비를 외주로 운영"
    )
    assert "야간 근무 부담이 크다" in prompt
    assert "야간 경비를 외주로 운영" in prompt


def answer(stance, reason, intensity=3):
    return {"stance": stance, "reason": reason, "condition": None, "intensity": intensity}


def test_conversion_rate_counts_support_and_conditional_support():
    before = [{"reason": "a"}, {"reason": "b"}, {"reason": "c"}, {"reason": "d"}]
    after = [
        answer("찬성", "외주면 괜찮다"),
        answer("조건부찬성", "계약서에 명시되면"),
        answer("반대", "여전히 비용이 크다", 5),
        answer("반대", "책임 소재가 애매하다", 4),
    ]
    out = summarize_persuasion(before, after)
    assert out["converted"] == 2
    assert out["held"] == 2
    assert out["conversion_rate"] == 50.0


def test_parse_failures_excluded_from_both_counts():
    out = summarize_persuasion([{"reason": "a"}, {"reason": "b"}], [answer("찬성", "ok"), None])
    assert out["converted"] == 1
    assert out["held"] == 0
    assert out["conversion_rate"] == 100.0


def test_reasons_are_separated_by_outcome():
    out = summarize_persuasion(
        [{"reason": "a"}, {"reason": "b"}],
        [answer("찬성", "외주면 괜찮다"), answer("반대", "여전히 비용이 크다", 5)],
    )
    assert "외주면 괜찮다" in out["conversion_reasons"]
    assert "여전히 비용이 크다" in out["holdout_reasons"]
    assert "외주면 괜찮다" not in out["holdout_reasons"]


def test_empty_cohort_returns_zero_rate_without_dividing_by_zero():
    assert summarize_persuasion([], [])["conversion_rate"] == 0.0
