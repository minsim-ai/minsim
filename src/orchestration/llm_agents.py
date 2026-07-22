"""LLM-backed run-level agents for analysis, reporting, and QA."""
from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, TypedDict

from langgraph.graph import END, START, StateGraph

from src.llm.base import LLMClientProtocol, LLMMessage, LLMRequest, LLMResponse
from src.llm.factory import create_llm_client
from src.llm.router import resolve_model_route
from src.orchestration.agents import run_agents

SAFE_RESULT_KEYS = (
    "run_id",
    "simulation_type",
    "seed",
    "sample_size",
    "total_responses",
    "parse_failed",
    "target_filter",
    "sample_summary",
    "quality",
    "warnings",
    "metrics",
    "segments",
    "insights",
    "model_alias",
    "provider",
    "provider_model",
    "llm_backend",
    "trace_id",
    "safe_intake_summary",
)


@dataclass(frozen=True)
class AgentSpec:
    name: str
    task_type: str
    prompt_version: str
    system_prompt: str


AGENT_SPECS = (
    AgentSpec(
        name="analysis",
        task_type="analysis",
        prompt_version="analysis:v3-20260716",
        system_prompt=(
            "당신은 KoreaSim의 분석 에이전트입니다. 반드시 한국어 JSON만 반환하세요. "
            "원문 페르소나가 아니라 제공된 aggregate result만 근거로 사용하세요. "
            "safe_intake_summary가 있으면 사용자 목표와 검토된 가정을 해석 맥락으로만 사용하세요. "
            "schema: {summary: string, key_findings: [{metric_key: string, finding: string, "
            "evidence: string, confidence: number}], segment_notes: [{segment_key: string, "
            "note: string, evidence: string}], generation_verdicts: [{segment_key: string, "
            "verdict: '매력적'|'조건부'|'보류', rationale: string, confidence: number}], "
            "overall_verdict: {verdict: '매력적'|'조건부'|'보류', rationale: string}}. "
            "metrics.opp_risk_matrix가 있으면 그 rows의 세그먼트(연령대)마다 5개 지표"
            "(수용도·니즈 강도·가격 저항·신뢰 우려·경쟁 압력)를 하나로 종합한 판정을 "
            "generation_verdicts에 쓰고, rationale은 지표별 개별 해석이 아니라 5개 지표 전체를 "
            "묶은 1~2문장으로 쓰세요. opp_risk_matrix가 없으면 generation_verdicts는 빈 배열로 두세요. "
            "metric_key에는 집계 지표 식별자만 쓰고, "
            "evidence에는 사용자가 읽을 한국어 한 줄 근거를 쓰세요 "
            "(예: 「특별한 기념품 제작」 니즈 9건). needs.count= 같은 기계 키 문법은 쓰지 마세요. "
            "근거 없는 사실은 만들지 마세요."
        ),
    ),
    AgentSpec(
        name="report",
        task_type="report",
        prompt_version="report:v2-20260512",
        system_prompt=(
            "당신은 KoreaSim의 리포트 에이전트입니다. 반드시 한국어 JSON만 반환하세요. "
            "schema: {headline: string, recommendations: [{priority: 'high'|'medium'|'low', "
            "action: string, reason: string}], risks: [{severity: 'high'|'medium'|'low', "
            "risk: string, mitigation: string}]}. 모든 권고와 리스크는 aggregate result와 "
            "prior analysis에 근거해야 하며, safe_intake_summary의 사용자 목표와 충돌하지 않게 쓰세요. "
            "실행 액션과 이유를 분리하세요."
        ),
    ),
    AgentSpec(
        name="qa",
        task_type="qa",
        prompt_version="qa:v3-20260716",
        system_prompt=(
            "당신은 KoreaSim의 QA 에이전트입니다. 반드시 한국어 JSON만 반환하세요. "
            "schema: {passed: boolean, severity: 'pass'|'directional_only'|'warning'|'fail', "
            "warnings: string[], review_notes: string[], confidence: number}. "
            "표본 수가 30 미만이면 품질 실패로 단정하지 말고 severity를 directional_only로 두고 "
            "방향성 검증 한계를 설명하세요. parse failures나 근거 없는 결론은 warning/fail로 표시하세요. "
            "prior analysis에 generation_verdicts가 있으면 각 segment_key가 "
            "metrics.opp_risk_matrix.rows와 일치하는지, 판정이 지표 방향과 모순되지 않는지 점검하세요."
        ),
    ),
)


