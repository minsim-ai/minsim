import json
import os
import urllib.error
from pathlib import Path

from scripts.configure_cloudflare_access import (
    AccessConfig,
    CloudflareAPIError,
    CloudflareClient,
    apply_google_idp,
    build_app_payload,
    build_google_idp_payload,
    build_policy_payload,
    collect_allowlist,
    collect_allowed_idps,
    collect_csv_values,
    disable_access_app,
    load_project_env,
    normalize_path,
    plan,
    plan_google_idp,
    redact_sensitive_text,
    redact_sensitive_value,
    summarize_identity_providers,
)


def make_config() -> AccessConfig:
    return AccessConfig(
        hostname="arabesque.cc",
        app_name="KoreaSim Demo",
        policy_name="Allow KoreaSim Demo Emails",
        session_duration="24h",
        protected_paths=("/app*", "/results*", "/api*"),
        allowlist_emails=("demo@example.com", "owner@example.com"),
    )


def test_build_app_payload_uses_public_destinations_for_all_protected_paths() -> None:
    payload = build_app_payload(make_config())

    assert payload["name"] == "KoreaSim Demo"
    assert payload["type"] == "self_hosted"
    assert payload["domain"] == "arabesque.cc/app*"
    assert payload["session_duration"] == "24h"
    assert payload["destinations"] == [
        {"type": "public", "uri": "arabesque.cc/app*"},
        {"type": "public", "uri": "arabesque.cc/results*"},
        {"type": "public", "uri": "arabesque.cc/api*"},
    ]
    assert "allowed_idps" not in payload


def test_build_app_payload_can_pin_google_idp() -> None:
    config = AccessConfig(
        hostname="arabesque.cc",
        app_name="KoreaSim Demo",
        policy_name="Allow KoreaSim Demo Emails",
        session_duration="24h",
        protected_paths=("/app*", "/results*", "/api*"),
        allowlist_emails=("demo@example.com",),
        allowed_idps=("google-idp-uuid",),
        auto_redirect_to_identity=True,
    )

    payload = build_app_payload(config)

    assert payload["allowed_idps"] == ["google-idp-uuid"]
    assert payload["auto_redirect_to_identity"] is True


def test_build_app_payload_rejects_auto_redirect_with_multiple_idps() -> None:
    config = AccessConfig(
        hostname="arabesque.cc",
        app_name="KoreaSim Demo",
        policy_name="Allow KoreaSim Demo Emails",
        session_duration="24h",
        protected_paths=("/app*",),
        allowlist_emails=("demo@example.com",),
        allowed_idps=("google-idp-uuid", "otp-idp-uuid"),
        auto_redirect_to_identity=True,
    )

    try:
        build_app_payload(config)
    except ValueError as exc:
        assert "exactly one allowed IdP" in str(exc)
    else:
        raise AssertionError("expected invalid auto_redirect_to_identity config")


def test_build_policy_payload_uses_email_allow_rules() -> None:
    payload = build_policy_payload(make_config())

    assert payload["decision"] == "allow"
    assert payload["precedence"] == 1
    assert payload["include"] == [
        {"email": {"email": "demo@example.com"}},
        {"email": {"email": "owner@example.com"}},
    ]
    assert payload["exclude"] == []
    assert payload["require"] == []


def test_collect_allowlist_normalizes_deduplicates_and_accepts_env() -> None:
    emails = collect_allowlist(
        [" Demo@Example.com,owner@example.com "],
        None,
        "demo@example.com,second@example.com",
    )

    assert emails == ("demo@example.com", "owner@example.com", "second@example.com")


def test_collect_allowlist_reads_private_file_and_ignores_comments(tmp_path: Path) -> None:
    allowlist_file = tmp_path / "allowlist.txt"
    allowlist_file.write_text(
        "\n".join(
            [
                "# KoreaSim demo allowlist",
                "Demo@Example.com",
                "",
                "owner@example.com",
            ]
        ),
        encoding="utf-8",
    )

    emails = collect_allowlist(None, str(allowlist_file), "demo@example.com")

    assert emails == ("demo@example.com", "owner@example.com")


def test_collect_allowlist_reports_missing_file_without_traceback(tmp_path: Path) -> None:
    missing = tmp_path / "missing-allowlist.txt"

    try:
        collect_allowlist(None, str(missing), None)
    except ValueError as exc:
        assert str(exc) == "allowlist file does not exist"
    else:
        raise AssertionError("expected missing allowlist file to fail")


