import json

from evals.run_creative_fixture_eval import FIXTURE_PATH, run_fixture
from evals.run_agent_eval import AGENT_FIXTURE_PATH, run_agent_eval_fixture


def test_creative_testing_fixture_eval_passes() -> None:
    fixture = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))

    result = run_fixture(fixture)

    assert result["ok"] is True
    assert result["parse_failed"] == 2


def test_agent_eval_fixture_scores_schema_and_leaks() -> None:
    fixture = json.loads(AGENT_FIXTURE_PATH.read_text(encoding="utf-8"))

    result = run_agent_eval_fixture(fixture)

    assert result["ok"] is True
    assert result["case_count"] == 4
    assert result["cases"][0]["scores"]["analysis"]["schema_valid"] is True
    assert result["cases"][1]["scores"]["analysis"]["no_raw_leak"] is False
    assert result["cases"][2]["scores"]["report"]["korean_output"] is False
    assert result["cases"][3]["scores"]["qa"]["small_sample_severity_valid"] is False
