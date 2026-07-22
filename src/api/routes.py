"""FastAPI route handlers for app, config, and run lifecycle APIs."""
from __future__ import annotations

import asyncio
import json
import os
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Request
from starlette.responses import RedirectResponse, StreamingResponse

from src.api.schemas import (
    DemoPreset,
    ErrorCode,
    PolicyDraftRequest,
    ProjectRunPersuasionRequest,
    ProjectRunPersuasionResponse,
    PolicyDraftResponse,
    SurveyExportResponse,
    ErrorResponse,
    AdminDeleteUserRequest,
    AdminExportResponse,
    AdminListResponse,
    AdminMutationResponse,
    AdminOverviewResponse,
    AdminRetentionPruneRequest,
    AnalyticsEventRequest,
    AnalyticsEventResponse,
    AuthSessionResponse,
    IntakeAssumption,
    IntakeAdvanceRequest,
    IntakeAdvanceResponse,
    IntakeCandidateRequest,
    ProjectAutofillRequest,
    ProjectAutofillResponse,
    IntakeCandidateResponse,
    IntakeCreativeCandidate,
    IntakeHistoryItem,
    IntakeHistoryResponse,
    IntakeMessageResponse,
    IntakeSessionListResponse,
    IntakeSessionResponse,
    IntakeSessionRunLinkRequest,
    IntakeSessionSaveRequest,
    InterviewThreadCreateRequest,
    InterviewThreadListResponse,
    InterviewThreadMessageRequest,
    InterviewThreadResponse,
    ProjectCreateRequest,
    ProjectListResponse,
    ProjectResponse,
    ProjectRunCreateRequest,
    ProjectRunCreateResponse,
    ProjectRunFollowupRequest,
    ProjectRunFollowupResponse,
    ProjectRunInterviewRequest,
    ProjectRunInterviewResponse,
    ProjectRunListResponse,
    ProjectUpdateRequest,
    RunCreateRequest,
    RunCreateResponse,
    RunExportResponse,
    RunFeedbackRequest,
    RunFeedbackResponse,
    RunPartialResultsResponse,
    RunResultEnvelope,
    RunSnapshot,
    RunStatus,
    SimulationType,
    UserOnboardingRequest,
    UserOnboardingResponse,
    UserUsageResponse,
)
from src.intake import advance_intake
from src.api.auth import (
    auth_required,
    build_google_callback_response,
    build_google_login_response,
    build_logout_response,
    build_test_login_response,
    local_dev_auto_login_enabled,
    local_dev_user,
    read_session_user,
    session_summary,
)
from src.api.presets import list_demo_presets
from src.config import (
    ENABLE_LANGGRAPH,
    ENABLE_LLM_AGENTS,
    LLM_BACKEND,
    MAX_SAMPLE_SIZE,
)
from src.jobs.events import format_heartbeat, format_snapshot, format_sse_event
from src.jobs.models import IntakeSessionRecord, RunEventType, RunRecord, RunStatusValue, UserRecord
from src.jobs.store import SQLiteRunStore
from src.llm.base import LLMClientProtocol, LLMMessage, LLMRequest
from src.llm.factory import create_llm_client
from src.services.policy_draft_service import draft_policy_fields
from src.services.survey_export import build_survey_questions
from src.runtime.health import collect_runtime_health
from src.data.pools import pool_metadata
from src.services.autofill_service import (
    build_autofill_messages,
    gather_market_context,
    normalize_autofill,
)
from src.services.errors import ServiceError
from src.services.export_service import build_run_export_response
from src.services.llm_usage_service import consume_interactive_llm_action
from src.services.project_service import ProjectService
from src.services.run_service import create_run_for_user
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


def _project_service(request: Request) -> ProjectService:
    return ProjectService(_store(request), enqueue_run=_enqueue_run(request))


def _error(status_code: int, response: ErrorResponse) -> HTTPException:
    return HTTPException(status_code=status_code, detail=response.model_dump(mode="json"))


def _service_error(exc: ServiceError) -> HTTPException:
    code = exc.code if isinstance(exc.code, ErrorCode) else ErrorCode.INVALID_REQUEST
    return _error(
        exc.status_code,
        ErrorResponse(code=code, message=exc.message, details=exc.details),
    )


def _is_llm_connection_error(exc: BaseException) -> bool:
    text = str(exc).lower()
    return any(
        token in text
        for token in (
            "connection failed",
            "connection error",
            "event loop is closed",
            "connecterror",
            "server disconnected",
        )
    )


def _llm_unavailable(exc: BaseException) -> HTTPException:
    return _error(
        502,
        ErrorResponse(
            code=ErrorCode.LLM_UNAVAILABLE,
            message="AI 연결에 실패했습니다. 잠시 후 다시 시도해주세요.",
            details={"error": str(exc)[:300]},
        ),
    )


