"""Result envelope builders for worker output."""
from __future__ import annotations

from collections import Counter
from typing import Any

from src.api.schemas import RawPersonaResult, RunResultEnvelope, RunStatus
from src.config import DEFAULT_COUNTRY_ID, LLM_BACKEND
from src.data.datasets import get_dataset
from src.jobs.models import RunRecord
from src.simulations.common import (
    GenericSimulationResult,
    quality,
    quality_warnings,
    sample_summary,
)
from src.simulations.creative_testing import (
    CreativeResult,
    _age_bucket,
    _parse_choice,
    _parse_reason,
)


def _country_fields(run: RunRecord) -> dict[str, str | None]:
    country_id = getattr(run, "country_id", None) or DEFAULT_COUNTRY_ID
    try:
        dataset = get_dataset(country_id)
    except ValueError:
        dataset = get_dataset(DEFAULT_COUNTRY_ID)
    return {
        "country_id": dataset.country_id,
        "dataset_name": dataset.hf_id.split("/")[-1],
        "language": dataset.language,
    }


def build_creative_testing_envelope(run: RunRecord, result: CreativeResult) -> dict[str, Any]:
    raw_results = [
        _raw_persona_result(raw, len(result.creatives)).model_dump(mode="json")
        for raw in result.raw_results
    ]
    parse_success = max(0, result.total_responses - result.parse_failed)
    parse_success_rate = (
        round(parse_success / result.total_responses * 100, 1) if result.total_responses else 0.0
    )
    warnings = _quality_warnings(result, parse_success_rate)

    provider = next((raw.provider for raw in result.raw_results if raw.provider), None)
    provider_model = next((raw.provider_model for raw in result.raw_results if raw.provider_model), None)
    trace_id = next((raw.trace_id for raw in result.raw_results if raw.trace_id), None)
    resolved_model_alias = next(
        (raw.model_alias for raw in result.raw_results if raw.model_alias),
        run.model_alias or provider_model,
    )

    envelope = RunResultEnvelope(
        run_id=run.run_id,
        simulation_type=run.simulation_type,
        status=RunStatus.COMPLETED,
        seed=run.seed,
        sample_size=run.sample_size,
        total_responses=result.total_responses,
        parse_failed=result.parse_failed,
        target_filter=run.target_filter,
        sample_summary=_sample_summary(result),
        quality=_trust_quality(result.total_responses, result.parse_failed, result.raw_results),
        warnings=warnings,
        metrics={
            "creatives": result.creatives,
            "choice_counts": result.choice_counts,
            "choice_pct": result.choice_pct,
            "reasons_by_choice": result.reasons_by_choice,
        },
        segments={
            "breakdown_by_age": result.breakdown_by_age,
            "breakdown_by_sex": result.breakdown_by_sex,
            "breakdown_by_province": result.breakdown_by_province,
        },
        insights=_insights(result),
        raw_results=raw_results,
        model_alias=resolved_model_alias,
        provider=provider,
        provider_model=provider_model,
        llm_backend=_resolved_llm_backend(provider),
        trace_id=trace_id,
        token_usage=token_usage(result.raw_results),
        persona_pool=getattr(run, "persona_pool", None),
        safe_intake_summary=_safe_intake_summary(run),
        **_country_fields(run),
    )
    return envelope.model_dump(mode="json")


def build_generic_result_envelope(
    run: RunRecord, result: GenericSimulationResult
) -> dict[str, Any]:
    raw_results = [
        _generic_raw_persona_result(raw, parsed).model_dump(mode="json")
        for raw, parsed in zip(result.raw_results, result.parsed_results)
    ]
    provider = next((raw.provider for raw in result.raw_results if raw.provider), None)
    provider_model = next((raw.provider_model for raw in result.raw_results if raw.provider_model), None)
    trace_id = next((raw.trace_id for raw in result.raw_results if raw.trace_id), None)
    resolved_model_alias = next(
        (raw.model_alias for raw in result.raw_results if raw.model_alias),
        run.model_alias or provider_model,
    )
    envelope = RunResultEnvelope(
        run_id=run.run_id,
        simulation_type=run.simulation_type,
        status=RunStatus.COMPLETED,
        seed=run.seed,
        sample_size=run.sample_size,
        total_responses=result.total_responses,
        parse_failed=result.parse_failed,
        target_filter=run.target_filter,
        sample_summary=sample_summary(result.raw_results),
        quality=_trust_quality(result.total_responses, result.parse_failed, result.raw_results),
        warnings=quality_warnings(
            result.total_responses,
            result.parse_failed,
            extra=[
                "시뮬레이션 결과는 합성 페르소나 기반 추산값이며 실제 시장조사를 대체하지 않습니다."
            ],
        ),
        metrics=result.metrics,
        segments=result.segments,
        insights=result.insights,
        raw_results=raw_results,
        model_alias=resolved_model_alias,
        provider=provider,
        provider_model=provider_model,
        llm_backend=_resolved_llm_backend(provider),
        trace_id=trace_id,
        token_usage=token_usage(result.raw_results),
        persona_pool=getattr(run, "persona_pool", None),
        safe_intake_summary=_safe_intake_summary(run),
        protocol=result.protocol,
        **_country_fields(run),
    )
    return envelope.model_dump(mode="json")


