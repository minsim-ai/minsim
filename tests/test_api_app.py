import json
import sqlite3
from contextlib import closing

from fastapi import FastAPI
from fastapi.testclient import TestClient

from src.llm.base import LLMRequest, LLMResponse
from src.api.schemas import RunCreateRequest
from src.api.schemas import SimulationType
from src.api.main import create_app
from src.api.static import install_static_routes
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


def test_public_api_health_redacts_runtime_details() -> None:
    client = TestClient(create_app())

    response = client.get("/api/health")

    assert response.status_code == 200
    data = response.json()
    assert set(data) == {"ok", "service", "scope", "status"}
    assert data["scope"] == "public-minimal"
    assert "sqlite" not in data
    assert "/Users/" not in response.text


def test_internal_health_requires_auth_when_auth_is_enabled(monkeypatch) -> None:
    monkeypatch.setenv("KORESIM_AUTH_SECRET", "test-secret")
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "google-client")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "google-secret")
    client = TestClient(create_app())

    response = client.get("/api/internal/health")

    assert response.status_code == 401


def test_api_config_exposes_only_public_contract_metadata() -> None:
    client = TestClient(create_app())

    response = client.get("/api/config")

    assert response.status_code == 200
    data = response.json()
    assert data["max_sample_size"] == 2000
    assert data["sample_size_presets"] == [100, 200, 300]
    assert data["default_seed"] == 42
    assert set(data["enabled_simulation_types"]) == {item.value for item in SimulationType}
    assert len(data["simulation_metadata"]) == len(SimulationType)
    assert "llm_backend" not in data
    assert "model_aliases" not in data
    assert "langgraph_enabled" not in data
    assert "llm_agents_enabled" not in data


def test_static_seo_files_directory_index_head_and_cache(tmp_path) -> None:
    dist = tmp_path / "dist"
    (dist / "use-cases" / "price-optimization").mkdir(parents=True)
    (dist / "simulations" / "price-optimization").mkdir(parents=True)
    (dist / "compare" / "market-research-vs-ai-simulation").mkdir(parents=True)
    (dist / "assets").mkdir()
    (dist / "index.html").write_text("<html>app</html>")
    (dist / "robots.txt").write_text("User-agent: *")
    (dist / "sitemap.xml").write_text("<urlset />")
    (dist / "use-cases" / "price-optimization" / "index.html").write_text("<html>price</html>")
    (dist / "simulations" / "price-optimization" / "index.html").write_text("<html>simulation</html>")
    (dist / "compare" / "market-research-vs-ai-simulation" / "index.html").write_text("<html>compare</html>")
    (dist / "assets" / "index-test.js").write_text("console.log('ok')")
    app = FastAPI()
    install_static_routes(app, dist_dir=dist)
    client = TestClient(app)

    robots = client.get("/robots.txt")
    assert robots.status_code == 200
    assert robots.text == "User-agent: *"
    assert robots.headers["cache-control"] == "public, max-age=3600"

    use_case = client.get("/use-cases/price-optimization/")
    assert use_case.status_code == 200
    assert "price" in use_case.text

    simulation = client.get("/simulations/price-optimization/")
    assert simulation.status_code == 200
    assert "simulation" in simulation.text

    compare = client.get("/compare/market-research-vs-ai-simulation/")
    assert compare.status_code == 200
    assert "compare" in compare.text

    head_response = client.head("/validation")
    assert head_response.status_code == 200

    asset = client.get("/assets/index-test.js")
    assert asset.status_code == 200
    assert "immutable" in asset.headers["cache-control"]


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


def test_intake_history_is_scoped_to_authenticated_user(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("KORESIM_AUTH_SECRET", "test-secret")
    monkeypatch.setenv("KORESIM_AUTH_COOKIE_SECURE", "false")
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "google-client")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "google-secret")
    monkeypatch.setenv("KORESIM_AUTH_TEST_LOGIN_ENABLED", "true")
    store = SQLiteRunStore(tmp_path / "runs.sqlite3")

    monkeypatch.setenv("KORESIM_AUTH_TEST_EMAIL", "first@example.com")
    first_client = TestClient(create_app(store=store, enqueue_run_func=lambda run_id: "job-1"))
    first_client.get("/api/auth/test-login", follow_redirects=False)
    first_saved = first_client.post(
        "/api/intake/sessions",
        json={
            "session_id": "intake-first-user",
            "status": "collecting",
            "snapshot": {"messages": [{"role": "user", "content": "첫 번째 사용자 대화"}]},
        },
    )
    assert first_saved.status_code == 200

    monkeypatch.setenv("KORESIM_AUTH_TEST_EMAIL", "second@example.com")
    second_client = TestClient(create_app(store=store, enqueue_run_func=lambda run_id: "job-1"))
    second_client.get("/api/auth/test-login", follow_redirects=False)

    second_history = second_client.get("/api/intake/history")
    assert second_history.status_code == 200
    assert second_history.json()["items"] == []

    leaked_session = second_client.get("/api/intake/sessions/intake-first-user")
    assert leaked_session.status_code == 404

    first_history = first_client.get("/api/intake/history")
    assert first_history.status_code == 200
    assert [item["session_id"] for item in first_history.json()["items"]] == ["intake-first-user"]


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


