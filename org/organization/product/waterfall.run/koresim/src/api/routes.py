"""FastAPI route handlers for app, config, and run lifecycle APIs."""
from __future__ import annotations

import asyncio
import json
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Request
from starlette.responses import RedirectResponse, StreamingResponse

from src.api.schemas import (
    DemoPreset,
    ErrorCode,
    ErrorResponse,
    AuthSessionResponse,
    IntakeAssumption,
    IntakeAdvanceRequest,
    IntakeAdvanceResponse,
    IntakeCandidateRequest,
    IntakeCandidateResponse,
    IntakeCreativeCandidate,
    IntakeHistoryItem,
    IntakeHistoryResponse,
    IntakeMessageResponse,
    IntakeSessionListResponse,
    IntakeSessionResponse,
    IntakeSessionRunLinkRequest,
    IntakeSessionSaveRequest,
    RunCreateRequest,
    RunCreateResponse,
    RunExportResponse,
    RunPartialResultsResponse,
    RunResultEnvelope,
    RunSnapshot,
    RunStatus,
    SimulationType,
)
from src.intake import advance_intake
from src.api.auth import (
    build_google_callback_response,
    build_google_login_response,
    build_logout_response,
    build_test_login_response,
    session_summary,
)
from src.api.presets import list_demo_presets
from src.config import (
    ENABLE_LANGGRAPH,
    ENABLE_LLM_AGENTS,
    LLM_BACKEND,
    MAX_SAMPLE_SIZE,
    MODEL_ANALYSIS_DEFAULT,
    MODEL_PERSONA_DEFAULT,
    MODEL_PERSONA_STRONG,
    MODEL_REPAIR_DEFAULT,
    MODEL_REPORT_DEFAULT,
)
from src.jobs.events import format_heartbeat, format_snapshot, format_sse_event
from src.jobs.models import RunEventType, RunRecord, RunStatusValue
from src.jobs.store import SQLiteRunStore
from src.llm.base import LLMClientProtocol, LLMMessage, LLMRequest
from src.llm.factory import create_llm_client
from src.runtime.health import collect_runtime_health
from src.simulations.registry import enabled_simulation_types, simulation_metadata

router = APIRouter()


def _store(request: Request) -> SQLiteRunStore:
    return request.app.state.run_store


def _enqueue_run(request: Request) -> Callable[[str], str]:
    return request.app.state.enqueue_run


def _llm_client(request: Request) -> LLMClientProtocol:
    client = getattr(request.app.state, "llm_client", None)
    if client is None:
        client = create_llm_client()
        request.app.state.llm_client = client
    return client


def _error(status_code: int, response: ErrorResponse) -> HTTPException:
    return HTTPException(status_code=status_code, detail=response.model_dump(mode="json"))


def _run_snapshot(store: SQLiteRunStore, run: RunRecord) -> RunSnapshot:
    progress_pct = 0.0
    if run.total_count > 0:
        progress_pct = round(min(100.0, (run.done_count / run.total_count) * 100), 2)

    rate_per_min, eta_seconds = _run_rate_and_eta(run)
    error = ErrorResponse.model_validate(run.error) if run.error else None
    return RunSnapshot(
        run_id=run.run_id,
        simulation_type=SimulationType(run.simulation_type),
        status=RunStatus(run.status.value),
        sample_size=run.sample_size,
        done_count=run.done_count,
        total_count=run.total_count,
        progress_pct=progress_pct,
        eta_seconds=eta_seconds,
        rate_per_min=rate_per_min,
        created_at=run.created_at,
        started_at=run.started_at,
        updated_at=run.updated_at,
        completed_at=run.completed_at,
        error=error,
        result_available=store.has_result(run.run_id),
    )


def _run_rate_and_eta(run: RunRecord) -> tuple[float | None, int | None]:
    if not run.started_at or run.done_count <= 0:
        return None, None
    try:
        started_at = datetime.fromisoformat(run.started_at)
    except ValueError:
        return None, None
    elapsed_seconds = max(0.001, (datetime.now(UTC) - started_at).total_seconds())
    rate_per_min = round(run.done_count / elapsed_seconds * 60, 2)
    remaining = max(0, run.total_count - run.done_count)
    eta_seconds = round(remaining / rate_per_min * 60) if rate_per_min else None
    return rate_per_min, eta_seconds