def _save_intake_snapshot(
    request: Request,
    *,
    session_id: str,
    status: str,
    snapshot: dict[str, Any],
    event_type: str,
    user: UserRecord | None,
) -> IntakeSessionRecord:
    try:
        return _store(request).save_intake_session(
            session_id=session_id,
            status=status,
            snapshot=snapshot,
            event_type=event_type,
            user=user,
        )
    except PermissionError as exc:
        raise _error(
            404,
            ErrorResponse(
                code=ErrorCode.INVALID_REQUEST,
                message="Intake session was not found.",
                details={"session_id": session_id},
            ),
        ) from exc


def _free_run_limit() -> int:
    from src.config import KORESIM_FREE_RUN_LIMIT

    return KORESIM_FREE_RUN_LIMIT


def _quota_bypass_emails() -> set[str]:
    raw_values = [
        os.getenv("KORESIM_ADMIN_EMAILS", ""),
        os.getenv("KORESIM_QUOTA_BYPASS_EMAILS", ""),
    ]
    emails: set[str] = set()
    for raw_value in raw_values:
        for item in raw_value.split(","):
            email = item.strip().lower()
            if email:
                emails.add(email)
    return emails


def _quota_bypass(email: str) -> bool:
    return email.strip().lower() in _quota_bypass_emails()


def _admin_emails() -> set[str]:
    return {
        email.strip().lower()
        for email in os.getenv("KORESIM_ADMIN_EMAILS", "").split(",")
        if email.strip()
    }


def _is_admin(email: str) -> bool:
    return email.strip().lower() in _admin_emails()


def _admin_retention_days() -> int:
    raw_value = os.getenv("KORESIM_DATA_RETENTION_DAYS", "180")
    try:
        return max(1, min(int(raw_value), 3650))
    except ValueError:
        return 180


def _authenticated_user(request: Request) -> dict[str, Any] | None:
    user = read_session_user(request)
    if user is None and auth_required() and local_dev_auto_login_enabled(request):
        user = local_dev_user()
    return user


def _user_record_for_request(request: Request) -> UserRecord | None:
    user = _authenticated_user(request)
    if user is None:
        return None
    return _store(request).upsert_user_from_auth(user, free_run_limit=_free_run_limit())


def _require_user(request: Request) -> UserRecord:
    user = _user_record_for_request(request)
    if user is None:
        raise _error(
            401,
            ErrorResponse(
                code=ErrorCode.INVALID_REQUEST,
                message="Login is required.",
            ),
        )
    return user


def _require_admin_user(request: Request) -> UserRecord:
    user = _user_record_for_request(request)
    if user is None or not _is_admin(user.email):
        raise _error(
            403,
            ErrorResponse(
                code=ErrorCode.INVALID_REQUEST,
                message="관리자 권한이 필요합니다.",
            ),
        )
    return user


def _require_run_owner(request: Request, run: RunRecord) -> None:
    if not auth_required():
        return
    user = _require_user(request)
    if _is_admin(user.email):
        return
    if not _store(request).user_owns_run(user.user_id, run.run_id):
        raise _error(
            404,
            ErrorResponse(
                code=ErrorCode.RUN_NOT_FOUND,
                message="Run was not found.",
                details={"run_id": run.run_id},
            ),
        )


def _usage_response(store: SQLiteRunStore, user: UserRecord) -> UserUsageResponse:
    usage = store.get_user_usage(
        user.user_id,
        quota_bypass=_quota_bypass(user.email),
        free_run_limit=_free_run_limit(),
    )
    return UserUsageResponse(
        user_id=usage.user_id,
        email=usage.email,
        plan=usage.plan,
        free_run_limit=usage.free_run_limit,
        used_runs=usage.used_runs,
        remaining_runs=usage.remaining_runs,
        can_create_run=usage.can_create_run,
        quota_bypass=usage.quota_bypass,
    )


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
        country_id=getattr(run, "country_id", None) or "kr",
        persona_pool=getattr(run, "persona_pool", None) or "nationwide",
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


def _mask_email(value: Any) -> Any:
    if not isinstance(value, str) or "@" not in value:
        return value
    name, domain = value.split("@", 1)
    if not name or not domain:
        return "***"
    visible = name[:2] if len(name) > 2 else name[:1]
    return f"{visible}{'*' * max(3, len(name) - len(visible))}@{domain}"


def _mask_text(value: Any, *, keep_prefix: int = 24) -> Any:
    if not isinstance(value, str):
        return value
    if len(value) <= keep_prefix:
        return "[masked]"
    return f"{value[:keep_prefix]}... [masked]"


def _mask_admin_value(key: str, value: Any) -> Any:
    if value is None:
        return None
    normalized_key = key.lower()
    if "email" in normalized_key:
        return _mask_email(value)
    if normalized_key in {"name", "free_text", "result_expectation", "intended_action", "occupation"}:
        return _mask_text(value)
    if normalized_key in {"input", "payload", "intake_context", "target_filter", "error"}:
        return _mask_nested(value)
    if isinstance(value, dict):
        return {child_key: _mask_admin_value(child_key, child_value) for child_key, child_value in value.items()}
    if isinstance(value, list):
        return [_mask_nested(item) for item in value]
    return value


