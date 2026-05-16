"""Inspect and adjust KoreaSim free-run quota for support operations."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.jobs.store import SQLiteRunStore  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--email", required=True, help="User email to inspect or adjust.")
    parser.add_argument("--sqlite-path", type=Path, default=None, help="Optional SQLite path override.")
    parser.add_argument("--limit", type=int, default=10, help="Run history rows to include.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("show", help="Show current usage and recent runs.")

    add_parser = subparsers.add_parser("add", help="Add free-run credits by reducing used count.")
    add_parser.add_argument("--credits", type=int, required=True, help="Positive credit count to add.")
    add_parser.add_argument("--reason", default="support_credit", help="Ledger reason.")

    reset_parser = subparsers.add_parser("reset", help="Reset used free-run count to zero.")
    reset_parser.add_argument("--reason", default="support_reset", help="Ledger reason.")

    args = parser.parse_args()
    store = SQLiteRunStore(args.sqlite_path) if args.sqlite_path else SQLiteRunStore()
    user = store.get_user_by_email(args.email)
    if user is None:
        raise SystemExit(f"User not found: {args.email}")

    if args.command == "add":
        if args.credits <= 0:
            raise SystemExit("--credits must be positive.")
        store.adjust_free_runs(user.user_id, delta=-args.credits, reason=args.reason)
    elif args.command == "reset":
        store.reset_free_run_usage(user.user_id, reason=args.reason)

    print(json.dumps(_report(store, user.user_id, limit=args.limit), ensure_ascii=False, indent=2))


def _report(store: SQLiteRunStore, user_id: str, *, limit: int) -> dict[str, Any]:
    usage = store.get_user_usage(user_id)
    runs = store.list_runs_for_user(user_id, limit=limit)
    return {
        "user": {
            "user_id": usage.user_id,
            "email": usage.email,
            "plan": usage.plan,
        },
        "usage": {
            "free_run_limit": usage.free_run_limit,
            "used_runs": usage.used_runs,
            "remaining_runs": usage.remaining_runs,
            "can_create_run": usage.can_create_run,
        },
        "recent_runs": [
            {
                "run_id": run.run_id,
                "simulation_type": run.simulation_type,
                "status": run.status.value,
                "sample_size": run.sample_size,
                "created_at": run.created_at,
                "completed_at": run.completed_at,
            }
            for run in runs
        ],
    }


if __name__ == "__main__":
    main()
