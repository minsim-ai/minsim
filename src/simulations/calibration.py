"""Post-stratification calibration helpers for simulation aggregates."""
from __future__ import annotations

from collections import Counter, defaultdict
from typing import Any

from src.agent.simulator import SimResult
from src.simulations.common import pct


def apply_categorical_calibration(
    raw_results: list[SimResult],
    parsed_results: list[dict[str, Any] | None],
    *,
    metric_key: str,
    calibration: dict[str, Any] | None,
) -> dict[str, Any] | None:
    if not calibration:
        return None
    dimensions = calibration.get("dimensions")
    if not isinstance(dimensions, dict) or not dimensions:
        return None
    dimension, target_distribution = next(iter(dimensions.items()))
    if not isinstance(target_distribution, dict) or not target_distribution:
        return None

    sample_counts = Counter(
        str(raw.persona.get(dimension))
        for raw, parsed in zip(raw_results, parsed_results)
        if parsed is not None and raw.persona.get(dimension) is not None
    )
    sample_total = sum(sample_counts.values())
    if sample_total == 0:
        return {
            "dimension": dimension,
            "weighted_counts": {},
            "weighted_pct": {},
            "weights": {},
            "warnings": [f"Calibration dimension '{dimension}' is not present in parsed personas."],
        }

    target_total = sum(float(value) for value in target_distribution.values())
    if target_total <= 0:
        return {
            "dimension": dimension,
            "weighted_counts": {},
            "weighted_pct": {},
            "weights": {},
            "warnings": ["Calibration target distribution sums to zero."],
        }

    max_weight = float(calibration.get("max_weight", 4))
    weights = {}
    warnings: list[str] = []
    for label, count in sample_counts.items():
        sample_share = count / sample_total
        target_share = float(target_distribution.get(label, 0)) / target_total
        raw_weight = target_share / sample_share if sample_share else 0.0
        weight = min(max_weight, raw_weight)
        if raw_weight > max_weight:
            warnings.append(f"Calibration weight for '{label}' was capped at {max_weight:g}.")
        weights[label] = weight

    weighted_counts: defaultdict[str, float] = defaultdict(float)
    for raw, parsed in zip(raw_results, parsed_results):
        if parsed is None:
            continue
        metric_value = parsed.get(metric_key)
        if metric_value is None:
            continue
        label = str(raw.persona.get(dimension))
        weighted_counts[str(metric_value)] += weights.get(label, 0.0)

    rounded_counts = {
        label: round(value, 2)
        for label, value in sorted(weighted_counts.items(), key=lambda item: item[0])
    }
    total_weight = sum(weighted_counts.values())
    weighted_pct = {
        label: pct(value, total_weight)
        for label, value in sorted(weighted_counts.items(), key=lambda item: item[0])
    }
    return {
        "dimension": dimension,
        "sample_distribution": dict(sample_counts),
        "target_distribution": target_distribution,
        "weights": {label: round(value, 3) for label, value in weights.items()},
        "weighted_counts": rounded_counts,
        "weighted_pct": weighted_pct,
        "warnings": warnings,
    }
