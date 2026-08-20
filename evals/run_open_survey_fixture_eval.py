"""Run deterministic Open Survey fixture evaluations."""
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

FIXTURE_PATH = PROJECT_ROOT / "evals" / "fixtures" / "open_survey_fixture.json"


def main() -> int:
    fixture = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    result = run_fixture(fixture)
    print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
    return 0


def run_fixture(fixture: dict[str, Any]) -> dict[str, Any]:
    total_responses, parse_failed, metrics = build_open_survey_result(fixture)
    expected = fixture["expected"]

    assert total_responses == expected["total_responses"]
    assert parse_failed == expected["parse_failed"]
    assert metrics == expected["metrics"]

    return {
        "fixture": fixture["name"],
        "ok": True,
        "total_responses": total_responses,
        "parse_failed": parse_failed,
        "choice_counts": metrics["choice_counts"],
    }


def build_open_survey_result(fixture: dict[str, Any]) -> tuple[int, int, dict[str, Any]]:
    from src.agent.simulator import SimResult
    from src.simulations.open_survey import aggregate_open_survey, make_open_survey_parser

    input_data = fixture["input_data"]
    personas = {persona["uuid"]: persona for persona in fixture["personas"]}
    raw_results = [
        SimResult(
            uuid=response["uuid"],
            persona=personas[response["uuid"]],
            response=response.get("response", ""),
            error=response.get("error"),
            provider="fixture",
            provider_model=fixture["name"],
        )
        for response in fixture["responses"]
    ]
    parser = make_open_survey_parser(input_data)
    parsed_results = [
        parser(result.response) if result.response and not result.error else None
        for result in raw_results
    ]
    parse_failed = sum(
        1 for result, parsed in zip(raw_results, parsed_results) if result.error or parsed is None
    )
    aggregate = aggregate_open_survey(input_data, raw_results, parsed_results)
    return len(raw_results), parse_failed, aggregate["metrics"]


if __name__ == "__main__":
    sys.exit(main())
