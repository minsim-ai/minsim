"""C-2: per-run token usage aggregation and cost estimation."""
import json

from src.agent.simulator import SimResult
from src.jobs.result_envelope import token_usage
from src.jobs.worker import _merge_agent_token_usage
from src.services.token_costs import estimate_cost_krw, load_price_table


def _sim_result(metadata: dict | None) -> SimResult:
    return SimResult(uuid="p-1", persona={}, response="ok", metadata=metadata)


def test_token_usage_sums_single_call_metadata() -> None:
    raw = [
        _sim_result({"task_type": "persona_response", "input_tokens": 100, "output_tokens": 20, "total_tokens": 120}),
        _sim_result({"task_type": "persona_response", "input_tokens": 110, "output_tokens": 30, "total_tokens": 140}),
        _sim_result(None),
        _sim_result({"task_type": "persona_response"}),
    ]

    usage = token_usage(raw)

    assert usage["input_tokens"] == 210
    assert usage["output_tokens"] == 50
    assert usage["total_tokens"] == 260
    assert usage["llm_calls"] == 2
    assert usage["by_task_type"]["persona_response"]["llm_calls"] == 2


def test_token_usage_prefers_protocol_usage_totals() -> None:
    raw = [
        _sim_result(
            {
                "input_tokens": 100,
                "usage_totals": {
                    "input_tokens": 400,
                    "output_tokens": 90,
                    "total_tokens": 490,
                    "llm_calls": 4,
                },
                "usage_by_task_type": {
                    "pricing_response": {"input_tokens": 100, "output_tokens": 30, "total_tokens": 130, "llm_calls": 1},
                    "pricing_objection": {"input_tokens": 300, "output_tokens": 60, "total_tokens": 360, "llm_calls": 3},
                },
            }
        )
    ]

    usage = token_usage(raw)

    assert usage["input_tokens"] == 400
    assert usage["llm_calls"] == 4
    assert usage["by_task_type"]["pricing_objection"]["llm_calls"] == 3


def test_merge_agent_token_usage_adds_agent_calls() -> None:
    envelope = {
        "token_usage": {
            "input_tokens": 100,
            "output_tokens": 10,
            "total_tokens": 110,
            "llm_calls": 1,
            "by_task_type": {"persona_response": {"input_tokens": 100, "output_tokens": 10, "total_tokens": 110, "llm_calls": 1}},
        }
    }
    agent_outputs = {
        "analysis": {"usage": {"input_tokens": 50, "output_tokens": 25, "total_tokens": 75}},
        "report": {"usage": {}},
        "qa": {"mode": "fallback"},
    }

    _merge_agent_token_usage(envelope, agent_outputs)

    usage = envelope["token_usage"]
    assert usage["input_tokens"] == 150
    assert usage["output_tokens"] == 35
    assert usage["llm_calls"] == 2
    assert usage["by_task_type"]["analysis"]["llm_calls"] == 1


def test_estimate_cost_krw_uses_price_table(tmp_path) -> None:
    table_path = tmp_path / "prices.json"
    table_path.write_text(
        json.dumps(
            {
                "currency": "KRW",
                "per_million_tokens": {
                    "solar-pro2": {"input": 300, "output": 1200},
                    "default": {"input": 100, "output": 400},
                },
            }
        )
    )
    table = load_price_table(table_path)

    cost = estimate_cost_krw(
        {"input_tokens": 1_000_000, "output_tokens": 500_000}, table, "solar-pro2"
    )
    assert cost == 900.0

    fallback = estimate_cost_krw(
        {"input_tokens": 1_000_000, "output_tokens": 0}, table, "unknown-model"
    )
    assert fallback == 100.0

    assert estimate_cost_krw(None, table, "solar-pro2") is None
    assert estimate_cost_krw({"input_tokens": "x"}, table, "solar-pro2") is None


def test_load_price_table_handles_missing_file(tmp_path) -> None:
    table = load_price_table(tmp_path / "missing.json")
    assert table["per_million_tokens"] == {}
