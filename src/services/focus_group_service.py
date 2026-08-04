"""Create/list/get focus-group sessions and drive protocol execution."""
from __future__ import annotations

import asyncio
import logging
import threading
from pathlib import Path
from typing import Any

from src.api.schemas import (
    ErrorCode,
    FocusGroupCreateRequest,
    FocusGroupListResponse,
    FocusGroupResponse,
)
from src.jobs.models import FocusGroupRecord, RunRecord, UserRecord
from src.jobs.store import SQLiteRunStore
from src.services.errors import ServiceError, require_authenticated_user
from src.services.llm_usage_service import consume_interactive_llm_action
from src.simulations.focus_group import (
    DEFAULT_PANEL_SIZE,
    PROTOCOL_ID,
    SCHEMA_VERSION,
    FocusGroupError,
    count_option_respondents,
    estimate_total_calls,
    run_focus_group_protocol,
    select_homogenous_panel,
)
from src.simulations.open_survey import survey_options

logger = logging.getLogger(__name__)

# Slightly above RQ job_timeout (30m) so timeout/kill is reclaimable.
FOCUS_GROUP_STALE_AFTER_SECONDS = 35 * 60
# Rough cost weight vs single interview turn (opening+reaction+final ≈ 27 calls).
FOCUS_GROUP_RATE_LIMIT_UNITS = 10


