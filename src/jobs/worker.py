"""RQ worker callables for simulation jobs."""
from __future__ import annotations

import asyncio
from contextlib import suppress
from pathlib import Path
from typing import Any

from src.api.schemas import ErrorCode, RunResultEnvelope, RunStatus
from src.config import DEFAULT_COUNTRY_ID, ENABLE_LLM_AGENTS, LLM_BACKEND
from src.agent.simulator import SimResult
from src.data.sampler import PersonaSampler
from src.jobs.models import RunEventType, RunStatusValue
from src.jobs.result_envelope import (
    build_creative_testing_envelope,
    build_generic_result_envelope,
    build_minimal_envelope,
    mark_orchestration_degraded,
)
from src.jobs.store import SQLiteRunStore, _utc_now
from src.llm.base import LLMClientProtocol
from src.orchestration.agents import run_agents
from src.orchestration.agent_scoring import score_agent_outputs
from src.orchestration.llm_agents import run_llm_agent_workflow, safe_agent_input
from src.simulations.common import GenericSimulationResult
from src.simulations.opp_risk import build_opp_risk_matrix
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
        from src.data.datasets import get_dataset

        country_id = getattr(run, "country_id", None) or DEFAULT_COUNTRY_ID
        try:
            dataset = get_dataset(country_id)
        except ValueError:
            dataset = get_dataset(DEFAULT_COUNTRY_ID)
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
            country_id=dataset.country_id,
            dataset_name=dataset.hf_id.split("/")[-1],
            language=dataset.language,
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

        stride = max(1, run.total_count // 50)

        def _check_canceled() -> None:
            if store.get_run_status(run_id) == RunStatusValue.CANCELED:
                raise WorkerCanceled(run_id)

        def on_progress(done: int, total: int) -> None:
            if done % stride != 0 and done != total:
                return
            _check_canceled()
            store.update_run_status(run_id, RunStatusValue.RUNNING, done_count=done)
            store.append_event(
                run_id,
                RunEventType.PROGRESS,
                {"done_count": done, "total_count": total},
            )

        partial_buffer: list[tuple[str, dict[str, Any]]] = []

        def _flush_partials() -> None:
            if not partial_buffer:
                return
            store.upsert_partial_results_bulk(run_id, list(partial_buffer))
            store.append_event(
                run_id,
                RunEventType.PARTIAL_RESULT,
                {"count": len(partial_buffer), "last_uuid": partial_buffer[-1][0]},
            )
            partial_buffer.clear()

        def on_result(raw: SimResult) -> None:
            partial_buffer.append((raw.uuid, _partial_result(raw)))
            if len(partial_buffer) >= stride:
                _check_canceled()
                _flush_partials()

        run_country_id = getattr(run, "country_id", None) or DEFAULT_COUNTRY_ID
        active_sampler = sampler or PersonaSampler(
            country_id=run_country_id,
            pool=run.persona_pool,
        )
        try:
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
                    sampler=active_sampler,
                    model_alias=run.model_alias,
                    trace_metadata={
                        "run_id": run.run_id,
                        "simulation_type": run.simulation_type,
                        "country_id": run_country_id,
                    },
                    persona_pool=run.persona_pool,
                )
            )
        finally:
            with suppress(Exception):
                _flush_partials()

        # Phase A: aggregate envelope. Any failure degrades to a partial-based
        # minimal envelope instead of losing the run (D-1 invariants I1/I3).
        try:
            envelope = _build_envelope(run, result)
            matrix = build_opp_risk_matrix(envelope)
            if matrix:
                envelope["metrics"]["opp_risk_matrix"] = matrix
        except WorkerCanceled:
            raise
        except Exception as exc:
            envelope = build_minimal_envelope(
                run,
                store.list_partial_results(run_id),
                _worker_error(run_id, run.simulation_type, exc),
                RunStatus.COMPLETED,
            )
        store.save_result(run_id, envelope)

        # Phase B: agent workflow + quality gate. Failures degrade the
        # orchestration block; they can no longer fail the run (I2).
        try:
            agent_outputs, graph_state = _run_agent_workflow_for_envelope(envelope, llm_client)
            _apply_agent_quality_gate(envelope, agent_outputs)
            envelope["orchestration"] = {
                "status": "completed",
                "graph": graph_state,
                "agents": agent_outputs,
            }
            _merge_agent_token_usage(envelope, agent_outputs)
        except WorkerCanceled:
            raise
        except Exception as exc:
            mark_orchestration_degraded(envelope, exc)
        else:
            try:
                _save_agent_workflow_checkpoints(store, run.run_id, graph_state)
                _save_agent_runs(store, run.run_id, envelope, agent_outputs)
            except Exception:
                envelope.setdefault("warnings", []).append(
                    "에이전트 실행 기록 저장에 실패했지만 결과에는 영향이 없습니다."
                )

        with suppress(Exception):
            for raw in envelope["raw_results"]:
                store.upsert_partial_result(run_id, raw["uuid"], raw)

        store.save_result(run_id, envelope)
        with suppress(Exception):
            store.save_run_token_usage(run_id, envelope.get("token_usage"))
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
        with suppress(Exception):
            if not store.has_result(run_id):
                store.save_result(
                    run_id,
                    build_minimal_envelope(
                        run,
                        store.list_partial_results(run_id),
                        error,
                        RunStatus.FAILED,
                    ),
                )
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


