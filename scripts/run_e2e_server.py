"""Self-contained app server for browser E2E runs.

- fake LLM backend (deterministic, no keys, no cost)
- inline-thread worker instead of Redis/RQ so a single process serves the
  whole booth journey: project -> intake -> run -> loading -> results
- fresh throwaway SQLite per launch

Usage: uv run python scripts/run_e2e_server.py [--port 8791]
"""
from __future__ import annotations

import argparse
import os
import secrets
import sys
import tempfile
import threading
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

os.environ.setdefault("LLM_BACKEND", "fake")
os.environ.setdefault("OBSERVABILITY_PROVIDER", "none")
os.environ.setdefault("ENABLE_LLM_AGENTS", "true")
# HTTP loopback only — Secure cookies would never be stored by Playwright.
os.environ["KORESIM_AUTH_COOKIE_SECURE"] = "false"
os.environ["KORESIM_AUTH_REQUIRED"] = "true"
os.environ["KORESIM_AUTH_LOCAL_DEV_AUTO_LOGIN"] = "true"
os.environ["KORESIM_AUTH_SECRET"] = secrets.token_urlsafe(32)
# CSRF remains on; e2e helpers send X-CSRF-Token after session bootstrap.
os.environ.setdefault("KORESIM_CSRF_ENFORCE", "true")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8791)
    args = parser.parse_args()

    import uvicorn

    from src.api.main import create_app
    from src.jobs.store import SQLiteRunStore
    from src.jobs.worker import run_simulation_job

    sqlite_path = Path(tempfile.mkdtemp(prefix="koresim-e2e-")) / "e2e.sqlite3"
    store = SQLiteRunStore(sqlite_path)

    def inline_enqueue(run_id: str) -> str:
        thread = threading.Thread(
            target=run_simulation_job,
            args=(run_id,),
            kwargs={"sqlite_path": str(sqlite_path)},
            daemon=True,
        )
        thread.start()
        return f"inline-{run_id}"

    app = create_app(store=store, enqueue_run_func=inline_enqueue)
    print(f"[e2e-server] sqlite={sqlite_path} port={args.port} llm=fake worker=inline")
    uvicorn.run(app, host="127.0.0.1", port=args.port, log_level="warning")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
