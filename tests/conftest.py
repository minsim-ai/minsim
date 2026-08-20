import pytest

from src import config
from src.runtime import event_mode


@pytest.fixture(autouse=True)
def isolate_event_mode(monkeypatch: pytest.MonkeyPatch) -> None:
    # KORESIM_EVENT_MODE is read once into a module constant at import time
    # (and re-imported by value into src.runtime.event_mode), so a developer's
    # local .env leaks into every test unless both bindings are patched here.
    # Tests that want event mode on (e.g. test_event_mode.py) override this
    # explicitly with their own monkeypatch.setattr call.
    monkeypatch.setattr(config, "KORESIM_EVENT_MODE", False)
    monkeypatch.setattr(event_mode, "KORESIM_EVENT_MODE", False)


@pytest.fixture(autouse=True)
def isolate_app_auth_env(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in [
        "KORESIM_AUTH_BASE_URL",
        "KORESIM_AUTH_SECRET",
        "KORESIM_AUTH_REQUIRED",
        "KORESIM_AUTH_COOKIE_SECURE",
        "KORESIM_AUTH_TEST_LOGIN_ENABLED",
        "KORESIM_AUTH_TEST_EMAIL",
        "KORESIM_AUTH_TEST_NAME",
        "KORESIM_AUTH_LOCAL_DEV_AUTO_LOGIN",
        "KORESIM_AUTH_LOCAL_DEV_EMAIL",
        "KORESIM_AUTH_LOCAL_DEV_NAME",
        "BETTER_AUTH_SECRET",
        "BETTER_AUTH_URL",
        "GOOGLE_CLIENT_ID",
        "GOOGLE_CLIENT_SECRET",
        "GOOGLE_OAUTH_CLIENT_ID",
        "GOOGLE_OAUTH_CLIENT_SECRET",
    ]:
        monkeypatch.delenv(name, raising=False)