def _utc_now() -> str:
    return datetime.now(UTC).isoformat()


def _export_response(result: RunResultEnvelope) -> RunExportResponse:
    return RunExportResponse(
        run_id=result.run_id,
        simulation_type=result.simulation_type,
        status=result.status,
        seed=result.seed,
        sample_size=result.sample_size,
        total_responses=result.total_responses,
        parse_failed=result.parse_failed,
        target_filter=result.target_filter,
        sample_summary=result.sample_summary,
        quality=result.quality,
        warnings=result.warnings,
        metrics=result.metrics,
        segments=result.segments,
        insights=result.insights,
        model_alias=result.model_alias,
        provider=result.provider,
        provider_model=result.provider_model,
        llm_backend=result.llm_backend,
        trace_id=result.trace_id,
        disclaimer=(
            "This export is a synthetic persona simulation report. It is not a real survey, "
            "market-share proof, demand forecast, or legally reviewed customer deliverable. "
            "Human review is required before external sharing."
        ),
    )


def _intake_session_response(record) -> IntakeSessionResponse:
    return IntakeSessionResponse(
        session_id=record.session_id,
        status=record.status,
        snapshot=record.snapshot,
        title=record.title,
        run_id=record.run_id,
        created_at=record.created_at,
        updated_at=record.updated_at,
    )


def _intake_history_response(record) -> IntakeHistoryItem:
    return IntakeHistoryItem(
        session_id=record.session_id,
        status=record.status,
        title=record.title,
        run_id=record.run_id,
        messages=[
            IntakeMessageResponse(
                role=message.role,
                content=message.content,
                created_at=message.created_at,
            )
            for message in record.messages
        ],
        created_at=record.created_at,
        updated_at=record.updated_at,
    )


@router.get("/health")
async def health() -> dict[str, object]:
    return {
        "ok": True,
        "service": "koresim-api",
        "scope": "public-minimal",
    }


@router.get("/api/health")
async def api_health(request: Request) -> dict[str, object]:
    runtime = collect_runtime_health(_store(request))
    return {
        "ok": runtime["ok"],
        "service": "koresim-api",
        "scope": "protected-detail",
        "sqlite": runtime["sqlite"],
        "redis": runtime["redis"],
        "queue": runtime["queue"],
        "persona_data": runtime["persona_data"],
        "react_build": runtime["react_build"],
        "model_provider": runtime["model_provider"],
        "llm_backend": LLM_BACKEND,
        "langgraph_enabled": ENABLE_LANGGRAPH,
        "llm_agents_enabled": ENABLE_LLM_AGENTS,
    }


@router.get("/api/config")
async def api_config() -> dict[str, object]:
    return {
        "service": "koresim-api",
        "max_sample_size": MAX_SAMPLE_SIZE,
        "default_seed": 42,
        "simulation_types": [simulation_type.value for simulation_type in SimulationType],
        "enabled_simulation_types": enabled_simulation_types(),
        "simulation_metadata": simulation_metadata(),
        "llm_backend": LLM_BACKEND,
        "model_aliases": {
            "persona_default": MODEL_PERSONA_DEFAULT,
            "persona_strong": MODEL_PERSONA_STRONG,
            "analysis_default": MODEL_ANALYSIS_DEFAULT,
            "report_default": MODEL_REPORT_DEFAULT,
            "schema_repair": MODEL_REPAIR_DEFAULT,
        },
        "langgraph_enabled": ENABLE_LANGGRAPH,
        "llm_agents_enabled": ENABLE_LLM_AGENTS,
        "auth": {
            "session_url": "/api/auth/session",
            "login_url": "/api/auth/google/login",
            "logout_url": "/api/auth/logout",
            "test_login_url": "/api/auth/test-login",
        },
    }


@router.get("/api/auth/session")
async def auth_session(request: Request) -> AuthSessionResponse:
    return AuthSessionResponse.model_validate(session_summary(request))


@router.get("/api/auth/google/login")
async def auth_google_login(request: Request, next: str = "/app") -> RedirectResponse:
    return build_google_login_response(request, next_url=next)


@router.get("/api/auth/google/callback", name="auth_google_callback")
async def auth_google_callback(request: Request) -> RedirectResponse:
    return await build_google_callback_response(request)


