from fastapi.testclient import TestClient

from src.api.main import create_app
from src.jobs.models import RunStatusValue
from src.jobs.store import SQLiteRunStore


def _login(client: TestClient, monkeypatch, email: str) -> None:
    monkeypatch.setenv("KORESIM_AUTH_SECRET", "test-secret")
    monkeypatch.setenv("KORESIM_AUTH_COOKIE_SECURE", "false")
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "google-client")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "google-secret")
    monkeypatch.setenv("KORESIM_AUTH_TEST_LOGIN_ENABLED", "true")
    monkeypatch.setenv("KORESIM_AUTH_TEST_EMAIL", email)
    response = client.get("/api/auth/test-login", follow_redirects=False)
    assert response.status_code == 303


def test_project_api_crud_and_archive(tmp_path, monkeypatch) -> None:
    store = SQLiteRunStore(tmp_path / "runs.sqlite3")
    client = TestClient(create_app(store=store, enqueue_run_func=lambda run_id: f"job-{run_id}"))
    _login(client, monkeypatch, "owner@example.com")

    created = client.post(
        "/api/projects",
        json={
            "name": "Ony",
            "description": "Care product",
            "product_context": {"category": "care"},
            "features": ["check-in"],
            "prices": ["29000"],
            "target_notes": "70+ seniors",
            "alternatives": ["phone call"],
        },
    )

    assert created.status_code == 200
    project = created.json()
    assert project["name"] == "Ony"
    assert project["product_context"]["category"] == "care"

    listed = client.get("/api/projects")
    assert listed.status_code == 200
    assert [item["project_id"] for item in listed.json()["projects"]] == [project["project_id"]]

    patched = client.patch(
        f"/api/projects/{project['project_id']}",
        json={
            "name": "Ony v2",
            "description": "Updated",
            "product_context": {"category": "care", "positioning": "family"},
            "features": ["check-in", "alert"],
            "prices": ["39000"],
            "target_notes": "family caregivers",
            "alternatives": ["home visit"],
        },
    )
    assert patched.status_code == 200
    assert patched.json()["name"] == "Ony v2"

    archived = client.post(f"/api/projects/{project['project_id']}/archive")
    assert archived.status_code == 200
    assert archived.json()["archived_at"] is not None
    assert client.get("/api/projects").json()["projects"] == []


def test_project_api_scopes_projects_to_authenticated_user(tmp_path, monkeypatch) -> None:
    store = SQLiteRunStore(tmp_path / "runs.sqlite3")
    first = TestClient(create_app(store=store, enqueue_run_func=lambda run_id: "job-1"))
    _login(first, monkeypatch, "first@example.com")
    created = first.post("/api/projects", json={"name": "Private project"})
    project_id = created.json()["project_id"]

    second = TestClient(create_app(store=store, enqueue_run_func=lambda run_id: "job-2"))
    _login(second, monkeypatch, "second@example.com")
    assert second.get(f"/api/projects/{project_id}").status_code == 404
    assert second.patch(f"/api/projects/{project_id}", json={"name": "Stolen"}).status_code == 404
    assert second.post(f"/api/projects/{project_id}/archive").status_code == 404