def test_collect_csv_values_preserves_order_and_deduplicates() -> None:
    values = collect_csv_values(["google-idp, otp-idp"], "google-idp,github-idp")

    assert values == ("google-idp", "otp-idp", "github-idp")


def test_collect_allowed_idps_accepts_legacy_and_google_env_aliases() -> None:
    values = collect_allowed_idps(["google-idp"], "google-idp,otp-idp", "google-single-idp")

    assert values == ("google-idp", "otp-idp", "google-single-idp")


def test_normalize_path_preserves_wildcard() -> None:
    assert normalize_path("api*") == "/api*"
    assert normalize_path("/results*") == "/results*"


def test_plan_is_dry_run_and_does_not_require_token() -> None:
    output = plan(make_config(), "unset")

    assert output["mode"] == "dry_run"
    assert output["scope"] == "unset"
    assert output["post_apply_gate"] == "uv run python scripts/check_cloudflare_access.py"
    assert output["policy_payload"]["include"] == [{"email": {"count": 2, "redacted": True}}]
    assert "demo@example.com" not in json.dumps(output)
    assert "owner@example.com" not in json.dumps(output)


def test_disable_access_app_deletes_named_app() -> None:
    class FakeClient:
        def __init__(self) -> None:
            self.deleted = None

        def list_apps(self):
            return [{"id": "access-app-id", "name": "KoreaSim Demo"}]

        def delete_app(self, app_id):
            self.deleted = app_id
            return {}

    client = FakeClient()
    output = disable_access_app("KoreaSim Demo", client)

    assert client.deleted == "access-app-id"
    assert output["ok"] is True
    assert output["mode"] == "disable_access_app"
    assert output["app"]["action"] == "deleted"
    assert output["post_apply_gate"] == "uv run python scripts/check_public_external_demo.py"


def test_disable_access_app_is_ok_when_named_app_is_absent() -> None:
    class FakeClient:
        def list_apps(self):
            return [{"id": "other-id", "name": "Other App"}]

        def delete_app(self, app_id):
            raise AssertionError(f"unexpected delete {app_id}")

    output = disable_access_app("KoreaSim Demo", FakeClient())

    assert output["ok"] is True
    assert output["app"] == {"name": "KoreaSim Demo", "action": "not_found"}


def test_summarize_identity_providers_omits_provider_config() -> None:
    providers = summarize_identity_providers(
        [
            {
                "id": "google-idp-uuid",
                "name": "Google",
                "type": "google",
                "config": {"client_secret": "must-not-print"},
            }
        ]
    )

    assert providers == [{"id": "google-idp-uuid", "name": "Google", "type": "google"}]


def test_build_google_idp_payload_uses_google_provider_type() -> None:
    payload = build_google_idp_payload("KoreaSim Google", "client-id", "client-secret")

    assert payload == {
        "name": "KoreaSim Google",
        "type": "google",
        "config": {
            "client_id": "client-id",
            "client_secret": "client-secret",
        },
    }


def test_plan_google_idp_redacts_secret_and_reports_callback() -> None:
    output = plan_google_idp("KoreaSim Google", "client-id", "account")
    serialized = json.dumps(output)

    assert output["mode"] == "dry_run_google_idp"
    assert output["scope"] == "account"
    assert output["identity_provider_payload"]["config"]["client_id"] == "client-id"
    assert output["identity_provider_payload"]["config"]["client_secret"] == "<redacted>"
    assert "cloudflareaccess.com/cdn-cgi/access/callback" in output["google_oauth_redirect_uri"]
    assert "client-secret" not in serialized


def test_apply_google_idp_creates_missing_provider() -> None:
    class FakeClient:
        def __init__(self) -> None:
            self.created_payload = None

        def list_identity_providers(self):
            return []

        def create_identity_provider(self, payload):
            self.created_payload = payload
            return {"id": "new-idp", "name": payload["name"], "type": payload["type"]}

    client = FakeClient()
    output = apply_google_idp("KoreaSim Google", "client-id", "client-secret", client)

    assert output["identity_provider"] == {
        "id": "new-idp",
        "name": "KoreaSim Google",
        "type": "google",
        "action": "created",
    }
    assert client.created_payload == build_google_idp_payload("KoreaSim Google", "client-id", "client-secret")


