import pytest


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
