"""Result envelope builders for worker output."""
from __future__ import annotations

from collections import Counter
from typing import Any

from src.api.schemas import RawPersonaResult, RunResultEnvelope, RunStatus
from src.config import LLM_BACKEND
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
        quality={
            "parse_success_rate": parse_success_rate,
            "sample_quality_grade": _sample_grade(result.total_responses),
            "overall_grade": _overall_grade(parse_success_rate, result.total_responses),
        },
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
        model_alias=run.model_alias,
        provider=provider,
        provider_model=provider_model,
        llm_backend=_resolved_llm_backend(provider),
        trace_id=trace_id,
        safe_intake_summary=_safe_intake_summary(run),
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
        quality=quality(result.total_responses, result.parse_failed),
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
        model_alias=run.model_alias,
        provider=provider,
        provider_model=provider_model,
        llm_backend=_resolved_llm_backend(provider),
        trace_id=trace_id,
        safe_intake_summary=_safe_intake_summary(run),
        protocol=result.protocol,
    )
    return envelope.model_dump(mode="json")


def _safe_intake_summary(run: RunRecord) -> dict[str, Any] | None:
    context = run.intake_context or {}
    summary = context.get("safe_intake_summary")
    return summary if isinstance(summary, dict) else None


def _resolved_llm_backend(provider: str | None) -> str:
    return provider or LLM_BACKEND


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
        warnings.append("Sample size is below the Phase 1 external demo maximum of 50.")
    if parse_success_rate < 85:
        warnings.append("Parse success rate is below the Phase 1 target threshold.")
    if result.total_responses and result.parse_failed == result.total_responses:
        warnings.append("All persona responses failed to parse or execute.")
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
