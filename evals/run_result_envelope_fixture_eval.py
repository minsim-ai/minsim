"""Run deterministic API result-envelope fixture evaluations."""
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

EXPECTED_ENVELOPE_KEYS = {
    "schema_version",
    "run_id",
    "simulation_type",
    "status",
    "seed",
    "sample_size",
    "total_responses",
    "parse_failed",
    "target_filter",
    "sample_summary",
    "quality",
    "warnings",
    "metrics",
    "segments",
    "insights",
    "raw_results",
    "model_alias",
    "provider",
    "provider_model",
    "llm_backend",
    "trace_id",
    "orchestration",
    "token_usage",
    "persona_pool",
    "safe_intake_summary",
    "protocol",
    "country_id",
    "dataset_name",
    "language",
}


def main() -> int:
    from evals.run_creative_fixture_eval import FIXTURE_PATH

    fixture = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    result = run_envelope_fixture(fixture)
    print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
    return 0


def run_envelope_fixture(fixture: dict[str, Any]) -> dict[str, Any]:
    from evals.run_creative_fixture_eval import build_creative_result
    from src.api.schemas import RunResultEnvelope
    from src.jobs.models import RunRecord, RunStatusValue
    from src.jobs.result_envelope import build_creative_testing_envelope

    creative_result = build_creative_result(fixture)
    run = RunRecord(
        run_id="fixture-run-creative-testing-10",
        simulation_type="creative_testing",
        input={"creatives": fixture["creatives"]},
        sample_size=fixture["expected"]["total_responses"],
        total_count=fixture["expected"]["total_responses"],
        target_filter={"province": ["서울", "경기"]},
        seed=42,
        status=RunStatusValue.COMPLETED,
        done_count=fixture["expected"]["total_responses"],
        model_alias="fixture_persona_default",
        created_at="2026-05-02T00:00:00+00:00",
        updated_at="2026-05-02T00:00:00+00:00",
        completed_at="2026-05-02T00:01:00+00:00",
    )
    envelope = build_creative_testing_envelope(run, creative_result)
    validated = RunResultEnvelope.model_validate(envelope)

    assert set(envelope) == EXPECTED_ENVELOPE_KEYS
    assert validated.schema_version == "result-envelope/v1"
    assert validated.total_responses == len(validated.raw_results)
    assert validated.parse_failed == fixture["expected"]["parse_failed"]
    assert validated.metrics["choice_counts"] == fixture["expected"]["choice_counts"]
    assert validated.metrics["choice_pct"] == fixture["expected"]["choice_pct"]
    assert validated.sample_summary["actual_sample_size"] == fixture["expected"]["total_responses"]
    assert any(raw.error == "PARSING_FAILED" for raw in validated.raw_results)

    return {
        "fixture": "creative_testing_success_10_envelope",
        "ok": True,
        "top_level_keys": sorted(envelope),
        "schema_version": validated.schema_version,
        "raw_results": len(validated.raw_results),
        "parse_failed": validated.parse_failed,
    }


if __name__ == "__main__":
    sys.exit(main())
