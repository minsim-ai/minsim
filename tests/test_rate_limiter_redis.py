"""Shared RPM limiter tests (local + Redis)."""
from __future__ import annotations

import asyncio
import time

import pytest

from src.llm.rate_limiter import (
    RedisSlidingWindowLimiter,
    SlidingWindowLimiter,
    resolve_rpm_limiter_mode,
    reset_rate_limiters_for_tests,
)


@pytest.fixture(autouse=True)
def _reset_limiters() -> None:
    reset_rate_limiters_for_tests()
    yield
    reset_rate_limiters_for_tests()


def test_resolve_mode_auto_uses_redis_when_multi_worker(monkeypatch: pytest.MonkeyPatch) -> None:
    import src.llm.rate_limiter as rl

    monkeypatch.setattr(rl, "LLM_MAX_RPM", 100)
    monkeypatch.setattr(rl, "LLM_RPM_LIMITER", "auto")
    monkeypatch.setattr(rl, "WORKER_COUNT", 5)
    assert resolve_rpm_limiter_mode() == "redis"
    monkeypatch.setattr(rl, "WORKER_COUNT", 1)
    assert resolve_rpm_limiter_mode() == "local"


@pytest.mark.anyio
async def test_local_limiter_accepts_budget_then_is_full() -> None:
    limiter = SlidingWindowLimiter(3)
    for _ in range(3):
        await limiter.acquire()
    assert len(limiter._times) == 3
    # Next acquire waits on the 60s window; free capacity by aging entries.
    aged = time.monotonic() - 61
    limiter._times = __import__("collections").deque([aged, aged, aged])
    await asyncio.wait_for(limiter.acquire(), timeout=1.0)
    assert len(limiter._times) == 1


@pytest.mark.anyio
async def test_redis_limiter_shared_budget() -> None:
    pytest.importorskip("redis")
    from redis import Redis
    from redis.exceptions import RedisError

    from src.config import REDIS_URL

    client = Redis.from_url(REDIS_URL, socket_connect_timeout=0.5)
    try:
        client.ping()
    except RedisError:
        pytest.skip("Redis not available")

    key = f"koresim:test:rpm:{time.time_ns()}"
    try:
        a = RedisSlidingWindowLimiter(5, key=key)
        b = RedisSlidingWindowLimiter(5, key=key)
        for _ in range(5):
            await a.acquire()
        # Shared budget exhausted for both views.
        assert client.zcard(key) == 5
        # Wait path should eventually acquire after window... use small budget exhaust check
        # by forcing old scores.
        now_ms = int(time.time() * 1000)
        client.delete(key)
        for i in range(5):
            client.zadd(key, {f"old-{i}": now_ms - 61_000})
        await asyncio.wait_for(b.acquire(), timeout=2.0)
        assert client.zcard(key) >= 1
    finally:
        client.delete(key)
        client.close()


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"