@router.get("/api/auth/test-login")
async def auth_test_login(next: str = "/app") -> RedirectResponse:
    return build_test_login_response(next_url=next)


@router.post("/api/auth/logout")
async def auth_logout_post(next: str = "/") -> RedirectResponse:
    return build_logout_response(next_url=next)


@router.get("/api/auth/logout")
async def auth_logout_get(next: str = "/") -> RedirectResponse:
    return build_logout_response(next_url=next)


@router.get("/api/presets")
async def api_presets() -> list[DemoPreset]:
    return list_demo_presets()


@router.post("/api/intake/sessions")
async def save_intake_session(
    request: Request,
    payload: IntakeSessionSaveRequest,
) -> IntakeSessionResponse:
    session_id = payload.session_id or f"intake-{uuid4()}"
    record = _store(request).save_intake_session(
        session_id=session_id,
        status=payload.status,
        snapshot=payload.snapshot,
        event_type="session_saved",
    )
    return _intake_session_response(record)


@router.get("/api/intake/sessions")
async def list_intake_sessions(request: Request, limit: int = 20) -> IntakeSessionListResponse:
    records = _store(request).list_intake_sessions(limit=limit)
    return IntakeSessionListResponse(
        sessions=[_intake_session_response(record) for record in records],
    )


@router.get("/api/intake/history")
async def list_intake_history(request: Request, limit: int = 20) -> IntakeHistoryResponse:
    records = _store(request).list_intake_history(limit=limit)
    return IntakeHistoryResponse(items=[_intake_history_response(record) for record in records])


@router.post("/api/intake/advance")
async def advance_intake_session(
    request: Request,
    payload: IntakeAdvanceRequest,
) -> IntakeAdvanceResponse:
    session_id = payload.session_id or str(payload.snapshot.get("id") or f"intake-{uuid4()}")
    advanced = advance_intake(
        session_id=session_id,
        snapshot=payload.snapshot,
        event=payload.event,
    )
    _store(request).save_intake_session(
        session_id=session_id,
        status=str(advanced["status"]),
        snapshot=advanced["snapshot"],
        event_type="advance",
    )
    return IntakeAdvanceResponse.model_validate(advanced)


@router.put("/api/intake/sessions/{session_id}")
async def update_intake_session(
    request: Request,
    session_id: str,
    payload: IntakeSessionSaveRequest,
) -> IntakeSessionResponse:
    record = _store(request).save_intake_session(
        session_id=session_id,
        status=payload.status,
        snapshot=payload.snapshot,
        event_type="session_updated",
    )
    return _intake_session_response(record)


@router.post("/api/intake/sessions/{session_id}/run")
async def link_intake_session_run(
    request: Request,
    session_id: str,
    payload: IntakeSessionRunLinkRequest,
) -> IntakeSessionResponse:
    try:
        record = _store(request).attach_intake_run(session_id=session_id, run_id=payload.run_id)
    except KeyError as exc:
        raise _error(
            404,
            ErrorResponse(
                code=ErrorCode.INVALID_REQUEST,
                message="Intake session was not found.",
                details={"session_id": session_id},
            ),
        ) from exc
    return _intake_session_response(record)


@router.get("/api/intake/sessions/{session_id}")
async def get_intake_session(request: Request, session_id: str) -> IntakeSessionResponse:
    record = _store(request).get_intake_session(session_id)
    if record is None:
        raise _error(
            404,
            ErrorResponse(
                code=ErrorCode.INVALID_REQUEST,
                message="Intake session was not found.",
                details={"session_id": session_id},
            ),
        )
    return _intake_session_response(record)


