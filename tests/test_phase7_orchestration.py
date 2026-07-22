import asyncio
import json

from src.llm.base import LLMRequest, LLMResponse
from src.llm.router import resolve_model_route, routing_metadata
from src.orchestration.agent_scoring import score_agent_outputs
from src.orchestration.agents import run_agents
from src.orchestration.graph import run_execution_graph, run_scaffold
from src.orchestration.llm_agents import run_llm_agents, safe_agent_input
from src.orchestration.memory import memory_json_schemas


class RecordingAgentLLM:
    def __init__(self) -> None:
        self.requests: list[LLMRequest] = []

    async def generate(self, request: LLMRequest) -> LLMResponse:
        self.requests.append(request)
        payloads = {
            "analysis": {
                "summary": "A안이 집계 지표에서 가장 강한 반응을 보입니다.",
                "key_findings": [
                    {
                        "metric_key": "choice_counts",
                        "finding": "A안 선택 비중이 가장 높습니다.",
                        "evidence": "choice_counts에서 A=8, B=2로 집계되었습니다.",
                        "confidence": 0.82,
                    }
                ],
                "segment_notes": [
                    {
                        "segment_key": "breakdown_by_age.20s",
                        "note": "20대 응답자는 A안에 더 강하게 반응했습니다.",
                        "evidence": "segments.breakdown_by_age.20s에서 A 선택이 확인됩니다.",
                    }
                ],
            },
            "report": {
                "headline": "A안을 다음 캠페인 기준안으로 권장합니다.",
                "recommendations": [
                    {
                        "priority": "high",
                        "action": "A안을 기준으로 후속 메시지 테스트를 진행합니다.",
                        "reason": "현재 집계에서 A안 의향 신호가 가장 강합니다.",
                    }
                ],
                "risks": [
                    {
                        "severity": "medium",
                        "risk": "소표본 결과를 출시 의사결정으로 과해석할 수 있습니다.",
                        "mitigation": "50명 이상 표본으로 재검증한 뒤 집행 여부를 결정합니다.",
                    }
                ],
            },
            "qa": {
                "passed": True,
                "severity": "directional_only",
                "warnings": [],
                "review_notes": ["소표본이므로 방향성 판단으로만 사용해야 합니다."],
                "confidence": 0.74,
            },
        }
        return LLMResponse(
            content=json.dumps(payloads[request.task_type]),
            provider="fake-agent",
            provider_model=f"fake-{request.task_type}",
            trace_id=f"trace-{request.task_type}",
            metadata={"task_type": request.task_type},
        )


def test_task_based_model_routing_supports_explicit_alias() -> None:
    route = resolve_model_route("analysis", requested_alias="analysis/custom")

    assert route.task_type == "analysis"
    assert route.model_alias == "analysis/custom"
    assert routing_metadata("qa")["model_alias"]


def test_run_level_graph_tracks_prepare_execute_analyze_report_qa_steps() -> None:
    state = run_scaffold(
        {
            "run_id": "run-1",
            "simulation_type": "creative_testing",
            "status": "completed",
            "result": {"metrics": {"choice_counts": {"A": 1}}, "total_responses": 1},
        }
    )

    assert state["steps"] == ["prepare", "execute", "analyze", "report", "qa"]
    assert state["qa"]["passed"] is True


def test_run_execution_graph_accepts_real_execute_node() -> None:
    def execute(state):
        next_state = dict(state)
        next_state["status"] = "completed"
        next_state["result"] = {
            "metrics": {"intent_counts": {"구매": 2}},
            "total_responses": 2,
            "parse_failed": 0,
        }
        return next_state

    state = run_execution_graph({"run_id": "run-1"}, execute)

    assert state["status"] == "completed"
    assert state["analysis"]["metric_keys"] == ["intent_counts"]
    assert state["qa"]["passed"] is True


def test_analysis_report_qa_agents_are_split() -> None:
    result = {
        "simulation_type": "price_optimization",
        "metrics": {"recommended_price": 5500},
        "insights": [{"title": "Recommended price"}],
        "quality": {"overall_grade": "A"},
        "total_responses": 50,
        "parse_failed": 0,
    }

    agents = run_agents(result)

    assert set(agents) == {"analysis", "report", "qa"}
    assert agents["qa"]["passed"] is True


