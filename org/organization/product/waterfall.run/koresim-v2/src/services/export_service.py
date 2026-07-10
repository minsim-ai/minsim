from __future__ import annotations

from src.api.schemas import RunExportResponse, RunResultEnvelope


def build_run_export_response(result: RunResultEnvelope) -> RunExportResponse:
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
        human_review_required=True,
        raw_results_included=False,
        disclaimer=(
            "This export is a synthetic persona simulation report. It is not a real survey, "
            "market-share proof, demand forecast, or legally reviewed customer deliverable. "
            "Human review is required before external sharing."
        ),
    )
