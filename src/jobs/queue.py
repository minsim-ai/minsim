"""Redis/RQ queue wiring for simulation jobs."""
from __future__ import annotations

from redis import Redis
from rq import Queue, Worker

from src.config import REDIS_URL

QUEUE_NAME = "koresim"


def get_redis_connection() -> Redis:
    return Redis.from_url(
        REDIS_URL,
        socket_connect_timeout=0.5,
        socket_timeout=0.5,
        decode_responses=False,
    )


def get_queue() -> Queue:
    return Queue(QUEUE_NAME, connection=get_redis_connection())


def enqueue_run(run_id: str) -> str:
    from src.jobs.worker import run_simulation_job

    job = get_queue().enqueue(run_simulation_job, run_id, job_timeout="30m", result_ttl=3600)
    return job.id


def check_queue() -> dict[str, object]:
    connection = get_redis_connection()
    redis = check_redis_connection(connection)
    queue = Queue(QUEUE_NAME, connection=connection)
    workers = [
        worker
        for worker in Worker.all(connection=connection)
        if QUEUE_NAME in {queue.name for queue in worker.queues}
    ]
    worker_names = sorted(worker.name for worker in workers)
    worker_count = len(worker_names)
    ok = bool(redis["ok"] and worker_count > 0)
    return {
        "ok": ok,
        "name": queue.name,
        "count": queue.count,
        "worker_count": worker_count,
        "workers": worker_names,
        "error": None if ok else f"No active RQ worker registered for queue: {QUEUE_NAME}",
    }


def check_redis_connection(connection: Redis | None = None) -> dict[str, object]:
    connection = connection or get_redis_connection()
    connection.ping()
    return {"ok": True, "url": REDIS_URL}


def _focus_group_job_failure(job, _connection, _exc_type, exc_value, _traceback) -> None:  # type: ignore[no-untyped-def]
    """RQ failure hook: ensure sticky queued/running rows become failed."""
    try:
        focus_group_id = str((job.args or [None])[0] or "")
        if not focus_group_id:
            return
        from src.jobs.store import SQLiteRunStore

        store = SQLiteRunStore()
        record = store.get_focus_group_by_id(focus_group_id)
        if record is None or record.status in {"completed", "failed"}:
            return
        store.mark_focus_group_failed(
            focus_group_id,
            error=f"rq_job_failed: {exc_value}"[:800],
        )
    except Exception:
        # Never break RQ's failure pipeline.
        pass


def enqueue_focus_group(focus_group_id: str) -> str:
    from src.jobs.worker import run_focus_group_job

    job = get_queue().enqueue(
        run_focus_group_job,
        focus_group_id,
        job_timeout="30m",
        result_ttl=3600,
        on_failure=_focus_group_job_failure,
    )
    return job.id
