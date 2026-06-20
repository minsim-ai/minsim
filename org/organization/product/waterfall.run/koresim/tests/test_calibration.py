from src.agent.simulator import SimResult
from src.simulations.calibration import apply_categorical_calibration


def test_apply_categorical_calibration_weights_metric_by_target_distribution() -> None:
    raw_results = [
        SimResult(uuid="p1", persona={"occupation": "마케터"}, response=""),
        SimResult(uuid="p2", persona={"occupation": "마케터"}, response=""),
        SimResult(uuid="p3", persona={"occupation": "기획자"}, response=""),
    ]
    parsed_results = [
        {"headline_intent": "구매"},
        {"headline_intent": "거부"},
        {"headline_intent": "거부"},
    ]

    calibrated = apply_categorical_calibration(
        raw_results,
        parsed_results,
        metric_key="headline_intent",
        calibration={
            "dimensions": {
                "occupation": {
                    "마케터": 0.9,
                    "기획자": 0.1,
                }
            },
            "max_weight": 3,
        },
    )

    assert calibrated["dimension"] == "occupation"
    assert calibrated["weighted_counts"] == {"거부": 1.65, "구매": 1.35}
    assert calibrated["weighted_pct"] == {"거부": 55.0, "구매": 45.0}
    assert calibrated["warnings"] == []
