import sqlite3
import json
from contextlib import closing

import pytest

from src.api.schemas import RunCreateRequest
from src.llm.base import LLMRequest, LLMResponse
from src.jobs.store import SQLiteRunStore
from src.jobs.models import RunEventType, RunStatusValue
from src.jobs.worker import (
    _apply_agent_quality_gate,
    run_creative_testing_job,
    run_noop_job,
    run_simulation_job,
)


class FakeLLM:
    async def generate(self, request: LLMRequest) -> LLMResponse:
        if request.task_type == "pricing_objection":
            content = "조건: 결과물증명\n조건상태: 조건부구매\n이유: 실제 산출물을 보면 결제할 수 있습니다."
        elif request.task_type == "pricing_anchor":
            content = "유사서비스: AI 업무 강의\n월지출: 12000\n앵커범주: AI학습\n이유: 업무 교육과 비슷합니다."
        elif request.task_type == "pricing_hesitation":
            content = "망설임: 신뢰부족\n이유: 품질 확인이 먼저 필요합니다."
        elif request.task_type == "product_qa_response":
            content = (
                "순위: A > B > C\n"
                "최상위: A\n"
                "최하위: C\n"
                "명확성: 4\n"
                "신뢰도: 3\n"
                "행동가능성: 5\n"
                "이유: 바로 비교할 수 있어서 좋습니다."
            )
        else:
            content = (
                "선택: A\n"
                "가격별의향:\n"
                "9900원: 관망\n"
                "14900원: 거부\n"
                "19900원: 거부\n"
                "선호가격: 5500\n"
                "지불의향가격: 6500\n"
                "대표의향: 거부\n"
                "점수: 4\n"
                "설득력: 4\n"
                "명확성: 4\n"
                "공감도: 4\n"
                "의향: 구매\n"
                "의향: 유지\n"
                "의향: 4\n"
                "세그먼트: 실용형\n"
                "니즈: 합리성\n"
                "페인: 가격 부담\n"
                "포지셔닝: 실용적인 프리미엄\n"
                "강점: 품질\n"
                "약점: 인지도\n"
                "연상어: 신뢰, 편리\n"
                "긍정: 사용감\n"
                "부정: 가격\n"
                "나를 잡으려면: 혜택 강화\n"
                "채널: 인스타그램\n"
                "메시지: 메시지 1\n"
                "반응: 클릭\n"
                "이유: 메시지가 명확해서 좋습니다."
            )
        return LLMResponse(
            content=content,
            provider="fake",
            provider_model="fake-model",
            metadata={"task_type": request.task_type},
        )


class AgentAwareFakeLLM(FakeLLM):
    async def generate(self, request: LLMRequest) -> LLMResponse:
        agent_payloads = {
            "analysis": {
                "summary": "A안이 가장 강한 반응을 보입니다.",
                "key_findings": [
                    {
                        "metric_key": "choice_counts",
                        "finding": "선택 비중과 정성 이유가 일치합니다.",
                        "evidence": "choice_counts에서 A안 선택이 가장 많습니다.",
                        "confidence": 0.82,
                    }
                ],
                "segment_notes": [
                    {
                        "segment_key": "persona.segment",
                        "note": "30대 실용형 페르소나에서 반응이 높습니다.",
                        "evidence": "세그먼트 집계에서 실용형 반응이 확인됩니다.",
                    }
                ],
            },
            "report": {
                "headline": "A안을 다음 캠페인 기준안으로 권장합니다.",
                "recommendations": [
                    {
                        "priority": "high",
                        "action": "A안을 기준으로 가격/메시지 후속 테스트를 진행합니다.",
                        "reason": "현재 집계에서 A안 신호가 가장 강합니다.",
                    }
                ],
                "risks": [
                    {
                        "severity": "medium",
                        "risk": "표본 수가 작을 때는 과해석 위험이 있습니다.",
                        "mitigation": "방향성 검증으로 해석하고 표본을 늘려 재검증합니다.",
                    }
                ],
            },
            "qa": {
                "passed": True,
                "severity": "directional_only",
                "warnings": [],
                "review_notes": ["LLM agent QA가 통과했습니다."],
                "confidence": 0.74,
            },
        }
        if request.task_type in agent_payloads:
            return LLMResponse(
                content=json.dumps(agent_payloads[request.task_type], ensure_ascii=False),
                provider="fake-agent",
                provider_model=f"fake-{request.task_type}",
                trace_id=f"trace-{request.task_type}",
                metadata={"task_type": request.task_type},
            )
        return await super().generate(request)


