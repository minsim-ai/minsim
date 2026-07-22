"""Run the KoreaSim RQ worker."""
from __future__ import annotations

import os
import sys
from pathlib import Path

from redis.exceptions import RedisError
from rq import Queue, SimpleWorker

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))


def main() -> None:
    from src.config import (
        INTERRUPT_ACTIVE_RUNS_ON_STARTUP,
        WORKER_COUNT,
    )
    from src.jobs.queue import QUEUE_NAME, get_redis_connection
    from src.jobs.store import SQLiteRunStore

    connection = get_redis_connection()
    try:
        connection.ping()
    except RedisError as exc:
        raise SystemExit(
            "Redis is not reachable. Start Redis first or set REDIS_URL. "
            f"Original error: {exc}"
        ) from exc

    store = SQLiteRunStore()
    interrupted_count = 0
    if INTERRUPT_ACTIVE_RUNS_ON_STARTUP:
        interrupted = store.mark_active_runs_interrupted(reason="worker_startup")
        interrupted_count = len(interrupted)
    worker_name = os.getenv("WORKER_NAME", "").strip() or None
    print(
        f"KoreaSim worker starting queue={QUEUE_NAME} name={worker_name or 'auto'} "
        f"sqlite={store.path} worker_count_target={WORKER_COUNT} "
        f"interrupt_on_startup={INTERRUPT_ACTIVE_RUNS_ON_STARTUP} "
        f"interrupted_recovered={interrupted_count}"
    )
    queue = Queue(QUEUE_NAME, connection=connection)
    worker = SimpleWorker(
        [queue],
        connection=connection,
        name=worker_name,
        exception_handlers=[handle_failed_job],
    )
    worker.work(with_scheduler=True)


def handle_failed_job(job, exc_type, exc_value, traceback) -> bool:
    from src.jobs.models import RunEventType, RunStatusValue
    from src.jobs.store import SQLiteRunStore, _utc_now

    run_id = job.args[0] if job.args else None
    if not isinstance(run_id, str):
        return True

    store = SQLiteRunStore()
    existing = store.get_run(run_id)
    if existing is None:
        return True
    if existing.status in {RunStatusValue.FAILED, RunStatusValue.CANCELED, RunStatusValue.INTERRUPTED}:
        return True

    error = {
        "code": "WORKER_INTERRUPTED",
        "message": "Worker failed before the run completed.",
        "details": {
            "run_id": run_id,
            "job_id": job.id,
            "error_type": getattr(exc_type, "__name__", str(exc_type)),
            "error": str(exc_value),
        },
    }
    store.update_run_status(
        run_id,
        RunStatusValue.FAILED,
        completed_at=_utc_now(),
        error=error,
    )
    store.append_event(run_id, RunEventType.FAILED, error)
    return True


if __name__ == "__main__":
    main()
