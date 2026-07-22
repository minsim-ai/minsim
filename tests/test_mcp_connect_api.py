"""MCP connect metadata API tests."""

from __future__ import annotations

from fastapi.testclient import TestClient

from src.api.main import create_app
from src.jobs.store import SQLiteRunStore


def _login(client: TestClient, monkeypatch) -> None:
    monkeypatch.setenv("KORESIM_AUTH_SECRET", "test-secret")
    monkeypatch.setenv("KORESIM_AUTH_COOKIE_SECURE", "false")
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "google-client")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "google-secret")
    monkeypatch.setenv("KORESIM_AUTH_TEST_LOGIN_ENABLED", "true")
    monkeypatch.setenv("KORESIM_AUTH_TEST_EMAIL", "connect@example.com")
    monkeypatch.setenv("KORESIM_AUTH_LOCAL_DEV_AUTO_LOGIN", "false")
    response = client.get("/api/auth/test-login?next=/connect", follow_redirects=False)
    assert response.status_code == 303


def test_mcp_connect_requires_login(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("KORESIM_AUTH_SECRET", "test-secret")
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "google-client")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "google-secret")
    monkeypatch.setenv("KORESIM_AUTH_LOCAL_DEV_AUTO_LOGIN", "false")
    monkeypatch.setenv("KORESIM_AUTH_REQUIRED", "true")
    client = TestClient(
        create_app(store=SQLiteRunStore(tmp_path / "runs.sqlite3")),
        base_url="https://arabesque.test",
    )
    response = client.get("/api/mcp/connect")
    assert response.status_code == 401


def test_mcp_connect_returns_configs_and_tools(tmp_path, monkeypatch) -> None:
    client = TestClient(
        create_app(store=SQLiteRunStore(tmp_path / "runs.sqlite3")),
        base_url="https://arabesque.test",
    )
    _login(client, monkeypatch)

    response = client.get("/api/mcp/connect")
    assert response.status_code == 200
    body = response.json()
    assert body["oauth_ready"] is True
    assert body["resource"] == "https://arabesque.test/mcp"
    assert body["configs"]["cursor"]["mcpServers"]["koresim"]["url"] == "https://arabesque.test/mcp"
    assert body["configs"]["claude_desktop"]["mcpServers"]["koresim"]["url"] == "https://arabesque.test/mcp"
    assert len(body["tools"]) == 9
    assert body["grants"] == []