def test_llm_agents_run_analysis_report_qa_without_raw_persona_payload() -> None:
    result = {
        "run_id": "run-1",
        "simulation_type": "creative_testing",
        "metrics": {"choice_counts": {"A": 8, "B": 2}},
        "segments": {"breakdown_by_age": {"20s": {"A": 5}}},
        "insights": [{"title": "A leads"}],
        "quality": {"overall_grade": "A"},
        "warnings": [],
        "total_responses": 10,
        "parse_failed": 0,
        "raw_results": [
            {
                "uuid": "persona-1",
                "persona": {"uuid": "persona-1", "professional_persona": "private-profile"},
                "response": "private-response-body",
            }
        ],
    }
    llm = RecordingAgentLLM()

    agents = asyncio.run(run_llm_agents(result, llm_client=llm))

    assert [request.task_type for request in llm.requests] == ["analysis", "report", "qa"]
    assert agents["analysis"]["mode"] == "llm"
    assert agents["analysis"]["summary"] == "A안이 집계 지표에서 가장 강한 반응을 보입니다."
    assert agents["analysis"]["key_findings"][0] == {
        "metric_key": "choice_counts",
        "finding": "A안 선택 비중이 가장 높습니다.",
        "evidence": "choice_counts에서 A=8, B=2로 집계되었습니다.",
        "confidence": 0.82,
    }
    assert agents["report"]["headline"] == "A안을 다음 캠페인 기준안으로 권장합니다."
    assert agents["report"]["recommendations"][0]["priority"] == "high"
    assert agents["qa"]["passed"] is True
    assert agents["qa"]["severity"] == "directional_only"
    assert agents["qa"]["trace_id"] == "trace-qa"
    request_text = "\n".join(
        message.content for request in llm.requests for message in request.messages
    )
    assert "raw_results" not in request_text
    assert "private-profile" not in request_text
    assert "private-response-body" not in request_text
    assert agents["analysis"]["prompt_version"].startswith("analysis:v3-")
    assert llm.requests[0].metadata["prompt_version"] == agents["analysis"]["prompt_version"]


def test_safe_agent_input_includes_only_safe_intake_summary() -> None:
    safe_input = safe_agent_input(
        {
            "run_id": "run-1",
            "simulation_type": "creative_testing",
            "metrics": {"choice_counts": {"A": 2}},
            "raw_results": [{"uuid": "persona-1", "response": "secret raw response"}],
            "safe_intake_summary": {
                "schema_version": "safe-intake-summary/v1",
                "user_goal": "헤드라인 테스트",
                "decision_question": "어떤 문구가 좋은가?",
                "simulation_type": "creative_testing",
                "user_provided": {"product_description": "AI 리서치 SaaS"},
            },
        }
    )

    assert "safe_intake_summary" in safe_input
    assert "raw_results" not in safe_input
    assert safe_input["safe_intake_summary"]["user_goal"] == "헤드라인 테스트"


def test_agent_scoring_detects_schema_and_raw_payload_leaks() -> None:
    scores = score_agent_outputs(
        {
            "analysis": {
                "summary": "private-profile should not appear",
                "key_findings": [
                    {
                        "metric_key": "choice_counts",
                        "finding": "A wins",
                        "evidence": "choice_counts",
                        "confidence": 0.8,
                    }
                ],
                "segment_notes": [],
            },
            "report": {
                "headline": "A wins",
                "recommendations": [
                    {"priority": "high", "action": "Ship A", "reason": "choice_counts"}
                ],
                "risks": [
                    {
                        "severity": "medium",
                        "risk": "small sample",
                        "mitigation": "rerun larger sample",
                    }
                ],
            },
            "qa": {
                "passed": True,
                "severity": "pass",
                "warnings": [],
                "review_notes": [],
                "confidence": 0.9,
            },
        },
        forbidden_terms=["private-profile"],
    )

    assert scores["analysis"]["schema_valid"] is True
    assert scores["analysis"]["no_raw_leak"] is False
    assert scores["report"]["schema_valid"] is True
    assert scores["qa"]["schema_valid"] is True


def test_agent_scoring_v2_requires_evidence_korean_and_small_sample_severity() -> None:
    scores = score_agent_outputs(
        {
            "analysis": {
                "summary": "A안 반응이 가장 강합니다.",
                "key_findings": [
                    {
                        "metric_key": "choice_counts",
                        "finding": "A안 선택이 우세합니다.",
                        "evidence": "choice_counts에서 A=8, B=2입니다.",
                        "confidence": 0.82,
                    }
                ],
                "segment_notes": [
                    {
                        "segment_key": "breakdown_by_age.20s",
                        "note": "20대에서 A안 선호가 높습니다.",
                        "evidence": "20대 응답 5건 중 A안이 다수입니다.",
                    }
                ],
            },
            "report": {
                "headline": "A안을 기준안으로 권장합니다.",
                "recommendations": [
                    {
                        "priority": "high",
                        "action": "A안으로 후속 메시지 테스트를 진행합니다.",
                        "reason": "집계 지표에서 A안 신호가 가장 강합니다.",
                    }
                ],
                "risks": [
                    {
                        "severity": "medium",
                        "risk": "소표본 결과를 과해석할 수 있습니다.",
                        "mitigation": "50명 이상 표본으로 재검증합니다.",
                    }
                ],
            },
            "qa": {
                "passed": True,
                "severity": "directional_only",
                "warnings": [],
                "review_notes": ["소표본 방향성 검증으로만 해석합니다."],
                "confidence": 0.72,
            },
        },
        safe_input={"total_responses": 10},
    )

    assert scores["analysis"]["schema_valid"] is True
    assert scores["analysis"]["evidence_valid"] is True
    assert scores["analysis"]["korean_output"] is True
    assert scores["report"]["actionability_valid"] is True
    assert scores["report"]["risk_mitigation_valid"] is True
    assert scores["report"]["korean_output"] is True
    assert scores["qa"]["qa_severity_valid"] is True
    assert scores["qa"]["small_sample_severity_valid"] is True


def test_project_session_memory_schema_defers_persona_memory() -> None:
    schemas = memory_json_schemas()

    assert "project_memory" in schemas
    assert "session_memory" in schemas
    assert schemas["persona_memory_status"] == "deferred_until_product_workflow_is_confirmed"