def _run_agent_workflow_for_envelope(
    envelope: dict[str, Any],
    llm_client: LLMClientProtocol | None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    if not ENABLE_LLM_AGENTS:
        outputs = run_agents(envelope)
        for output in outputs.values():
            output.setdefault("mode", "deterministic")
        return outputs, {
            "graph_name": "result-agent-workflow/v1",
            "status": "completed",
            "steps": ["analysis", "report", "qa"],
            "agent_modes": {name: "deterministic" for name in outputs},
            **outputs,
        }
    return asyncio.run(run_llm_agent_workflow(envelope, llm_client=llm_client))


def _apply_agent_quality_gate(
    envelope: dict[str, Any],
    agent_outputs: dict[str, Any],
) -> None:
    quality = envelope.setdefault("quality", {})
    warnings = envelope.setdefault("warnings", [])
    fallback_agents = [
        name
        for name, output in agent_outputs.items()
        if isinstance(output, dict) and output.get("mode") == "fallback"
    ]
    qa = agent_outputs.get("qa") if isinstance(agent_outputs.get("qa"), dict) else {}
    qa_passed = qa.get("passed") is True
    qa_severity = str(qa.get("severity") or "unknown")
    review_required = bool(
        fallback_agents or not qa_passed or qa_severity in {"warning", "fail"}
    )
    quality["agent_qa"] = {
        "passed": qa_passed,
        "severity": qa_severity,
        "fallback_agents": fallback_agents,
        "review_required": review_required,
    }
    quality["review_required"] = review_required
    if fallback_agents:
        warnings.append(
            "일부 AI 분석 단계가 fallback으로 처리되었습니다: " + ", ".join(fallback_agents)
        )
    if not qa_passed:
        warnings.append("AI QA를 통과하지 못해 사람 검토가 필요합니다.")
    elif qa_severity == "warning":
        warnings.append("AI QA가 경고를 반환해 사람 검토가 필요합니다.")
    for warning in qa.get("warnings", []):
        if isinstance(warning, str) and warning and warning not in warnings:
            warnings.append(warning)
    if review_required and quality.get("overall_grade") == "A":
        quality["overall_grade"] = "B"


def _save_agent_workflow_checkpoints(
    store: SQLiteRunStore,
    run_id: str,
    graph_state: dict[str, Any],
) -> None:
    completed: dict[str, Any] = {
        "graph_name": graph_state.get("graph_name"),
        "status": "running",
        "steps": [],
    }
    for name in ("analysis", "report", "qa"):
        output = graph_state.get(name)
        if not isinstance(output, dict):
            continue
        completed[name] = output
        completed["steps"] = [*completed["steps"], name]
        completed["status"] = "completed" if name == "qa" else "running"
        store.save_orchestration_checkpoint(
            run_id=run_id,
            graph_name="result-agent-workflow/v1",
            checkpoint_name=name,
            state=dict(completed),
        )


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


def _merge_agent_token_usage(
    envelope: dict[str, Any], agent_outputs: dict[str, Any]
) -> None:
    usage = envelope.get("token_usage")
    if not isinstance(usage, dict):
        usage = {
            "input_tokens": 0,
            "output_tokens": 0,
            "total_tokens": 0,
            "llm_calls": 0,
            "by_task_type": {},
        }
        envelope["token_usage"] = usage
    by_task = usage.setdefault("by_task_type", {})
    for name, output in agent_outputs.items():
        agent_usage = output.get("usage") if isinstance(output, dict) else None
        if not isinstance(agent_usage, dict):
            continue
        bucket = by_task.setdefault(str(name), {})
        observed = False
        for key in ("input_tokens", "output_tokens", "total_tokens"):
            value = agent_usage.get(key)
            if isinstance(value, int | float):
                usage[key] = int(usage.get(key, 0)) + int(value)
                bucket[key] = int(bucket.get(key, 0)) + int(value)
                observed = True
        if observed:
            usage["llm_calls"] = int(usage.get("llm_calls", 0)) + 1
            bucket["llm_calls"] = int(bucket.get("llm_calls", 0)) + 1


def _partial_result(raw: SimResult) -> dict[str, Any]:
    return {
        "uuid": raw.uuid,
        "persona": raw.persona,
        "response": raw.response,
        "error": raw.error,
        "provider": raw.provider,
        "provider_model": raw.provider_model,
        "trace_id": raw.trace_id,
        "model_alias": raw.model_alias,
        "metadata": raw.metadata or {},
    }
