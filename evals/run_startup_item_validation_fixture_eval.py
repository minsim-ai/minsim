"""Run deterministic Startup Item Validation (v1) fixture evaluations."""
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

FIXTURE_PATH = PROJECT_ROOT / "evals" / "fixtures" / "startup_item_validation_fixture.json"


def main() -> int:
    fixture = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    result = run_fixture(fixture)
    print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
    return 0


def run_fixture(fixture: dict[str, Any]) -> dict[str, Any]:
    total_responses, parse_failed, metrics, segments, insights = build_startup_validation_result(fixture)
    expected = fixture["expected"]

    assert total_responses == expected["total_responses"]
    assert parse_failed == expected["parse_failed"]
    assert metrics == expected["metrics"]
    assert segments == expected["segments"]
    assert insights == expected["insights"]

    return {
        "fixture": fixture["name"],
        "ok": True,
        "total_responses": total_responses,
        "parse_failed": parse_failed,
        "intent_counts": metrics["intent_counts"],
    }


def _step_blocks(response: str) -> dict[str, str]:
    blocks: dict[str, str] = {}
    for block in response.split("\n\n"):
        if not block.startswith("["):
            continue
        step_id, _, content = block.partition("]\n")
        blocks[step_id.lstrip("[")] = content
    return blocks


def build_startup_validation_result(
    fixture: dict[str, Any],
) -> tuple[int, int, dict[str, Any], dict[str, Any], list[dict[str, Any]]]:
    from src.agent.simulator import SimResult
    from src.simulations.startup_item_validation import (
        aggregate_startup_item_validation,
        parse_acceptance_price,
        parse_adoption_barrier,
        parse_competition_positioning,
        parse_needs_segment,
    )

    input_data = fixture["input_data"]
    personas = {persona["uuid"]: persona for persona in fixture["personas"]}
    raw_results: list[Any] = []
    parsed_results: list[dict[str, Any] | None] = []

    for response in fixture["responses"]:
        persona = personas[response["uuid"]]
        blocks = _step_blocks(response.get("response", ""))
        stored_error = response.get("error")
        error = stored_error
        parsed: dict[str, Any] | None = {"protocol_steps": {}}

        needs = parse_needs_segment(blocks["needs_segment"]) if "needs_segment" in blocks else None
        if needs is None:
            error = error or "PARSING_FAILED: needs_segment"
            parsed = None
        else:
            parsed["protocol_steps"]["needs_segment"] = needs

        if parsed is not None:
            competition_block = blocks.get("competition_positioning")
            competition = (
                parse_competition_positioning(competition_block, input_data.get("alternatives") or [])
                if competition_block is not None
                else None
            )
            if competition is None:
                error = error or "PARSING_FAILED: competition_positioning"
                parsed = None
            else:
                parsed["protocol_steps"]["competition_positioning"] = competition

        if parsed is not None:
            acceptance_block = blocks.get("acceptance_price")
            acceptance = parse_acceptance_price(acceptance_block) if acceptance_block is not None else None
            if acceptance is None:
                error = error or "PARSING_FAILED: acceptance_price"
                parsed = None
            else:
                parsed["protocol_steps"]["acceptance_price"] = acceptance
                parsed.update(
                    {
                        "primary": acceptance["acceptance"],
                        "intent": acceptance["acceptance"],
                        "problem_empathy": parsed["protocol_steps"]["needs_segment"]["problem_empathy"],
                        "need_category": parsed["protocol_steps"]["needs_segment"]["need_category"],
                        "self_segment": parsed["protocol_steps"]["needs_segment"]["self_segment"],
                        "willingness_to_pay": acceptance["willingness_to_pay"],
                        "reason": acceptance["reason"],
                    }
                )

        if parsed is not None and parsed["intent"] != "수용":
            barrier_block = blocks.get("adoption_barrier")
            barrier = parse_adoption_barrier(barrier_block) if barrier_block is not None else None
            if barrier is None:
                error = error or "PARSING_FAILED: adoption_barrier"
                parsed = None
            else:
                parsed["protocol_steps"]["adoption_barrier"] = barrier
        elif parsed is not None:
            parsed["protocol_steps"]["adoption_barrier"] = {"skipped": True}

        raw_results.append(
            SimResult(
                uuid=response["uuid"],
                persona=persona,
                response=response.get("response", ""),
                error=error,
                provider="fixture",
                provider_model=fixture["name"],
            )
        )
        parsed_results.append(parsed)

    parse_failed = sum(
        1 for raw, parsed in zip(raw_results, parsed_results) if raw.error or parsed is None
    )
    aggregate = aggregate_startup_item_validation(input_data, raw_results, parsed_results)
    return len(raw_results), parse_failed, aggregate["metrics"], aggregate["segments"], aggregate["insights"]


if __name__ == "__main__":
    sys.exit(main())
