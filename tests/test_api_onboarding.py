"""First-login onboarding API and store tests."""

from fastapi.testclient import TestClient

from src.api.main import create_app
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


def test_onboarding_requires_auth(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("KORESIM_AUTH_SECRET", "test-secret")
    monkeypatch.setenv("KORESIM_AUTH_COOKIE_SECURE", "false")
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "google-client")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "google-secret")
    monkeypatch.delenv("KORESIM_AUTH_TEST_LOGIN_ENABLED", raising=False)
    client = TestClient(create_app(store=SQLiteRunStore(tmp_path / "runs.sqlite3")))

    response = client.get("/api/me/onboarding")
    assert response.status_code == 401


def test_test_provider_onboarding_is_bypassed(tmp_path, monkeypatch) -> None:
    store = SQLiteRunStore(tmp_path / "runs.sqlite3")
    client = TestClient(create_app(store=store))
    _login(client, monkeypatch, "bypass@example.com")

    response = client.get("/api/me/onboarding")
    assert response.status_code == 200
    data = response.json()
    assert data["completed"] is True
    assert data["bypassed"] is True
    assert data["completed_at"] is None


def test_save_onboarding_persists_fields(tmp_path, monkeypatch) -> None:
    store = SQLiteRunStore(tmp_path / "runs.sqlite3")
    client = TestClient(create_app(store=store))
    _login(client, monkeypatch, "onboard-save@example.com")

    save = client.post(
        "/api/me/onboarding",
        json={
            "referral_source": "sns",
            "life_stage": "student",
            "occupation": "  컴공 학부  ",
        },
    )
    assert save.status_code == 200
    body = save.json()
    assert body["completed"] is True
    assert body["referral_source"] == "sns"
    assert body["life_stage"] == "student"
    assert body["occupation"] == "컴공 학부"
    assert body["completed_at"]

    user = store.get_user_by_email("onboard-save@example.com")
    assert user is not None
    assert user.occupation == "컴공 학부"
    assert user.referral_source == "sns"
    assert user.onboarding_completed_at


def test_save_onboarding_rejects_invalid_enum(tmp_path, monkeypatch) -> None:
    store = SQLiteRunStore(tmp_path / "runs.sqlite3")
    client = TestClient(create_app(store=store))
    _login(client, monkeypatch, "onboard-bad@example.com")

    response = client.post(
        "/api/me/onboarding",
        json={
            "referral_source": "telegram",
            "life_stage": "student",
            "occupation": "개발자",
        },
    )
    assert response.status_code == 422


def test_save_onboarding_rejects_blank_occupation(tmp_path, monkeypatch) -> None:
    store = SQLiteRunStore(tmp_path / "runs.sqlite3")
    client = TestClient(create_app(store=store))
    _login(client, monkeypatch, "onboard-blank@example.com")

    response = client.post(
        "/api/me/onboarding",
        json={
            "referral_source": "search",
            "life_stage": "worker",
            "occupation": "   ",
        },
    )
    assert response.status_code == 422


def test_google_user_onboarding_starts_incomplete_and_completes(tmp_path) -> None:
    store = SQLiteRunStore(tmp_path / "runs.sqlite3")
    user = store.upsert_user_from_auth(
        {
            "email": "real-google@example.com",
            "name": "Real",
            "provider": "google",
            "id": "g-1",
        }
    )
    assert user.onboarding_completed_at is None
    assert user.provider == "google"

    completed = store.save_user_onboarding(
        user.user_id,
        referral_source="work",
        life_stage="worker",
        occupation="PM",
    )
    assert completed.onboarding_completed_at
    assert completed.referral_source == "work"
    assert completed.life_stage == "worker"
    assert completed.occupation == "PM"

    # Google users surface as incomplete until completed_at is set.
    reloaded = store.get_user(user.user_id)
    assert reloaded is not None
    assert reloaded.onboarding_completed_at
