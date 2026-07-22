from fastapi.testclient import TestClient

from src.api.main import _is_public_path, create_app
from src.jobs.models import RunStatusValue
from src.jobs.store import SQLiteRunStore


def _login(client: TestClient, monkeypatch, email: str = "mcp@example.com") -> None:
    monkeypatch.setenv("KORESIM_AUTH_SECRET", "test-secret")
    monkeypatch.setenv("KORESIM_AUTH_COOKIE_SECURE", "false")
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "google-client")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "google-secret")
    monkeypatch.setenv("KORESIM_AUTH_TEST_LOGIN_ENABLED", "true")
    monkeypatch.setenv("KORESIM_AUTH_TEST_EMAIL", email)
    response = client.get("/api/auth/test-login", follow_redirects=False)
    assert response.status_code == 303


def _rpc(method: str, params: dict | None = None, request_id: str = "1") -> dict:
    body = {"jsonrpc": "2.0", "id": request_id, "method": method}
    if params is not None:
        body["params"] = params
    return body


def _configure_api_key(monkeypatch, *, token: str = "mcp_test_0123456789abcdef0123456789abcdef") -> str:
    monkeypatch.setenv("KORESIM_MCP_API_KEY", token)
    monkeypatch.setenv("KORESIM_MCP_API_KEY_ID", "external-pilot")
    monkeypatch.setenv("KORESIM_MCP_API_KEY_EMAIL", "mcp-pilot@arabesque.test")
    monkeypatch.setenv("KORESIM_MCP_API_KEY_NAME", "MCP Pilot")
    monkeypatch.setenv("KORESIM_AUTH_LOCAL_DEV_AUTO_LOGIN", "false")
    return token


def test_mcp_unauthenticated_response_advertises_protected_resource(monkeypatch) -> None:
    monkeypatch.setenv("KORESIM_AUTH_SECRET", "test-secret")
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "google-client")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "google-secret")
    monkeypatch.setenv("KORESIM_AUTH_LOCAL_DEV_AUTO_LOGIN", "false")
    client = TestClient(create_app(), base_url="https://arabesque.test")

    response = client.post("/mcp", json=_rpc("initialize"))

    assert _is_public_path("/mcp")
    assert _is_public_path("/.well-known/oauth-protected-resource")
    assert response.status_code == 401
    assert 'resource_metadata="https://arabesque.test/.well-known/oauth-protected-resource"' in response.headers[
        "www-authenticate"
    ]

    metadata = client.get("/.well-known/oauth-protected-resource")
    assert metadata.status_code == 200
    assert metadata.json()["resource"] == "https://arabesque.test/mcp"
    assert metadata.json()["authorization_servers"] == ["https://arabesque.test"]
    assert metadata.json()["authentication_methods"] == ["oauth2_bearer", "google_session_cookie"]
    assert metadata.json()["bearer_methods_supported"] == ["header"]
    assert "OAuth access token" in response.json()["message"]


def test_mcp_initialize_tools_and_resources_after_login(tmp_path, monkeypatch) -> None:
    store = SQLiteRunStore(tmp_path / "runs.sqlite3")
    client = TestClient(create_app(store=store, enqueue_run_func=lambda run_id: f"job-{run_id}"))
    _login(client, monkeypatch)
    project = client.post("/api/projects", json={"name": "MCP Project", "description": "Shared context"}).json()

    initialized = client.post("/mcp", json=_rpc("initialize"))
    assert initialized.status_code == 200
    assert initialized.json()["result"]["serverInfo"]["name"] == "koresim-v2"

    tools = client.post("/mcp", json=_rpc("tools/list", request_id="tools"))
    assert tools.status_code == 200
    tool_names = {item["name"] for item in tools.json()["result"]["tools"]}
    assert {"koresim.list_projects", "koresim.export_run", "koresim.ask_followup"}.issubset(tool_names)

    listed = client.post(
        "/mcp",
        json=_rpc("tools/call", {"name": "koresim.list_projects", "arguments": {}}, request_id="list"),
    )
    assert listed.status_code == 200
    assert listed.json()["result"]["structuredContent"]["projects"][0]["project_id"] == project["project_id"]

    resource = client.post(
        "/mcp",
        json=_rpc("resources/read", {"uri": "koresim://projects"}, request_id="resources"),
    )
    assert resource.status_code == 200
    assert "MCP Project" in resource.json()["result"]["contents"][0]["text"]


def test_mcp_rejects_legacy_shared_bearer_even_when_configured(tmp_path, monkeypatch) -> None:
    store = SQLiteRunStore(tmp_path / "runs.sqlite3")
    client = TestClient(
        create_app(store=store, enqueue_run_func=lambda run_id: f"job-{run_id}"),
        base_url="https://arabesque.test",
    )
    token = _configure_api_key(monkeypatch)

    response = client.post(
        "/mcp",
        headers={"Authorization": f"Bearer {token}"},
        json=_rpc("initialize"),
    )

    assert response.status_code == 401
    assert response.json()["error"] == "AUTH_REQUIRED"
    user = store.get_user("mcp_api_key:external-pilot")
    assert user is None


def test_mcp_rejects_invalid_bearer_api_key(tmp_path, monkeypatch) -> None:
    client = TestClient(
        create_app(store=SQLiteRunStore(tmp_path / "runs.sqlite3")),
        base_url="https://arabesque.test",
    )
    _configure_api_key(monkeypatch)

    response = client.post(
        "/mcp",
        headers={"Authorization": "Bearer wrong-key"},
        json=_rpc("initialize"),
    )

    assert response.status_code == 401
    assert response.json()["error"] == "AUTH_REQUIRED"


def test_mcp_rejects_untrusted_origin_even_with_valid_login_session(tmp_path, monkeypatch) -> None:
    client = TestClient(
        create_app(store=SQLiteRunStore(tmp_path / "runs.sqlite3")),
        base_url="https://arabesque.test",
    )
    _login(client, monkeypatch)

    response = client.post(
        "/mcp",
        headers={
            "Origin": "https://attacker.example",
        },
        json=_rpc("initialize"),
    )

    assert response.status_code == 403
    assert response.json()["error"] == "ORIGIN_FORBIDDEN"


def test_mcp_export_tool_returns_redacted_project_report(tmp_path, monkeypatch) -> None:
    store = SQLiteRunStore(tmp_path / "runs.sqlite3")
    client = TestClient(create_app(store=store, enqueue_run_func=lambda run_id: f"job-{run_id}"))
    _login(client, monkeypatch)
    project = client.post("/api/projects", json={"name": "Export Project"}).json()
    created_run = client.post(
        f"/api/projects/{project['project_id']}/runs",
        json={
            "run_label": "Exportable run",
            "simulation_type": "creative_testing",
            "input": {"creatives": ["A copy", "B copy"]},
            "sample_size": 2,
            "seed": 42,
        },
    ).json()
    run_id = created_run["run"]["run_id"]
    store.save_result(run_id, _result_envelope(run_id))
    store.update_run_status(run_id, RunStatusValue.COMPLETED, done_count=2)

    response = client.post(
        "/mcp",
        json=_rpc(
            "tools/call",
            {
                "name": "koresim.export_run",
                "arguments": {"project_id": project["project_id"], "run_id": run_id},
            },
            request_id="export",
        ),
    )

    assert response.status_code == 200
    report = response.json()["result"]["structuredContent"]
    assert report["run_id"] == run_id
    assert report["human_review_required"] is True
    assert report["raw_results_included"] is False
    assert "raw_results" not in report


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