def _public_panel(panel: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    """Hide persona blobs from API clients (worker still stores them until complete)."""
    out: list[dict[str, Any]] = []
    for member in panel or []:
        if not isinstance(member, dict):
            continue
        out.append(
            {
                "uuid": member.get("uuid"),
                "display_name": member.get("display_name"),
                "meta": member.get("meta"),
                "initial_choice": member.get("initial_choice"),
                "initial_reason": member.get("initial_reason"),
                "final_choice": member.get("final_choice"),
                "final_reason": member.get("final_reason"),
                "changed": member.get("changed"),
            }
        )
    return out


def focus_group_response(record: FocusGroupRecord) -> FocusGroupResponse:
    return FocusGroupResponse(
        schema_version=record.schema_version or SCHEMA_VERSION,
        focus_group_id=record.focus_group_id,
        project_id=record.project_id,
        run_id=record.run_id,
        status=record.status,  # type: ignore[arg-type]
        created_at=record.created_at,
        updated_at=record.updated_at,
        completed_at=record.completed_at,
        error=record.error,
        config=record.config or {},
        progress=record.progress,
        panel=_public_panel(record.panel),
        timeline=record.timeline or [],
        stance_table=record.stance_table,
        summary=record.summary,
        token_usage=record.token_usage,
    )


class FocusGroupService:
    def __init__(
        self,
        store: SQLiteRunStore,
        *,
        enqueue_focus_group: Any | None = None,
        run_inline: bool = False,
        stale_after_seconds: int = FOCUS_GROUP_STALE_AFTER_SECONDS,
    ) -> None:
        self.store = store
        self.enqueue_focus_group = enqueue_focus_group
        self.run_inline = run_inline
        self.stale_after_seconds = stale_after_seconds

    def list_focus_groups(
        self,
        user: UserRecord | None,
        project_id: str,
        run_id: str,
    ) -> FocusGroupListResponse:
        user = require_authenticated_user(user)
        self._owned_project_run(user, project_id, run_id)
        self.store.reclaim_stale_focus_groups(
            run_id=run_id, stale_after_seconds=self.stale_after_seconds
        )
        records = self.store.list_focus_groups(user_id=user.user_id, run_id=run_id)
        return FocusGroupListResponse(focus_groups=[focus_group_response(r) for r in records])

    def get_focus_group(
        self,
        user: UserRecord | None,
        project_id: str,
        run_id: str,
        focus_group_id: str,
    ) -> FocusGroupResponse:
        user = require_authenticated_user(user)
        self._owned_project_run(user, project_id, run_id)
        self.store.reclaim_stale_focus_groups(
            run_id=run_id, stale_after_seconds=self.stale_after_seconds
        )
        record = self.store.get_focus_group(user_id=user.user_id, focus_group_id=focus_group_id)
        if record is None or record.project_id != project_id or record.run_id != run_id:
            raise ServiceError(
                status_code=404,
                code=ErrorCode.RUN_NOT_FOUND,
                message="Focus group was not found.",
                details={"focus_group_id": focus_group_id, "run_id": run_id},
            )
        return focus_group_response(record)

    def create_focus_group(
        self,
        user: UserRecord | None,
        project_id: str,
        run_id: str,
        payload: FocusGroupCreateRequest,
        *,
        llm_client: Any | None = None,
    ) -> FocusGroupResponse:
        user = require_authenticated_user(user)
        run = self._owned_project_run(user, project_id, run_id)
        if run.simulation_type != "open_survey":
            raise ServiceError(
                status_code=400,
                code=ErrorCode.INVALID_REQUEST,
                message="Focus groups are only available for open_survey runs.",
                details={"simulation_type": run.simulation_type},
            )
        if run.status.value != "completed":
            raise ServiceError(
                status_code=409,
                code=ErrorCode.RESULT_NOT_READY,
                message="Run must be completed before starting a focus group.",
                details={"status": run.status.value},
            )
        result_rec = self.store.get_result(run.run_id)
        if result_rec is None:
            raise ServiceError(
                status_code=409,
                code=ErrorCode.RESULT_NOT_READY,
                message="Run result is not ready yet.",
                details={"run_id": run.run_id},
            )
        result = result_rec.result if isinstance(result_rec.result, dict) else {}
        input_data = run.input if isinstance(run.input, dict) else {}
        options = survey_options(input_data)
        if not options:
            metrics = result.get("metrics") if isinstance(result.get("metrics"), dict) else {}
            options = [str(o) for o in (metrics.get("options") or []) if str(o).strip()]
        cohort_option = payload.cohort_option.strip()
        if cohort_option not in options:
            raise ServiceError(
                status_code=400,
                code=ErrorCode.INVALID_REQUEST,
                message="cohort_option must match one of the survey options.",
                details={"cohort_option": cohort_option, "options": options},
            )
        panel_size = int(payload.panel_size or DEFAULT_PANEL_SIZE)
        if panel_size != DEFAULT_PANEL_SIZE:
            raise ServiceError(
                status_code=400,
                code=ErrorCode.INVALID_REQUEST,
                message=f"MVP allows panel_size={DEFAULT_PANEL_SIZE} only.",
                details={"panel_size": panel_size},
            )
        raw_results = result.get("raw_results") or []
        if not isinstance(raw_results, list):
            raw_results = []
        available = count_option_respondents(raw_results, cohort_option)
        if available < panel_size:
            raise ServiceError(
                status_code=400,
                code=ErrorCode.INVALID_REQUEST,
                message=f"Need at least {panel_size} respondents for this option (found {available}).",
                details={"cohort_option": cohort_option, "available": available, "need": panel_size},
            )

        seed = int(payload.seed if payload.seed is not None else (run.seed or 42))
        country_id = str(getattr(run, "country_id", None) or result.get("country_id") or "kr")
        question = str(
            input_data.get("question") or (result.get("metrics") or {}).get("question") or ""
        ).strip()
        try:
            panel = select_homogenous_panel(
                raw_results,
                cohort_option=cohort_option,
                panel_size=panel_size,
                seed=seed,
                country_id=country_id,
            )
        except FocusGroupError as exc:
            raise ServiceError(
                status_code=400,
                code=ErrorCode.INVALID_REQUEST,
                message=str(exc),
                details={"cohort_option": cohort_option},
            ) from exc

        moderator_prompt = (payload.moderator_prompt or "").strip() or None
        config = {
            "simulation_type": "open_survey",
            "cohort_option": cohort_option,
            "moderator_prompt": moderator_prompt or question,
            "question": question,
            "options": options,
            "panel_size": panel_size,
            "protocol_id": PROTOCOL_ID,
            "seed": seed,
            "country_id": country_id,
            "model_alias": run.model_alias,
        }
        display_panel = [
            {
                "uuid": m["uuid"],
                "display_name": m["display_name"],
                "meta": m["meta"],
                "initial_choice": m["initial_choice"],
                "initial_reason": m["initial_reason"],
                "final_choice": None,
                "final_reason": None,
                "changed": None,
                "persona": m["persona"],
            }
            for m in panel
        ]
        progress = {
            "phase": "select_panel",
            "round": None,
            "speaker_index": 0,
            "speakers_total": panel_size,
            "done_calls": 0,
            "total_calls_est": estimate_total_calls(panel_size),
        }

        # Insert under active lock first so concurrent losers don't burn rate limit.
        try:
            record = self.store.create_focus_group_if_idle(
                user_id=user.user_id,
                project_id=project_id,
                run_id=run_id,
                config=config,
                panel=display_panel,
                progress=progress,
                stale_after_seconds=self.stale_after_seconds,
            )
        except ValueError as exc:
            if str(exc) == "focus_group_active":
                raise ServiceError(
                    status_code=409,
                    code=ErrorCode.QUEUE_BUSY,
                    message="A focus group is already queued or running for this run.",
                    details={"run_id": run_id},
                ) from exc
            raise

        try:
            consume_interactive_llm_action(
                store=self.store,
                user=user,
                action_type="focus_group",
                units=FOCUS_GROUP_RATE_LIMIT_UNITS,
            )
        except ServiceError:
            self.store.mark_focus_group_failed(
                record.focus_group_id, error="rate_limited_before_start"
            )
            raise

        self.store.record_analytics_event(
            event_name="focus_group_created",
            user=user,
            run_id=run_id,
            page="/results",
            simulation_type=run.simulation_type,
            payload={"project_id": project_id, "focus_group_id": record.focus_group_id},
        )
        self._schedule_execution(record.focus_group_id, llm_client=llm_client)
        refreshed = self.store.get_focus_group(
            user_id=user.user_id, focus_group_id=record.focus_group_id
        )
        assert refreshed is not None
        return focus_group_response(refreshed)

    def _schedule_execution(self, focus_group_id: str, *, llm_client: Any | None = None) -> None:
        if self.run_inline:
            rec = self.store.get_focus_group_by_id(focus_group_id)
            progress = dict(rec.progress or {}) if rec else {}
            progress["execution_mode"] = "inline"
            self.store.update_focus_group(focus_group_id, progress=progress)
            execute_focus_group_job(focus_group_id, store=self.store, llm_client=llm_client)
            return

        queue_ok = False
        if self.enqueue_focus_group is not None:
            try:
                from src.jobs.queue import check_queue

                health = check_queue()
                queue_ok = bool(health.get("ok"))
            except Exception:
                logger.exception("Focus group queue health check failed for %s", focus_group_id)
                queue_ok = False

            if queue_ok:
                try:
                    job_id = self.enqueue_focus_group(focus_group_id)
                    self.store.update_focus_group(
                        focus_group_id,
                        job_id=str(job_id),
                        progress={
                            **(self.store.get_focus_group_by_id(focus_group_id).progress or {}),
                            "execution_mode": "rq",
                        },
                    )
                    return
                except Exception:
                    logger.exception(
                        "Failed to enqueue focus group %s; falling back to thread",
                        focus_group_id,
                    )

        # Thread fallback: process-local — UI must not claim durable background work.
        record = self.store.get_focus_group_by_id(focus_group_id)
        progress = dict(record.progress or {}) if record else {}
        progress["execution_mode"] = "thread"
        self.store.update_focus_group(focus_group_id, progress=progress)
        sqlite_path = str(self.store.path) if getattr(self.store, "path", None) else None

        def _target() -> None:
            try:
                execute_focus_group_job(focus_group_id, sqlite_path=sqlite_path, llm_client=None)
            except Exception as exc:
                logger.exception("Focus group thread failed: %s", focus_group_id)
                try:
                    store = SQLiteRunStore(Path(sqlite_path)) if sqlite_path else SQLiteRunStore()
                    store.mark_focus_group_failed(
                        focus_group_id, error=f"thread_executor_error: {exc}"[:800]
                    )
                except Exception:
                    logger.exception(
                        "Could not mark focus group failed after thread crash: %s",
                        focus_group_id,
                    )

        threading.Thread(
            target=_target, name=f"focus-group-{focus_group_id[:8]}", daemon=True
        ).start()

    def _owned_project_run(self, user: UserRecord, project_id: str, run_id: str) -> RunRecord:
        project = self.store.get_project(project_id)
        if project is None or project.user_id != user.user_id or project.archived_at is not None:
            raise ServiceError(
                status_code=404,
                code=ErrorCode.RUN_NOT_FOUND,
                message="Project was not found.",
                details={"project_id": project_id},
            )
        link = self.store.get_project_run(project_id, run_id)
        run = self.store.get_run(run_id)
        if link is None or run is None or run.user_id != user.user_id:
            raise ServiceError(
                status_code=404,
                code=ErrorCode.RUN_NOT_FOUND,
                message="Run was not found.",
                details={"project_id": project_id, "run_id": run_id},
            )
        return run


def execute_focus_group_job(
    focus_group_id: str,
    *,
    sqlite_path: str | None = None,
    store: SQLiteRunStore | None = None,
    llm_client: Any | None = None,
) -> dict[str, Any]:
    """Worker entry: run protocol and persist progress/result (fail-closed)."""
    store = store or (SQLiteRunStore(Path(sqlite_path)) if sqlite_path else SQLiteRunStore())
    client: Any | None = llm_client
    owns_client = False
    try:
        record = store.get_focus_group_by_id(focus_group_id)
        if record is None:
            raise KeyError(focus_group_id)
        if record.status in {"completed", "failed"}:
            return {"focus_group_id": focus_group_id, "status": record.status}

        config = dict(record.config or {})
        panel = [dict(m) for m in (record.panel or [])]
        question = str(config.get("question") or "")
        options = [str(o) for o in (config.get("options") or []) if str(o).strip()]
        cohort_option = str(config.get("cohort_option") or "")
        moderator_prompt = config.get("moderator_prompt")
        model_alias = config.get("model_alias")
        if not isinstance(model_alias, str):
            model_alias = None

        if client is None:
            from src.llm.factory import create_llm_client

            client = create_llm_client()
            owns_client = True

        # Only claim running after client is ready so init failures don't stick.
        store.update_focus_group(focus_group_id, status="running")

        async def on_progress(payload: dict[str, Any]) -> None:
            store.update_focus_group(
                focus_group_id,
                status="running",
                progress={
                    "phase": payload.get("phase"),
                    "round": payload.get("round"),
                    "speaker_index": payload.get("speaker_index"),
                    "speakers_total": payload.get("speakers_total"),
                    "done_calls": payload.get("done_calls"),
                    "total_calls_est": payload.get("total_calls_est"),
                    "execution_mode": (record.progress or {}).get("execution_mode"),
                },
                panel=payload.get("panel"),
                timeline=payload.get("timeline"),
            )

        result = asyncio.run(
            run_focus_group_protocol(
                panel=panel,
                question=question,
                options=options,
                cohort_option=cohort_option,
                moderator_prompt=str(moderator_prompt) if moderator_prompt else None,
                llm_client=client,
                model_alias=model_alias,
                on_progress=on_progress,
                trace_metadata={
                    "focus_group_id": focus_group_id,
                    "run_id": record.run_id,
                    "interactive_action": "focus_group",
                },
            )
        )
        public_panel = []
        for member in result["panel"]:
            public_panel.append(
                {
                    "uuid": member.get("uuid"),
                    "display_name": member.get("display_name"),
                    "meta": member.get("meta"),
                    "initial_choice": member.get("initial_choice"),
                    "initial_reason": member.get("initial_reason"),
                    "final_choice": member.get("final_choice"),
                    "final_reason": member.get("final_reason"),
                    "changed": member.get("changed"),
                }
            )

        summary = dict(result.get("summary") or {})
        undecided = int(summary.get("undecided_count") or 0)
        empty_turns = sum(
            1
            for turn in result.get("timeline") or []
            if turn.get("role") == "participant" and not str(turn.get("text") or "").strip()
        )
        # Quality gate: all finals unparsable → failed (not a polished empty "completed").
        if undecided >= len(public_panel) and public_panel:
            store.update_focus_group(
                focus_group_id,
                status="failed",
                panel=public_panel,
                timeline=result["timeline"],
                stance_table=result["stance_table"],
                summary=summary,
                progress={
                    "phase": "failed",
                    "round": "final",
                    "speaker_index": len(public_panel),
                    "speakers_total": len(public_panel),
                    "done_calls": result.get("done_calls"),
                    "total_calls_est": result.get("total_calls_est"),
                    "execution_mode": (record.progress or {}).get("execution_mode"),
                },
                mark_completed=True,
                error="all_final_stances_unparsed",
            )
            return {
                "focus_group_id": focus_group_id,
                "status": "failed",
                "error": "all_final_stances_unparsed",
            }

        if empty_turns:
            warnings = list(summary.get("warnings") or [])
            warnings.append(f"빈 발언 {empty_turns}건이 있어 토론 품질이 낮을 수 있습니다.")
            summary["warnings"] = warnings

        store.update_focus_group(
            focus_group_id,
            status="completed",
            panel=public_panel,
            timeline=result["timeline"],
            stance_table=result["stance_table"],
            summary=summary,
            progress={
                "phase": "completed",
                "round": "summary",
                "speaker_index": len(public_panel),
                "speakers_total": len(public_panel),
                "done_calls": result.get("done_calls"),
                "total_calls_est": result.get("total_calls_est"),
                "execution_mode": (record.progress or {}).get("execution_mode"),
            },
            mark_completed=True,
            error="",
        )
        return {"focus_group_id": focus_group_id, "status": "completed"}
    except Exception as exc:
        logger.exception("Focus group failed: %s", focus_group_id)
        try:
            store.mark_focus_group_failed(focus_group_id, error=str(exc)[:800])
        except Exception:
            logger.exception("Could not persist focus group failure: %s", focus_group_id)
        return {"focus_group_id": focus_group_id, "status": "failed", "error": str(exc)}
    finally:
        if owns_client and client is not None:
            close = getattr(client, "close", None)
            if close:
                try:
                    maybe = close()
                    if asyncio.iscoroutine(maybe):
                        asyncio.run(maybe)
                except Exception:
                    pass
