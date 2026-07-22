from fakeredis import FakeRedis
from rq import Queue, Worker

from src.jobs.queue import QUEUE_NAME, check_queue, check_redis_connection


def test_check_redis_connection_with_fakeredis() -> None:
    connection = FakeRedis()

    result = check_redis_connection(connection)

    assert result["ok"] is True


def test_check_queue_requires_registered_worker() -> None:
    connection = FakeRedis()
    Queue(QUEUE_NAME, connection=connection)

    result = check_queue_with_connection(connection)

    assert result["ok"] is False
    assert result["worker_count"] == 0


def test_check_queue_reports_registered_worker() -> None:
    connection = FakeRedis()
    queue = Queue(QUEUE_NAME, connection=connection)
    worker = Worker([queue], connection=connection)
    worker.register_birth()

    try:
        result = check_queue_with_connection(connection)
    finally:
        worker.register_death()

    assert result["ok"] is True
    assert result["worker_count"] == 1
    assert worker.name in result["workers"]


def check_queue_with_connection(connection: FakeRedis) -> dict[str, object]:
    from src.jobs import queue as queue_module

    original = queue_module.get_redis_connection
    queue_module.get_redis_connection = lambda: connection
    try:
        return check_queue()
    finally:
        queue_module.get_redis_connection = original