class FakeSampler:
    def __init__(self) -> None:
        self.seen_seed: int | None = None

    def sample(self, n: int, filter_=None, seed: int = 42) -> list[dict]:
        self.seen_seed = seed
        personas = [
            {
                "uuid": f"persona-{idx}",
                "age": 30 + idx,
                "sex": "여성" if idx % 2 else "남성",
                "province": "Seoul",
                "district": "서울-강남구",
                "occupation": "마케터",
                "education_level": "대졸",
                "marital_status": "미혼",
                "family_type": "1인가구",
                "housing_type": "아파트",
                "professional_persona": "브랜드 메시지에 민감한 직장인",
                "family_persona": "가족 구매도 자주 고려함",
                "culinary_persona": "새로운 제품을 비교해 봄",
                "persona": "실용적인 소비자",
            }
            for idx in range(n)
        ]
        return personas


def test_noop_worker_updates_sqlite_run_and_result(tmp_path) -> None:
    path = tmp_path / "runs.sqlite3"
    store = SQLiteRunStore(path)
    run = store.create_run(
        RunCreateRequest.model_validate(
            {
                "simulation_type": "creative_testing",
                "input": {"creatives": ["concept A", "concept B"]},
                "sample_size": 2,
            }
        )
    )

    worker_result = run_noop_job(run.run_id, sqlite_path=str(path))

    assert worker_result == {"run_id": run.run_id, "status": "completed"}
    completed = store.get_run(run.run_id)
    assert completed.status.value == "completed"
    assert completed.done_count == 2

    result = store.get_result(run.run_id)
    assert result is not None
    assert result.result["run_id"] == run.run_id
    assert result.result["warnings"] == [
        "Gate 1C no-op worker completed without executing simulation."
    ]


def test_worker_charges_free_run_only_after_completion(tmp_path) -> None:
    path = tmp_path / "runs.sqlite3"
    store = SQLiteRunStore(path)
    user = store.upsert_user_from_auth(
        {
            "id": "worker-user",
            "email": "worker@example.com",
            "name": "Worker User",
            "provider": "test",
        },
        free_run_limit=5,
    )
    run = store.create_run(
        RunCreateRequest.model_validate(
            {
                "simulation_type": "creative_testing",
                "input": {"creatives": ["concept A", "concept B"]},
                "sample_size": 2,
            }
        ),
        user=user,
    )

    assert store.get_user_usage(user.user_id).remaining_runs == 5

    run_noop_job(run.run_id, sqlite_path=str(path))
    run_noop_job(run.run_id, sqlite_path=str(path))

    usage = store.get_user_usage(user.user_id)
    assert usage.used_runs == 1
    assert usage.remaining_runs == 4


def test_rq_worker_updates_sqlite_with_fakeredis(tmp_path) -> None:
    from fakeredis import FakeRedis
    from rq import Queue, SimpleWorker
    from rq.job import JobStatus

    path = tmp_path / "runs.sqlite3"
    store = SQLiteRunStore(path)
    run = store.create_run(
        RunCreateRequest.model_validate(
            {
                "simulation_type": "creative_testing",
                "input": {"creatives": ["concept A", "concept B"]},
                "sample_size": 2,
            }
        )
    )
    connection = FakeRedis()
    queue = Queue("koresim-test", connection=connection)
    job = queue.enqueue(run_noop_job, run.run_id, str(path), job_timeout="30m")

    worker = SimpleWorker([queue], connection=connection)
    worker.work(burst=True)

    assert job.get_status(refresh=True) == JobStatus.FINISHED
    assert store.get_run(run.run_id).status.value == "completed"
    assert store.get_result(run.run_id) is not None


def test_rq_worker_runs_creative_testing_job_with_fake_dependencies(tmp_path) -> None:
    from fakeredis import FakeRedis
    from rq import Queue, SimpleWorker
    from rq.job import JobStatus

    path = tmp_path / "runs.sqlite3"
    store = SQLiteRunStore(path)
    run = store.create_run(
        RunCreateRequest.model_validate(
            {
                "simulation_type": "creative_testing",
                "input": {"creatives": ["concept A", "concept B"]},
                "sample_size": 10,
            }
        )
    )
    connection = FakeRedis()
    queue = Queue("koresim-test", connection=connection)
    job = queue.enqueue(
        run_creative_testing_job,
        run.run_id,
        str(path),
        FakeLLM(),
        FakeSampler(),
        job_timeout="30m",
    )

    worker = SimpleWorker([queue], connection=connection)
    worker.work(burst=True)

    assert job.get_status(refresh=True) == JobStatus.FINISHED
    assert store.get_run(run.run_id).status.value == "completed"
    assert store.get_result(run.run_id).result["total_responses"] == 10


