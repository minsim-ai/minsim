"""Run deterministic fixture evaluations for the 8 generic_suite simulation types."""
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any, Callable

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

FIXTURE_DIR = PROJECT_ROOT / "evals" / "fixtures"
FIXTURE_FILES = [
    FIXTURE_DIR / "price_optimization_fixture.json",
    FIXTURE_DIR / "product_launch_fixture.json",
    FIXTURE_DIR / "value_proposition_fixture.json",
    FIXTURE_DIR / "market_segmentation_fixture.json",
    FIXTURE_DIR / "competitive_positioning_fixture.json",
    FIXTURE_DIR / "brand_perception_fixture.json",
    FIXTURE_DIR / "churn_prediction_fixture.json",
    FIXTURE_DIR / "campaign_strategy_fixture.json",
]

SIMULATION_FUNCTIONS: dict[str, tuple[str, str]] = {
    "price_optimization": ("_parse_price_response", "_aggregate_price"),
    "product_launch": ("_parse_product_launch_response", "_aggregate_product_launch"),
    "value_proposition": ("_parse_value_proposition_response", "_aggregate_value_proposition"),
    "market_segmentation": ("_parse_market_segmentation_response", "_aggregate_market_segmentation"),
    "competitive_positioning": (
        "_parse_competitive_positioning_response",
        "_aggregate_competitive_positioning",
    ),
    "brand_perception": ("_parse_brand_perception_response", "_aggregate_brand_perception"),
    "churn_prediction": ("_parse_churn_prediction_response", "_aggregate_churn_prediction"),
    "campaign_strategy": ("_parse_campaign_strategy_response", "_aggregate_campaign_strategy"),
}


def main() -> int:
    ok = True
    for fixture_path in FIXTURE_FILES:
        fixture = json.loads(fixture_path.read_text(encoding="utf-8"))
        try:
            result = run_fixture(fixture)
        except AssertionError as exc:
            ok = False
            print(json.dumps({"fixture": fixture["name"], "ok": False, "error": str(exc)}, ensure_ascii=False, indent=2))
            continue
        print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
    return 0 if ok else 1


def run_fixture(fixture: dict[str, Any]) -> dict[str, Any]:
    parser, aggregator = _resolve_functions(fixture["simulation_type"])
    total_responses, parse_failed, metrics = run_generic_fixture(fixture, parser, aggregator)
    expected = fixture["expected"]

    assert total_responses == expected["total_responses"]
    assert parse_failed == expected["parse_failed"]
    assert metrics == expected["metrics"]

    return {
        "fixture": fixture["name"],
        "simulation_type": fixture["simulation_type"],
        "ok": True,
        "total_responses": total_responses,
        "parse_failed": parse_failed,
    }


def run_generic_fixture(
    fixture: dict[str, Any],
    parser: Callable[[str], dict[str, Any] | None],
    aggregator: Callable[[dict[str, Any], list[Any], list[dict[str, Any] | None]], dict[str, Any]],
) -> tuple[int, int, dict[str, Any]]:
    from src.agent.simulator import SimResult

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
    parsed_results = [
        parser(result.response) if result.response and not result.error else None
        for result in raw_results
    ]
    parse_failed = sum(
        1 for result, parsed in zip(raw_results, parsed_results) if result.error or parsed is None
    )
    aggregate = aggregator(fixture["input_data"], raw_results, parsed_results)
    return len(raw_results), parse_failed, aggregate["metrics"]


def _resolve_functions(simulation_type: str) -> tuple[Callable[..., Any], Callable[..., Any]]:
    from src.simulations import generic_suite

    parser_name, aggregator_name = SIMULATION_FUNCTIONS[simulation_type]
    return getattr(generic_suite, parser_name), getattr(generic_suite, aggregator_name)


if __name__ == "__main__":
    sys.exit(main())
