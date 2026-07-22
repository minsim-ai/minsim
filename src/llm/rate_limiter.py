"""Fleet-wide and process-local sliding-window limiters for provider RPM caps.

Multi-worker deployments must share one budget so N processes do not multiply
``LLM_MAX_RPM``. Prefer Redis (``LLM_RPM_LIMITER=redis`` or ``auto`` when
``WORKER_COUNT>1``). Local mode remains for single-worker and tests.

Disabled when ``LLM_MAX_RPM`` is 0.
"""
from __future__ import annotations

import asyncio
import logging
import time
import uuid
from collections import deque

from src.config import (
    LLM_MAX_RPM,
    LLM_RPM_LIMITER,
    LLM_RPM_REDIS_KEY,
    REDIS_URL,
    WORKER_COUNT,
)

logger = logging.getLogger(__name__)

# Lua: sliding window via sorted set. ARGV: now_ms, window_ms, max_rpm, member.
# Returns 1 if acquired, 0 if over budget.
_REDIS_ACQUIRE_LUA = """
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]
redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
local count = redis.call('ZCARD', key)
if count < limit then
  redis.call('ZADD', key, now, member)
  redis.call('PEXPIRE', key, window)
  return 1
end
local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
if oldest[2] then
  return tonumber(oldest[2]) - (now - window)
end
return 0
"""


class SlidingWindowLimiter:
    """In-process sliding window (one event loop / one worker process)."""

    def __init__(self, max_rpm: int) -> None:
        self.max_rpm = max_rpm
        self._times: deque[float] = deque()
        self._lock = asyncio.Lock()

    async def acquire(self) -> None:
        if self.max_rpm <= 0:
            return
        while True:
            async with self._lock:
                now = time.monotonic()
                while self._times and now - self._times[0] >= 60:
                    self._times.popleft()
                if len(self._times) < self.max_rpm:
                    self._times.append(now)
                    return
                wait = 60 - (now - self._times[0]) + 0.05
            await asyncio.sleep(max(0.05, wait))


class RedisSlidingWindowLimiter:
    """Cross-process RPM budget shared through Redis."""

    def __init__(
        self,
        max_rpm: int,
        *,
        redis_url: str = REDIS_URL,
        key: str = LLM_RPM_REDIS_KEY,
    ) -> None:
        self.max_rpm = max_rpm
        self.redis_url = redis_url
        self.key = key
        self._client = None
        self._script = None
        self._lock = asyncio.Lock()
        self._degraded_local: SlidingWindowLimiter | None = None

    def _get_client(self):
        if self._client is None:
            from redis import Redis

            self._client = Redis.from_url(
                self.redis_url,
                socket_connect_timeout=0.5,
                socket_timeout=1.0,
                decode_responses=True,
            )
            self._script = self._client.register_script(_REDIS_ACQUIRE_LUA)
        return self._client

    def _degraded(self) -> SlidingWindowLimiter:
        if self._degraded_local is None:
            budget = max(1, self.max_rpm // max(WORKER_COUNT, 1))
            self._degraded_local = SlidingWindowLimiter(budget)
        return self._degraded_local

    async def acquire(self) -> None:
        if self.max_rpm <= 0:
            return
        if self._degraded_local is not None and self._client is None:
            # Already failed over for this process lifetime after Redis errors.
            await self._degraded().acquire()
            return
        while True:
            try:
                wait_ms = await asyncio.to_thread(self._try_acquire_sync)
            except Exception as exc:  # noqa: BLE001 - degrade rather than fail the run
                logger.warning(
                    "Redis RPM limiter unavailable (%s); using local degraded budget",
                    exc,
                )
                self._client = None
                self._script = None
                await self._degraded().acquire()
                return
            if wait_ms is None:
                return
            await asyncio.sleep(max(0.05, min(2.0, wait_ms / 1000.0 + 0.05)))

    def _try_acquire_sync(self) -> float | None:
        """Return None if acquired, else milliseconds until the oldest slot frees."""

        client = self._get_client()
        assert self._script is not None
        now_ms = int(time.time() * 1000)
        member = f"{now_ms}-{uuid.uuid4().hex}"
        result = self._script(
            keys=[self.key],
            args=[now_ms, 60_000, self.max_rpm, member],
            client=client,
        )
        # script returns 1 on acquire, else remaining wait in ms (can be 0+)
        if int(result) == 1:
            return None
        return max(50.0, float(result))


# One limiter instance per event loop id for local mode; shared redis client lazy.
_LOCAL_LIMITERS: dict[int, SlidingWindowLimiter] = {}
_REDIS_LIMITER: RedisSlidingWindowLimiter | None = None
_RESOLVED_MODE: str | None = None


def resolve_rpm_limiter_mode() -> str:
    """Return effective limiter mode: redis | local | off."""

    if LLM_MAX_RPM <= 0:
        return "off"
    mode = LLM_RPM_LIMITER
    if mode == "auto":
        return "redis" if WORKER_COUNT > 1 else "local"
    if mode in {"redis", "local"}:
        return mode
    return "local"


def _local_budget() -> int:
    if resolve_rpm_limiter_mode() == "redis":
        # Only used on Redis failure degrade path inside Redis limiter.
        return LLM_MAX_RPM
    return LLM_MAX_RPM


async def acquire_llm_slot() -> None:
    if LLM_MAX_RPM <= 0:
        return
    mode = resolve_rpm_limiter_mode()
    if mode == "off":
        return
    if mode == "redis":
        global _REDIS_LIMITER
        if _REDIS_LIMITER is None:
            _REDIS_LIMITER = RedisSlidingWindowLimiter(LLM_MAX_RPM)
        await _REDIS_LIMITER.acquire()
        return

    loop_id = id(asyncio.get_running_loop())
    limiter = _LOCAL_LIMITERS.get(loop_id)
    if limiter is None:
        limiter = SlidingWindowLimiter(_local_budget())
        _LOCAL_LIMITERS[loop_id] = limiter
        if len(_LOCAL_LIMITERS) > 16:
            for stale in list(_LOCAL_LIMITERS)[:-8]:
                if stale != loop_id:
                    _LOCAL_LIMITERS.pop(stale, None)
    await limiter.acquire()


def reset_rate_limiters_for_tests() -> None:
    """Drop cached limiters so tests can reconfigure env/monkeypatches."""

    global _REDIS_LIMITER, _RESOLVED_MODE
    _LOCAL_LIMITERS.clear()
    _REDIS_LIMITER = None
    _RESOLVED_MODE = None