def test_intake_autofill_fills_all_fields_from_one_sentence(tmp_path) -> None:
    from src.llm.fake import FakeLLMClient

    client = TestClient(
        create_app(store=SQLiteRunStore(tmp_path / "runs.sqlite3"), llm_client=FakeLLMClient())
    )

    response = client.post(
        "/api/intake/autofill",
        json={"prompt": "잠이 잘 오게 하는 뇌파 생성 머리띠를 생각 중인데 시장 검토하고 싶어"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["project_fields"]["name"]
    assert data["project_fields"]["product_context"]
    assert data["project_fields"]["prices"]
    assert data["project_fields"]["target_notes"]
    assert data["recommended_simulation_type"] == "startup_item_validation"
    assert data["simulation_input"]["item_name"] == "슬립웨이브"
    assert data["assumptions"]
    assert data["provider"] == "fake"


def test_intake_autofill_degrades_invalid_simulation_input(tmp_path) -> None:
    class BadInputLLM:
        async def generate(self, request: LLMRequest) -> LLMResponse:
            return LLMResponse(
                content=(
                    '{"project": {"name": "테스트 아이템"},'
                    ' "recommended_simulation_type": "price_optimization",'
                    ' "simulation_input": {"product_name": "테스트"},'
                    ' "assumptions": [], "notes": []}'
                ),
                provider="fake",
                provider_model="fake-model",
                trace_id="trace-autofill",
            )

    client = TestClient(
        create_app(store=SQLiteRunStore(tmp_path / "runs.sqlite3"), llm_client=BadInputLLM())
    )

    response = client.post("/api/intake/autofill", json={"prompt": "아이템 검증하고 싶어"})

    assert response.status_code == 200
    data = response.json()
    assert data["project_fields"]["name"] == "테스트 아이템"
    assert data["recommended_simulation_type"] == "price_optimization"
    assert data["simulation_input"] == {}
    assert any("검증에 실패" in note for note in data["notes"])
    assert data["assumptions"] == []


def test_intake_autofill_rejects_malformed_llm_json(tmp_path) -> None:
    class BrokenLLM:
        async def generate(self, request: LLMRequest) -> LLMResponse:
            return LLMResponse(
                content="not json at all",
                provider="fake",
                provider_model="fake-model",
                trace_id=None,
            )

    client = TestClient(
        create_app(store=SQLiteRunStore(tmp_path / "runs.sqlite3"), llm_client=BrokenLLM())
    )

    response = client.post("/api/intake/autofill", json={"prompt": "아이템 검증하고 싶어"})

    assert response.status_code == 502


def test_intake_autofill_maps_connection_failure_to_llm_unavailable(tmp_path) -> None:
    class ConnFailLLM:
        async def generate(self, request: LLMRequest) -> LLMResponse:
            raise RuntimeError("upstage connection failed.")

    client = TestClient(
        create_app(store=SQLiteRunStore(tmp_path / "runs.sqlite3"), llm_client=ConnFailLLM())
    )

    response = client.post("/api/intake/autofill", json={"prompt": "아이템 검증하고 싶어"})

    assert response.status_code == 502
    detail = response.json()["detail"]
    assert detail["code"] == "LLM_UNAVAILABLE"
    assert "연결" in detail["message"]


def test_startup_validation_accepts_intake_payload_without_problem_statement(tmp_path) -> None:
    """Regression: intake marked canInfer-critical slots satisfied with empty
    values and the run POST failed with 422 at the booth flow (2026-07-16)."""

    store = SQLiteRunStore(tmp_path / "runs.sqlite3")
    client = TestClient(create_app(store=store, enqueue_run_func=lambda run_id: "job-1"))

    response = client.post(
        "/api/runs",
        json={
            "simulation_type": "startup_item_validation",
            "input": {
                "item_name": "창업 여행",
                "item_description": "창업 교육 콘텐츠와 현지 생태계 탐방을 결합한 여행 상품",
                "problem_statement": "",
            },
            "sample_size": 200,
        },
    )

    assert response.status_code == 200


def test_validation_errors_are_persisted_for_traceability(tmp_path) -> None:
    store = SQLiteRunStore(tmp_path / "runs.sqlite3")
    client = TestClient(create_app(store=store, enqueue_run_func=lambda run_id: "job-1"))

    response = client.post(
        "/api/runs",
        json={
            "simulation_type": "startup_item_validation",
            "input": {"item_name": "", "item_description": ""},
            "sample_size": 200,
        },
    )

    assert response.status_code == 422
    with closing(sqlite3.connect(tmp_path / "runs.sqlite3")) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            "SELECT page, payload_json FROM analytics_events WHERE event_name = 'api_validation_error'"
        ).fetchall()
    assert rows, "422 must leave a traceable analytics event"
    payload = json.loads(rows[0]["payload_json"])
    assert payload["method"] == "POST"
    assert rows[0]["page"] == "/api/runs"
    assert any("item_description" in error["loc"] for error in payload["errors"])


def test_analytics_feedback_and_admin_api(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("KORESIM_AUTH_SECRET", "test-secret")
    monkeypatch.setenv("KORESIM_AUTH_COOKIE_SECURE", "false")
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "google-client")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "google-secret")
    monkeypatch.setenv("KORESIM_AUTH_TEST_LOGIN_ENABLED", "true")
    monkeypatch.setenv("KORESIM_AUTH_TEST_EMAIL", "admin@example.com")
    monkeypatch.setenv("KORESIM_ADMIN_EMAILS", "admin@example.com")
    store = SQLiteRunStore(tmp_path / "runs.sqlite3")
    client = TestClient(create_app(store=store, enqueue_run_func=lambda run_id: "job-1"))
    client.get("/api/auth/test-login", follow_redirects=False)

    analytics_response = client.post(
        "/api/analytics/events",
        json={
            "event_name": "page_view",
            "page": "/app",
            "simulation_type": "creative_testing",
            "payload": {"source": "test"},
        },
    )
    assert analytics_response.status_code == 200
    assert analytics_response.json()["event_name"] == "page_view"

    run_response = client.post(
        "/api/runs",
        json={
            "simulation_type": "creative_testing",
            "input": {"creatives": ["concept A", "concept B"]},
            "sample_size": 3,
        },
    )
    assert run_response.status_code == 200
    run_id = run_response.json()["run_id"]

    feedback_response = client.post(
        f"/api/runs/{run_id}/feedback",
        json={
            "usefulness_score": 5,
            "trust_score": 4,
            "actionability_score": 5,
            "intended_action": "가격 후보를 다시 테스트",
            "free_text": "세그먼트별 해석이 더 필요합니다.",
        },
    )
    assert feedback_response.status_code == 200
    assert feedback_response.json()["run_id"] == run_id

    overview_response = client.get("/api/admin/overview")
    assert overview_response.status_code == 200
    overview = overview_response.json()
    assert overview["users"] == 1
    assert overview["runs"] == 1
    assert overview["feedback"] == 1
    assert overview["analytics_events"] >= 3
    assert overview["recent_events"][0]["user_email"] != "admin@example.com"
    assert overview["funnel"]["steps"]
    assert overview["accounts"][0]["account_domain"] == "example.com"
    assert overview["policy"]["default_masking"] is True

    runs_response = client.get("/api/admin/runs")
    assert runs_response.status_code == 200
    assert runs_response.json()["items"][0]["run_id"] == run_id
    assert runs_response.json()["items"][0]["user_email"] != "admin@example.com"

    sensitive_runs_response = client.get("/api/admin/runs?include_sensitive=true")
    assert sensitive_runs_response.status_code == 200
    assert sensitive_runs_response.json()["items"][0]["user_email"] == "admin@example.com"

    feedback_list_response = client.get("/api/admin/feedback")
    assert feedback_list_response.status_code == 200
    assert feedback_list_response.json()["items"][0]["usefulness_score"] == 5
    assert "세그먼트별 해석" not in feedback_list_response.json()["items"][0]["free_text"]

    export_response = client.get("/api/admin/export")
    assert export_response.status_code == 200
    export_data = export_response.json()
    assert export_data["schema_version"] == "arabesque-admin-export/v1"
    assert export_data["feedback"][0]["free_text"] != "세그먼트별 해석이 더 필요합니다."

    prune_dry_run_response = client.post(
        "/api/admin/retention/prune",
        json={"retention_days": 180, "dry_run": True, "confirm": False},
    )
    assert prune_dry_run_response.status_code == 200
    assert prune_dry_run_response.json()["dry_run"] is True

    prune_without_confirm_response = client.post(
        "/api/admin/retention/prune",
        json={"retention_days": 180, "dry_run": False, "confirm": False},
    )
    assert prune_without_confirm_response.status_code == 400

    other_user = store.upsert_user_from_auth(
        {"email": "customer@example.com", "provider": "test"},
        free_run_limit=5,
    )
    delete_mismatch_response = client.post(
        f"/api/admin/users/{other_user.user_id}/delete",
        json={"confirm_user_id": "wrong-user"},
    )
    assert delete_mismatch_response.status_code == 400
    delete_response = client.post(
        f"/api/admin/users/{other_user.user_id}/delete",
        json={"confirm_user_id": other_user.user_id},
    )
    assert delete_response.status_code == 200
    assert store.get_user(other_user.user_id) is None