def _mask_nested(value: Any) -> Any:
    if isinstance(value, dict):
        masked: dict[str, Any] = {}
        for key, child_value in value.items():
            normalized_key = key.lower()
            if any(token in normalized_key for token in ("email", "name", "description", "context", "text", "message", "creative", "product")):
                masked[key] = _mask_text(child_value)
            else:
                masked[key] = _mask_admin_value(key, child_value)
        return masked
    if isinstance(value, list):
        return [_mask_nested(item) for item in value]
    if isinstance(value, str):
        return _mask_text(value)
    return value


def _mask_admin_items(items: list[dict[str, Any]], *, include_sensitive: bool = False) -> list[dict[str, Any]]:
    if include_sensitive:
        return items
    return [
        {key: _mask_admin_value(key, value) for key, value in item.items()}
        for item in items
    ]


def _mask_admin_payload(payload: dict[str, Any], *, include_sensitive: bool = False) -> dict[str, Any]:
    if include_sensitive:
        return payload
    masked = {key: _mask_admin_value(key, value) for key, value in payload.items()}
    for key in ("recent_events", "users", "runs", "feedback", "accounts"):
        if isinstance(masked.get(key), list):
            masked[key] = _mask_admin_items(masked[key], include_sensitive=False)
    if isinstance(masked.get("overview"), dict):
        masked["overview"] = _mask_admin_payload(masked["overview"], include_sensitive=False)
    return masked


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
        "scope": "public-minimal",
        "status": "ready" if runtime["ok"] else "unhealthy",
    }