class AgentWorkflowState(TypedDict, total=False):
    context: dict[str, Any]
    outputs: dict[str, dict[str, Any]]
    steps: list[str]
    status: str


async def run_llm_agents(
    result: dict[str, Any],
    *,
    llm_client: LLMClientProtocol | None = None,
) -> dict[str, dict[str, Any]]:
    """Run LLM analysis/report/QA agents with deterministic fallback."""

    outputs, _ = await run_llm_agent_workflow(result, llm_client=llm_client)
    return outputs


async def run_llm_agent_workflow(
    result: dict[str, Any],
    *,
    llm_client: LLMClientProtocol | None = None,
) -> tuple[dict[str, dict[str, Any]], dict[str, Any]]:
    """Execute Analysis → Report → QA as the actual run-level LangGraph."""

    owns_client = llm_client is None
    client = llm_client or create_llm_client()
    fallback = run_agents(result)
    # Do not ask the LLM to invent winners when parse yield is unusable.
    if all(
        isinstance(output, dict) and output.get("mode") == "fail_closed"
        for output in fallback.values()
    ):
        graph_state = {
            "graph_name": "result-agent-workflow/v1",
            "status": "fail_closed",
            "steps": ["analysis", "report", "qa"],
            "agent_modes": {name: "fail_closed" for name in fallback},
            "analysis": fallback.get("analysis", {}),
            "report": fallback.get("report", {}),
            "qa": fallback.get("qa", {}),
        }
        if owns_client:
            close = getattr(client, "close", None)
            if close:
                await close()
        return fallback, graph_state
    context = _safe_result_context(result)
    try:
        graph = _build_agent_workflow(client, fallback)
        state = await graph.ainvoke(
            AgentWorkflowState(context=context, outputs={}, steps=[], status="running")
        )
        outputs = state.get("outputs", {})
        graph_state = {
            "graph_name": "result-agent-workflow/v1",
            "status": state.get("status", "completed"),
            "steps": state.get("steps", []),
            "agent_modes": {
                name: output.get("mode", "unknown")
                for name, output in outputs.items()
                if isinstance(output, dict)
            },
            "analysis": outputs.get("analysis", {}),
            "report": outputs.get("report", {}),
            "qa": outputs.get("qa", {}),
        }
        return outputs, graph_state
    finally:
        if owns_client:
            close = getattr(client, "close", None)
            if close:
                await close()


def _build_agent_workflow(
    client: LLMClientProtocol,
    fallback: dict[str, dict[str, Any]],
):
    graph = StateGraph(AgentWorkflowState)

    async def run_node(state: AgentWorkflowState, spec: AgentSpec) -> AgentWorkflowState:
        outputs = dict(state.get("outputs", {}))
        try:
            response = await _call_agent(client, spec, state.get("context", {}), outputs)
            parsed = _parse_json_object(response.content)
            outputs[spec.name] = _normalize_agent_output(spec, parsed, response)
        except Exception as exc:
            outputs[spec.name] = _fallback_agent_output(spec, fallback, exc)
        return {
            **state,
            "outputs": outputs,
            "steps": [*state.get("steps", []), spec.name],
            "status": "completed" if spec.name == "qa" else "running",
        }

    async def analysis_node(state: AgentWorkflowState) -> AgentWorkflowState:
        return await run_node(state, AGENT_SPECS[0])

    async def report_node(state: AgentWorkflowState) -> AgentWorkflowState:
        return await run_node(state, AGENT_SPECS[1])

    async def qa_node(state: AgentWorkflowState) -> AgentWorkflowState:
        return await run_node(state, AGENT_SPECS[2])

    graph.add_node("analysis", analysis_node)
    graph.add_node("report", report_node)
    graph.add_node("qa", qa_node)
    graph.add_edge(START, "analysis")
    graph.add_edge("analysis", "report")
    graph.add_edge("report", "qa")
    graph.add_edge("qa", END)
    return graph.compile()


