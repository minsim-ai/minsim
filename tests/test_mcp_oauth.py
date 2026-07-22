"""OAuth authorization server + MCP Bearer access tests."""

from __future__ import annotations

import base64
import hashlib
import secrets
from urllib.parse import parse_qs, urlparse

from fastapi.testclient import TestClient

from src.api.main import _is_public_path, create_app
from src.jobs.store import SQLiteRunStore


def _login(client: TestClient, monkeypatch, email: str = "oauth-user@example.com") -> None:
    monkeypatch.setenv("KORESIM_AUTH_SECRET", "test-secret")
    monkeypatch.setenv("KORESIM_AUTH_COOKIE_SECURE", "false")
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "google-client")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "google-secret")
    monkeypatch.setenv("KORESIM_AUTH_TEST_LOGIN_ENABLED", "true")
    monkeypatch.setenv("KORESIM_AUTH_TEST_EMAIL", email)
    monkeypatch.setenv("KORESIM_AUTH_LOCAL_DEV_AUTO_LOGIN", "false")
    response = client.get("/api/auth/test-login?next=/connect", follow_redirects=False)
    assert response.status_code == 303


def _pkce_pair() -> tuple[str, str]:
    verifier = secrets.token_urlsafe(48)
    challenge = (
        base64.urlsafe_b64encode(hashlib.sha256(verifier.encode("utf-8")).digest())
        .decode("ascii")
        .rstrip("=")
    )
    return verifier, challenge


def _rpc(method: str, params: dict | None = None, request_id: str = "1") -> dict:
    body = {"jsonrpc": "2.0", "id": request_id, "method": method}
    if params is not None:
        body["params"] = params
    return body


def test_oauth_discovery_is_public(monkeypatch) -> None:
    monkeypatch.setenv("KORESIM_AUTH_SECRET", "test-secret")
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "google-client")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "google-secret")
    monkeypatch.setenv("KORESIM_AUTH_LOCAL_DEV_AUTO_LOGIN", "false")
    client = TestClient(create_app(), base_url="https://arabesque.test")

    assert _is_public_path("/.well-known/oauth-authorization-server")
    assert _is_public_path("/oauth/register")
    assert _is_public_path("/oauth/token")

    metadata = client.get("/.well-known/oauth-authorization-server")
    assert metadata.status_code == 200
    body = metadata.json()
    assert body["issuer"] == "https://arabesque.test"
    assert body["authorization_endpoint"] == "https://arabesque.test/oauth/authorize"
    assert body["code_challenge_methods_supported"] == ["S256"]


def test_pkce_oauth_bearer_can_list_mcp_tools(tmp_path, monkeypatch) -> None:
    store = SQLiteRunStore(tmp_path / "runs.sqlite3")
    client = TestClient(
        create_app(store=store, enqueue_run_func=lambda run_id: f"job-{run_id}"),
        base_url="https://arabesque.test",
    )
    _login(client, monkeypatch)

    project = client.post("/api/projects", json={"name": "OAuth Project"}).json()
    verifier, challenge = _pkce_pair()

    registered = client.post(
        "/oauth/register",
        json={
            "client_name": "Cursor Test",
            "redirect_uris": ["http://127.0.0.1:8734/callback"],
            "token_endpoint_auth_method": "none",
        },
    )
    assert registered.status_code == 201
    client_id = registered.json()["client_id"]

    authorize = client.get(
        "/oauth/authorize",
        params={
            "response_type": "code",
            "client_id": client_id,
            "redirect_uri": "http://127.0.0.1:8734/callback",
            "scope": "koresim:mcp",
            "state": "xyz",
            "code_challenge": challenge,
            "code_challenge_method": "S256",
            "resource": "https://arabesque.test/mcp",
        },
    )
    assert authorize.status_code == 200
    assert "MCP 호스트 연결 승인" in authorize.text

    consent = client.post(
        "/oauth/authorize/consent",
        data={
            "client_id": client_id,
            "redirect_uri": "http://127.0.0.1:8734/callback",
            "scope": "koresim:mcp",
            "state": "xyz",
            "code_challenge": challenge,
            "code_challenge_method": "S256",
            "resource": "https://arabesque.test/mcp",
            "decision": "approve",
        },
        follow_redirects=False,
    )
    assert consent.status_code == 303
    location = consent.headers["location"]
    code = parse_qs(urlparse(location).query)["code"][0]

    token = client.post(
        "/oauth/token",
        data={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": "http://127.0.0.1:8734/callback",
            "client_id": client_id,
            "code_verifier": verifier,
        },
    )
    assert token.status_code == 200
    access_token = token.json()["access_token"]
    assert token.json()["token_type"] == "Bearer"
    assert token.json()["scope"] == "koresim:mcp"

    # Session cookies must not be required for host-style calls.
    bare = TestClient(
        create_app(store=store, enqueue_run_func=lambda run_id: f"job-{run_id}"),
        base_url="https://arabesque.test",
    )
    tools = bare.post(
        "/mcp",
        headers={"Authorization": f"Bearer {access_token}"},
        json=_rpc("tools/list", request_id="tools"),
    )
    assert tools.status_code == 200
    names = {item["name"] for item in tools.json()["result"]["tools"]}
    assert "koresim.list_projects" in names

    listed = bare.post(
        "/mcp",
        headers={"Authorization": f"Bearer {access_token}"},
        json=_rpc("tools/call", {"name": "koresim.list_projects", "arguments": {}}, request_id="list"),
    )
    assert listed.status_code == 200
    assert listed.json()["result"]["structuredContent"]["projects"][0]["project_id"] == project["project_id"]


