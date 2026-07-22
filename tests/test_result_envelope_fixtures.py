import json

from evals.run_creative_fixture_eval import FIXTURE_PATH
from evals.run_result_envelope_fixture_eval import run_envelope_fixture


def test_creative_testing_result_envelope_fixture_passes() -> None:
    fixture = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))

    result = run_envelope_fixture(fixture)

    assert result["ok"] is True
    assert result["schema_version"] == "result-envelope/v1"
    assert result["raw_results"] == 10
    assert result["parse_failed"] == 2