_USAGE_KEYS = ("input_tokens", "output_tokens", "total_tokens", "llm_calls")


def token_usage(raw_results: list[Any]) -> dict[str, Any]:
    """Aggregate per-call token usage captured in SimResult metadata.

    Multi-step protocol results carry pre-summed ``usage_totals`` /
    ``usage_by_task_type``; single-call results carry flat token fields.
    """

    totals = {key: 0 for key in _USAGE_KEYS}
    by_task: dict[str, dict[str, int]] = {}

    def _add(bucket: dict[str, int], source: dict[str, Any]) -> None:
        for key in _USAGE_KEYS:
            value = source.get(key)
            if isinstance(value, int):
                bucket[key] = bucket.get(key, 0) + value

    for raw in raw_results:
        metadata = getattr(raw, "metadata", None)
        if not isinstance(metadata, dict):
            continue
        usage_totals = metadata.get("usage_totals")
        if isinstance(usage_totals, dict):
            _add(totals, usage_totals)
            per_task = metadata.get("usage_by_task_type")
            if isinstance(per_task, dict):
                for task, source in per_task.items():
                    if isinstance(source, dict):
                        _add(by_task.setdefault(str(task), {}), source)
            continue
        token_fields = ("input_tokens", "output_tokens", "total_tokens")
        if any(isinstance(metadata.get(key), int) for key in token_fields):
            single = {
                key: metadata[key]
                for key in token_fields
                if isinstance(metadata.get(key), int)
            }
            single["llm_calls"] = 1
            _add(totals, single)
            _add(by_task.setdefault(str(metadata.get("task_type") or "unknown"), {}), single)

    return {**totals, "by_task_type": by_task}


def build_minimal_envelope(
    run: RunRecord,
    partials: list[dict[str, Any]],
    error: dict[str, Any] | None,
    status: RunStatus,
) -> dict[str, Any]:
    """Synthesize a renderable envelope from surviving partial results.

    Used when envelope construction or post-processing fails so the results
    page always has something valid to show (D-1 invariant I1/I3).
    """

    raw_results: list[RawPersonaResult] = []
    for item in partials:
        try:
            raw_results.append(RawPersonaResult.model_validate(item))
        except Exception:
            continue
    total = len(raw_results)
    parse_failed = sum(1 for raw in raw_results if raw.error)
    quality_block = quality(total, parse_failed)
    quality_block.update(
        {
            "inference_scope": "synthetic_persona_panel_directional",
            "result_completeness": "partial",
            "review_required": True,
        }
    )
    if error:
        quality_block["degraded_reason"] = error
    envelope = RunResultEnvelope(
        run_id=run.run_id,
        simulation_type=run.simulation_type,
        status=status,
        seed=run.seed,
        sample_size=run.sample_size,
        total_responses=total,
        parse_failed=parse_failed,
        target_filter=run.target_filter,
        sample_summary=_partial_sample_summary(raw_results),
        quality=quality_block,
        warnings=[
            "시뮬레이션 후처리 중 오류가 발생해 부분 결과만 제공됩니다. 원자료(응답)는 모두 보존되어 있습니다."
        ],
        metrics={},
        segments={},
        insights=[],
        raw_results=raw_results,
        model_alias=run.model_alias,
        llm_backend=LLM_BACKEND,
        safe_intake_summary=_safe_intake_summary(run),
    )
    return envelope.model_dump(mode="json")


def mark_orchestration_degraded(envelope: dict[str, Any], exc: Exception) -> None:
    """Downgrade the agent stage in-place instead of failing the run (I2)."""

    envelope["orchestration"] = {
        "status": "degraded",
        "error": type(exc).__name__,
        "graph": {"graph_name": "result-agent-workflow/v1", "status": "degraded"},
        "agents": {},
    }
    warnings = envelope.setdefault("warnings", [])
    message = "AI 해석 단계가 실패해 집계 결과만 표시합니다. 수치 결과에는 영향이 없습니다."
    if message not in warnings:
        warnings.append(message)
    quality_block = envelope.setdefault("quality", {})
    quality_block["review_required"] = True
    if quality_block.get("overall_grade") == "A":
        quality_block["overall_grade"] = "B"


def _partial_sample_summary(raw_results: list[RawPersonaResult]) -> dict[str, Any]:
    age: Counter = Counter()
    sex: Counter = Counter()
    province: Counter = Counter()
    for raw in raw_results:
        persona = raw.persona or {}
        if isinstance(persona.get("age"), int):
            age[_age_bucket(persona["age"])] += 1
        if persona.get("sex"):
            sex[persona["sex"]] += 1
        if persona.get("province"):
            province[persona["province"]] += 1
    return {
        "actual_sample_size": len(raw_results),
        "age_buckets": dict(age),
        "sex": dict(sex),
        "province": dict(province),
    }