def test_noop_worker_records_failed_status_on_execution_error(tmp_path) -> None:
    path = tmp_path / "runs.sqlite3"
    store = SQLiteRunStore(path)
    run = store.create_run(
        RunCreateRequest.model_validate(
            {
                "simulation_type": "creative_testing",
                "input": {"creatives": ["concept A", "concept B"]},
                "sample_size": 2,
            }
        )
    )
    with closing(sqlite3.connect(path)) as conn:
        conn.execute(
            "UPDATE runs SET simulation_type = ? WHERE run_id = ?",
            ("unsupported", run.run_id),
        )
        conn.commit()

    with pytest.raises(Exception):
        run_noop_job(run.run_id, sqlite_path=str(path))

    failed = store.get_run(run.run_id)
    assert failed.status.value == "failed"
    assert failed.error["code"] == "INTERNAL_ERROR"


def test_worker_does_not_restart_pre_canceled_run(tmp_path) -> None:
    path = tmp_path / "runs.sqlite3"
    store = SQLiteRunStore(path)
    run = store.create_run(
        RunCreateRequest.model_validate(
            {
                "simulation_type": "creative_testing",
                "input": {"creatives": ["concept A", "concept B"]},
                "sample_size": 2,
            }
        )
    )
    store.update_run_status(run.run_id, RunStatusValue.CANCELED, completed_at="2026-05-03T00:00:00+00:00")

    worker_result = run_simulation_job(
        run.run_id,
        sqlite_path=str(path),
        llm_client=FakeLLM(),
        sampler=FakeSampler(),
    )

    assert worker_result == {"run_id": run.run_id, "status": "canceled"}
    assert store.get_run(run.run_id).status == RunStatusValue.CANCELED
    assert store.get_result(run.run_id) is None


def test_creative_testing_worker_saves_full_result_envelope(tmp_path) -> None:
    path = tmp_path / "runs.sqlite3"
    store = SQLiteRunStore(path)
    sampler = FakeSampler()
    run = store.create_run(
        RunCreateRequest.model_validate(
            {
                "simulation_type": "creative_testing",
                "input": {"creatives": ["concept A", "concept B"]},
                "sample_size": 2,
                "seed": 123,
                "model_alias": "persona_default",
            }
        )
    )

    worker_result = run_creative_testing_job(
        run.run_id,
        sqlite_path=str(path),
        llm_client=FakeLLM(),
        sampler=sampler,
    )

    assert worker_result == {"run_id": run.run_id, "status": "completed"}
    assert sampler.seen_seed == 123
    completed = store.get_run(run.run_id)
    assert completed.status.value == "completed"
    assert completed.done_count == 2

    result = store.get_result(run.run_id)
    assert result is not None
    assert result.result["schema_version"] == "result-envelope/v1"
    assert result.result["total_responses"] == 2
    assert result.result["parse_failed"] == 0
    assert result.result["provider"] == "fake"
    assert result.result["provider_model"] == "fake-model"
    assert result.result["llm_backend"] == "fake"
    assert result.result["metrics"]["choice_counts"] == {"A": 2, "B": 0}
    assert result.result["raw_results"][0]["parsed"]["choice"] == "A"
    assert result.result["raw_results"][0]["persona"]["occupation"] == "마케터"
    assert result.result["orchestration"]["agents"]["qa"]["passed"] is True


def test_worker_saves_llm_agent_outputs_when_agent_client_returns_json(tmp_path) -> None:
    path = tmp_path / "agent-runs.sqlite3"
    store = SQLiteRunStore(path)
    run = store.create_run(
        RunCreateRequest.model_validate(
            {
                "simulation_type": "creative_testing",
                "input": {"creatives": ["concept A", "concept B"]},
                "sample_size": 2,
                "seed": 123,
            }
        )
    )

    run_creative_testing_job(
        run.run_id,
        sqlite_path=str(path),
        llm_client=AgentAwareFakeLLM(),
        sampler=FakeSampler(),
    )

    result = store.get_result(run.run_id)
    assert result is not None
    agents = result.result["orchestration"]["agents"]
    assert agents["analysis"]["mode"] == "llm"
    assert agents["analysis"]["provider"] == "fake-agent"
    assert agents["report"]["headline"] == "A안을 다음 캠페인 기준안으로 권장합니다."
    assert agents["qa"]["passed"] is True
    assert agents["qa"]["trace_id"] == "trace-qa"

    stored_agents = store.list_agent_runs(run.run_id)
    assert [agent.agent_name for agent in stored_agents] == ["analysis", "report", "qa"]
    assert stored_agents[0].prompt_version.startswith("analysis:")
    assert stored_agents[0].scores["schema_valid"] is True
    assert stored_agents[0].scores["no_raw_leak"] is True


