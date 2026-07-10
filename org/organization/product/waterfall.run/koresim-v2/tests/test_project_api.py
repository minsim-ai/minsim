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
    ]
    for method, path, kwargs in cases:
        response = getattr(other, method)(path, **kwargs)
        assert response.status_code == 404


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
