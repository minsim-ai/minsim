from __future__ import annotations

import os
from collections.abc import Callable
from datetime import UTC, datetime

from src.api.schemas import (
    ErrorCode,
    ErrorResponse,
    RunCreateRequest,
    RunCreateResponse,
    RunStatus,
    SimulationType,
)
from src.jobs.models import RunEventType, RunStatusValue, UserRecord
from src.jobs.store import SQLiteRunStore
from src.runtime.event_mode import (
    clamp_event_sample_size,
    event_mode_enabled,
    queue_admission_state,
)
from src.services.errors import ServiceError


def create_run_for_user(
    *,
    store: SQLiteRunStore,
    enqueue_run: Callable[[str], str],
    payload: RunCreateRequest,
    user: UserRecord | None,
    page: str,
) -> RunCreateResponse:
    from src.data.datasets import get_dataset

    from src.config import KORESIM_FREE_RUN_LIMIT

    # free_run_limit <= 0 means unlimited; config is the enforcement source of truth.
    bypass_quota = bool(user and _quota_bypass(user.email))
    if user and not bypass_quota and KORESIM_FREE_RUN_LIMIT > 0:
        usage = store.get_user_usage(
            user.user_id,
            free_run_limit=KORESIM_FREE_RUN_LIMIT,
        )
        if not usage.can_create_run:
            raise ServiceError(
                status_code=403,
                code=ErrorCode.FREE_QUOTA_EXHAUSTED,
                message=f"무료 실행 {usage.free_run_limit}회를 모두 사용했습니다.",
                details={
                    "free_run_limit": usage.free_run_limit,
                    "used_runs": usage.used_runs,
                    "remaining_runs": usage.remaining_runs,
                },
            )

    # Event-day admission: refuse new work when the queue is already deep so
    # visitors see a clear wait instead of multi-minute silent backlog / 429s.
    admission = queue_admission_state()
    if admission.get("busy"):
        raise ServiceError(
            status_code=503,
            code=ErrorCode.QUEUE_BUSY,
            message="지금 체험이 붐빕니다. 1–2분만 뒤에 다시 시작해 주세요.",
            details={
                "queue_depth": admission.get("queue_depth"),
                "worker_count": admission.get("worker_count"),
                "max_queued_runs": admission.get("max_queued_runs"),
                "estimated_wait_seconds": admission.get("estimated_wait_seconds"),
                "event_mode": event_mode_enabled(),
            },
        )

    dataset = get_dataset(payload.country_id)
    if not dataset.is_available():
        raise ServiceError(
            status_code=400,
            code=ErrorCode.INVALID_REQUEST,
            message=(
                f"선택한 국가 데이터셋({payload.country_id})이 서버에 없습니다. "
                f"`uv run python scripts/download_dataset.py --country {payload.country_id}` 를 실행하세요."
            ),
            details={"country_id": payload.country_id, "path": str(dataset.resolved_path())},
        )

    clamped_size = clamp_event_sample_size(payload.sample_size)
    if clamped_size != payload.sample_size:
        payload = payload.model_copy(update={"sample_size": clamped_size})

    run = store.create_run(payload, user=user)
    store.record_analytics_event(
        event_name="run_created",
        user=user,
        run_id=run.run_id,
        page=page,
        simulation_type=payload.simulation_type.value,
        payload={
            "sample_size": payload.sample_size,
            "country_id": payload.country_id,
            "has_intake_context": payload.intake_context is not None,
            "event_mode": event_mode_enabled(),
        },
    )
    try:
        job_id = enqueue_run(run.run_id)
        store.append_event(run.run_id, RunEventType.QUEUED, {"job_id": job_id})
    except Exception as exc:
        error = ErrorResponse(
            code=ErrorCode.QUEUE_UNAVAILABLE,
            message="Run was persisted, but the worker queue is unavailable.",
            details={"run_id": run.run_id, "error": str(exc)},
        )
        store.update_run_status(
            run.run_id,
            RunStatusValue.FAILED,
            completed_at=_utc_now(),
            error=error.model_dump(mode="json"),
        )
        raise ServiceError(
            status_code=503,
            code=ErrorCode.QUEUE_UNAVAILABLE,
            message=error.message,
            details=error.details,
        ) from exc

    return RunCreateResponse(
        run_id=run.run_id,
        status=RunStatus.QUEUED,
        simulation_type=SimulationType(run.simulation_type),
        events_url=f"/api/runs/{run.run_id}/events",
        status_url=f"/api/runs/{run.run_id}",
        result_url=f"/api/runs/{run.run_id}/result",
    )


def _quota_bypass(email: str) -> bool:
    raw_values = [
        os.getenv("KORESIM_ADMIN_EMAILS", ""),
        os.getenv("KORESIM_QUOTA_BYPASS_EMAILS", ""),
    ]
    allowed = {
        item.strip().lower()
        for raw_value in raw_values
        for item in raw_value.split(",")
        if item.strip()
    }
    return email.strip().lower() in allowed


def _utc_now() -> str:
    return datetime.now(UTC).isoformat()