@pytest.mark.parametrize("sample_size", [10, 50])
def test_creative_testing_worker_handles_gate_sample_sizes_with_fake_llm(
    tmp_path,
    sample_size: int,
) -> None:
    path = tmp_path / f"runs-{sample_size}.sqlite3"
    store = SQLiteRunStore(path)
    run = store.create_run(
        RunCreateRequest.model_validate(
            {
                "simulation_type": "creative_testing",
                "input": {"creatives": ["concept A", "concept B"]},
                "sample_size": sample_size,
            }
        )
    )

    run_creative_testing_job(
        run.run_id,
        sqlite_path=str(path),
        llm_client=FakeLLM(),
        sampler=FakeSampler(),
    )

    result = store.get_result(run.run_id)
    assert result.result["total_responses"] == sample_size
    assert result.result["parse_failed"] == 0
    assert len(result.result["raw_results"]) == sample_size
    assert len(store.list_partial_results(run.run_id)) == sample_size


def test_worker_throttles_progress_and_partial_events_for_large_runs(tmp_path) -> None:
    path = tmp_path / "runs-throttle.sqlite3"
    store = SQLiteRunStore(path)
    run = store.create_run(
        RunCreateRequest.model_validate(
            {
                "simulation_type": "creative_testing",
                "input": {"creatives": ["concept A", "concept B"]},
                "sample_size": 200,
            }
        )
    )

    run_creative_testing_job(
        run.run_id,
        sqlite_path=str(path),
        llm_client=FakeLLM(),
        sampler=FakeSampler(),
    )

    events = store.list_events(run.run_id)
    progress_events = [e for e in events if e.event_type == RunEventType.PROGRESS]
    partial_events = [e for e in events if e.event_type == RunEventType.PARTIAL_RESULT]
    assert len(progress_events) <= 55
    assert len(partial_events) <= 55
    assert len(store.list_partial_results(run.run_id)) == 200

    final = store.get_run(run.run_id)
    assert final.status == RunStatusValue.COMPLETED
    assert final.done_count == 200


@pytest.mark.parametrize(
    ("simulation_type", "input_data", "metric_key"),
    [
        (
            "price_optimization",
            {
                "product_name": "커피",
                "product_description": "테이크아웃 커피",
                "price_points": [4500, 5500, 6500],
            },
            "recommended_price",
        ),
        (
            "product_launch",
            {
                "product_concept": "AI 홈클리너",
                "key_features": ["저소음", "자동 동선"],
                "target_use_case": "맞벌이 가구",
            },
            "average_score",
        ),
        (
            "value_proposition",
            {
                "product_context": "OTT 서비스",
                "statements": ["오리지널 콘텐츠", "가족 모두 이용"],
            },
            "choice_counts",
        ),
        (
            "market_segmentation",
            {
                "category": "건강 간식",
                "core_questions": ["구매 기준은 무엇인가요?"],
            },
            "segment_counts",
        ),
        (
            "competitive_positioning",
            {
                "category_context": "OTT 경쟁",
                "products": ["A 서비스", "B 서비스"],
            },
            "preference_counts",
        ),
        (
            "brand_perception",
            {
                "brand_name": "Arabica Daily",
                "category": "커피",
                "attributes": ["신뢰", "고급", "편리"],
            },
            "average_score",
        ),
        (
            "churn_prediction",
            {
                "service_name": "5G 요금제",
                "current_situation": "월 요금을 내고 사용 중",
                "trigger_event": "가격 인상",
            },
            "intent_counts",
        ),
        (
            "campaign_strategy",
            {
                "product_context": "비건 선케어",
                "channels": [{"name": "인스타그램"}, {"name": "네이버 검색"}],
                "messages": [
                    {"name": "메시지 1", "creative": "저자극 비건 선케어"},
                    {"name": "메시지 2", "creative": "가벼운 데일리 선크림"},
                ],
            },
            "best_combinations",
        ),
    ],
)
def test_registered_simulation_worker_saves_generic_envelope(
    tmp_path,
    simulation_type: str,
    input_data: dict,
    metric_key: str,
) -> None:
    path = tmp_path / f"{simulation_type}.sqlite3"
    store = SQLiteRunStore(path)
    run = store.create_run(
        RunCreateRequest.model_validate(
            {
                "simulation_type": simulation_type,
                "input": input_data,
                "sample_size": 10,
                "seed": 77,
            }
        )
    )

    run_simulation_job(
        run.run_id,
        sqlite_path=str(path),
        llm_client=FakeLLM(),
        sampler=FakeSampler(),
    )

    result = store.get_result(run.run_id)
    assert result is not None
    assert result.result["simulation_type"] == simulation_type
    assert result.result["total_responses"] == 10
    assert result.result["parse_failed"] == 0
    assert result.result["provider"] == "fake"
    assert result.result["llm_backend"] == "fake"
    assert metric_key in result.result["metrics"]
    assert result.result["raw_results"][0]["parsed"] is not None
    assert result.result["orchestration"]["graph"]["qa"]["passed"] is True