def test_admin_api_requires_admin_email(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("KORESIM_AUTH_SECRET", "test-secret")
    monkeypatch.setenv("KORESIM_AUTH_COOKIE_SECURE", "false")
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "google-client")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "google-secret")
    monkeypatch.setenv("KORESIM_AUTH_TEST_LOGIN_ENABLED", "true")
    monkeypatch.setenv("KORESIM_AUTH_TEST_EMAIL", "user@example.com")
    monkeypatch.setenv("KORESIM_ADMIN_EMAILS", "admin@example.com")
    client = TestClient(create_app(store=SQLiteRunStore(tmp_path / "runs.sqlite3")))
    client.get("/api/auth/test-login", follow_redirects=False)

    response = client.get("/api/admin/overview")

    assert response.status_code == 403


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


def test_authenticated_user_has_unlimited_runs_by_default(
    tmp_path,
    monkeypatch,
) -> None:
    monkeypatch.setenv("KORESIM_AUTH_SECRET", "test-secret")
    monkeypatch.setenv("KORESIM_AUTH_COOKIE_SECURE", "false")
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "google-client")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "google-secret")
    monkeypatch.setenv("KORESIM_AUTH_TEST_LOGIN_ENABLED", "true")
    monkeypatch.setenv("KORESIM_AUTH_TEST_EMAIL", "launch@example.com")
    monkeypatch.setenv("KORESIM_FREE_RUN_LIMIT", "0")
    monkeypatch.setattr("src.config.KORESIM_FREE_RUN_LIMIT", 0)
    store = SQLiteRunStore(tmp_path / "runs.sqlite3")
    client = TestClient(create_app(store=store, enqueue_run_func=lambda run_id: f"job-{run_id}"))
    client.get("/api/auth/test-login", follow_redirects=False)

    usage = client.get("/api/me/usage")
    assert usage.status_code == 200
    body = usage.json()
    assert body["free_run_limit"] == 0
    assert body["can_create_run"] is True

    for index in range(6):
        response = client.post(
            "/api/runs",
            json={
                "simulation_type": "creative_testing",
                "input": {"creatives": [f"concept A {index}", f"concept B {index}"]},
                "sample_size": 2,
            },
        )
        assert response.status_code == 200
        store.complete_free_run(
            "test:launch@example.com",
            response.json()["run_id"],
            reason="test_run_completed",
        )

    after = client.get("/api/me/usage").json()
    assert after["used_runs"] == 6
    assert after["can_create_run"] is True