@router.post("/api/intake/candidates")
async def generate_intake_candidates(
    request: Request,
    payload: IntakeCandidateRequest,
) -> IntakeCandidateResponse:
    llm_response = await _llm_client(request).generate(
        LLMRequest(
            task_type="intake_candidate_generation",
            temperature=0.6,
            messages=[
                LLMMessage(
                    role="system",
                    content=(
                        "You generate Korean landing-page headline candidates for Arabesque intake. "
                        "Return JSON only with keys candidates and assumptions. "
                        "Each candidate needs text, angle, and why. "
                        "Use distinct angles: outcome, pain_relief, automation, differentiation, trust. "
                        "Avoid unverifiable claims such as 1위, 100%, guaranteed."
                    ),
                ),
                LLMMessage(
                    role="user",
                    content=(
                        f"제품 설명: {payload.product_description}\n"
                        f"핵심 고객: {', '.join(payload.target_customers) or '미지정'}\n"
                        f"장점: {payload.main_benefit or '미지정'}\n"
                        f"톤: {payload.tone or '미지정'}\n"
                        f"후보 수: {payload.count}\n"
                        "JSON 형식: {\"candidates\":[{\"text\":\"...\",\"angle\":\"automation\",\"why\":\"...\"}],"
                        "\"assumptions\":[{\"slot_id\":\"...\",\"value\":\"...\",\"confidence\":0.7}]}"
                    ),
                ),
            ],
            metadata={"scope": "agentic_intake", "candidate_count": payload.count},
        )
    )
    parsed = _parse_candidate_json(llm_response.content)
    return IntakeCandidateResponse(
        candidates=_normalize_candidates(parsed.get("candidates", []), payload.count),
        assumptions=_normalize_assumptions(parsed.get("assumptions", [])),
        provider=llm_response.provider,
        provider_model=llm_response.provider_model,
        trace_id=llm_response.trace_id,
    )


@router.post("/api/runs")
async def create_run(request: Request, payload: RunCreateRequest) -> RunCreateResponse:
    store = _store(request)
    run = store.create_run(payload)

    try:
        job_id = _enqueue_run(request)(run.run_id)
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
        raise _error(503, error) from exc

    return RunCreateResponse(
        run_id=run.run_id,
        status=RunStatus.QUEUED,
        simulation_type=SimulationType(run.simulation_type),
        events_url=f"/api/runs/{run.run_id}/events",
        status_url=f"/api/runs/{run.run_id}",
        result_url=f"/api/runs/{run.run_id}/result",
    )


def _parse_candidate_json(content: str) -> dict[str, Any]:
    text = content.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:].strip()
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as exc:
        raise _error(
            502,
            ErrorResponse(
                code=ErrorCode.PARSING_FAILED,
                message="Candidate generator returned malformed JSON.",
                details={"preview": content[:300]},
            ),
        ) from exc
    if not isinstance(parsed, dict):
        raise _error(
            502,
            ErrorResponse(
                code=ErrorCode.PARSING_FAILED,
                message="Candidate generator returned an invalid JSON shape.",
                details={"preview": content[:300]},
            ),
        )
    return parsed


def _normalize_candidates(raw: Any, count: int) -> list[IntakeCreativeCandidate]:
    if not isinstance(raw, list):
        raw = []
    candidates: list[IntakeCreativeCandidate] = []
    for index, item in enumerate(raw):
        if not isinstance(item, dict):
            continue
        text = str(item.get("text", "")).strip()
        if not text:
            continue
        candidates.append(
            IntakeCreativeCandidate(
                id=str(item.get("id") or f"llm-{index + 1}"),
                text=text[:120],
                angle=str(item.get("angle") or "differentiation"),
                why=str(item.get("why") or "")[:300],
                source="generated",
            )
        )
    if len(candidates) < 2:
        raise _error(
            502,
            ErrorResponse(
                code=ErrorCode.PARSING_FAILED,
                message="Candidate generator returned fewer than two usable candidates.",
                details={"candidate_count": len(candidates)},
            ),
        )
    return candidates[:count]


def _normalize_assumptions(raw: Any) -> list[IntakeAssumption]:
    if not isinstance(raw, list):
        return []
    assumptions: list[IntakeAssumption] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        slot_id = item.get("slot_id") or item.get("slotId")
        if not slot_id:
            continue
        assumptions.append(
            IntakeAssumption(
                slot_id=str(slot_id),
                value=item.get("value"),
                confidence=float(item.get("confidence", 0.7)),
            )
        )
    return assumptions


