from fastapi.testclient import TestClient

from src.llm.base import LLMRequest, LLMResponse
from src.api.schemas import RunCreateRequest
from src.api.schemas import SimulationType
from src.api.main import create_app
from src.jobs.models import RunEventType, RunStatusValue
from src.jobs.store import SQLiteRunStore


class IntakeFakeLLM:
    async def generate(self, request: LLMRequest) -> LLMResponse:
        return LLMResponse(
            content=(
                '{"candidates": ['
                '{"text": "블로그 글쓰기, 초안부터 발행까지 한 번에", "angle": "automation", "why": "자동화 편익"},'
                '{"text": "소상공인을 위한 검색 노출형 블로그 작성 프로그램", "angle": "differentiation", "why": "대상 명확화"},'
                '{"text": "글감 고민 없이 완성하는 마케팅 블로그", "angle": "pain_relief", "why": "불편 해소"}'
                '], "assumptions": [{"slot_id": "main_benefit", "value": "작성 시간 절감", "confidence": 0.74}]}'
            ),
            provider="fake",
            provider_model="fake-model",
            trace_id="trace-intake",
            metadata={"task_type": request.task_type},
        )


def test_public_health() -> None:
    client = TestClient(create_app())

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "ok": True,
        "service": "koresim-api",
        "scope": "public-minimal",
    }


def test_api_config_exposes_contract_metadata() -> None:
    client = TestClient(create_app())

    response = client.get("/api/config")

    assert response.status_code == 200
    data = response.json()
    assert data["max_sample_size"] == 200
    assert data["default_seed"] == 42
    assert set(data["enabled_simulation_types"]) == {item.value for item in SimulationType}
    assert len(data["simulation_metadata"]) == len(SimulationType)
    assert set(data["model_aliases"]) == {
        "persona_default",
        "persona_strong",
        "analysis_default",
        "report_default",
        "schema_repair",
    }


def test_api_presets_returns_executable_enterprise_safe_presets() -> None:
    client = TestClient(create_app())

    response = client.get("/api/presets")

    assert response.status_code == 200
    data = response.json()
    assert len(data) == len(SimulationType)
    assert {preset["simulation_type"] for preset in data} == {
        item.value for item in SimulationType
    }
    assert all(preset["sample_size"] <= 50 for preset in data)
    assert all(preset["fallback_simulation_type"] is None for preset in data)
    serialized = str(data).lower()
    assert "politic" not in serialized
    assert "election" not in serialized
    assert "정치" not in serialized
    assert "선거" not in serialized


def test_api_presets_can_create_runs(tmp_path) -> None:
    store = SQLiteRunStore(tmp_path / "runs.sqlite3")
    client = TestClient(create_app(store=store, enqueue_run_func=lambda run_id: f"job-{run_id}"))

    presets_response = client.get("/api/presets")
    assert presets_response.status_code == 200

    for preset in presets_response.json():
        response = client.post(
            "/api/runs",
            json={
                "simulation_type": preset["simulation_type"],
                "input": preset["input"],
                "sample_size": preset["sample_size"],
                "target_filter": preset["target_filter"],
                "seed": preset["seed"],
            },
        )

        assert response.status_code == 200
        created = response.json()
        snapshot_response = client.get(created["status_url"])
        assert snapshot_response.status_code == 200
        assert snapshot_response.json()["status"] == "queued"


def test_unknown_api_route_returns_404() -> None:
    client = TestClient(create_app())

    response = client.get("/api/unknown")

    assert response.status_code == 404