def test_authenticated_user_is_blocked_when_free_run_limit_is_configured(
    tmp_path,
    monkeypatch,
) -> None:
    monkeypatch.setenv("KORESIM_AUTH_SECRET", "test-secret")
    monkeypatch.setenv("KORESIM_AUTH_COOKIE_SECURE", "false")
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "google-client")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "google-secret")
    monkeypatch.setenv("KORESIM_AUTH_TEST_LOGIN_ENABLED", "true")
    monkeypatch.setenv("KORESIM_AUTH_TEST_EMAIL", "capped@example.com")
    monkeypatch.setenv("KORESIM_FREE_RUN_LIMIT", "5")
    monkeypatch.setattr("src.config.KORESIM_FREE_RUN_LIMIT", 5)
    store = SQLiteRunStore(tmp_path / "runs.sqlite3")
    client = TestClient(create_app(store=store, enqueue_run_func=lambda run_id: f"job-{run_id}"))
    client.get("/api/auth/test-login", follow_redirects=False)

    usage = client.get("/api/me/usage")
    assert usage.status_code == 200
    assert usage.json()["remaining_runs"] == 5

    for index in range(5):
        response = client.post(
            "/api/runs",
            json={
                "simulation_type": "creative_testing",
                "input": {"creatives": [f"concept A {index}", f"concept B {index}"]},
                "sample_size": 2,
            },
        )
        assert response.status_code == 200
        store.complete_free_run(
            "test:capped@example.com",
            response.json()["run_id"],
            reason="test_run_completed",
        )

    exhausted = client.get("/api/me/usage").json()
    assert exhausted["used_runs"] == 5
    assert exhausted["remaining_runs"] == 0
    assert exhausted["can_create_run"] is False

    blocked = client.post(
        "/api/runs",
        json={
            "simulation_type": "creative_testing",
            "input": {"creatives": ["concept A final", "concept B final"]},
            "sample_size": 2,
        },
    )
    assert blocked.status_code == 403
    assert blocked.json()["detail"]["code"] == "FREE_QUOTA_EXHAUSTED"


