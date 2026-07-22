from fastapi.testclient import TestClient

from src.api.main import _is_public_path, create_app
from src.api.schemas import RunCreateRequest


def test_auth_session_reports_disabled_when_google_secret_is_missing(monkeypatch) -> None:
    monkeypatch.delenv("KORESIM_AUTH_SECRET", raising=False)
    monkeypatch.delenv("BETTER_AUTH_SECRET", raising=False)
    monkeypatch.delenv("GOOGLE_OAUTH_CLIENT_ID", raising=False)
    monkeypatch.delenv("GOOGLE_OAUTH_CLIENT_SECRET", raising=False)
    client = TestClient(create_app())

    response = client.get("/api/auth/session")

    assert response.status_code == 200
    data = response.json()
    assert data["authenticated"] is False
    assert data["auth_enabled"] is False
    assert data["auth_required"] is False
    assert data["login_url"] == "/api/auth/google/login"


def test_test_login_is_disabled_by_default(monkeypatch) -> None:
    monkeypatch.delenv("KORESIM_AUTH_TEST_LOGIN_ENABLED", raising=False)
    client = TestClient(create_app())

    response = client.get("/api/auth/test-login", follow_redirects=False)

    assert response.status_code == 404


def test_test_login_sets_signed_session_cookie(monkeypatch) -> None:
    monkeypatch.setenv("KORESIM_AUTH_SECRET", "test-secret")
    monkeypatch.setenv("KORESIM_AUTH_COOKIE_SECURE", "false")
    monkeypatch.setenv("KORESIM_AUTH_TEST_LOGIN_ENABLED", "true")
    monkeypatch.setenv("KORESIM_AUTH_TEST_EMAIL", "qa@example.com")
    client = TestClient(create_app())

    login_response = client.get("/api/auth/test-login?next=/app", follow_redirects=False)

    assert login_response.status_code == 303
    assert login_response.headers["location"] == "/app"
    assert "koresim_session=" in login_response.headers["set-cookie"]

    session_response = client.get("/api/auth/session")
    assert session_response.status_code == 200
    session = session_response.json()
    assert session["authenticated"] is True
    assert session["provider"] == "test"
    assert session["user"]["email"] == "qa@example.com"


def test_test_login_blocked_on_public_demo_host(monkeypatch) -> None:
    monkeypatch.setenv("KORESIM_AUTH_SECRET", "test-secret")
    monkeypatch.setenv("KORESIM_AUTH_COOKIE_SECURE", "false")
    monkeypatch.setenv("KORESIM_AUTH_TEST_LOGIN_ENABLED", "true")
    client = TestClient(create_app())

    response = client.get(
        "/api/auth/test-login?next=/app",
        headers={"host": "arabesque.cc"},
        follow_redirects=False,
    )
    assert response.status_code == 404


def test_csrf_enforced_when_enabled(monkeypatch) -> None:
    monkeypatch.setenv("KORESIM_AUTH_SECRET", "test-secret")
    monkeypatch.setenv("KORESIM_AUTH_COOKIE_SECURE", "false")
    monkeypatch.setenv("KORESIM_AUTH_TEST_LOGIN_ENABLED", "true")
    monkeypatch.setenv("KORESIM_AUTH_REQUIRED", "false")
    monkeypatch.setenv("KORESIM_CSRF_ENFORCE", "true")
    client = TestClient(create_app())
    client.get("/api/auth/test-login", follow_redirects=False)
    # Bootstrap CSRF cookie via any GET.
    bootstrap = client.get("/api/auth/session")
    assert bootstrap.status_code == 200
    csrf = client.cookies.get("koresim_csrf")
    assert csrf

    denied = client.post("/api/projects", json={"name": "x", "kind": "venture"})
    assert denied.status_code == 403
    assert denied.json()["detail"]["code"] == "CSRF_FAILED"

    allowed = client.post(
        "/api/projects",
        json={"name": "demo", "kind": "venture"},
        headers={"X-CSRF-Token": csrf},
    )
    # May be 200/201 or validation 422 depending on schema — but not CSRF 403.
    assert allowed.status_code != 403


def test_logout_clears_session_cookie(monkeypatch) -> None:
    monkeypatch.setenv("KORESIM_AUTH_SECRET", "test-secret")
    monkeypatch.setenv("KORESIM_AUTH_COOKIE_SECURE", "false")
    monkeypatch.setenv("KORESIM_AUTH_TEST_LOGIN_ENABLED", "true")
    client = TestClient(create_app())
    client.get("/api/auth/test-login", follow_redirects=False)

    response = client.post("/api/auth/logout?next=/", follow_redirects=False)

    assert response.status_code == 303
    assert response.headers["location"] == "/"
    assert "koresim_session=" in response.headers["set-cookie"]