def test_price_optimization_worker_saves_price_research_v2_protocol(tmp_path) -> None:
    path = tmp_path / "price-research-v2.sqlite3"
    store = SQLiteRunStore(path)
    run = store.create_run(
        RunCreateRequest.model_validate(
            {
                "simulation_type": "price_optimization",
                "input": {
                    "protocol_id": "price_research_v2",
                    "product_name": "로나",
                    "product_description": "업무 맞춤 AI 실습 서비스",
                    "price_points": [9900, 14900, 19900],
                },
                "sample_size": 3,
                "seed": 77,
            }
        )
    )

    run_simulation_job(
        run.run_id,
        sqlite_path=str(path),
        llm_client=FakeLLM(),
        sampler=FakeSampler(),
    )

    result = store.get_result(run.run_id)
    assert result is not None
    assert result.result["simulation_type"] == "price_optimization"
    assert result.result["metrics"]["protocol_id"] == "price_research_v2"
    assert result.result["metrics"]["conditional_yes_count"] == 3
    assert result.result["protocol"]["protocol_id"] == "price_research_v2"
    assert result.result["protocol"]["step_summaries"][0]["id"] == "price_ladder"
    assert result.result["raw_results"][0]["parsed"]["protocol_steps"]["rejection_conditions"][
        "condition_category"
    ] == "결과물증명"


def test_value_proposition_worker_saves_product_qa_v1_protocol(tmp_path) -> None:
    path = tmp_path / "product-qa-v1.sqlite3"
    store = SQLiteRunStore(path)
    run = store.create_run(
        RunCreateRequest.model_validate(
            {
                "simulation_type": "value_proposition",
                "input": {
                    "protocol_id": "product_qa_v1",
                    "artifact_type": "landing_copy",
                    "product_context": "AI persona research SaaS",
                    "statements": ["빠른 리서치", "조건부 거절 분석", "인터뷰 가이드"],
                    "criteria": ["명확성", "신뢰도", "행동가능성"],
                },
                "sample_size": 3,
                "seed": 77,
            }
        )
    )

    run_simulation_job(
        run.run_id,
        sqlite_path=str(path),
        llm_client=FakeLLM(),
        sampler=FakeSampler(),
    )

    result = store.get_result(run.run_id)
    assert result is not None
    assert result.result["simulation_type"] == "value_proposition"
    assert result.result["metrics"]["protocol_id"] == "product_qa_v1"
    assert result.result["metrics"]["top_choice_counts"] == {"A": 3}
    assert result.result["protocol"]["protocol_id"] == "product_qa_v1"
    assert result.result["raw_results"][0]["parsed"]["top_choice"] == "A"


def test_agent_quality_gate_requires_review_for_qa_warning() -> None:
    envelope = {"quality": {"overall_grade": "A"}, "warnings": []}
    agents = {
        "analysis": {"mode": "llm"},
        "report": {"mode": "llm"},
        "qa": {
            "mode": "llm",
            "passed": True,
            "severity": "warning",
            "warnings": ["근거를 한 번 더 확인하세요."],
        },
    }

    _apply_agent_quality_gate(envelope, agents)

    assert envelope["quality"]["review_required"] is True
    assert envelope["quality"]["overall_grade"] == "B"
    assert "근거를 한 번 더 확인하세요." in envelope["warnings"]
