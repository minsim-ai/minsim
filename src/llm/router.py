"""Provider-neutral task-based model alias routing."""
from __future__ import annotations

from dataclasses import dataclass

from src.config import (
    AGENT_EXTRA_BODY,
    ALLOWED_MODEL_ALIASES,
    MODEL_ANALYSIS_DEFAULT,
    MODEL_PERSONA_DEFAULT,
    MODEL_PERSONA_STRONG,
    MODEL_REPAIR_DEFAULT,
    MODEL_REPORT_DEFAULT,
)

_AGENT_EXTRA_BODY_TASKS = frozenset({"analysis", "report", "qa", "schema_repair"})


@dataclass(frozen=True)
class ModelRoute:
    task_type: str
    model_alias: str
    extra_body: dict[str, object] | None = None


TASK_MODEL_ALIASES: dict[str, str] = {
    "persona_response": MODEL_PERSONA_DEFAULT,
    "pricing_response": MODEL_PERSONA_DEFAULT,
    "pricing_objection": MODEL_PERSONA_STRONG,
    "pricing_anchor": MODEL_PERSONA_STRONG,
    "pricing_hesitation": MODEL_PERSONA_STRONG,
    "launch_response": MODEL_PERSONA_DEFAULT,
    "value_prop_response": MODEL_PERSONA_DEFAULT,
    "product_qa_response": MODEL_PERSONA_DEFAULT,
    "segmentation_response": MODEL_PERSONA_STRONG,
    "positioning_response": MODEL_PERSONA_DEFAULT,
    "brand_response": MODEL_PERSONA_DEFAULT,
    "churn_response": MODEL_PERSONA_STRONG,
    "campaign_response": MODEL_PERSONA_STRONG,
    "validation_response": MODEL_PERSONA_DEFAULT,
    # Structured startup V2 benefits from the stronger model (JSON contract).
    "validation_structured_response": MODEL_PERSONA_STRONG,
    "validation_competition": MODEL_PERSONA_DEFAULT,
    "validation_acceptance": MODEL_PERSONA_DEFAULT,
    "validation_objection": MODEL_PERSONA_STRONG,
    "intake_autofill": MODEL_PERSONA_STRONG,
    "analysis": MODEL_ANALYSIS_DEFAULT,
    "report": MODEL_REPORT_DEFAULT,
    "qa": MODEL_ANALYSIS_DEFAULT,
    "schema_repair": MODEL_REPAIR_DEFAULT,
}

PUBLIC_MODEL_ALIASES: dict[str, str] = {
    "persona_default": MODEL_PERSONA_DEFAULT,
    "persona_strong": MODEL_PERSONA_STRONG,
    "analysis_default": MODEL_ANALYSIS_DEFAULT,
    "report_default": MODEL_REPORT_DEFAULT,
    "schema_repair": MODEL_REPAIR_DEFAULT,
}


def resolve_model_route(
    task_type: str,
    requested_alias: str | None = None,
) -> ModelRoute:
    """Return the alias to send to the LLM gateway for a task.

    Explicit run-level aliases win. Otherwise tasks map to env-configurable aliases.
    """

    model_alias = requested_alias or TASK_MODEL_ALIASES.get(task_type, MODEL_PERSONA_DEFAULT)
    extra_body = (
        dict(AGENT_EXTRA_BODY)
        if AGENT_EXTRA_BODY and task_type in _AGENT_EXTRA_BODY_TASKS
        else None
    )
    return ModelRoute(task_type=task_type, model_alias=model_alias, extra_body=extra_body)


def allowed_model_aliases() -> tuple[str, ...]:
    """Return operator-configured aliases accepted from run requests."""

    return tuple(sorted(ALLOWED_MODEL_ALIASES))


def validate_requested_model_alias(model_alias: str) -> str:
    """Validate an untrusted run-level model override at the API boundary."""

    resolved = PUBLIC_MODEL_ALIASES.get(model_alias, model_alias)
    if resolved not in ALLOWED_MODEL_ALIASES:
        raise ValueError(f"Model alias is not allowed: {model_alias}")
    return resolved


def routing_metadata(task_type: str, requested_alias: str | None = None) -> dict[str, str]:
    route = resolve_model_route(task_type, requested_alias)
    return {
        "task_type": route.task_type,
        "model_alias": route.model_alias,
    }