@router.post("/api/runs/{run_id}/cancel")
async def cancel_run(request: Request, run_id: str) -> RunSnapshot:
    store = _store(request)
    run = store.get_run(run_id)
    if run is None:
        raise _error(
            404,
            ErrorResponse(
                code=ErrorCode.RUN_NOT_FOUND,
                message="Run was not found.",
                details={"run_id": run_id},
            ),
        )
    if run.status in {
        RunStatusValue.COMPLETED,
        RunStatusValue.FAILED,
        RunStatusValue.CANCELED,
        RunStatusValue.INTERRUPTED,
    }:
        raise _error(
            409,
            ErrorResponse(
                code=ErrorCode.RUN_NOT_CANCELABLE,
                message="Run is already terminal and cannot be canceled.",
                details={"run_id": run_id, "status": run.status.value},
            ),
        )
    canceled_at = _utc_now()
    updated = store.update_run_status(
        run_id,
        RunStatusValue.CANCELED,
        completed_at=canceled_at,
    )
    store.append_event(run_id, RunEventType.CANCELED, {"canceled_at": canceled_at})
    return _run_snapshot(store, updated)


@router.get("/api/runs/{run_id}")
async def get_run(request: Request, run_id: str) -> RunSnapshot:
    store = _store(request)
    run = store.get_run(run_id)
    if run is None:
        raise _error(
            404,
            ErrorResponse(
                code=ErrorCode.RUN_NOT_FOUND,
                message="Run was not found.",
                details={"run_id": run_id},
            ),
        )
    return _run_snapshot(store, run)


@router.get("/api/runs/{run_id}/events")
async def get_run_events(request: Request, run_id: str) -> StreamingResponse:
    store = _store(request)
    run = store.get_run(run_id)
    if run is None:
        raise _error(
            404,
            ErrorResponse(
                code=ErrorCode.RUN_NOT_FOUND,
                message="Run was not found.",
                details={"run_id": run_id},
            ),
        )
    after_event_id = request.query_params.get("after_event_id") or request.headers.get(
        "last-event-id"
    )
    if after_event_id:
        try:
            store.list_events_after(run_id, after_event_id)
        except ValueError as exc:
            raise _error(
                400,
                ErrorResponse(
                    code=ErrorCode.INVALID_REQUEST,
                    message="Invalid SSE event cursor.",
                    details={"run_id": run_id, "after_event_id": after_event_id},
                ),
            ) from exc

    async def event_stream():
        sent_event_ids: set[str] = set()
        heartbeat_ticks = 0
        current = store.get_run(run_id)
        if current:
            yield format_snapshot(_run_snapshot(store, current))
        while True:
            events = store.list_events_after(run_id, after_event_id)
            for event in events:
                if event.event_id and event.event_id not in sent_event_ids:
                    sent_event_ids.add(event.event_id)
                    yield format_sse_event(event)

            current = store.get_run(run_id)
            if current and current.status in {
                RunStatusValue.COMPLETED,
                RunStatusValue.FAILED,
                RunStatusValue.CANCELED,
                RunStatusValue.INTERRUPTED,
            }:
                break

            heartbeat_ticks += 1
            if heartbeat_ticks >= 15:
                heartbeat_ticks = 0
                yield format_heartbeat(run_id)

            await asyncio.sleep(1)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/api/runs/{run_id}/result")
async def get_run_result(request: Request, run_id: str) -> RunResultEnvelope:
    store = _store(request)
    run = store.get_run(run_id)
    if run is None:
        raise _error(
            404,
            ErrorResponse(
                code=ErrorCode.RUN_NOT_FOUND,
                message="Run was not found.",
                details={"run_id": run_id},
            ),
        )

    result = store.get_result(run_id)
    if result is None:
        raise _error(
            409,
            ErrorResponse(
                code=ErrorCode.RESULT_NOT_READY,
                message="Run result is not ready yet.",
                details={"run_id": run_id, "status": run.status.value},
            ),
        )

    return RunResultEnvelope.model_validate(result.result)


@router.get("/api/runs/{run_id}/export")
async def export_run_result(request: Request, run_id: str) -> RunExportResponse:
    result = await get_run_result(request, run_id)
    return _export_response(result)


@router.get("/api/runs/{run_id}/partials")
async def get_run_partials(request: Request, run_id: str) -> RunPartialResultsResponse:
    store = _store(request)
    run = store.get_run(run_id)
    if run is None:
        raise _error(
            404,
            ErrorResponse(
                code=ErrorCode.RUN_NOT_FOUND,
                message="Run was not found.",
                details={"run_id": run_id},
            ),
        )
    partials = store.list_partial_results(run_id)
    return RunPartialResultsResponse(
        run_id=run_id,
        status=RunStatus(run.status.value),
        done_count=run.done_count,
        total_count=run.total_count,
        partial_count=len(partials),
        raw_results=partials,
    )
