"""RQ worker callables for simulation jobs."""
from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

from src.api.schemas import ErrorCode, RunResultEnvelope, RunStatus
from src.config import ENABLE_LLM_AGENTS, LLM_BACKEND
from src.agent.simulator import SimResult
from src.jobs.models import RunEventType, RunStatusValue
from src.jobs.result_envelope import build_creative_testing_envelope, build_generic_result_envelope
from src.jobs.store import SQLiteRunStore, _utc_now
from src.llm.base import LLMClientProtocol
from src.orchestration.agents import run_agents
from src.orchestration.agent_scoring import score_agent_outputs
from src.orchestration.graph import run_scaffold
from src.orchestration.llm_agents import run_llm_agents, safe_agent_input
from src.simulations.common import GenericSimulationResult
from src.simulations.creative_testing import CreativeResult
from src.simulations.registry import run_registered_simulation


class WorkerCanceled(Exception):
    """Raised when a persisted run has been canceled while a worker is running."""


def run_noop_job(run_id: str, sqlite_path: str | None = None) -> dict[str, Any]:
    """Gate 1C placeholder job.

    Gate 1D replaces this with the Creative Testing adapter. Keeping this job
    real enough lets us validate RQ, SQLite, restart recovery, and API reads.
    """

    store = SQLiteRunStore(Path(sqlite_path)) if sqlite_path else SQLiteRunStore()
    run = store.get_run(run_id)
    if run is None:
        raise KeyError(run_id)
    if run.status == RunStatusValue.CANCELED:
        return {"run_id": run_id, "status": RunStatusValue.CANCELED.value}

    try:
        started_at = _utc_now()
        store.update_run_status(
            run_id,
            RunStatusValue.RUNNING,
            done_count=0,
            started_at=started_at,
        )
        store.append_event(run_id, RunEventType.RUNNING, {"started_at": started_at})

        completed_at = _utc_now()
        result = RunResultEnvelope(
            run_id=run.run_id,
            simulation_type=run.simulation_type,
            status=RunStatus.COMPLETED,
            seed=run.seed,
            sample_size=run.sample_size,
            total_responses=0,
            parse_failed=0,
            target_filter=run.target_filter,
            sample_summary={"status": "noop", "sample_size": run.sample_size},
            quality={"status": "not_evaluated", "reason": "noop_worker"},
            warnings=["Gate 1C no-op worker completed without executing simulation."],
            metrics={},
            segments={},
            insights=[],
            raw_results=[],
            model_alias=run.model_alias,
            llm_backend=LLM_BACKEND,
        ).model_dump(mode="json")

        store.save_result(run_id, result)
        store.update_run_status(
            run_id,
            RunStatusValue.COMPLETED,
            done_count=run.total_count,
            completed_at=completed_at,
        )
        if run.user_id:
            store.complete_free_run(run.user_id, run.run_id, reason="run_completed")
        store.append_event(run_id, RunEventType.COMPLETED, {"completed_at": completed_at})
        return {"run_id": run_id, "status": RunStatusValue.COMPLETED.value}
    except Exception as exc:
        error = {
            "code": ErrorCode.INTERNAL_ERROR.value,
            "message": str(exc),
            "details": {"run_id": run_id, "worker": "noop"},
        }
        store.update_run_status(
            run_id,
            RunStatusValue.FAILED,
            completed_at=_utc_now(),
            error=error,
        )
        store.append_event(run_id, RunEventType.FAILED, error)
        raise


def run_creative_testing_job(
    run_id: str,
    sqlite_path: str | None = None,
    llm_client: LLMClientProtocol | None = None,
    sampler: Any | None = None,
) -> dict[str, Any]:
    """Run a Creative Testing simulation and persist a full result envelope."""

    return run_simulation_job(
        run_id=run_id,
        sqlite_path=sqlite_path,
        llm_client=llm_client,
        sampler=sampler,
    )


