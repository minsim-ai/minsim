"""Run deterministic evals for LLM agent output contracts."""
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from src.orchestration.agent_scoring import score_agent_outputs  # noqa: E402

AGENT_FIXTURE_PATH = PROJECT_ROOT / "evals" / "fixtures" / "agent_runs_v2.json"


def main() -> int:
    fixture = json.loads(AGENT_FIXTURE_PATH.read_text(encoding="utf-8"))
    result = run_agent_eval_fixture(fixture)
    print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
    return 0 if result["ok"] else 1


def run_agent_eval_fixture(fixture: dict[str, Any]) -> dict[str, Any]:
    rows = [_score_case(case) for case in fixture.get("cases", [])]
    return {
        "fixture": fixture.get("name", "agent-runs-v2"),
        "ok": all(row["passed"] for row in rows),
        "case_count": len(rows),
        "cases": rows,
    }


def _score_case(case: dict[str, Any]) -> dict[str, Any]:
    outputs = case.get("agent_outputs", {})
    if not isinstance(outputs, dict):
        outputs = {}
    scores = score_agent_outputs(
        outputs,
        forbidden_terms=case.get("forbidden_terms", []),
        safe_input=case.get("safe_input", {}),
    )
    observed_ok = all(_score_passed(score) for score in scores.values())
    expected_ok = bool(case.get("expected", {}).get("ok"))
    return {
        "id": case.get("id", "unnamed"),
        "expected_ok": expected_ok,
        "observed_ok": observed_ok,
        "passed": observed_ok == expected_ok,
        "scores": scores,
    }


def _score_passed(score: dict[str, Any]) -> bool:
    return all(value is True for key, value in score.items() if key.endswith("_valid")) and all(
        score.get(key) is True
        for key in ("schema_valid", "no_raw_leak", "korean_output")
        if key in score
    )


if __name__ == "__main__":
    raise SystemExit(main())