async def _call_agent(
    client: LLMClientProtocol,
    spec: AgentSpec,
    context: dict[str, Any],
    prior_outputs: dict[str, dict[str, Any]],
) -> LLMResponse:
    route = resolve_model_route(spec.task_type)
    return await client.generate(
        LLMRequest(
            task_type=spec.task_type,
            model_alias=route.model_alias,
            temperature=0.2,
            extra_body=route.extra_body,
            messages=[
                LLMMessage(role="system", content=spec.system_prompt),
                LLMMessage(
                    role="user",
                    content=json.dumps(
                        {
                            "result": context,
                            "prior_agents": _public_prior_outputs(prior_outputs),
                        },
                        ensure_ascii=False,
                        sort_keys=True,
                    ),
                ),
            ],
            metadata={
                "run_id": context.get("run_id"),
                "simulation_type": context.get("simulation_type"),
                "agent_name": spec.name,
                "task_type": spec.task_type,
                "model_alias": route.model_alias,
                "prompt_version": spec.prompt_version,
            },
        )
    )


def _safe_result_context(result: dict[str, Any]) -> dict[str, Any]:
    return {key: result[key] for key in SAFE_RESULT_KEYS if key in result}


def safe_agent_input(result: dict[str, Any]) -> dict[str, Any]:
    """Return the aggregate-only result view allowed in agent prompts/storage."""

    return _safe_result_context(result)


def _public_prior_outputs(outputs: dict[str, dict[str, Any]]) -> dict[str, dict[str, Any]]:
    public: dict[str, dict[str, Any]] = {}
    for name, output in outputs.items():
        public[name] = {
            key: value
            for key, value in output.items()
            if key not in {"provider", "provider_model", "trace_id", "fallback_reason", "usage"}
        }
    return public


def _parse_json_object(content: str) -> dict[str, Any]:
    try:
        parsed = json.loads(content)
    except json.JSONDecodeError:
        start = content.find("{")
        end = content.rfind("}")
        if start < 0 or end <= start:
            raise
        parsed = json.loads(content[start : end + 1])
    if not isinstance(parsed, dict):
        raise ValueError("LLM agent response must be a JSON object.")
    return parsed


def _normalize_agent_output(
    spec: AgentSpec,
    parsed: dict[str, Any],
    response: LLMResponse,
) -> dict[str, Any]:
    if spec.name == "analysis":
        payload = {
            "summary": _string(parsed.get("summary")),
            "key_findings": _finding_list(parsed.get("key_findings")),
            "segment_notes": _segment_note_list(parsed.get("segment_notes")),
            "generation_verdicts": _verdict_list(parsed.get("generation_verdicts")),
            "overall_verdict": _overall_verdict(parsed.get("overall_verdict")),
        }
    elif spec.name == "report":
        payload = {
            "headline": _string(parsed.get("headline")),
            "recommendations": _recommendation_list(parsed.get("recommendations")),
            "risks": _risk_list(parsed.get("risks")),
        }
    else:
        payload = {
            "passed": bool(parsed.get("passed")),
            "severity": _enum_string(
                parsed.get("severity"),
                allowed=("pass", "directional_only", "warning", "fail"),
                default="warning",
            ),
            "warnings": _string_list(parsed.get("warnings")),
            "review_notes": _string_list(parsed.get("review_notes")),
            "confidence": _confidence(parsed.get("confidence")),
        }
    usage = {
        key: response.metadata.get(key)
        for key in ("input_tokens", "output_tokens", "total_tokens", "latency_ms")
        if isinstance(response.metadata.get(key), int | float)
    }
    return {
        "agent": spec.name,
        "mode": "llm",
        "task_type": spec.task_type,
        "prompt_version": spec.prompt_version,
        **payload,
        "provider": response.provider,
        "provider_model": response.provider_model,
        "trace_id": response.trace_id,
        "usage": usage,
    }


_VERDICT_VALUES = ("매력적", "조건부", "보류")


