"""Simulation registry for backend execution and UI metadata."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable

from src.data.sampler import PersonaSampler, TargetFilter
from src.llm.base import LLMClientProtocol
from src.simulations.common import GenericSimulationResult
from src.simulations.creative_testing import CreativeResult, CreativeTesting
from src.simulations.generic_suite import (
    brand_perception_runner,
    campaign_strategy_runner,
    churn_prediction_runner,
    competitive_positioning_runner,
    market_segmentation_runner,
    price_optimization_runner,
    product_launch_runner,
    value_proposition_runner,
)


@dataclass(frozen=True)
class SimulationSpec:
    simulation_type: str
    label: str
    task_type: str
    runner_factory: Callable[[], Any]
    enabled: bool = True
    description: str = ""


SIMULATION_SPECS: dict[str, SimulationSpec] = {
    "creative_testing": SimulationSpec(
        simulation_type="creative_testing",
        label="Creative Testing",
        task_type="persona_response",
        runner_factory=CreativeTesting,
        description="Compare ad or message creatives across Korean synthetic personas.",
    ),
    "price_optimization": SimulationSpec(
        simulation_type="price_optimization",
        label="Price Optimization",
        task_type="pricing_response",
        runner_factory=price_optimization_runner,
        description="Estimate price preference, demand curve direction, and willingness to pay.",
    ),
    "product_launch": SimulationSpec(
        simulation_type="product_launch",
        label="Product Launch",
        task_type="launch_response",
        runner_factory=product_launch_runner,
        description="Assess initial launch appeal, purchase intent, and positioning angles.",
    ),
    "value_proposition": SimulationSpec(
        simulation_type="value_proposition",
        label="Value Proposition",
        task_type="value_prop_response",
        runner_factory=value_proposition_runner,
        description="Compare value proposition statements on clarity and persuasion.",
    ),
    "market_segmentation": SimulationSpec(
        simulation_type="market_segmentation",
        label="Market Segmentation",
        task_type="segmentation_response",
        runner_factory=market_segmentation_runner,
        description="Cluster persona answers into demand-side segments and needs.",
    ),
    "competitive_positioning": SimulationSpec(
        simulation_type="competitive_positioning",
        label="Competitive Positioning",
        task_type="positioning_response",
        runner_factory=competitive_positioning_runner,
        description="Compare products by preference share, strengths, and weaknesses.",
    ),
    "brand_perception": SimulationSpec(
        simulation_type="brand_perception",
        label="Brand Perception",
        task_type="brand_response",
        runner_factory=brand_perception_runner,
        description="Measure brand score, associations, positive themes, and negative themes.",
    ),
    "churn_prediction": SimulationSpec(
        simulation_type="churn_prediction",
        label="Churn Prediction",
        task_type="churn_response",
        runner_factory=churn_prediction_runner,
        description="Estimate retain/watch/churn intent and retention hooks.",
    ),
    "campaign_strategy": SimulationSpec(
        simulation_type="campaign_strategy",
        label="Campaign Strategy",
        task_type="campaign_response",
        runner_factory=campaign_strategy_runner,
        description="Rank channel/message combinations and expected campaign reactions.",
    ),
}


def get_simulation_spec(simulation_type: str) -> SimulationSpec:
    return SIMULATION_SPECS[simulation_type]


def enabled_simulation_types() -> list[str]:
    return [
        simulation_type
        for simulation_type, spec in SIMULATION_SPECS.items()
        if spec.enabled
    ]


def simulation_metadata() -> list[dict[str, Any]]:
    return [
        {
            "simulation_type": spec.simulation_type,
            "label": spec.label,
            "description": spec.description,
            "task_type": spec.task_type,
            "enabled": spec.enabled,
        }
        for spec in SIMULATION_SPECS.values()
    ]


async def run_registered_simulation(
    *,
    simulation_type: str,
    input_data: dict[str, Any],
    sample_size: int,
    target_filter: TargetFilter | None,
    seed: int,
    on_progress: Callable[[int, int], None] | None = None,
    on_result: Callable[[Any], None] | None = None,
    llm_client: LLMClientProtocol | None = None,
    sampler: PersonaSampler | None = None,
    model_alias: str | None = None,
    trace_metadata: dict[str, object] | None = None,
) -> CreativeResult | GenericSimulationResult:
    spec = get_simulation_spec(simulation_type)
    runner = spec.runner_factory()
    if spec.simulation_type == "creative_testing":
        return await runner.run(
            creatives=input_data["creatives"],
            sample_size=sample_size,
            target_filter=target_filter,
            seed=seed,
            on_progress=on_progress,
            on_result=on_result,
            llm_client=llm_client,
            sampler=sampler,
            model_alias=model_alias,
            trace_metadata=trace_metadata,
        )
    return await runner.run(
        input_data=input_data,
        sample_size=sample_size,
        target_filter=target_filter,
        seed=seed,
        on_progress=on_progress,
        on_result=on_result,
        llm_client=llm_client,
        sampler=sampler,
        model_alias=model_alias,
        trace_metadata=trace_metadata,
    )
