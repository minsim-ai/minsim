"""D-1 resilience matrix: a renderable envelope must always survive.

Invariants under test:
- I1: after persona fanout finishes, a validating envelope is always persisted.
- I2: agent-workflow / gate / record-save failures degrade the run, never FAIL it.
- I3: even envelope-build or fanout failures leave a minimal partial envelope.
"""
import pytest

from src.api.schemas import RunCreateRequest, RunResultEnvelope
from src.jobs.models import RunStatusValue
from src.jobs.store import SQLiteRunStore
from src.jobs.worker import run_simulation_job
from src.llm.base import LLMRequest, LLMResponse
from tests.test_jobs_worker import FakeLLM, FakeSampler

AGENT_TASKS = {"analysis", "report", "qa"}

SIMULATION_INPUTS = {
    "creative_testing": {"creatives": ["concept A", "concept B"]},
    "market_segmentation": {
        "category": "건강 간식",
        "core_questions": ["구매 기준은 무엇인가요?"],
    },
    "churn_prediction": {
        "service_name": "5G 요금제",
        "current_situation": "월 요금을 내고 사용 중",
        "trigger_event": "가격 인상",
    },
}


class MalformedAgentLLM(FakeLLM):
    """Persona calls behave normally; agent calls return unparseable JSON."""

    async def generate(self, request: LLMRequest) -> LLMResponse:
        if request.task_type in AGENT_TASKS:
            return LLMResponse(
                content="not json {",
                provider="fake-agent",
                provider_model="fake-model",
                metadata={},
            )
        return await super().generate(request)


class RaisingAgentLLM(FakeLLM):
    """Persona calls behave normally; agent calls raise."""

    async def generate(self, request: LLMRequest) -> LLMResponse:
        if request.task_type in AGENT_TASKS:
            raise TimeoutError("agent timeout")
        return await super().generate(request)


def _create_run(store: SQLiteRunStore, simulation_type: str, sample_size: int = 6):
    return store.create_run(
        RunCreateRequest.model_validate(
            {
                "simulation_type": simulation_type,
                "input": SIMULATION_INPUTS[simulation_type],
                "sample_size": sample_size,
                "seed": 77,
            }
        )
    )


def _stored_envelope(store: SQLiteRunStore, run_id: str) -> RunResultEnvelope:
    result = store.get_result(run_id)
    assert result is not None, "envelope must always be persisted"
    return RunResultEnvelope.model_validate(result.result)


@pytest.mark.parametrize("simulation_type", sorted(SIMULATION_INPUTS))
@pytest.mark.parametrize("agent_llm", [MalformedAgentLLM, RaisingAgentLLM])
def test_agent_stage_failures_degrade_but_complete(tmp_path, simulation_type, agent_llm) -> None:
    path = tmp_path / f"{simulation_type}-{agent_llm.__name__}.sqlite3"
    store = SQLiteRunStore(path)
    run = _create_run(store, simulation_type)

    run_simulation_job(
        run.run_id, sqlite_path=str(path), llm_client=agent_llm(), sampler=FakeSampler()
    )

    assert store.get_run(run.run_id).status == RunStatusValue.COMPLETED
    envelope = _stored_envelope(store, run.run_id)
    assert envelope.total_responses == 6
    assert envelope.quality.get("review_required") is True
    assert envelope.warnings


def test_envelope_build_failure_saves_minimal_envelope(tmp_path, monkeypatch) -> None:
    path = tmp_path / "envelope-build-failure.sqlite3"
    store = SQLiteRunStore(path)
    run = _create_run(store, "creative_testing", sample_size=8)

    def _boom(run_record, result):
        raise RuntimeError("envelope build exploded")

    monkeypatch.setattr("src.jobs.worker._build_envelope", _boom)
    run_simulation_job(
        run.run_id, sqlite_path=str(path), llm_client=FakeLLM(), sampler=FakeSampler()
    )

    assert store.get_run(run.run_id).status == RunStatusValue.COMPLETED
    envelope = _stored_envelope(store, run.run_id)
    assert envelope.quality.get("result_completeness") == "partial"
    assert envelope.quality.get("review_required") is True
    assert envelope.total_responses == 8
    assert len(envelope.raw_results) == 8


def test_agent_workflow_crash_marks_degraded(tmp_path, monkeypatch) -> None:
    path = tmp_path / "agent-crash.sqlite3"
    store = SQLiteRunStore(path)
    run = _create_run(store, "creative_testing")

    def _boom(envelope, llm_client):
        raise RuntimeError("workflow infrastructure down")

    monkeypatch.setattr("src.jobs.worker._run_agent_workflow_for_envelope", _boom)
    run_simulation_job(
        run.run_id, sqlite_path=str(path), llm_client=FakeLLM(), sampler=FakeSampler()
    )

    assert store.get_run(run.run_id).status == RunStatusValue.COMPLETED
    envelope = _stored_envelope(store, run.run_id)
    assert envelope.orchestration.get("status") == "degraded"
    assert envelope.quality.get("review_required") is True
    assert any("AI 해석 단계" in warning for warning in envelope.warnings)


def test_agent_record_save_failure_keeps_run_completed(tmp_path, monkeypatch) -> None:
    path = tmp_path / "agent-save-failure.sqlite3"
    store = SQLiteRunStore(path)
    run = _create_run(store, "creative_testing")

    def _boom(store_arg, run_id, envelope, agent_outputs):
        raise RuntimeError("agent_runs table locked")

    monkeypatch.setattr("src.jobs.worker._save_agent_runs", _boom)
    run_simulation_job(
        run.run_id, sqlite_path=str(path), llm_client=FakeLLM(), sampler=FakeSampler()
    )

    assert store.get_run(run.run_id).status == RunStatusValue.COMPLETED
    envelope = _stored_envelope(store, run.run_id)
    assert any("에이전트 실행 기록" in warning for warning in envelope.warnings)


def test_fanout_failure_persists_minimal_envelope_and_fails_run(tmp_path) -> None:
    path = tmp_path / "fanout-failure.sqlite3"
    store = SQLiteRunStore(path)
    run = _create_run(store, "creative_testing")

    class ExplodingSampler:
        def sample(self, n, filter_=None, seed=42):
            raise RuntimeError("parquet missing")

    with pytest.raises(RuntimeError):
        run_simulation_job(
            run.run_id,
            sqlite_path=str(path),
            llm_client=FakeLLM(),
            sampler=ExplodingSampler(),
        )

    assert store.get_run(run.run_id).status == RunStatusValue.FAILED
    envelope = _stored_envelope(store, run.run_id)
    assert envelope.status.value == "failed"
    assert envelope.total_responses == 0
    assert envelope.quality.get("result_completeness") == "partial"