def test_revoked_grant_rejects_bearer(tmp_path, monkeypatch) -> None:
    store = SQLiteRunStore(tmp_path / "runs.sqlite3")
    client = TestClient(
        create_app(store=store, enqueue_run_func=lambda run_id: f"job-{run_id}"),
        base_url="https://arabesque.test",
    )
    _login(client, monkeypatch)
    verifier, challenge = _pkce_pair()
    client_id = client.post(
        "/oauth/register",
        json={
            "client_name": "Revoke Client",
            "redirect_uris": ["http://127.0.0.1:9001/cb"],
            "token_endpoint_auth_method": "none",
        },
    ).json()["client_id"]

    client.get(
        "/oauth/authorize",
        params={
            "response_type": "code",
            "client_id": client_id,
            "redirect_uri": "http://127.0.0.1:9001/cb",
            "code_challenge": challenge,
            "code_challenge_method": "S256",
            "resource": "https://arabesque.test/mcp",
        },
    )
    consent = client.post(
        "/oauth/authorize/consent",
        data={
            "client_id": client_id,
            "redirect_uri": "http://127.0.0.1:9001/cb",
            "code_challenge": challenge,
            "code_challenge_method": "S256",
            "resource": "https://arabesque.test/mcp",
            "decision": "approve",
        },
        follow_redirects=False,
    )
    code = parse_qs(urlparse(consent.headers["location"]).query)["code"][0]
    access_token = client.post(
        "/oauth/token",
        data={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": "http://127.0.0.1:9001/cb",
            "client_id": client_id,
            "code_verifier": verifier,
        },
    ).json()["access_token"]

    grants = client.get("/api/mcp/grants").json()["grants"]
    assert len(grants) == 1
    revoked = client.delete(f"/api/mcp/grants/{grants[0]['grant_id']}")
    assert revoked.status_code == 200
    assert revoked.json()["grant"]["revoked_at"] is not None

    bare = TestClient(create_app(store=store), base_url="https://arabesque.test")
    response = bare.post(
        "/mcp",
        headers={"Authorization": f"Bearer {access_token}"},
        json=_rpc("initialize"),
    )
    assert response.status_code == 401


def test_wrong_resource_rejected_at_authorize(tmp_path, monkeypatch) -> None:
    store = SQLiteRunStore(tmp_path / "runs.sqlite3")
    client = TestClient(create_app(store=store), base_url="https://arabesque.test")
    _login(client, monkeypatch)
    _, challenge = _pkce_pair()
    client_id = client.post(
        "/oauth/register",
        json={
            "client_name": "Bad Resource",
            "redirect_uris": ["http://127.0.0.1:9002/cb"],
            "token_endpoint_auth_method": "none",
        },
    ).json()["client_id"]

    response = client.get(
        "/oauth/authorize",
        params={
            "response_type": "code",
            "client_id": client_id,
            "redirect_uri": "http://127.0.0.1:9002/cb",
            "code_challenge": challenge,
            "code_challenge_method": "S256",
            "resource": "https://evil.example/mcp",
        },
    )
    assert response.status_code == 400
    assert response.json()["error"] == "invalid_target"
