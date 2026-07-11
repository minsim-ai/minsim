#!/usr/bin/env python
"""Isolated local e2e server for browser testing on the Upstage (Solar) backend.

Fully isolated from the production stack:
- inline in-process run execution (a background thread per run) instead of the
  shared Redis/RQ queue, so the production worker never sees these jobs;
- a temporary SQLite DB and runtime dir, so production data is untouched;
- Upstage as the LLM backend (LLM_BACKEND=upstage).

Environment variables set here use ``setdefault`` so the shell can override them.
``UPSTAGE_API_KEY`` MUST be provided by the environment (never hardcoded).

Usage:
    UPSTAGE_API_KEY=up_xxx uv run python scripts/run_local_upstage_e2e.py
    # then open http://127.0.0.1:8099/app in a browser
"""
from __future__ import annotations

import os
import sys
import tempfile
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

# --- isolate the environment BEFORE importing src.config (module-level reads) ---
_E2E_DIR = Path(os.getenv("E2E_RUNTIME_DIR", str(Path(tempfile.gettempdir()) / "koresim_upstage_e2e")))
_E2E_DIR.mkdir(parents=True, exist_ok=True)

os.environ.setdefault("LLM_BACKEND", "upstage")
os.environ.setdefault("UPSTAGE_BASE_URL", "https://api.upstage.ai/v1")
os.environ.setdefault("UPSTAGE_MODEL", "solar-pro2")
os.environ.setdefault("SQLITE_PATH", str(_E2E_DIR / "e2e.sqlite3"))
os.environ.setdefault("RUNTIME_DATA_DIR", str(_E2E_DIR))
os.environ.setdefault("PARQUET_PATH", str(ROOT / "data" / "nemotron_korea_personas.parquet"))
# keep auth "enabled" so localhost auto-login resolves a quota-bypassed local dev user,
# but do not require https cookies on http://127.0.0.1
os.environ.setdefault("KORESIM_AUTH_COOKIE_SECURE", "false")
# no external observability noise for a throwaway e2e run
os.environ.setdefault("OBSERVABILITY_PROVIDER", "none")

if not os.getenv("UPSTAGE_API_KEY"):
    raise SystemExit("UPSTAGE_API_KEY environment variable is required.")

import uvicorn  # noqa: E402

from src.api.main import create_app  # noqa: E402
from src.config import SQLITE_PATH  # noqa: E402
from src.jobs.store import SQLiteRunStore  # noqa: E402
from src.jobs.worker import run_simulation_job  # noqa: E402


def _inline_enqueue(run_id: str) -> str:
    """Run the simulation synchronously in a background thread (no Redis)."""

    def _work() -> None:
        try:
            run_simulation_job(run_id=run_id, sqlite_path=str(SQLITE_PATH))
        except Exception as exc:  # noqa: BLE001 - surface worker failures in logs
            print(f"[inline-worker] run {run_id} failed: {exc}", flush=True)

    threading.Thread(target=_work, name=f"inline-run-{run_id}", daemon=True).start()
    return f"inline-{run_id}"


app = create_app(store=SQLiteRunStore(), enqueue_run_func=_inline_enqueue)


if __name__ == "__main__":
    port = int(os.getenv("E2E_PORT", "8099"))
    print(f"[e2e] Upstage model={os.environ['UPSTAGE_MODEL']} db={SQLITE_PATH}", flush=True)
    print(f"[e2e] open http://127.0.0.1:{port}/app", flush=True)
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")
