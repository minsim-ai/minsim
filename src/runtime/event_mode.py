"""Event-day capacity helpers: sample caps and queue admission."""
from __future__ import annotations

from dataclasses import dataclass

from src.config import (
    EVENT_DEFAULT_SAMPLE_SIZE,
    EVENT_MAX_QUEUED_RUNS,
    EVENT_MAX_SAMPLE_SIZE,
    KORESIM_EVENT_MODE,
    KORESIM_FREE_RUN_LIMIT,
    MAX_SAMPLE_SIZE,
    WORKER_COUNT,
)


@dataclass(frozen=True)
class EventConfigSnapshot:
    enabled: bool
    default_sample_size: int
    max_sample_size: int
    max_queued_runs: int
    worker_count: int
    free_run_limit: int
    sample_size_presets: tuple[int, ...]


def event_mode_enabled() -> bool:
    return KORESIM_EVENT_MODE


def effective_max_sample_size() -> int:
    if not KORESIM_EVENT_MODE:
        return MAX_SAMPLE_SIZE
    return min(MAX_SAMPLE_SIZE, EVENT_MAX_SAMPLE_SIZE)


def effective_sample_presets() -> list[int]:
    # Shared product presets: 100 / 200 / 300 for intake panel picker.
    desired = (100, 200, 300)
    if not KORESIM_EVENT_MODE:
        return [preset for preset in desired if preset <= MAX_SAMPLE_SIZE] or [min(200, MAX_SAMPLE_SIZE)]
    cap = effective_max_sample_size()
    return [p for p in desired if p <= cap] or [min(100, cap)]


def clamp_event_sample_size(sample_size: int) -> int:
    """Clamp a requested sample size under event mode (no-op when disabled)."""

    size = max(1, int(sample_size))
    if not KORESIM_EVENT_MODE:
        return min(size, MAX_SAMPLE_SIZE)
    return min(size, effective_max_sample_size())


def event_config_snapshot() -> EventConfigSnapshot:
    return EventConfigSnapshot(
        enabled=KORESIM_EVENT_MODE,
        default_sample_size=min(EVENT_DEFAULT_SAMPLE_SIZE, effective_max_sample_size()),
        max_sample_size=effective_max_sample_size(),
        max_queued_runs=EVENT_MAX_QUEUED_RUNS,
        worker_count=WORKER_COUNT,
        free_run_limit=KORESIM_FREE_RUN_LIMIT,
        sample_size_presets=tuple(effective_sample_presets()),
    )


def queue_admission_state() -> dict[str, object]:
    """Return queue depth stats; used before enqueue in event mode."""

    from src.jobs.queue import check_queue

    queue = check_queue()
    depth = int(queue.get("count") or 0)
    worker_count = int(queue.get("worker_count") or 0)
    max_queued = EVENT_MAX_QUEUED_RUNS if KORESIM_EVENT_MODE else 10_000
    busy = KORESIM_EVENT_MODE and depth >= max_queued
    # Rough wait: each wave of worker_count jobs ~45s under event sample sizes.
    waves = 0
    if worker_count > 0 and depth > 0:
        waves = (depth + worker_count - 1) // worker_count
    estimated_wait_seconds = min(600, max(30, waves * 45)) if busy or depth > worker_count else 0
    return {
        "queue_depth": depth,
        "worker_count": worker_count,
        "max_queued_runs": max_queued,
        "busy": busy,
        "estimated_wait_seconds": estimated_wait_seconds,
    }
