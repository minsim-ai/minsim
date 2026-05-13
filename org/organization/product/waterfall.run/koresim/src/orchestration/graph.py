"""Run-level LangGraph scaffold for Phase 7 orchestration."""
from __future__ import annotations

from collections.abc import Callable
from typing import Any, TypedDict

from langgraph.graph import END, START, StateGraph

from src.config import ENABLE_LANGGRAPH


class RunGraphState(TypedDict, total=False):
    run_id: str
    simulation_type: str
    status: str
    input: dict[str, Any]
    metadata: dict[str, Any]
    steps: list[str]
    result: dict[str, Any]
    analysis: dict[str, Any]
    report: dict[str, Any]
    qa: dict[str, Any]


def _append_step(state: RunGraphState, step: str) -> RunGraphState:
    next_state = dict(state)
    next_state["steps"] = [*next_state.get("steps", []), step]
    return next_state


def _prepare(state: RunGraphState) -> RunGraphState:
    next_state = _append_step(state, "prepare")
    next_state["status"] = next_state.get("status", "prepared")
    return next_state


def _execute(state: RunGraphState) -> RunGraphState:
    return _append_step(state, "execute")


def _analyze(state: RunGraphState) -> RunGraphState:
    next_state = _append_step(state, "analyze")
    result = next_state.get("result", {})
    next_state["analysis"] = {
        "simulation_type": next_state.get("simulation_type"),
        "metric_keys": sorted(result.get("metrics", {}).keys()) if result else [],
    }
    return next_state


def _report(state: RunGraphState) -> RunGraphState:
    next_state = _append_step(state, "report")
    next_state["report"] = {
        "status": next_state.get("status"),
        "quality": next_state.get("result", {}).get("quality", {}),
    }
    return next_state


def _qa(state: RunGraphState) -> RunGraphState:
    next_state = _append_step(state, "qa")
    result = next_state.get("result", {})
    total = int(result.get("total_responses") or 0) if result else 0
    parse_failed = int(result.get("parse_failed") or 0) if result else 0
    next_state["qa"] = {"passed": total == 0 or parse_failed < total}
    return next_state


def build_run_graph():
    graph = StateGraph(RunGraphState)
    graph.add_node("prepare", _prepare)
    graph.add_node("execute", _execute)
    graph.add_node("analyze", _analyze)
    graph.add_node("report", _report)
    graph.add_node("qa", _qa)
    graph.add_edge(START, "prepare")
    graph.add_edge("prepare", "execute")
    graph.add_edge("execute", "analyze")
    graph.add_edge("analyze", "report")
    graph.add_edge("report", "qa")
    graph.add_edge("qa", END)
    return graph.compile()


def run_scaffold(state: RunGraphState) -> RunGraphState:
    if not ENABLE_LANGGRAPH:
        return _qa(_report(_analyze(_execute(_prepare(state)))))
    graph = build_run_graph()
    return graph.invoke(state)


def run_execution_graph(
    state: RunGraphState,
    execute: Callable[[RunGraphState], RunGraphState],
) -> RunGraphState:
    """Run the deterministic execution graph with a caller-supplied execute node."""

    prepared = _prepare(state)
    executed = execute(_execute(prepared))
    return _qa(_report(_analyze(executed)))
