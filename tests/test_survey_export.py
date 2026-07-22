from src.services.survey_export import build_survey_questions

AGENDA = "중앙도서관 24시간 개방"
METRICS = {
    "condition_clusters": [
        {"condition": "야간 안전 인력 상주", "count": 28},
        {"condition": "학생회비 인상 없이 재원 조달", "count": 21},
    ],
    "opposition_reasons": [
        {"reason": "야간 근무 부담이 교직원에 전가", "count": 16},
        {"reason": "비용 대비 실이용률 의문", "count": 13},
    ],
    "tier_housing_matrix": {},
}


def test_includes_a_stance_question():
    out = build_survey_questions(AGENDA, METRICS)
    assert "stance" in [question["kind"] for question in out["questions"]]


def test_condition_clusters_become_multiple_choice_options():
    out = build_survey_questions(AGENDA, METRICS)
    condition_q = next(q for q in out["questions"] if q["kind"] == "condition")
    assert "야간 안전 인력 상주" in condition_q["options"]
    assert "학생회비 인상 없이 재원 조달" in condition_q["options"]


def test_opposition_reasons_become_priority_question():
    out = build_survey_questions(AGENDA, METRICS)
    opposition_q = next(q for q in out["questions"] if q["kind"] == "opposition")
    assert "야간 근무 부담이 교직원에 전가" in opposition_q["options"]


def test_includes_free_text_question():
    out = build_survey_questions(AGENDA, METRICS)
    assert any(question["kind"] == "free_text" for question in out["questions"])


def test_markdown_contains_agenda_and_all_questions():
    out = build_survey_questions(AGENDA, METRICS)
    assert AGENDA in out["markdown"]
    for question in out["questions"]:
        assert question["text"] in out["markdown"]


def test_handles_empty_metrics_without_crashing():
    out = build_survey_questions("안건", {"condition_clusters": [], "opposition_reasons": []})
    kinds = [question["kind"] for question in out["questions"]]
    assert "stance" in kinds
    assert "free_text" in kinds
