from src.api.schemas import SIMULATION_INPUT_MODELS, SimulationType
from src.simulations.registry import (
    enabled_simulation_types,
    get_simulation_spec,
    simulation_metadata,
)


def test_simulation_registry_enables_all_phase_5_simulations() -> None:
    assert set(enabled_simulation_types()) == set(SimulationType)
    assert {item["simulation_type"] for item in simulation_metadata()} == {
        item.value for item in SimulationType
    }


def test_simulation_registry_exposes_input_models_and_task_types() -> None:
    price = get_simulation_spec(SimulationType.PRICE_OPTIMIZATION)
    validated = SIMULATION_INPUT_MODELS[SimulationType.PRICE_OPTIMIZATION].model_validate(
        {
            "product_name": "커피",
            "product_description": "테이크아웃 커피",
            "price_points": [6500, 4500, 5500],
        }
    )

    assert price.task_type == "pricing_response"
    assert validated.model_dump()["price_points"] == [4500, 5500, 6500]