def test_auth_required_protects_app_and_api_when_google_is_configured(monkeypatch) -> None:
    monkeypatch.setenv("KORESIM_AUTH_SECRET", "test-secret")
    monkeypatch.setenv("KORESIM_AUTH_COOKIE_SECURE", "false")
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "google-client")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "google-secret")
    monkeypatch.setenv("KORESIM_AUTH_TEST_LOGIN_ENABLED", "true")
    client = TestClient(create_app())

    app_response = client.get("/app", follow_redirects=False)
    assert app_response.status_code == 303
    assert app_response.headers["location"].startswith("/login?")
    assert "next=%2Fapp" in app_response.headers["location"]

    api_response = client.get("/api/presets")
    assert api_response.status_code == 401
    assert api_response.json()["detail"]["code"] == "AUTH_REQUIRED"

    client.get("/api/auth/test-login", follow_redirects=False)
    authorized = client.get("/api/presets")
    assert authorized.status_code == 200
    assert authorized.json()


def test_seo_public_paths_bypass_auth_middleware() -> None:
    assert _is_public_path("/robots.txt")
    assert _is_public_path("/sitemap.xml")
    assert _is_public_path("/use-cases/price-optimization/")
    assert _is_public_path("/simulations/price-optimization/")
    assert _is_public_path("/compare/market-research-vs-ai-simulation/")
    assert _is_public_path("/landing/logos/nvidia.svg")
    assert not _is_public_path("/app")
    assert not _is_public_path("/results")
    assert not _is_public_path("/admin")


def test_localhost_auto_login_allows_local_development_without_google_click(monkeypatch) -> None:
    monkeypatch.setenv("KORESIM_AUTH_SECRET", "test-secret")
    monkeypatch.setenv("KORESIM_AUTH_COOKIE_SECURE", "false")
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "google-client")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "google-secret")
    client = TestClient(create_app(), base_url="http://127.0.0.1")

    session_response = client.get("/api/auth/session")
    assert session_response.status_code == 200
    session = session_response.json()
    assert session["authenticated"] is True
    assert session["provider"] == "local_dev"

    api_response = client.get("/api/presets")
    assert api_response.status_code == 200
    assert "koresim_session=" in api_response.headers["set-cookie"]


def test_localhost_auto_login_can_be_disabled(monkeypatch) -> None:
    monkeypatch.setenv("KORESIM_AUTH_SECRET", "test-secret")
    monkeypatch.setenv("KORESIM_AUTH_COOKIE_SECURE", "false")
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "google-client")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "google-secret")
    monkeypatch.setenv("KORESIM_AUTH_LOCAL_DEV_AUTO_LOGIN", "false")
    client = TestClient(create_app(), base_url="http://127.0.0.1")

    api_response = client.get("/api/presets")
    assert api_response.status_code == 401


def test_authenticated_user_cannot_read_another_users_run_partials(monkeypatch) -> None:
    monkeypatch.setenv("KORESIM_AUTH_SECRET", "test-secret")
    monkeypatch.setenv("KORESIM_AUTH_COOKIE_SECURE", "false")
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "google-client")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "google-secret")
    monkeypatch.setenv("KORESIM_AUTH_TEST_LOGIN_ENABLED", "true")
    monkeypatch.setenv("KORESIM_AUTH_TEST_EMAIL", "attacker@example.com")
    app = create_app()
    owner = app.state.run_store.upsert_user_from_auth(
        {"email": "owner@example.com", "provider": "test", "sub": "owner"}
    )
    run = app.state.run_store.create_run(
        RunCreateRequest.model_validate(
            {
                "simulation_type": "startup_item_validation",
                "input": {
                    "item_name": "private item",
                    "item_description": "private description",
                },
                "sample_size": 1,
            }
        ),
        user=owner,
    )
    app.state.run_store.upsert_partial_result(
        run.run_id,
        "private-persona",
        {"uuid": "private-persona", "response": "private model output"},
    )
    # Use default TestClient host (testserver) so test-login remains available
    # for unit tests; production arabesque.cc blocks test-login separately.
    attacker = TestClient(app)
    login = attacker.get("/api/auth/test-login", follow_redirects=False)
    assert login.status_code == 303

    response = attacker.get(f"/api/runs/{run.run_id}/partials")

    assert response.status_code == 404
    assert "private model output" not in response.text