def run_simulation_job(
    run_id: str,
    sqlite_path: str | None = None,
    llm_client: LLMClientProtocol | None = None,
    sampler: Any | None = None,
) -> dict[str, Any]:
    """Run any registered simulation and persist a full result envelope."""

    store = SQLiteRunStore(Path(sqlite_path)) if sqlite_path else SQLiteRunStore()
    run = store.get_run(run_id)
    if run is None:
        raise KeyError(run_id)
    if run.status == RunStatusValue.CANCELED:
        return {"run_id": run_id, "status": RunStatusValue.CANCELED.value}

    try:
        started_at = _utc_now()
        store.update_run_status(
            run_id,
            RunStatusValue.RUNNING,
            done_count=0,
            started_at=started_at,
        )
        store.append_event(run_id, RunEventType.RUNNING, {"started_at": started_at})

        def on_progress(done: int, total: int) -> None:
            if store.get_run(run_id).status == RunStatusValue.CANCELED:
                raise WorkerCanceled(run_id)
            store.update_run_status(run_id, RunStatusValue.RUNNING, done_count=done)
            store.append_event(
                run_id,
                RunEventType.PROGRESS,
                {"done_count": done, "total_count": total},
            )

        def on_result(raw: SimResult) -> None:
            if store.get_run(run_id).status == RunStatusValue.CANCELED:
                raise WorkerCanceled(run_id)
            store.upsert_partial_result(run_id, raw.uuid, _partial_result(raw))
            store.append_event(run_id, RunEventType.PARTIAL_RESULT, {"uuid": raw.uuid})

        result = asyncio.run(
            run_registered_simulation(
                simulation_type=run.simulation_type,
                input_data=run.input,
                sample_size=run.sample_size,
                target_filter=run.target_filter,
                seed=run.seed,
                on_progress=on_progress,
                on_result=on_result,
                llm_client=llm_client,
                sampler=sampler,
                model_alias=run.model_alias,
            )
        )

        envelope = _build_envelope(run, result)
        graph_result = {
            "total_responses": envelope["total_responses"],
            "parse_failed": envelope["parse_failed"],
            "quality": envelope["quality"],
            "metrics": envelope["metrics"],
        }
        agent_outputs = _run_agents_for_envelope(envelope, llm_client)
        graph_state = run_scaffold(
            {
                "run_id": run.run_id,
                "simulation_type": run.simulation_type,
                "status": "completed",
                "input": run.input,
                "result": graph_result,
            }
        )
        envelope["orchestration"] = {
            "graph": graph_state,
            "agents": agent_outputs,
        }
        store.save_orchestration_checkpoint(
            run_id=run.run_id,
            graph_name="run_scaffold",
            checkpoint_name="qa",
            state=graph_state,
        )
        _save_agent_runs(store, run.run_id, envelope, agent_outputs)
        for raw in envelope["raw_results"]:
            store.upsert_partial_result(run_id, raw["uuid"], raw)

        store.save_result(run_id, envelope)
        completed_at = _utc_now()
        store.update_run_status(
            run_id,
            RunStatusValue.COMPLETED,
            done_count=run.total_count,
            completed_at=completed_at,
        )
        if run.user_id:
            store.complete_free_run(run.user_id, run.run_id, reason="run_completed")
        store.append_event(run_id, RunEventType.COMPLETED, {"completed_at": completed_at})
        return {"run_id": run_id, "status": RunStatusValue.COMPLETED.value}
    except WorkerCanceled:
        canceled_at = _utc_now()
        store.update_run_status(
            run_id,
            RunStatusValue.CANCELED,
            completed_at=canceled_at,
        )
        store.append_event(run_id, RunEventType.CANCELED, {"canceled_at": canceled_at})
        return {"run_id": run_id, "status": RunStatusValue.CANCELED.value}
    except Exception as exc:
        error = _worker_error(run_id, run.simulation_type, exc)
        store.update_run_status(
            run_id,
            RunStatusValue.FAILED,
            completed_at=_utc_now(),
            error=error,
        )
        store.append_event(run_id, RunEventType.FAILED, error)
        raise


def _build_envelope(
    run: Any,
    result: CreativeResult | GenericSimulationResult,
) -> dict[str, Any]:
    if isinstance(result, CreativeResult):
        return build_creative_testing_envelope(run, result)
    return build_generic_result_envelope(run, result)


def _run_agents_for_envelope(
    envelope: dict[str, Any],
    llm_client: LLMClientProtocol | None,
) -> dict[str, Any]:
    if not ENABLE_LLM_AGENTS:
        return run_agents(envelope)
    return asyncio.run(run_llm_agents(envelope, llm_client=llm_client))


def _save_agent_runs(
    store: SQLiteRunStore,
    run_id: str,
    envelope: dict[str, Any],
    agent_outputs: dict[str, Any],
) -> None:
    safe_input = safe_agent_input(envelope)
    forbidden_terms = _forbidden_agent_terms(envelope)
    scores = score_agent_outputs(
        agent_outputs,
        forbidden_terms=forbidden_terms,
        safe_input=safe_input,
    )
    for agent_name in ("analysis", "report", "qa"):
        output = agent_outputs.get(agent_name)
        if not isinstance(output, dict):
            continue
        store.save_agent_run(
            run_id=run_id,
            agent_name=agent_name,
            task_type=str(output.get("task_type") or agent_name),
            prompt_version=str(output.get("prompt_version") or "unknown"),
            mode=str(output.get("mode") or "unknown"),
            safe_input=safe_input,
            output=output,
            scores=scores.get(agent_name, {}),
            provider=output.get("provider") if isinstance(output.get("provider"), str) else None,
            provider_model=(
                output.get("provider_model") if isinstance(output.get("provider_model"), str) else None
            ),
            trace_id=output.get("trace_id") if isinstance(output.get("trace_id"), str) else None,
        )


def _forbidden_agent_terms(envelope: dict[str, Any]) -> list[str]:
    terms: list[str] = ["raw_results"]
    for raw in envelope.get("raw_results", []):
        if not isinstance(raw, dict):
            continue
        for key in ("uuid", "response"):
            value = raw.get(key)
            if isinstance(value, str) and len(value) >= 8:
                terms.append(value[:160])
        persona = raw.get("persona")
        if isinstance(persona, dict):
            for key in ("uuid", "professional_persona", "family_persona", "persona"):
                value = persona.get(key)
                if isinstance(value, str) and len(value) >= 8:
                    terms.append(value[:160])
    return terms[:100]


def _worker_error(run_id: str, simulation_type: str, exc: Exception) -> dict[str, Any]:
    if "Unsupported simulation type" in str(exc):
        code = ErrorCode.UNSUPPORTED_SIMULATION_TYPE
    elif "필터 조건에 해당하는 페르소나가 없습니다" in str(exc):
        code = ErrorCode.NO_PERSONAS_MATCH_FILTER
    elif "LLM_TIMEOUT" in str(exc):
        code = ErrorCode.LLM_TIMEOUT
    else:
        code = ErrorCode.INTERNAL_ERROR

    return {
        "code": code.value,
        "message": str(exc),
        "details": {
            "run_id": run_id,
            "simulation_type": simulation_type,
            "worker": "simulation",
        },
    }


def _partial_result(raw: SimResult) -> dict[str, Any]:
    return {
        "uuid": raw.uuid,
        "persona": raw.persona,
        "response": raw.response,
        "error": raw.error,
        "provider": raw.provider,
        "provider_model": raw.provider_model,
        "trace_id": raw.trace_id,
    }
