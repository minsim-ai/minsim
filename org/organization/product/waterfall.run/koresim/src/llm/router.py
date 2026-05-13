"""Task-based model alias routing for Gemini and LiteLLM paths."""
from __future__ import annotations

from dataclasses import dataclass

from src.config import (
    MODEL_ANALYSIS_DEFAULT,
    MODEL_PERSONA_DEFAULT,
    MODEL_PERSONA_STRONG,
    MODEL_REPAIR_DEFAULT,
    MODEL_REPORT_DEFAULT,
)


@dataclass(frozen=True)
class ModelRoute:
    task_type: str
    model_alias: str


TASK_MODEL_ALIASES: dict[str, str] = {
    "persona_response": MODEL_PERSONA_DEFAULT,
    "pricing_response": MODEL_PERSONA_DEFAULT,
    "launch_response": MODEL_PERSONA_DEFAULT,
    "value_prop_response": MODEL_PERSONA_DEFAULT,
    "segmentation_response": MODEL_PERSONA_STRONG,
    "positioning_response": MODEL_PERSONA_DEFAULT,
    "brand_response": MODEL_PERSONA_DEFAULT,
    "churn_response": MODEL_PERSONA_STRONG,
    "campaign_response": MODEL_PERSONA_STRONG,
    "analysis": MODEL_ANALYSIS_DEFAULT,
    "report": MODEL_REPORT_DEFAULT,
    "qa": MODEL_REPAIR_DEFAULT,
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
    return ModelRoute(task_type=task_type, model_alias=model_alias)


def routing_metadata(task_type: str, requested_alias: str | None = None) -> dict[str, str]:
    route = resolve_model_route(task_type, requested_alias)
    return {
        "task_type": route.task_type,
        "model_alias": route.model_alias,
    }