def test_apply_google_idp_updates_existing_provider() -> None:
    class FakeClient:
        def __init__(self) -> None:
            self.updated = None

        def list_identity_providers(self):
            return [{"id": "existing-idp", "name": "KoreaSim Google", "type": "google"}]

        def update_identity_provider(self, provider_id, payload):
            self.updated = (provider_id, payload)
            return {"id": provider_id, "name": payload["name"], "type": payload["type"]}

    client = FakeClient()
    output = apply_google_idp("KoreaSim Google", "client-id", "client-secret", client)

    assert output["identity_provider"]["action"] == "updated"
    assert output["identity_provider"]["id"] == "existing-idp"
    assert client.updated == (
        "existing-idp",
        build_google_idp_payload("KoreaSim Google", "client-id", "client-secret"),
    )


def test_redact_sensitive_text_masks_emails_and_secret_like_values() -> None:
    text = 'email demo@example.com token="abc123" client_secret: secret-placeholder'

    redacted = redact_sensitive_text(text)

    assert "demo@example.com" not in redacted
    assert "abc123" not in redacted
    assert "secret-placeholder" not in redacted
    assert "<redacted-email>" in redacted


def test_redact_sensitive_value_masks_nested_cloudflare_error_details() -> None:
    value = [
        {
            "message": "invalid email demo@example.com",
            "email": "demo@example.com",
            "config": {"client_secret": "must-not-print"},
        }
    ]

    redacted = redact_sensitive_value(value)
    serialized = json.dumps(redacted)

    assert "demo@example.com" not in serialized
    assert "must-not-print" not in serialized
    assert redacted[0]["email"] == "<redacted>"
    assert redacted[0]["config"]["client_secret"] == "<redacted>"


def test_cloudflare_client_redacts_http_error_body(monkeypatch) -> None:
    class FakeErrorBody:
        def read(self) -> bytes:
            return b'{"message":"bad email demo@example.com","client_secret":"secret-placeholder"}'

        def close(self) -> None:
            return None

    def fake_urlopen(_request, timeout: int):
        raise urllib.error.HTTPError(
            url="https://api.example.invalid",
            code=400,
            msg="Bad Request",
            hdrs=None,
            fp=FakeErrorBody(),
        )

    monkeypatch.setattr("urllib.request.urlopen", fake_urlopen)
    client = CloudflareClient(api_token="token-placeholder", account_id="account", base_url="https://api.example.invalid")

    try:
        client.request("POST", "/access/apps", {"name": "KoreaSim Demo"})
    except CloudflareAPIError as exc:
        message = str(exc)
    else:
        raise AssertionError("expected CloudflareAPIError")

    assert "demo@example.com" not in message
    assert "secret-placeholder" not in message
    assert "<redacted-email>" in message


def test_cloudflare_client_redacts_api_error_payload(monkeypatch) -> None:
    class FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def read(self) -> bytes:
            return json.dumps(
                {
                    "success": False,
                    "errors": [
                        {
                            "message": "invalid email demo@example.com",
                            "email": "demo@example.com",
                            "config": {"client_secret": "secret-placeholder"},
                        }
                    ],
                }
            ).encode("utf-8")

    def fake_urlopen(_request, timeout: int):
        return FakeResponse()

    monkeypatch.setattr("urllib.request.urlopen", fake_urlopen)
    client = CloudflareClient(api_token="token-placeholder", account_id="account", base_url="https://api.example.invalid")

    try:
        client.request("POST", "/access/apps", {"name": "KoreaSim Demo"})
    except CloudflareAPIError as exc:
        message = str(exc)
    else:
        raise AssertionError("expected CloudflareAPIError")

    assert "demo@example.com" not in message
    assert "secret-placeholder" not in message
    assert "<redacted-email>" in message


def test_load_project_env_reads_private_env_without_overriding_exported_values(
    tmp_path: Path,
    monkeypatch,
) -> None:
    env_file = tmp_path / ".env"
    env_file.write_text(
        "\n".join(
            [
                "CLOUDFLARE_API_TOKEN=from-file",
                "CLOUDFLARE_ACCOUNT_ID=from-file-account",
            ]
        ),
        encoding="utf-8",
    )
    monkeypatch.delenv("CLOUDFLARE_API_TOKEN", raising=False)
    monkeypatch.setenv("CLOUDFLARE_ACCOUNT_ID", "exported-account")

    assert load_project_env(env_file) is True
    assert load_project_env(env_file) is True

    assert os.environ["CLOUDFLARE_API_TOKEN"] == "from-file"
    assert os.environ["CLOUDFLARE_ACCOUNT_ID"] == "exported-account"
