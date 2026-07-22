"""Per-run token cost report and budget projection.

Reads completed runs' persisted token usage from SQLite, computes average
tokens per persona per simulation type, projects the cost of a 200-person and
2,000-person run, and how many runs a KRW budget covers. Writes JSON + MD
artifacts under docs/verification/benchmarks/.

Usage:
    uv run python scripts/report_token_costs.py --budget-krw 250000
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.jobs.store import SQLiteRunStore  # noqa: E402
from src.services.token_costs import (  # noqa: E402
    estimate_cost_krw,
    load_price_table,
    price_for_model,
)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sqlite-path", default=None)
    parser.add_argument("--price-table", default=None, type=Path)
    parser.add_argument("--budget-krw", default=250_000, type=float)
    parser.add_argument(
        "--artifact-dir", default="docs/verification/benchmarks", type=Path
    )
    args = parser.parse_args()

    store = SQLiteRunStore(Path(args.sqlite_path)) if args.sqlite_path else SQLiteRunStore()
    price_table = load_price_table(args.price_table)
    entries = store.list_run_token_usage()

    runs: list[dict] = []
    by_type: dict[str, dict[str, float]] = {}
    for entry in entries:
        usage = entry["token_usage"]
        sample = entry["sample_size"] or 0
        cost = estimate_cost_krw(usage, price_table, entry["model_alias"])
        runs.append({**entry, "estimated_cost_krw": cost})
        input_tokens = usage.get("input_tokens")
        output_tokens = usage.get("output_tokens")
        if not isinstance(input_tokens, int) or not isinstance(output_tokens, int) or sample <= 0:
            continue
        bucket = by_type.setdefault(
            str(entry["simulation_type"]),
            {"runs": 0, "personas": 0, "input_tokens": 0, "output_tokens": 0},
        )
        bucket["runs"] += 1
        bucket["personas"] += sample
        bucket["input_tokens"] += input_tokens
        bucket["output_tokens"] += output_tokens

    projections: dict[str, dict] = {}
    for simulation_type, bucket in sorted(by_type.items()):
        if bucket["personas"] <= 0:
            continue
        input_per_persona = bucket["input_tokens"] / bucket["personas"]
        output_per_persona = bucket["output_tokens"] / bucket["personas"]
        price = price_for_model(price_table, price_table.get("_default_alias") or "default")
        per_persona_cost = (
            input_per_persona / 1_000_000 * price["input"]
            + output_per_persona / 1_000_000 * price["output"]
        )
        cost_200 = round(per_persona_cost * 200, 1)
        cost_2000 = round(per_persona_cost * 2000, 1)
        projections[simulation_type] = {
            "observed_runs": int(bucket["runs"]),
            "input_tokens_per_persona": round(input_per_persona, 1),
            "output_tokens_per_persona": round(output_per_persona, 1),
            "cost_krw_per_200": cost_200,
            "cost_krw_per_2000": cost_2000,
            "runs_per_budget_at_200": int(args.budget_krw // cost_200) if cost_200 > 0 else None,
            "runs_per_budget_at_2000": int(args.budget_krw // cost_2000) if cost_2000 > 0 else None,
        }

    timestamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    artifact = {
        "schema_version": "token-cost-report/v1",
        "generated_at": timestamp,
        "budget_krw": args.budget_krw,
        "price_table": price_table.get("per_million_tokens", {}),
        "observed_runs": len(runs),
        "projections": projections,
        "runs": runs[-50:],
    }

    args.artifact_dir.mkdir(parents=True, exist_ok=True)
    json_path = args.artifact_dir / f"token-costs-{timestamp}.json"
    json_path.write_text(json.dumps(artifact, ensure_ascii=False, indent=2, default=str))

    lines = [
        f"# Token cost report ({timestamp})",
        "",
        f"- observed runs with usage: {len(runs)}",
        f"- budget: {args.budget_krw:,.0f} KRW",
        "",
        "| simulation | in tok/persona | out tok/persona | 200명 비용(₩) | 2,000명 비용(₩) | 예산 내 200명 실행수 |",
        "|---|---|---|---|---|---|",
    ]
    for simulation_type, row in projections.items():
        lines.append(
            f"| {simulation_type} | {row['input_tokens_per_persona']} "
            f"| {row['output_tokens_per_persona']} | {row['cost_krw_per_200']} "
            f"| {row['cost_krw_per_2000']} | {row['runs_per_budget_at_200']} |"
        )
    if not projections:
        lines.append("| (no usage data yet — run a simulation first) | | | | | |")
    md_path = args.artifact_dir / f"token-costs-{timestamp}.md"
    md_path.write_text("\n".join(lines) + "\n")

    print(json.dumps({"runs": len(runs), "projections": projections}, ensure_ascii=False, indent=2))
    print(f"[costs] artifacts: {json_path} / {md_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