def _safe_intake_summary(run: RunRecord) -> dict[str, Any] | None:
    context = run.intake_context or {}
    summary = context.get("safe_intake_summary")
    return summary if isinstance(summary, dict) else None


def _resolved_llm_backend(provider: str | None) -> str:
    return provider or LLM_BACKEND


def _trust_quality(total_responses: int, parse_failed: int, raw_results: list[Any]) -> dict[str, Any]:
    base = quality(total_responses, parse_failed)
    latencies = [
        float(raw.metadata["latency_ms"])
        for raw in raw_results
        if isinstance(getattr(raw, "metadata", None), dict)
        and isinstance(raw.metadata.get("latency_ms"), int | float)
    ]
    retry_counts = [
        int(raw.metadata["retry_count"])
        for raw in raw_results
        if isinstance(getattr(raw, "metadata", None), dict)
        and isinstance(raw.metadata.get("retry_count"), int | float)
    ]
    base.update(
        {
            "inference_scope": "synthetic_persona_panel_directional",
            "panel_seed_reproducible": True,
            "llm_output_reproducible": False,
            "confidence_interval_method": "wilson_95_for_choice_share_when_rendered",
            "observability": {
                "latency_ms_avg": round(sum(latencies) / len(latencies), 1) if latencies else None,
                "retry_count_total": sum(retry_counts),
                "observed_calls": len(latencies),
            },
        }
    )
    return base


def _raw_persona_result(raw: Any, n_options: int) -> RawPersonaResult:
    parsed = _parsed_response(raw.response, n_options) if raw.response else None
    error = raw.error
    if error is None and raw.response and parsed is None:
        error = "PARSING_FAILED"
    return RawPersonaResult(
        uuid=raw.uuid,
        persona=raw.persona,
        response=raw.response,
        parsed=parsed,
        error=error,
    )


def _generic_raw_persona_result(
    raw: Any, parsed: dict[str, Any] | None
) -> RawPersonaResult:
    error = raw.error
    if error is None and raw.response and parsed is None:
        error = "PARSING_FAILED"
    return RawPersonaResult(
        uuid=raw.uuid,
        persona=raw.persona,
        response=raw.response,
        parsed=parsed,
        error=error,
    )


def _parsed_response(response: str, n_options: int) -> dict[str, str] | None:
    choice = _parse_choice(response, n_options)
    if not choice:
        return None
    return {"choice": choice, "reason": _parse_reason(response)}


def _sample_summary(result: CreativeResult) -> dict[str, Any]:
    age = Counter()
    sex = Counter()
    province = Counter()
    for raw in result.raw_results:
        persona = raw.persona
        if isinstance(persona.get("age"), int):
            age[_age_bucket(persona["age"])] += 1
        if persona.get("sex"):
            sex[persona["sex"]] += 1
        if persona.get("province"):
            province[persona["province"]] += 1
    return {
        "actual_sample_size": len(result.raw_results),
        "age_buckets": dict(age),
        "sex": dict(sex),
        "province": dict(province),
    }


def _sample_grade(total_responses: int) -> str:
    if total_responses >= 50:
        return "A"
    if total_responses >= 30:
        return "B"
    if total_responses >= 10:
        return "C"
    return "D"


def _overall_grade(parse_success_rate: float, total_responses: int) -> str:
    if total_responses > 0 and parse_success_rate == 0:
        return "D"
    if total_responses >= 20 and parse_success_rate < 15:
        return "D"
    if parse_success_rate >= 90 and total_responses >= 50:
        return "A"
    if parse_success_rate >= 85 and total_responses >= 30:
        return "B"
    if parse_success_rate >= 80 and total_responses >= 10:
        return "C"
    return "D"


def _quality_warnings(result: CreativeResult, parse_success_rate: float) -> list[str]:
    warnings: list[str] = []
    if result.total_responses < 50:
        warnings.append("Sample size is below the 50-person directional review threshold.")
    if parse_success_rate < 85:
        warnings.append("Parse success rate is below the Phase 1 target threshold.")
    if result.total_responses and result.parse_failed == result.total_responses:
        warnings.append("All persona responses failed to parse or execute.")
        warnings.append("Ranking winners and AI conclusions are suppressed until a re-run succeeds.")
    elif result.total_responses >= 20 and parse_success_rate < 15:
        warnings.append("Parse yield is too low to crown a ranking winner; treat results as unusable.")
    return warnings


def _insights(result: CreativeResult) -> list[dict[str, Any]]:
    if not result.choice_counts:
        return []
    winner, count = max(result.choice_counts.items(), key=lambda item: item[1])
    return [
        {
            "type": "top_choice",
            "title": f"Creative {winner} leads",
            "choice": winner,
            "count": count,
            "pct": result.choice_pct.get(winner, 0),
        }
    ]