def test_project_run_creation_wraps_existing_run_creation(tmp_path, monkeypatch) -> None:
    store = SQLiteRunStore(tmp_path / "runs.sqlite3")
    enqueued: list[str] = []
    client = TestClient(
        create_app(
            store=store,
            enqueue_run_func=lambda run_id: enqueued.append(run_id) or f"job-{run_id}",
        )
    )
    _login(client, monkeypatch, "owner@example.com")
    project = client.post(
        "/api/projects",
        json={
            "name": "Launch",
            "product_context": {"product_description": "AI research SaaS"},
            "features": ["Korean persona simulation"],
            "prices": ["99000"],
        },
    ).json()

    response = client.post(
        f"/api/projects/{project['project_id']}/runs",
        json={
            "run_label": "Message test",
            "simulation_type": "creative_testing",
            "input": {"creatives": ["A copy", "B copy"]},
            "sample_size": 3,
            "target_filter": {"province": ["Seoul"]},
            "seed": 42,
            "intake_context": {
                "schema_version": "intake-context/v1",
                "intake_session_id": "intake-project-1",
                "router_version": "goal-router:v1",
                "planner_version": "intake-planner:v2-20260513",
                "task_frame": {},
                "provenance": {},
                "safe_intake_summary": {
                    "schema_version": "safe-intake-summary/v1",
                    "user_goal": "카피 비교",
                    "decision_question": "어떤 카피가 더 좋은가?",
                    "simulation_type": "creative_testing",
                    "user_provided": {},
                    "inferred": {},
                    "generated": {},
                    "defaults": {},
                    "reviewed_assumptions": {},
                    "generated_candidates": ["A copy", "B copy"],
                    "constraints": {},
                    "source_counts": {"user": 0, "inferred": 0, "generated": 0, "default": 0},
                    "unreviewed_assumption_count": 0,
                },
            },
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["project_id"] == project["project_id"]
    assert body["run"]["status"] == "queued"
    assert enqueued == [body["run"]["run_id"]]

    runs = client.get(f"/api/projects/{project['project_id']}/runs")
    assert runs.status_code == 200
    assert runs.json()["runs"][0]["run"]["run_id"] == body["run"]["run_id"]


def test_project_run_actions_reject_other_users(tmp_path, monkeypatch) -> None:
    store = SQLiteRunStore(tmp_path / "runs.sqlite3")
    owner = TestClient(create_app(store=store, enqueue_run_func=lambda run_id: f"job-{run_id}"))
    _login(owner, monkeypatch, "owner@example.com")
    project = owner.post("/api/projects", json={"name": "Private result"}).json()
    created_run = owner.post(
        f"/api/projects/{project['project_id']}/runs",
        json={
            "run_label": "Private run",
            "simulation_type": "creative_testing",
            "input": {"creatives": ["A copy", "B copy"]},
            "sample_size": 2,
            "seed": 42,
        },
    ).json()
    run_id = created_run["run"]["run_id"]
    store.save_result(run_id, _result_envelope(run_id))
    store.update_run_status(run_id, RunStatusValue.COMPLETED, done_count=2)

    other = TestClient(create_app(store=store, enqueue_run_func=lambda run_id: "job-other"))
    _login(other, monkeypatch, "other@example.com")

    cases = [
        ("get", f"/api/projects/{project['project_id']}/runs/{run_id}/result", {}),
        ("get", f"/api/projects/{project['project_id']}/runs/{run_id}/export", {}),
        (
            "post",
            f"/api/projects/{project['project_id']}/runs/{run_id}/feedback",
            {"json": {"usefulness_score": 4}},
        ),
        (
            "post",
            f"/api/projects/{project['project_id']}/runs/{run_id}/followup",
            {"json": {"question": "왜요?", "cohort": "all", "sample_size": 1}},
        ),
        (
            "post",
            f"/api/projects/{project['project_id']}/runs/{run_id}/interview",
            {"json": {"question": "더 설명해주세요.", "sample_size": 1}},
        ),
        (
            "get",
            f"/api/projects/{project['project_id']}/runs/{run_id}/interview-threads",
            {},
        ),
        (
            "post",
            f"/api/projects/{project['project_id']}/runs/{run_id}/interview-threads",
            {"json": {"subject_uuid": "persona-1"}},
        ),
    ]
    for method, path, kwargs in cases:
        response = getattr(other, method)(path, **kwargs)
        assert response.status_code == 404


class _InterviewFakeLLM:
    async def generate(self, request):  # noqa: ANN001
        from src.llm.base import LLMResponse

        return LLMResponse(
            content='{"answer": "가격이 부담되지 않아서요.", "confidence": 0.8}',
            provider="fake",
            provider_model="fake-model",
            trace_id="trace-interview",
            metadata={"task_type": getattr(request, "task_type", None)},
        )


def test_project_interview_thread_persists_messages_and_rejects_unknown_subject(tmp_path, monkeypatch) -> None:
    store = SQLiteRunStore(tmp_path / "runs.sqlite3")
    client = TestClient(
        create_app(
            store=store,
            enqueue_run_func=lambda run_id: f"job-{run_id}",
            llm_client=_InterviewFakeLLM(),
        )
    )
    _login(client, monkeypatch, "owner@example.com")
    project = client.post("/api/projects", json={"name": "Interview project"}).json()
    created_run = client.post(
        f"/api/projects/{project['project_id']}/runs",
        json={
            "simulation_type": "creative_testing",
            "input": {"creatives": ["A copy", "B copy"]},
            "sample_size": 2,
            "seed": 42,
        },
    ).json()
    run_id = created_run["run"]["run_id"]
    store.save_result(run_id, _result_envelope(run_id))
    store.update_run_status(run_id, RunStatusValue.COMPLETED, done_count=2)

    invalid = client.post(
        f"/api/projects/{project['project_id']}/runs/{run_id}/interview-threads",
        json={"subject_uuid": "missing-persona"},
    )
    assert invalid.status_code == 400

    created = client.post(
        f"/api/projects/{project['project_id']}/runs/{run_id}/interview-threads",
        json={
            "subject_uuid": "persona-1",
            "subject_label": "김영희 · A안",
            "subject_meta": "30세 · 서울",
            "context_quote": "메시지가 명확해서 좋습니다.",
        },
    )
    assert created.status_code == 200
    thread_id = created.json()["thread_id"]
    assert created.json()["messages"] == []

    first_turn = client.post(
        f"/api/projects/{project['project_id']}/runs/{run_id}/interview-threads/{thread_id}/messages",
        json={"question": "왜 그렇게 답했나요?"},
    )
    assert first_turn.status_code == 200
    assert [message["role"] for message in first_turn.json()["messages"]] == ["user", "assistant"]

    second_turn = client.post(
        f"/api/projects/{project['project_id']}/runs/{run_id}/interview-threads/{thread_id}/messages",
        json={"question": "조금 더 설명해주세요."},
    )
    assert second_turn.status_code == 200
    assert [message["ordinal"] for message in second_turn.json()["messages"]] == [0, 1, 2, 3]

    restored = client.get(
        f"/api/projects/{project['project_id']}/runs/{run_id}/interview-threads"
    )
    assert restored.status_code == 200
    assert restored.json()["threads"][0]["thread_id"] == thread_id
    assert len(restored.json()["threads"][0]["messages"]) == 4


def _result_envelope(run_id: str) -> dict:
    return {
        "schema_version": "result-envelope/v1",
        "run_id": run_id,
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
        "metrics": {"choice_counts": {"A": 2}, "choice_pct": {"A": 100}},
        "segments": {},
        "insights": [{"title": "A wins"}],
        "raw_results": [
            {
                "uuid": "persona-1",
                "persona": {"uuid": "persona-1", "age": 30},
                "response": "선택: A",
                "parsed": {"choice": "A", "score": 5},
            }
        ],
        "model_alias": "test",
        "provider": "fake",
        "provider_model": "fake-model",
        "llm_backend": "fake",
        "trace_id": None,
    }


def test_patch_without_kind_preserves_poll(tmp_path, monkeypatch) -> None:
    """상세 화면의 '저장'은 kind를 보내지 않는다. 갈래가 조용히 바뀌면 안 된다."""
    store = SQLiteRunStore(tmp_path / "runs.sqlite3")
    client = TestClient(create_app(store=store, enqueue_run_func=lambda run_id: f"job-{run_id}"))
    _login(client, monkeypatch, "poll-owner@example.com")

    created = client.post(
        "/api/projects", json={"name": "도서관 24시간", "kind": "poll"}
    )
    assert created.status_code == 200
    assert created.json()["kind"] == "poll"
    project_id = created.json()["project_id"]

    # ProjectDetailPage.tsx가 실제로 보내는 페이로드 — kind 없음.
    patched = client.patch(
        f"/api/projects/{project_id}",
        json={
            "name": "도서관 24시간",
            "description": "설명만 고침",
            "product_context": {},
            "features": [],
            "prices": [],
            "target_notes": "학부생 위주",
            "alternatives": [],
        },
    )
    assert patched.status_code == 200
    assert patched.json()["kind"] == "poll"
    assert client.get(f"/api/projects/{project_id}").json()["kind"] == "poll"


def _poll_project(client: TestClient) -> str:
    created = client.post("/api/projects", json={"name": "여론조사", "kind": "poll"})
    assert created.status_code == 200
    return created.json()["project_id"]


def test_poll_project_rejects_venture_only_simulation(tmp_path, monkeypatch) -> None:
    """갈래 규칙이 프론트엔드 상수에만 있어 API 직접 호출이 통과하던 결함."""
    store = SQLiteRunStore(tmp_path / "runs.sqlite3")
    client = TestClient(create_app(store=store, enqueue_run_func=lambda run_id: f"job-{run_id}"))
    _login(client, monkeypatch, "poll-run@example.com")
    project_id = _poll_project(client)

    response = client.post(
        f"/api/projects/{project_id}/runs",
        json={
            "simulation_type": "startup_item_validation",
            "sample_size": 10,
            "input": {"item_name": "테스트 아이템", "item_description": "테스트 설명"},
        },
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "UNSUPPORTED_SIMULATION_TYPE"


def test_venture_project_rejects_campus_simulation(tmp_path, monkeypatch) -> None:
    store = SQLiteRunStore(tmp_path / "runs.sqlite3")
    client = TestClient(create_app(store=store, enqueue_run_func=lambda run_id: f"job-{run_id}"))
    _login(client, monkeypatch, "venture-run@example.com")
    created = client.post("/api/projects", json={"name": "사업", "kind": "venture"})
    project_id = created.json()["project_id"]

    response = client.post(
        f"/api/projects/{project_id}/runs",
        json={
            "simulation_type": "campus_policy",
            "sample_size": 10,
            "input": {"agenda": "도서관 24시간", "current_state": "평일 09-23시", "proposed_change": "24시간", "tradeoffs": "연 1.2억"},
        },
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "UNSUPPORTED_SIMULATION_TYPE"


def test_poll_project_rejects_non_korean_country(tmp_path, monkeypatch) -> None:
    store = SQLiteRunStore(tmp_path / "runs.sqlite3")
    client = TestClient(create_app(store=store, enqueue_run_func=lambda run_id: f"job-{run_id}"))
    _login(client, monkeypatch, "poll-country@example.com")
    project_id = _poll_project(client)

    response = client.post(
        f"/api/projects/{project_id}/runs",
        json={
            "simulation_type": "campus_policy",
            "sample_size": 10,
            "country_id": "fr",
            "input": {"agenda": "도서관 24시간", "current_state": "평일 09-23시", "proposed_change": "24시간", "tradeoffs": "연 1.2억"},
        },
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "INVALID_REQUEST"


def test_poll_project_defaults_to_dgist_pool(tmp_path, monkeypatch) -> None:
    """persona_pool을 생략하면 스키마 기본값(nationwide)이 조용히 채워지던 결함."""
    from src.simulations.kind_policy import default_persona_pool

    assert default_persona_pool("poll") == "dgist"
    assert default_persona_pool("venture") == "nationwide"
    assert default_persona_pool(None) == "nationwide"

    store = SQLiteRunStore(tmp_path / "runs.sqlite3")
    client = TestClient(create_app(store=store, enqueue_run_func=lambda run_id: f"job-{run_id}"))
    _login(client, monkeypatch, "poll-pool-default@example.com")
    project_id = _poll_project(client)

    omitted = client.post(
        f"/api/projects/{project_id}/runs",
        json={
            "simulation_type": "open_survey",
            "sample_size": 10,
            "input": {"question": "Q?", "options": ["A", "B"]},
        },
    )
    assert omitted.status_code == 200
    omitted_run = store.get_run(omitted.json()["run"]["run_id"])
    assert omitted_run is not None
    assert omitted_run.persona_pool == "dgist"

    nationwide = client.post(
        f"/api/projects/{project_id}/runs",
        json={
            "simulation_type": "open_survey",
            "sample_size": 10,
            "persona_pool": "nationwide",
            "input": {"question": "Q?", "options": ["A", "B"]},
        },
    )
    assert nationwide.status_code == 200
    nationwide_run = store.get_run(nationwide.json()["run"]["run_id"])
    assert nationwide_run is not None
    assert nationwide_run.persona_pool == "nationwide"
    snapshot = client.get(f"/api/runs/{nationwide_run.run_id}")
    assert snapshot.status_code == 200
    assert snapshot.json()["persona_pool"] == "nationwide"
