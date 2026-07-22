"""Token cost estimation from the checked-in public price table."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from src.config import MODEL_PRICE_TABLE_PATH


def load_price_table(path: Path | None = None) -> dict[str, Any]:
    table_path = path or MODEL_PRICE_TABLE_PATH
    try:
        loaded = json.loads(Path(table_path).read_text())
    except (OSError, json.JSONDecodeError):
        return {"currency": "KRW", "per_million_tokens": {}}
    return loaded if isinstance(loaded, dict) else {"currency": "KRW", "per_million_tokens": {}}


def price_for_model(price_table: dict[str, Any], model_alias: str | None) -> dict[str, float]:
    prices = price_table.get("per_million_tokens")
    if not isinstance(prices, dict):
        return {"input": 0.0, "output": 0.0}
    entry = prices.get(model_alias or "") or prices.get("default") or {}
    return {
        "input": float(entry.get("input", 0) or 0),
        "output": float(entry.get("output", 0) or 0),
    }


def estimate_cost_krw(
    token_usage: dict[str, Any] | None,
    price_table: dict[str, Any],
    model_alias: str | None,
) -> float | None:
    """Estimate run cost in KRW; None when usage or prices are unavailable."""

    if not isinstance(token_usage, dict):
        return None
    input_tokens = token_usage.get("input_tokens")
    output_tokens = token_usage.get("output_tokens")
    if not isinstance(input_tokens, int) or not isinstance(output_tokens, int):
        return None
    price = price_for_model(price_table, model_alias)
    if price["input"] <= 0 and price["output"] <= 0:
        return None
    cost = (input_tokens / 1_000_000) * price["input"] + (
        output_tokens / 1_000_000
    ) * price["output"]
    return round(cost, 2)