def test_intake_session_api_persists_snapshot(tmp_path) -> None:
    store = SQLiteRunStore(tmp_path / "runs.sqlite3")
    client = TestClient(create_app(store=store, enqueue_run_func=lambda run_id: "job-1", llm_client=IntakeFakeLLM()))

    response = client.post(
        "/api/intake/sessions",
        json={
            "session_id": "intake-api-1",
            "status": "collecting",
            "snapshot": {"messages": [{"role": "user", "content": "헤드라인 만들고 싶어요"}]},
        },
    )
    assert response.status_code == 200
    saved = response.json()
    assert saved["session_id"] == "intake-api-1"

    get_response = client.get("/api/intake/sessions/intake-api-1")
    assert get_response.status_code == 200
    assert get_response.json()["snapshot"]["messages"][0]["content"] == "헤드라인 만들고 싶어요"

    list_response = client.get("/api/intake/sessions")
    assert list_response.status_code == 200
    assert list_response.json()["sessions"][0]["session_id"] == "intake-api-1"

    history_response = client.get("/api/intake/history")
    assert history_response.status_code == 200
    history = history_response.json()["items"][0]
    assert history["session_id"] == "intake-api-1"
    assert history["title"] == "헤드라인 만들고 싶어요"
    assert history["messages"][0]["content"] == "헤드라인 만들고 싶어요"

    run_response = client.post(
        "/api/runs",
        json={
            "simulation_type": "creative_testing",
            "input": {"creatives": ["concept A", "concept B"]},
            "sample_size": 3,
        },
    )
    assert run_response.status_code == 200
    link_response = client.post(
        "/api/intake/sessions/intake-api-1/run",
        json={"run_id": run_response.json()["run_id"]},
    )
    assert link_response.status_code == 200
    assert link_response.json()["run_id"] == run_response.json()["run_id"]


