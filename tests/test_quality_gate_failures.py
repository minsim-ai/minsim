"""D-2: prove the quality gate actually trips on intentionally bad input."""
from src.jobs.worker import _apply_agent_quality_gate
from src.orchestration.agents import QAAgent, run_agents


def test_qa_severity_escalates_on_high_parse_failure_despite_small_sample() -> None:
    qa = QAAgent().check({"total_responses": 8, "parse_failed": 4, "warnings": []})

    assert qa["passed"] is True
    assert qa["severity"] == "warning"
    assert any("파싱 실패 비율" in note for note in qa["review_notes"])


def test_qa_small_clean_sample_stays_directional_only() -> None:
    qa = QAAgent().check({"total_responses": 12, "parse_failed": 0, "warnings": []})

    assert qa["severity"] == "directional_only"


def test_qa_all_parse_failed_fails() -> None:
    qa = QAAgent().check({"total_responses": 5, "parse_failed": 5, "warnings": []})

    assert qa["passed"] is False
    assert qa["severity"] == "fail"


def test_gate_trips_and_downgrades_grade_on_garbage_input() -> None:
    garbage_result = {
        "total_responses": 8,
        "parse_failed": 4,
        "metrics": {"segment_counts": {"실용형": 4}},
        "segments": {},
        "insights": [],
        "warnings": [],
        "quality": {"overall_grade": "A"},
    }
    agent_outputs = run_agents(garbage_result)
    envelope = {"quality": {"overall_grade": "A"}, "warnings": []}

    _apply_agent_quality_gate(envelope, agent_outputs)

    assert envelope["quality"]["review_required"] is True
    assert envelope["quality"]["agent_qa"]["severity"] == "warning"
    assert envelope["quality"]["overall_grade"] == "B"
    assert any("검토가 필요" in warning for warning in envelope["warnings"])


def test_gate_trips_on_fallback_agents() -> None:
    envelope = {"quality": {"overall_grade": "A"}, "warnings": []}
    agent_outputs = {
        "analysis": {"mode": "fallback", "agent": "analysis"},
        "report": {"mode": "llm", "agent": "report"},
        "qa": {"mode": "llm", "passed": True, "severity": "pass", "warnings": []},
    }

    _apply_agent_quality_gate(envelope, agent_outputs)

    assert envelope["quality"]["review_required"] is True
    assert "analysis" in envelope["quality"]["agent_qa"]["fallback_agents"]
    assert any("fallback" in warning for warning in envelope["warnings"])


def test_gate_passes_clean_run_without_review() -> None:
    envelope = {"quality": {"overall_grade": "A"}, "warnings": []}
    agent_outputs = run_agents(
        {
            "total_responses": 200,
            "parse_failed": 0,
            "metrics": {"choice_counts": {"A": 120, "B": 80}},
            "segments": {},
            "insights": [],
            "warnings": [],
            "quality": {"overall_grade": "A"},
        }
    )

    _apply_agent_quality_gate(envelope, agent_outputs)

    assert envelope["quality"]["review_required"] is False
    assert envelope["quality"]["overall_grade"] == "A"