@router.get("/api/internal/health")
async def api_internal_health(request: Request) -> dict[str, object]:
    runtime = collect_runtime_health(_store(request))
    return {
        "ok": runtime["ok"],
        "service": "koresim-api",
        "scope": "authenticated-detail",
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
    from src.config import DEFAULT_COUNTRY_ID, WORKER_COUNT
    from src.data.datasets import available_countries
    from src.runtime.event_mode import event_config_snapshot, event_mode_enabled

    event = event_config_snapshot()
    return {
        "service": "koresim-api",
        "max_sample_size": event.max_sample_size if event.enabled else MAX_SAMPLE_SIZE,
        "sample_size_presets": list(event.sample_size_presets),
        "default_sample_size": event.default_sample_size if event.enabled else 100,
        "persona_pools": pool_metadata(),
        "default_seed": 42,
        "default_country_id": DEFAULT_COUNTRY_ID,
        "available_countries": available_countries(),
        "simulation_types": [simulation_type.value for simulation_type in SimulationType],
        "enabled_simulation_types": enabled_simulation_types(),
        "simulation_metadata": simulation_metadata(),
        "event_mode": {
            "enabled": event_mode_enabled(),
            "default_sample_size": event.default_sample_size,
            "max_sample_size": event.max_sample_size,
            "max_queued_runs": event.max_queued_runs,
            "worker_count": WORKER_COUNT,
            "free_run_limit": event.free_run_limit,
            "banner": (
                "행사장 체험 모드 · 권장 표본 100명 · 대기 시 1–2분"
                if event_mode_enabled()
                else None
            ),
        },
        "auth": {
            "session_url": "/api/auth/session",
            "login_url": "/api/auth/google/login",
            "logout_url": "/api/auth/logout",
            "test_login_url": "/api/auth/test-login",
        },
    }


@router.get("/api/mcp/connect")
async def mcp_connect(request: Request) -> dict[str, Any]:
    user = _require_user(request)
    from src.oauth.authorization_server import mcp_connect_payload

    return mcp_connect_payload(request, user_id=user.user_id)


@router.get("/api/mcp/grants")
async def mcp_grants(request: Request) -> dict[str, Any]:
    user = _require_user(request)
    grants = _store(request).list_oauth_grants(user.user_id)
    return {"grants": grants}


@router.delete("/api/mcp/grants/{grant_id}")
async def mcp_revoke_grant(request: Request, grant_id: str) -> dict[str, Any]:
    user = _require_user(request)
    grant = _store(request).revoke_oauth_grant(grant_id, user_id=user.user_id)
    if grant is None:
        raise HTTPException(
            status_code=404,
            detail={"code": "GRANT_NOT_FOUND", "message": "OAuth grant not found."},
        )
    return {"grant": grant}


@router.get("/api/auth/session")
async def auth_session(request: Request) -> AuthSessionResponse:
    return AuthSessionResponse.model_validate(session_summary(request))


@router.get("/api/me/usage")
async def my_usage(request: Request) -> UserUsageResponse:
    user = _user_record_for_request(request)
    if user is None:
        raise _error(
            401,
            ErrorResponse(
                code=ErrorCode.INVALID_REQUEST,
                message="로그인이 필요합니다.",
            ),
        )
    return _usage_response(_store(request), user)


_REFERRAL_SOURCES = frozenset({"referral", "sns", "search", "school", "work", "other"})
_LIFE_STAGES = frozenset({"student", "worker", "other"})


def _onboarding_bypassed(user: UserRecord) -> bool:
    """Test and local-dev sessions skip the first-login form so E2E stays stable."""

    return user.provider in {"test", "local_dev"}


def _onboarding_response(user: UserRecord) -> UserOnboardingResponse:
    bypassed = _onboarding_bypassed(user)
    completed = bypassed or bool(user.onboarding_completed_at)
    referral = user.referral_source if user.referral_source in _REFERRAL_SOURCES else None
    life_stage = user.life_stage if user.life_stage in _LIFE_STAGES else None
    return UserOnboardingResponse.model_validate(
        {
            "completed": completed,
            "referral_source": referral,
            "life_stage": life_stage,
            "occupation": user.occupation,
            "completed_at": user.onboarding_completed_at,
            "bypassed": bypassed,
        }
    )


@router.get("/api/me/onboarding")
async def get_my_onboarding(request: Request) -> UserOnboardingResponse:
    user = _user_record_for_request(request)
    if user is None:
        raise _error(
            401,
            ErrorResponse(
                code=ErrorCode.INVALID_REQUEST,
                message="로그인이 필요합니다.",
            ),
        )
    return _onboarding_response(user)


@router.post("/api/me/onboarding")
async def save_my_onboarding(
    request: Request,
    payload: UserOnboardingRequest,
) -> UserOnboardingResponse:
    user = _user_record_for_request(request)
    if user is None:
        raise _error(
            401,
            ErrorResponse(
                code=ErrorCode.INVALID_REQUEST,
                message="로그인이 필요합니다.",
            ),
        )
    occupation = payload.occupation.strip()
    if not occupation:
        raise _error(
            422,
            ErrorResponse(
                code=ErrorCode.INVALID_REQUEST,
                message="직업을 한 글자 이상 입력해 주세요.",
            ),
        )
    store = _store(request)
    updated = store.save_user_onboarding(
        user.user_id,
        referral_source=payload.referral_source,
        life_stage=payload.life_stage,
        occupation=occupation,
    )
    store.record_analytics_event(
        event_name="onboarding_completed",
        user=updated,
        page="/onboarding",
        payload={
            "referral_source": payload.referral_source,
            "life_stage": payload.life_stage,
        },
    )
    return _onboarding_response(updated)


@router.post("/api/analytics/events")
async def record_analytics_event(
    request: Request,
    payload: AnalyticsEventRequest,
) -> AnalyticsEventResponse:
    user = _user_record_for_request(request)
    record = _store(request).record_analytics_event(
        event_name=payload.event_name,
        user=user,
        session_id=payload.session_id,
        run_id=payload.run_id,
        page=payload.page,
        simulation_type=payload.simulation_type.value if payload.simulation_type else None,
        payload=payload.payload,
    )
    return AnalyticsEventResponse.model_validate(record)


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


@router.get("/api/admin/overview")
async def admin_overview(request: Request, include_sensitive: bool = False) -> AdminOverviewResponse:
    admin = _require_admin_user(request)
    store = _store(request)
    store.append_admin_audit_event(
        admin=admin,
        action="view_admin_overview",
        payload={"include_sensitive": include_sensitive},
    )
    overview = store.admin_overview()
    overview["funnel"] = store.admin_funnel()
    overview["accounts"] = store.admin_accounts(limit=20)
    overview["policy"] = store.admin_policy(retention_days=_admin_retention_days())
    return AdminOverviewResponse.model_validate(_mask_admin_payload(overview, include_sensitive=include_sensitive))


@router.get("/api/admin/users")
async def admin_users(request: Request, limit: int = 50, include_sensitive: bool = False) -> AdminListResponse:
    admin = _require_admin_user(request)
    store = _store(request)
    store.append_admin_audit_event(
        admin=admin,
        action="view_admin_users",
        payload={"limit": limit, "include_sensitive": include_sensitive},
    )
    return AdminListResponse(items=_mask_admin_items(store.admin_users(limit=limit), include_sensitive=include_sensitive))


@router.get("/api/admin/runs")
async def admin_runs(request: Request, limit: int = 50, include_sensitive: bool = False) -> AdminListResponse:
    admin = _require_admin_user(request)
    store = _store(request)
    store.append_admin_audit_event(
        admin=admin,
        action="view_admin_runs",
        payload={"limit": limit, "include_sensitive": include_sensitive},
    )
    return AdminListResponse(items=_mask_admin_items(store.admin_runs(limit=limit), include_sensitive=include_sensitive))


@router.get("/api/admin/feedback")
async def admin_feedback(request: Request, limit: int = 50, include_sensitive: bool = False) -> AdminListResponse:
    admin = _require_admin_user(request)
    store = _store(request)
    store.append_admin_audit_event(
        admin=admin,
        action="view_admin_feedback",
        payload={"limit": limit, "include_sensitive": include_sensitive},
    )
    return AdminListResponse(items=_mask_admin_items(store.admin_feedback(limit=limit), include_sensitive=include_sensitive))


@router.get("/api/admin/export")
async def admin_export(request: Request, include_sensitive: bool = False) -> AdminExportResponse:
    admin = _require_admin_user(request)
    store = _store(request)
    store.append_admin_audit_event(
        admin=admin,
        action="export_admin_data",
        payload={"include_sensitive": include_sensitive},
    )
    export_data = store.admin_export(retention_days=_admin_retention_days())
    return AdminExportResponse.model_validate(_mask_admin_payload(export_data, include_sensitive=include_sensitive))


@router.get("/api/admin/policy")
async def admin_policy(request: Request) -> dict[str, Any]:
    admin = _require_admin_user(request)
    store = _store(request)
    store.append_admin_audit_event(admin=admin, action="view_admin_policy")
    return store.admin_policy(retention_days=_admin_retention_days())


@router.post("/api/admin/retention/prune")
async def admin_retention_prune(
    request: Request,
    payload: AdminRetentionPruneRequest,
) -> AdminMutationResponse:
    admin = _require_admin_user(request)
    if not payload.dry_run and not payload.confirm:
        raise _error(
            400,
            ErrorResponse(
                code=ErrorCode.INVALID_REQUEST,
                message="실제 보존 정책 삭제에는 confirm=true가 필요합니다.",
            ),
        )
    store = _store(request)
    result = store.prune_retention(retention_days=payload.retention_days, dry_run=payload.dry_run)
    store.append_admin_audit_event(
        admin=admin,
        action="retention_prune_dry_run" if payload.dry_run else "retention_prune_execute",
        payload={
            "retention_days": payload.retention_days,
            "dry_run": payload.dry_run,
            "counts": result.get("counts", {}),
        },
    )
    return AdminMutationResponse(action="retention_prune", dry_run=payload.dry_run, result=result)


@router.post("/api/admin/users/{user_id}/delete")
async def admin_delete_user(
    request: Request,
    user_id: str,
    payload: AdminDeleteUserRequest,
) -> AdminMutationResponse:
    admin = _require_admin_user(request)
    if payload.confirm_user_id != user_id:
        raise _error(
            400,
            ErrorResponse(
                code=ErrorCode.INVALID_REQUEST,
                message="삭제하려면 confirm_user_id가 대상 user_id와 정확히 같아야 합니다.",
            ),
        )
    if admin.user_id == user_id:
        raise _error(
            400,
            ErrorResponse(
                code=ErrorCode.INVALID_REQUEST,
                message="현재 로그인한 관리자 계정은 이 화면에서 삭제할 수 없습니다.",
            ),
        )
    store = _store(request)
    result = store.delete_user_data(user_id=user_id)
    masked_result = _mask_admin_payload(result, include_sensitive=False)
    store.append_admin_audit_event(
        admin=admin,
        action="delete_user_data",
        target_type="user",
        target_id=user_id,
        payload=masked_result,
    )
    return AdminMutationResponse(action="delete_user_data", result=masked_result)


@router.post("/api/intake/sessions")
async def save_intake_session(
    request: Request,
    payload: IntakeSessionSaveRequest,
) -> IntakeSessionResponse:
    session_id = payload.session_id or f"intake-{uuid4()}"
    user = _user_record_for_request(request)
    record = _save_intake_snapshot(
        request,
        session_id=session_id,
        status=payload.status,
        snapshot=payload.snapshot,
        event_type="session_saved",
        user=user,
    )
    _store(request).record_analytics_event(
        event_name="intake_session_saved",
        user=user,
        session_id=session_id,
        page="/app",
        payload={"status": payload.status},
    )
    return _intake_session_response(record)


@router.get("/api/intake/sessions")
async def list_intake_sessions(request: Request, limit: int = 20) -> IntakeSessionListResponse:
    user = _user_record_for_request(request)
    records = _store(request).list_intake_sessions(
        limit=limit,
        user_id=user.user_id if user else None,
    )
    return IntakeSessionListResponse(
        sessions=[_intake_session_response(record) for record in records],
    )


@router.get("/api/intake/history")
async def list_intake_history(request: Request, limit: int = 20) -> IntakeHistoryResponse:
    user = _user_record_for_request(request)
    records = _store(request).list_intake_history(
        limit=limit,
        user_id=user.user_id if user else None,
    )
    return IntakeHistoryResponse(items=[_intake_history_response(record) for record in records])


@router.post("/api/intake/advance", deprecated=True)
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
    user = _user_record_for_request(request)
    _save_intake_snapshot(
        request,
        session_id=session_id,
        status=str(advanced["status"]),
        snapshot=advanced["snapshot"],
        event_type="advance",
        user=user,
    )
    _store(request).record_analytics_event(
        event_name="intake_advanced",
        user=user,
        session_id=session_id,
        page="/app",
        payload={
            "status": str(advanced["status"]),
            "event_type": payload.event.get("type"),
        },
    )
    return IntakeAdvanceResponse.model_validate(advanced)


@router.put("/api/intake/sessions/{session_id}")
async def update_intake_session(
    request: Request,
    session_id: str,
    payload: IntakeSessionSaveRequest,
) -> IntakeSessionResponse:
    user = _user_record_for_request(request)
    record = _save_intake_snapshot(
        request,
        session_id=session_id,
        status=payload.status,
        snapshot=payload.snapshot,
        event_type="session_updated",
        user=user,
    )
    _store(request).record_analytics_event(
        event_name="intake_session_updated",
        user=user,
        session_id=session_id,
        page="/app",
        payload={"status": payload.status},
    )
    return _intake_session_response(record)


@router.post("/api/intake/sessions/{session_id}/run")
async def link_intake_session_run(
    request: Request,
    session_id: str,
    payload: IntakeSessionRunLinkRequest,
) -> IntakeSessionResponse:
    user = _user_record_for_request(request)
    try:
        record = _store(request).attach_intake_run(
            session_id=session_id,
            run_id=payload.run_id,
            user_id=user.user_id if user else None,
        )
    except KeyError as exc:
        raise _error(
            404,
            ErrorResponse(
                code=ErrorCode.INVALID_REQUEST,
                message="Intake session was not found.",
                details={"session_id": session_id},
            ),
        ) from exc
    _store(request).record_analytics_event(
        event_name="intake_run_linked",
        user=user,
        session_id=session_id,
        run_id=payload.run_id,
        page="/app",
        payload={},
    )
    return _intake_session_response(record)


@router.get("/api/intake/sessions/{session_id}")
async def get_intake_session(request: Request, session_id: str) -> IntakeSessionResponse:
    user = _user_record_for_request(request)
    record = _store(request).get_intake_session(
        session_id,
        user_id=user.user_id if user else None,
    )
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
    try:
        consume_interactive_llm_action(
            store=_store(request),
            user=_user_record_for_request(request),
            action_type="intake_candidate_generation",
        )
    except ServiceError as exc:
        raise _service_error(exc) from exc
    try:
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
    except RuntimeError as exc:
        if _is_llm_connection_error(exc):
            raise _llm_unavailable(exc) from exc
        raise
    parsed = _parse_candidate_json(llm_response.content)
    return IntakeCandidateResponse(
        candidates=_normalize_candidates(parsed.get("candidates", []), payload.count),
        assumptions=_normalize_assumptions(parsed.get("assumptions", [])),
        provider=llm_response.provider,
        provider_model=llm_response.provider_model,
        trace_id=llm_response.trace_id,
    )


@router.post("/api/intake/autofill")
async def autofill_project_from_prompt(
    request: Request,
    payload: ProjectAutofillRequest,
) -> ProjectAutofillResponse:
    try:
        consume_interactive_llm_action(
            store=_store(request),
            user=_user_record_for_request(request),
            action_type="project_autofill",
        )
    except ServiceError as exc:
        raise _service_error(exc) from exc
    market_context = await gather_market_context(payload.prompt)
    try:
        llm_response = await _llm_client(request).generate(
            LLMRequest(
                task_type="intake_autofill",
                temperature=0.3,
                messages=build_autofill_messages(
                    payload.prompt,
                    payload.simulation_type,
                    market_context,
                    kind=payload.kind,
                    current_fields=payload.current_fields,
                ),
                metadata={"scope": "agentic_intake", "web_search": bool(market_context)},
            )
        )
    except RuntimeError as exc:
        if _is_llm_connection_error(exc):
            raise _llm_unavailable(exc) from exc
        raise
    parsed = _parse_candidate_json(llm_response.content)
    return normalize_autofill(
        parsed,
        payload.simulation_type,
        provider=llm_response.provider,
        provider_model=llm_response.provider_model,
        trace_id=llm_response.trace_id,
    )


@router.get("/api/projects")
async def list_projects(request: Request) -> ProjectListResponse:
    try:
        return _project_service(request).list_projects(_user_record_for_request(request))
    except ServiceError as exc:
        raise _service_error(exc) from exc


@router.post("/api/projects")
async def create_project(request: Request, payload: ProjectCreateRequest) -> ProjectResponse:
    try:
        return _project_service(request).create_project(_user_record_for_request(request), payload)
    except ServiceError as exc:
        raise _service_error(exc) from exc


@router.get("/api/projects/{project_id}")
async def get_project(request: Request, project_id: str) -> ProjectResponse:
    try:
        return _project_service(request).get_project(_user_record_for_request(request), project_id)
    except ServiceError as exc:
        raise _service_error(exc) from exc


@router.patch("/api/projects/{project_id}")
async def update_project(request: Request, project_id: str, payload: ProjectUpdateRequest) -> ProjectResponse:
    try:
        return _project_service(request).update_project(_user_record_for_request(request), project_id, payload)
    except ServiceError as exc:
        raise _service_error(exc) from exc


@router.post("/api/projects/{project_id}/archive")
async def archive_project(request: Request, project_id: str) -> ProjectResponse:
    try:
        return _project_service(request).archive_project(_user_record_for_request(request), project_id)
    except ServiceError as exc:
        raise _service_error(exc) from exc


@router.get("/api/projects/{project_id}/runs")
async def list_project_runs(request: Request, project_id: str) -> ProjectRunListResponse:
    try:
        return _project_service(request).list_project_runs(_user_record_for_request(request), project_id)
    except ServiceError as exc:
        raise _service_error(exc) from exc


@router.post("/api/projects/{project_id}/runs")
async def create_project_run(
    request: Request,
    project_id: str,
    payload: ProjectRunCreateRequest,
) -> ProjectRunCreateResponse:
    try:
        return _project_service(request).create_project_run(_user_record_for_request(request), project_id, payload)
    except ServiceError as exc:
        raise _service_error(exc) from exc


@router.get("/api/projects/{project_id}/runs/{run_id}/result")
async def get_project_run_result(request: Request, project_id: str, run_id: str) -> RunResultEnvelope:
    try:
        return _project_service(request).get_project_run_result(_user_record_for_request(request), project_id, run_id)
    except ServiceError as exc:
        raise _service_error(exc) from exc


@router.get("/api/projects/{project_id}/runs/{run_id}/export")
async def export_project_run(request: Request, project_id: str, run_id: str) -> RunExportResponse:
    try:
        return _project_service(request).export_project_run(_user_record_for_request(request), project_id, run_id)
    except ServiceError as exc:
        raise _service_error(exc) from exc


@router.post("/api/projects/{project_id}/runs/{run_id}/feedback")
async def submit_project_run_feedback(
    request: Request,
    project_id: str,
    run_id: str,
    payload: RunFeedbackRequest,
) -> RunFeedbackResponse:
    try:
        return _project_service(request).submit_project_run_feedback(
            _user_record_for_request(request),
            project_id,
            run_id,
            payload,
        )
    except ServiceError as exc:
        raise _service_error(exc) from exc


@router.post("/api/intake/policy-draft")
async def create_policy_draft(
    request: Request, payload: PolicyDraftRequest
) -> PolicyDraftResponse:
    """안건 한 줄에서 campus_policy 구조화 필드 초안을 만든다.

    ai_generated는 어느 칸이 AI 초안인지 UI에 알려준다. current_state 같은
    필드는 모델이 모르는 사실이라 사용자의 확인 없이 실행되면 안 된다.
    """
    result = await draft_policy_fields(
        payload.agenda, payload.fields or {}, _llm_client(request)
    )
    return PolicyDraftResponse(**result)


@router.get("/api/runs/{run_id}/survey")
async def get_run_survey(request: Request, run_id: str) -> SurveyExportResponse:
    """시뮬 결과를 실제 설문 문항으로 변환한다. raw_results는 포함하지 않는다."""
    store = _store(request)
    result = store.get_result(run_id)
    if result is None:
        raise _error(
            409,
            ErrorResponse(
                code=ErrorCode.RESULT_NOT_READY,
                message="Run result is not ready yet.",
                details={"run_id": run_id},
            ),
        )
    payload = result if isinstance(result, dict) else result.model_dump()
    agenda = str((payload.get("input") or {}).get("agenda") or "이 안건")
    survey = build_survey_questions(agenda, payload.get("metrics") or {})
    return SurveyExportResponse(agenda=agenda, **survey)


@router.post("/api/projects/{project_id}/runs/{run_id}/followup")
def ask_project_run_followup(
    request: Request,
    project_id: str,
    run_id: str,
    payload: ProjectRunFollowupRequest,
) -> ProjectRunFollowupResponse:
    try:
        return _project_service(request).ask_followup(
            _user_record_for_request(request),
            project_id,
            run_id,
            payload,
            llm_client=request.app.state.llm_client,
        )
    except ServiceError as exc:
        raise _service_error(exc) from exc


@router.post("/api/projects/{project_id}/runs/{run_id}/persuasion")
def run_project_run_persuasion(
    request: Request,
    project_id: str,
    run_id: str,
    payload: ProjectRunPersuasionRequest,
) -> ProjectRunPersuasionResponse:
    """반대한 응답자에게만 조건을 제시해 전환율을 낸다."""
    try:
        return _project_service(request).run_persuasion(
            _user_record_for_request(request),
            project_id,
            run_id,
            payload,
            llm_client=request.app.state.llm_client,
        )
    except ServiceError as exc:
        raise _service_error(exc) from exc


@router.get("/api/projects/{project_id}/runs/{run_id}/interview-threads")
def list_project_run_interview_threads(
    request: Request,
    project_id: str,
    run_id: str,
) -> InterviewThreadListResponse:
    try:
        return _project_service(request).list_interview_threads(
            _user_record_for_request(request),
            project_id,
            run_id,
        )
    except ServiceError as exc:
        raise _service_error(exc) from exc


@router.post("/api/projects/{project_id}/runs/{run_id}/interview-threads")
def create_project_run_interview_thread(
    request: Request,
    project_id: str,
    run_id: str,
    payload: InterviewThreadCreateRequest,
) -> InterviewThreadResponse:
    try:
        return _project_service(request).create_interview_thread(
            _user_record_for_request(request),
            project_id,
            run_id,
            payload,
        )
    except ServiceError as exc:
        raise _service_error(exc) from exc


@router.post("/api/projects/{project_id}/runs/{run_id}/interview-threads/{thread_id}/messages")
def ask_project_run_interview_thread(
    request: Request,
    project_id: str,
    run_id: str,
    thread_id: str,
    payload: InterviewThreadMessageRequest,
) -> InterviewThreadResponse:
    try:
        return _project_service(request).ask_interview_thread_question(
            _user_record_for_request(request),
            project_id,
            run_id,
            thread_id,
            payload,
            llm_client=request.app.state.llm_client,
        )
    except ServiceError as exc:
        raise _service_error(exc) from exc


@router.post("/api/projects/{project_id}/runs/{run_id}/interview")
def ask_project_run_interview(
    request: Request,
    project_id: str,
    run_id: str,
    payload: ProjectRunInterviewRequest,
) -> ProjectRunInterviewResponse:
    try:
        return _project_service(request).ask_interview_question(
            _user_record_for_request(request),
            project_id,
            run_id,
            payload,
            llm_client=request.app.state.llm_client,
        )
    except ServiceError as exc:
        raise _service_error(exc) from exc


@router.post("/api/runs")
async def create_run(request: Request, payload: RunCreateRequest) -> RunCreateResponse:
    try:
        return create_run_for_user(
            store=_store(request),
            enqueue_run=_enqueue_run(request),
            payload=payload,
            user=_user_record_for_request(request),
            page="/app",
        )
    except ServiceError as exc:
        raise _service_error(exc) from exc


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
    _require_run_owner(request, run)
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
    _require_run_owner(request, run)
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
    _require_run_owner(request, run)
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
        cursor = after_event_id or "0"
        heartbeat_ticks = 0
        current = store.get_run(run_id)
        if current:
            yield format_snapshot(_run_snapshot(store, current))
        while True:
            events = store.list_events_after(run_id, cursor)
            for event in events:
                yield format_sse_event(event)
            if events and events[-1].event_id:
                cursor = events[-1].event_id

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
    _require_run_owner(request, run)

    result = store.get_result(run_id)
    if result is None:
        raise _error(
            409,
            ErrorResponse(
                code=ErrorCode.RESULT_NOT_READY,
                message="Run result is not ready yet.",
                details={
                    "run_id": run_id,
                    "status": run.status.value,
                    "done_count": run.done_count,
                    "total_count": run.total_count,
                    "partial_count": len(store.list_partial_results(run_id)),
                },
            ),
        )

    user = _user_record_for_request(request)
    store.record_analytics_event(
        event_name="result_viewed",
        user=user,
        run_id=run_id,
        page="/results",
        simulation_type=run.simulation_type,
        payload={"status": run.status.value},
    )
    return RunResultEnvelope.model_validate(result.result)


@router.post("/api/runs/{run_id}/feedback")
async def save_run_feedback(
    request: Request,
    run_id: str,
    payload: RunFeedbackRequest,
) -> RunFeedbackResponse:
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
    _require_run_owner(request, run)
    user = _user_record_for_request(request)
    record = store.save_user_feedback(
        run_id=run_id,
        user=user,
        intake_session_id=payload.intake_session_id,
        usefulness_score=payload.usefulness_score,
        trust_score=payload.trust_score,
        actionability_score=payload.actionability_score,
        result_expectation=payload.result_expectation,
        free_text=payload.free_text,
        intended_action=payload.intended_action,
        decision_confidence_before=payload.decision_confidence_before,
        decision_confidence_after=payload.decision_confidence_after,
        shared_with_team=payload.shared_with_team,
        exported_report=payload.exported_report,
    )
    store.record_analytics_event(
        event_name="feedback_submitted",
        user=user,
        run_id=run_id,
        page="/results",
        simulation_type=run.simulation_type,
        payload={
            "usefulness_score": payload.usefulness_score,
            "trust_score": payload.trust_score,
            "actionability_score": payload.actionability_score,
        },
    )
    return RunFeedbackResponse.model_validate(record)


@router.get("/api/runs/{run_id}/export")
async def export_run_result(request: Request, run_id: str) -> RunExportResponse:
    result = await get_run_result(request, run_id)
    return build_run_export_response(result)


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
    _require_run_owner(request, run)
    partials = store.list_partial_results(run_id)
    return RunPartialResultsResponse(
        run_id=run_id,
        status=RunStatus(run.status.value),
        done_count=run.done_count,
        total_count=run.total_count,
        partial_count=len(partials),
        raw_results=partials,
    )