def test_intake_advance_api_returns_safe_summary_and_checkpoint(tmp_path) -> None:
    store = SQLiteRunStore(tmp_path / "runs.sqlite3")
    client = TestClient(create_app(store=store, enqueue_run_func=lambda run_id: "job-1", llm_client=IntakeFakeLLM()))

    response = client.post(
        "/api/intake/advance",
        json={
            "session_id": "intake-advance-1",
            "snapshot": {},
            "event": {"type": "user_message", "content": "가격을 얼마로 해야 할까요?"},
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["session_id"] == "intake-advance-1"
    assert data["action"]["type"] == "ask_question"
    assert data["safe_intake_summary"]["simulation_type"] == "price_optimization"
    assert data["checkpoint"]["graph_name"] == "intake_v2"

    saved = store.get_intake_session("intake-advance-1")
    assert saved is not None
    assert saved.snapshot["checkpoint"]["planner_version"] == "intake-planner:v2-20260513"


def test_intake_candidate_api_uses_llm_client(tmp_path) -> None:
    client = TestClient(create_app(store=SQLiteRunStore(tmp_path / "runs.sqlite3"), llm_client=IntakeFakeLLM()))

    response = client.post(
        "/api/intake/candidates",
        json={
            "product_description": "블로그를 작성하는 윈도우 프로그램",
            "target_customers": ["네이버 블로그로 마케팅하는 소상공인"],
            "main_benefit": "블로그 작성 시간을 줄입니다.",
            "tone": "전환 중심",
            "count": 3,
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["provider"] == "fake"
    assert data["provider_model"] == "fake-model"
    assert data["trace_id"] == "trace-intake"
    assert len(data["candidates"]) == 3
    assert data["candidates"][0]["angle"] == "automation"


def test_create_run_persists_queued_snapshot(tmp_path) -> None:
    store = SQLiteRunStore(tmp_path / "runs.sqlite3")
    client = TestClient(create_app(store=store, enqueue_run_func=lambda run_id: "job-1"))

    response = client.post(
        "/api/runs",
        json={
            "simulation_type": "creative_testing",
            "input": {"creatives": ["concept A", "concept B"]},
            "sample_size": 3,
        },
    )

    assert response.status_code == 200
    created = response.json()
    assert created["status"] == "queued"
    assert created["events_url"] == f"/api/runs/{created['run_id']}/events"

    status_response = client.get(created["status_url"])
    assert status_response.status_code == 200
    snapshot = status_response.json()
    assert snapshot["run_id"] == created["run_id"]
    assert snapshot["status"] == "queued"
    assert snapshot["sample_size"] == 3
    assert snapshot["eta_seconds"] is None
    assert snapshot["rate_per_min"] is None
    assert snapshot["result_available"] is False


def test_cancel_queued_run_marks_terminal_and_emits_event(tmp_path) -> None:
    store = SQLiteRunStore(tmp_path / "runs.sqlite3")
    client = TestClient(create_app(store=store, enqueue_run_func=lambda run_id: "job-1"))
    created = client.post(
        "/api/runs",
        json={
            "simulation_type": "creative_testing",
            "input": {"creatives": ["concept A", "concept B"]},
            "sample_size": 3,
        },
    ).json()

    response = client.post(f"/api/runs/{created['run_id']}/cancel")

    assert response.status_code == 200
    snapshot = response.json()
    assert snapshot["status"] == "canceled"
    events = store.list_events(created["run_id"])
    assert events[-1].event_type == RunEventType.CANCELED


def test_completed_run_cannot_be_canceled(tmp_path) -> None:
    store = SQLiteRunStore(tmp_path / "runs.sqlite3")
    run = store.create_run(
        RunCreateRequest.model_validate(
            {
                "simulation_type": "creative_testing",
                "input": {"creatives": ["concept A", "concept B"]},
                "sample_size": 2,
            }
        )
    )
    store.update_run_status(run.run_id, RunStatusValue.COMPLETED, done_count=2)
    client = TestClient(create_app(store=store, enqueue_run_func=lambda run_id: "job-1"))

    response = client.post(f"/api/runs/{run.run_id}/cancel")

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "RUN_NOT_CANCELABLE"


def test_get_run_result_returns_not_ready_until_worker_saves_result(tmp_path) -> None:
    store = SQLiteRunStore(tmp_path / "runs.sqlite3")
    client = TestClient(create_app(store=store, enqueue_run_func=lambda run_id: "job-1"))

    response = client.post(
        "/api/runs",
        json={
            "simulation_type": "creative_testing",
            "input": {"creatives": ["concept A", "concept B"]},
            "sample_size": 2,
        },
    )
    result_response = client.get(response.json()["result_url"])

    assert result_response.status_code == 409
    assert result_response.json()["detail"]["code"] == "RESULT_NOT_READY"


def test_create_run_records_queue_unavailable_failure(tmp_path) -> None:
    store = SQLiteRunStore(tmp_path / "runs.sqlite3")

    def failing_enqueue(run_id: str) -> str:
        raise RuntimeError("redis unavailable")

    client = TestClient(create_app(store=store, enqueue_run_func=failing_enqueue))

    response = client.post(
        "/api/runs",
        json={
            "simulation_type": "creative_testing",
            "input": {"creatives": ["concept A", "concept B"]},
            "sample_size": 2,
        },
    )

    assert response.status_code == 503
    detail = response.json()["detail"]
    assert detail["code"] == "QUEUE_UNAVAILABLE"
    run = store.get_run(detail["details"]["run_id"])
    assert run is not None
    assert run.status.value == "failed"


def test_run_events_stream_replays_persisted_events_and_closes_on_terminal_run(tmp_path) -> None:
    store = SQLiteRunStore(tmp_path / "runs.sqlite3")
    run = store.create_run(
        RunCreateRequest.model_validate(
            {
                "simulation_type": "creative_testing",
                "input": {"creatives": ["concept A", "concept B"]},
                "sample_size": 2,
            }
        )
    )
    store.update_run_status(run.run_id, RunStatusValue.COMPLETED, done_count=2)
    store.append_event(run.run_id, RunEventType.COMPLETED, {"done_count": 2})
    client = TestClient(create_app(store=store, enqueue_run_func=lambda run_id: "job-1"))

    response = client.get(f"/api/runs/{run.run_id}/events")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    body = response.text
    assert "event: created" in body
    assert "event: snapshot" in body
    assert "event: completed" in body
    assert f'"run_id": "{run.run_id}"' in body


def test_run_events_stream_replays_after_cursor(tmp_path) -> None:
    store = SQLiteRunStore(tmp_path / "runs.sqlite3")
    run = store.create_run(
        RunCreateRequest.model_validate(
            {
                "simulation_type": "creative_testing",
                "input": {"creatives": ["concept A", "concept B"]},
                "sample_size": 2,
            }
        )
    )
    progress = store.append_event(run.run_id, RunEventType.PROGRESS, {"done_count": 1})
    store.update_run_status(run.run_id, RunStatusValue.COMPLETED, done_count=2)
    store.append_event(run.run_id, RunEventType.COMPLETED, {"done_count": 2})
    client = TestClient(create_app(store=store, enqueue_run_func=lambda run_id: "job-1"))

    response = client.get(f"/api/runs/{run.run_id}/events?after_event_id={progress.event_id}")

    assert response.status_code == 200
    body = response.text
    assert "event: snapshot" in body
    assert "event: completed" in body
    assert '"done_count": 1' not in body


def test_run_partials_returns_idempotent_partial_results(tmp_path) -> None:
    store = SQLiteRunStore(tmp_path / "runs.sqlite3")
    run = store.create_run(
        RunCreateRequest.model_validate(
            {
                "simulation_type": "creative_testing",
                "input": {"creatives": ["concept A", "concept B"]},
                "sample_size": 2,
            }
        )
    )
    store.update_run_status(run.run_id, RunStatusValue.INTERRUPTED, done_count=1)
    store.upsert_partial_result(
        run.run_id,
        "persona-1",
        {"uuid": "persona-1", "persona": {}, "response": "선택: A", "error": None},
    )
    client = TestClient(create_app(store=store, enqueue_run_func=lambda run_id: "job-1"))

    response = client.get(f"/api/runs/{run.run_id}/partials")

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "interrupted"
    assert data["partial_count"] == 1
    assert data["raw_results"][0]["uuid"] == "persona-1"


def test_run_export_redacts_raw_results_and_requires_human_review(tmp_path) -> None:
    store = SQLiteRunStore(tmp_path / "runs.sqlite3")
    run = store.create_run(
        RunCreateRequest.model_validate(
            {
                "simulation_type": "creative_testing",
                "input": {"creatives": ["concept A", "concept B"]},
                "sample_size": 2,
            }
        )
    )
    store.save_result(
        run.run_id,
        {
            "schema_version": "result-envelope/v1",
            "run_id": run.run_id,
            "simulation_type": "creative_testing",
            "status": "completed",
            "seed": 42,
            "sample_size": 2,
            "total_responses": 2,
            "parse_failed": 0,
            "target_filter": {},
            "sample_summary": {},
            "quality": {"overall_grade": "B"},
            "warnings": [],
            "metrics": {"choice_counts": {"A": 2}},
            "segments": {},
            "insights": [{"title": "A wins"}],
            "raw_results": [
                {
                    "uuid": "persona-1",
                    "persona": {"uuid": "persona-1", "age": 30},
                    "response": "선택: A",
                    "parsed": {"choice": "A"},
                }
            ],
            "model_alias": "test",
            "provider": "fake",
            "provider_model": "fake-model",
            "llm_backend": "fake",
            "trace_id": None,
        },
    )
    store.update_run_status(run.run_id, RunStatusValue.COMPLETED, done_count=2)
    client = TestClient(create_app(store=store, enqueue_run_func=lambda run_id: "job-1"))

    response = client.get(f"/api/runs/{run.run_id}/export")

    assert response.status_code == 200
    data = response.json()
    assert data["schema_version"] == "koresim-export/v1"
    assert data["human_review_required"] is True
    assert data["raw_results_included"] is False
    assert "raw_results" not in data
