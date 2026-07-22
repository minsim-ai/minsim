def test_existing_core_imports() -> None:
    from src.agent.simulator import BatchSimulator
    from src.data.sampler import PersonaSampler
    from src.simulations.creative_testing import CreativeTesting

    assert BatchSimulator
    assert CreativeTesting
    assert PersonaSampler


def test_gate_1a_scaffold_imports() -> None:
    from src.api.schemas import RunCreateRequest
    from src.jobs.models import RunEventRecord, RunEventType, RunRecord, RunStatusValue
    from src.llm.base import LLMMessage, LLMRequest, LLMResponse
    from src.llm.openai_compatible_adapter import OpenAICompatibleAdapter
    from src.orchestration.graph import RunGraphState, run_scaffold

    assert LLMMessage
    assert LLMRequest
    assert LLMResponse
    assert OpenAICompatibleAdapter
    assert RunCreateRequest
    assert RunEventRecord
    assert RunEventType
    assert RunGraphState
    assert RunRecord
    assert RunStatusValue
    assert run_scaffold({"run_id": "run-1"})["steps"] == [
        "prepare",
        "execute",
        "analyze",
        "report",
        "qa",
    ]
