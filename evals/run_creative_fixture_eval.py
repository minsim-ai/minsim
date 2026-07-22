"""Run deterministic Creative Testing fixture evaluations."""
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

FIXTURE_PATH = PROJECT_ROOT / "evals" / "fixtures" / "creative_testing_10.json"


def main() -> int:
    fixture = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    result = run_fixture(fixture)
    print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
    return 0


def run_fixture(fixture: dict[str, Any]) -> dict[str, Any]:
    result = build_creative_result(fixture)
    expected = fixture["expected"]

    assert result.total_responses == expected["total_responses"]
    assert result.total_responses == len(result.raw_results)
    assert result.parse_failed == expected["parse_failed"]
    assert result.choice_counts == expected["choice_counts"]
    assert result.choice_pct == expected["choice_pct"]
    assert sum(result.choice_counts.values()) + result.parse_failed == result.total_responses
    assert all(len(reason) <= 200 for reasons in result.reasons_by_choice.values() for reason in reasons)

    valid_count = sum(result.choice_counts.values())
    for breakdown in (
        result.breakdown_by_age,
        result.breakdown_by_sex,
        result.breakdown_by_province,
    ):
        assert sum(sum(counts.values()) for counts in breakdown.values()) <= valid_count

    return {
        "fixture": fixture["name"],
        "ok": True,
        "total_responses": result.total_responses,
        "parse_failed": result.parse_failed,
        "choice_counts": result.choice_counts,
        "choice_pct": result.choice_pct,
    }


def build_creative_result(fixture: dict[str, Any]):
    from src.agent.simulator import SimResult
    from src.simulations.creative_testing import CreativeTesting

    personas = {persona["uuid"]: persona for persona in fixture["personas"]}
    sim_results = [
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
    return CreativeTesting()._aggregate(fixture["creatives"], sim_results)


if __name__ == "__main__":
    sys.exit(main())