def _verdict_list(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    verdicts: list[dict[str, Any]] = []
    for item in value[:12]:
        if not isinstance(item, dict):
            continue
        segment_key = item.get("segment_key")
        verdict = item.get("verdict")
        rationale = item.get("rationale")
        if not isinstance(segment_key, str) or not segment_key.strip():
            continue
        if verdict not in _VERDICT_VALUES:
            continue
        if not isinstance(rationale, str) or not rationale.strip():
            continue
        verdicts.append(
            {
                "segment_key": segment_key.strip(),
                "verdict": verdict,
                "rationale": rationale.strip(),
                "confidence": _confidence(item.get("confidence")),
            }
        )
    return verdicts


def _overall_verdict(value: Any) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return None
    verdict = value.get("verdict")
    rationale = value.get("rationale")
    if verdict not in _VERDICT_VALUES or not isinstance(rationale, str) or not rationale.strip():
        return None
    return {"verdict": verdict, "rationale": rationale.strip()}


def _fallback_agent_output(
    spec: AgentSpec,
    fallback: dict[str, dict[str, Any]],
    exc: Exception,
) -> dict[str, Any]:
    base = dict(fallback.get(spec.name, {}))
    base.setdefault("agent", spec.name)
    base.setdefault("task_type", spec.task_type)
    base["prompt_version"] = spec.prompt_version
    base["mode"] = "fallback"
    base["fallback_reason"] = type(exc).__name__
    return base


def _string(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def _string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [item.strip() for item in value if isinstance(item, str) and item.strip()][:8]


def _finding_list(value: Any) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    if not isinstance(value, list):
        return rows
    for item in value:
        if isinstance(item, dict):
            row = {
                "metric_key": _string(item.get("metric_key")),
                "finding": _string(item.get("finding")),
                "evidence": _string(item.get("evidence")),
                "confidence": _confidence(item.get("confidence")),
            }
        elif isinstance(item, str):
            row = {"metric_key": "", "finding": item.strip(), "evidence": "", "confidence": 0.5}
        else:
            continue
        if row["finding"]:
            rows.append(row)
    return rows[:8]


def _segment_note_list(value: Any) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    if not isinstance(value, list):
        return rows
    for item in value:
        if isinstance(item, dict):
            row = {
                "segment_key": _string(item.get("segment_key")),
                "note": _string(item.get("note")),
                "evidence": _string(item.get("evidence")),
            }
        elif isinstance(item, str):
            row = {"segment_key": "", "note": item.strip(), "evidence": ""}
        else:
            continue
        if row["note"]:
            rows.append(row)
    return rows[:8]


def _recommendation_list(value: Any) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    if not isinstance(value, list):
        return rows
    for item in value:
        if isinstance(item, dict):
            row = {
                "priority": _enum_string(
                    item.get("priority"), allowed=("high", "medium", "low"), default="medium"
                ),
                "action": _string(item.get("action")),
                "reason": _string(item.get("reason")),
            }
        elif isinstance(item, str):
            row = {"priority": "medium", "action": item.strip(), "reason": ""}
        else:
            continue
        if row["action"]:
            rows.append(row)
    return rows[:8]


def _risk_list(value: Any) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    if not isinstance(value, list):
        return rows
    for item in value:
        if isinstance(item, dict):
            row = {
                "severity": _enum_string(
                    item.get("severity"), allowed=("high", "medium", "low"), default="medium"
                ),
                "risk": _string(item.get("risk")),
                "mitigation": _string(item.get("mitigation")),
            }
        elif isinstance(item, str):
            row = {"severity": "medium", "risk": item.strip(), "mitigation": ""}
        else:
            continue
        if row["risk"]:
            rows.append(row)
    return rows[:8]


def _enum_string(value: Any, *, allowed: tuple[str, ...], default: str) -> str:
    if isinstance(value, str) and value.strip() in allowed:
        return value.strip()
    return default


def _confidence(value: Any) -> float:
    if isinstance(value, bool):
        return 0.0
    if isinstance(value, int | float):
        return round(max(0.0, min(1.0, float(value))), 3)
    return 0.0