def test_queue_failure_refunds_reserved_free_run(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("KORESIM_AUTH_SECRET", "test-secret")
    monkeypatch.setenv("KORESIM_AUTH_COOKIE_SECURE", "false")
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "google-client")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "google-secret")
    monkeypatch.setenv("KORESIM_AUTH_TEST_LOGIN_ENABLED", "true")
    monkeypatch.setenv("KORESIM_AUTH_TEST_EMAIL", "refund@example.com")
    monkeypatch.setenv("KORESIM_FREE_RUN_LIMIT", "1")
    # config.KORESIM_FREE_RUN_LIMIT is import-time; env alone is not enough when .env already loaded 5.
    monkeypatch.setattr("src.config.KORESIM_FREE_RUN_LIMIT", 1)
    store = SQLiteRunStore(tmp_path / "runs.sqlite3")

    def failing_enqueue(run_id: str) -> str:
        raise RuntimeError("redis unavailable")

    failing_client = TestClient(create_app(store=store, enqueue_run_func=failing_enqueue))
    failing_client.get("/api/auth/test-login", follow_redirects=False)
    failed = failing_client.post(
        "/api/runs",
        json={
            "simulation_type": "creative_testing",
            "input": {"creatives": ["concept A", "concept B"]},
            "sample_size": 2,
        },
    )
    assert failed.status_code == 503

    usage_after_failure = failing_client.get("/api/me/usage").json()
    assert usage_after_failure["used_runs"] == 0
    assert usage_after_failure["remaining_runs"] == 1

    success_client = TestClient(create_app(store=store, enqueue_run_func=lambda run_id: "job-1"))
    success_client.get("/api/auth/test-login", follow_redirects=False)
    accepted = success_client.post(
        "/api/runs",
        json={
            "simulation_type": "creative_testing",
            "input": {"creatives": ["concept A", "concept B"]},
            "sample_size": 2,
        },
    )
    assert accepted.status_code == 200
    assert success_client.get("/api/me/usage").json()["remaining_runs"] == 1
    store.complete_free_run(
        "test:refund@example.com",
        accepted.json()["run_id"],
        reason="test_run_completed",
    )
    assert success_client.get("/api/me/usage").json()["remaining_runs"] == 0


def test_admin_email_bypasses_free_run_quota(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("KORESIM_AUTH_SECRET", "test-secret")
    monkeypatch.setenv("KORESIM_AUTH_COOKIE_SECURE", "false")
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "google-client")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "google-secret")
    monkeypatch.setenv("KORESIM_AUTH_TEST_LOGIN_ENABLED", "true")
    monkeypatch.setenv("KORESIM_AUTH_TEST_EMAIL", "admin@example.com")
    monkeypatch.setenv("KORESIM_FREE_RUN_LIMIT", "1")
    monkeypatch.setattr("src.config.KORESIM_FREE_RUN_LIMIT", 1)
    monkeypatch.setenv("KORESIM_ADMIN_EMAILS", "admin@example.com")
    store = SQLiteRunStore(tmp_path / "runs.sqlite3")
    client = TestClient(create_app(store=store, enqueue_run_func=lambda run_id: f"job-{run_id}"))
    client.get("/api/auth/test-login", follow_redirects=False)

    for index in range(2):
        response = client.post(
            "/api/runs",
            json={
                "simulation_type": "creative_testing",
                "input": {"creatives": [f"concept A {index}", f"concept B {index}"]},
                "sample_size": 2,
            },
        )
        assert response.status_code == 200

    usage = client.get("/api/me/usage").json()
    assert usage["quota_bypass"] is True
    assert usage["can_create_run"] is True


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
