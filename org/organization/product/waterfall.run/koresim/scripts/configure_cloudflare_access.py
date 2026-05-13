"""Prepare or apply the Cloudflare Access policy for the KoreaSim demo."""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_HOSTNAME = "arabesque.cc"
DEFAULT_APP_NAME = "KoreaSim Demo"
DEFAULT_POLICY_NAME = "Allow KoreaSim Demo Emails"
DEFAULT_GOOGLE_IDP_NAME = "KoreaSim Google"
DEFAULT_SESSION_DURATION = "24h"
DEFAULT_PROTECTED_PATHS = ("/app*", "/results*", "/api*")
EMAIL_RE = re.compile(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}")
SECRET_VALUE_RE = re.compile(
    r'("?(?:api[_-]?token|token|client[_-]?secret|password|secret)"?\s*[:=]\s*)(".*?"|[^,\s}]+)',
    re.IGNORECASE,
)


class CloudflareAPIError(RuntimeError):
    """Raised when the Cloudflare API returns an error response."""


class AllowlistError(ValueError):
    """Raised when the private allowlist source cannot be read."""


def load_project_env(path: Path = PROJECT_ROOT / ".env") -> bool:
    """Load local secrets for CLI use without overriding exported variables."""
    return bool(load_dotenv(path, override=False))


def redact_sensitive_text(text: str) -> str:
    redacted = EMAIL_RE.sub("<redacted-email>", text)
    return SECRET_VALUE_RE.sub(r"\1<redacted>", redacted)


def redact_sensitive_value(value: Any) -> Any:
    if isinstance(value, str):
        return redact_sensitive_text(value)
    if isinstance(value, list):
        return [redact_sensitive_value(item) for item in value]
    if isinstance(value, dict):
        output: dict[str, Any] = {}
        for key, item in value.items():
            lowered = str(key).lower()
            if any(marker in lowered for marker in ("secret", "token", "password", "email")):
                output[key] = "<redacted>"
            else:
                output[key] = redact_sensitive_value(item)
        return output
    return value


@dataclass(frozen=True)
class AccessConfig:
    hostname: str
    app_name: str
    policy_name: str
    session_duration: str
    protected_paths: tuple[str, ...]
    allowlist_emails: tuple[str, ...]
    allowed_idps: tuple[str, ...] = ()
    auto_redirect_to_identity: bool = False


class CloudflareClient:
    def __init__(
        self,
        *,
        api_token: str,
        account_id: str | None = None,
        zone_id: str | None = None,
        base_url: str = "https://api.cloudflare.com/client/v4",
    ) -> None:
        if bool(account_id) == bool(zone_id):
            raise ValueError("provide exactly one of account_id or zone_id")
        self.api_token = api_token
        self.scope = f"accounts/{account_id}" if account_id else f"zones/{zone_id}"
        self.base_url = base_url.rstrip("/")

    def request(self, method: str, path: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        data = None if payload is None else json.dumps(payload).encode("utf-8")
        request = urllib.request.Request(
            f"{self.base_url}/{self.scope}{path}",
            data=data,
            method=method,
            headers={
                "Authorization": f"Bearer {self.api_token}",
                "Content-Type": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                body = response.read().decode("utf-8")
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            safe_body = redact_sensitive_text(body)
            raise CloudflareAPIError(f"Cloudflare API {method} {path} failed with {exc.code}: {safe_body}") from exc
        except urllib.error.URLError as exc:
            raise CloudflareAPIError(f"Cloudflare API {method} {path} failed: {exc.reason}") from exc

        parsed = json.loads(body)
        if not parsed.get("success", False):
            safe_errors = redact_sensitive_value(parsed.get("errors"))
            raise CloudflareAPIError(f"Cloudflare API {method} {path} returned errors: {safe_errors}")
        return parsed

    def list_apps(self) -> list[dict[str, Any]]:
        return list(self.request("GET", "/access/apps").get("result") or [])

    def create_app(self, payload: dict[str, Any]) -> dict[str, Any]:
        return dict(self.request("POST", "/access/apps", payload).get("result") or {})

    def update_app(self, app_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        return dict(self.request("PUT", f"/access/apps/{app_id}", payload).get("result") or {})

    def delete_app(self, app_id: str) -> dict[str, Any]:
        return dict(self.request("DELETE", f"/access/apps/{app_id}").get("result") or {})

    def list_policies(self, app_id: str) -> list[dict[str, Any]]:
        return list(self.request("GET", f"/access/apps/{app_id}/policies").get("result") or [])

    def create_policy(self, app_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        return dict(self.request("POST", f"/access/apps/{app_id}/policies", payload).get("result") or {})

    def update_policy(self, app_id: str, policy_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        return dict(self.request("PUT", f"/access/apps/{app_id}/policies/{policy_id}", payload).get("result") or {})

    def list_identity_providers(self) -> list[dict[str, Any]]:
        return list(self.request("GET", "/access/identity_providers").get("result") or [])

    def create_identity_provider(self, payload: dict[str, Any]) -> dict[str, Any]:
        return dict(self.request("POST", "/access/identity_providers", payload).get("result") or {})

    def update_identity_provider(self, provider_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        return dict(self.request("PUT", f"/access/identity_providers/{provider_id}", payload).get("result") or {})


def normalize_path(path: str) -> str:
    return "/" + path.strip().lstrip("/")


def normalize_email(email: str) -> str:
    return email.strip().lower()


def read_allowlist_file(file_path: str) -> list[str]:
    try:
        lines = Path(file_path).read_text(encoding="utf-8").splitlines()
    except FileNotFoundError as exc:
        raise AllowlistError("allowlist file does not exist") from exc
    except IsADirectoryError as exc:
        raise AllowlistError("allowlist file path points to a directory") from exc
    except OSError as exc:
        raise AllowlistError(f"allowlist file could not be read: {exc.strerror}") from exc
    return [line.strip() for line in lines if line.strip() and not line.strip().startswith("#")]


def collect_allowlist(values: list[str] | None, file_path: str | None, env_value: str | None) -> tuple[str, ...]:
    emails: list[str] = []
    for value in values or []:
        emails.extend(part for part in value.split(",") if part.strip())
    if env_value:
        emails.extend(part for part in env_value.split(",") if part.strip())
    if file_path:
        emails.extend(read_allowlist_file(file_path))
    unique = sorted({normalize_email(email) for email in emails if normalize_email(email)})
    return tuple(unique)


def collect_csv_values(values: list[str] | None, env_value: str | None) -> tuple[str, ...]:
    collected: list[str] = []
    for value in values or []:
        collected.extend(part.strip() for part in value.split(",") if part.strip())
    if env_value:
        collected.extend(part.strip() for part in env_value.split(",") if part.strip())
    return tuple(dict.fromkeys(collected))


def collect_allowed_idps(values: list[str] | None, *env_values: str | None) -> tuple[str, ...]:
    collected: list[str] = []
    for value in values or []:
        collected.extend(part.strip() for part in value.split(",") if part.strip())
    for env_value in env_values:
        if env_value:
            collected.extend(part.strip() for part in env_value.split(",") if part.strip())
    return tuple(dict.fromkeys(collected))


def destination_uri(hostname: str, path: str) -> str:
    return f"{hostname}{normalize_path(path)}"


def build_app_payload(config: AccessConfig) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "name": config.app_name,
        "domain": destination_uri(config.hostname, config.protected_paths[0]),
        "type": "self_hosted",
        "session_duration": config.session_duration,
        "app_launcher_visible": False,
        "allow_authenticate_via_warp": False,
        "destinations": [
            {
                "type": "public",
                "uri": destination_uri(config.hostname, path),
            }
            for path in config.protected_paths
        ],
    }
    if config.allowed_idps:
        payload["allowed_idps"] = list(config.allowed_idps)
    if config.auto_redirect_to_identity:
        if len(config.allowed_idps) != 1:
            raise ValueError("auto_redirect_to_identity requires exactly one allowed IdP")
        payload["auto_redirect_to_identity"] = True
    return payload


def build_policy_payload(config: AccessConfig) -> dict[str, Any]:
    return {
        "name": config.policy_name,
        "decision": "allow",
        "precedence": 1,
        "session_duration": config.session_duration,
        "include": [{"email": {"email": email}} for email in config.allowlist_emails],
        "exclude": [],
        "require": [],
    }


def build_redacted_policy_payload(config: AccessConfig) -> dict[str, Any]:
    return {
        "name": config.policy_name,
        "decision": "allow",
        "precedence": 1,
        "session_duration": config.session_duration,
        "include": [{"email": {"count": len(config.allowlist_emails), "redacted": True}}],
        "exclude": [],
        "require": [],
    }


def find_named(items: list[dict[str, Any]], name: str) -> dict[str, Any] | None:
    return next((item for item in items if item.get("name") == name), None)


def summarize_identity_providers(identity_providers: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "id": provider.get("id"),
            "name": provider.get("name"),
            "type": provider.get("type"),
        }
        for provider in identity_providers
    ]


def build_google_idp_payload(name: str, client_id: str, client_secret: str) -> dict[str, Any]:
    return {
        "name": name,
        "type": "google",
        "config": {
            "client_id": client_id,
            "client_secret": client_secret,
        },
    }


def plan(config: AccessConfig, scope: str) -> dict[str, Any]:
    return {
        "mode": "dry_run",
        "scope": scope,
        "app_payload": build_app_payload(config),
        "policy_payload": build_redacted_policy_payload(config),
        "post_apply_gate": "uv run python scripts/check_cloudflare_access.py",
    }


def plan_google_idp(name: str, client_id: str, scope: str) -> dict[str, Any]:
    return {
        "mode": "dry_run_google_idp",
        "scope": scope,
        "identity_provider_payload": build_google_idp_payload(name, client_id, "<redacted>"),
        "google_oauth_redirect_uri": "https://<your-team-name>.cloudflareaccess.com/cdn-cgi/access/callback",
        "next_step": "Re-run with --apply, then set CLOUDFLARE_GOOGLE_IDP_ID to the returned id.",
    }


def apply_google_idp(name: str, client_id: str, client_secret: str, client: CloudflareClient) -> dict[str, Any]:
    payload = build_google_idp_payload(name, client_id, client_secret)
    providers = client.list_identity_providers()
    provider = find_named(providers, name)
    action = "updated" if provider else "created"
    if provider:
        provider = client.update_identity_provider(str(provider["id"]), payload)
    else:
        provider = client.create_identity_provider(payload)
    return {
        "mode": "apply_google_idp",
        "ok": True,
        "identity_provider": {
            "id": provider.get("id"),
            "name": provider.get("name"),
            "type": provider.get("type"),
            "action": action,
        },
        "next_step": "Set CLOUDFLARE_GOOGLE_IDP_ID to this id, then apply the Access app policy.",
    }


def apply(config: AccessConfig, client: CloudflareClient) -> dict[str, Any]:
    app_payload = build_app_payload(config)
    policy_payload = build_policy_payload(config)

    apps = client.list_apps()
    app = find_named(apps, config.app_name)
    app_action = "updated" if app else "created"
    if app:
        app_id = str(app["id"])
        app = client.update_app(app_id, app_payload)
    else:
        app = client.create_app(app_payload)
        app_id = str(app["id"])

    policies = client.list_policies(app_id)
    policy = find_named(policies, config.policy_name)
    policy_action = "updated" if policy else "created"
    if policy:
        policy = client.update_policy(app_id, str(policy["id"]), policy_payload)
    else:
        policy = client.create_policy(app_id, policy_payload)

    return {
        "mode": "apply",
        "ok": True,
        "app": {"id": app.get("id"), "name": app.get("name"), "action": app_action},
        "policy": {"id": policy.get("id"), "name": policy.get("name"), "action": policy_action},
        "post_apply_gate": "uv run python scripts/check_cloudflare_access.py",
    }


def disable_access_app(app_name: str, client: CloudflareClient) -> dict[str, Any]:
    apps = client.list_apps()
    app = find_named(apps, app_name)
    if not app:
        return {
            "mode": "disable_access_app",
            "ok": True,
            "app": {"name": app_name, "action": "not_found"},
            "post_apply_gate": "uv run python scripts/check_public_external_demo.py",
        }
    client.delete_app(str(app["id"]))
    return {
        "mode": "disable_access_app",
        "ok": True,
        "app": {"id": app.get("id"), "name": app.get("name"), "action": "deleted"},
        "post_apply_gate": "uv run python scripts/check_public_external_demo.py",
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Write the Access application and policy to Cloudflare.")
    parser.add_argument(
        "--disable-access-app",
        action="store_true",
        help="Delete the named Cloudflare Access application so /app, /results, and /api are public.",
    )
    parser.add_argument(
        "--create-google-idp",
        action="store_true",
        help="Create or update the Cloudflare Access Google IdP from GOOGLE_OAUTH_CLIENT_ID/SECRET.",
    )
    parser.add_argument(
        "--list-idps",
        action="store_true",
        help="List configured Cloudflare Access identity providers without printing provider config or secrets.",
    )
    parser.add_argument("--account-id", default=os.getenv("CLOUDFLARE_ACCOUNT_ID"))
    parser.add_argument("--zone-id", default=os.getenv("CLOUDFLARE_ZONE_ID"))
    parser.add_argument("--api-token", default=os.getenv("CLOUDFLARE_API_TOKEN"))
    parser.add_argument("--hostname", default=DEFAULT_HOSTNAME)
    parser.add_argument("--app-name", default=DEFAULT_APP_NAME)
    parser.add_argument("--policy-name", default=DEFAULT_POLICY_NAME)
    parser.add_argument("--google-idp-name", default=os.getenv("CLOUDFLARE_GOOGLE_IDP_NAME", DEFAULT_GOOGLE_IDP_NAME))
    parser.add_argument("--google-client-id", default=os.getenv("GOOGLE_OAUTH_CLIENT_ID"))
    parser.add_argument("--google-client-secret", default=os.getenv("GOOGLE_OAUTH_CLIENT_SECRET"))
    parser.add_argument("--session-duration", default=DEFAULT_SESSION_DURATION)
    parser.add_argument("--protected-path", action="append", default=list(DEFAULT_PROTECTED_PATHS))
    parser.add_argument("--allowlist-email", action="append", help="Email or comma-separated emails to allow.")
    parser.add_argument(
        "--allowlist-file",
        default=os.getenv("KORESIM_ACCESS_ALLOWLIST_FILE"),
        help="Private newline-separated allowlist file. Defaults to KORESIM_ACCESS_ALLOWLIST_FILE.",
    )
    parser.add_argument(
        "--allowed-idp",
        action="append",
        help="Cloudflare Access identity provider UUID or comma-separated UUIDs.",
    )
    parser.add_argument(
        "--auto-redirect-to-idp",
        action="store_true",
        help="Skip IdP selection. Requires exactly one allowed IdP.",
    )
    return parser.parse_args()


def main() -> int:
    load_project_env()
    args = parse_args()
    if args.disable_access_app:
        scope = "account" if args.account_id else "zone" if args.zone_id else "unset"
        if not args.apply:
            print(
                json.dumps(
                    {
                        "mode": "dry_run_disable_access_app",
                        "scope": scope,
                        "app_name": args.app_name,
                        "post_apply_gate": "uv run python scripts/check_public_external_demo.py",
                    },
                    indent=2,
                    sort_keys=True,
                )
            )
            return 0
        if not args.api_token:
            print(json.dumps({"ok": False, "error": "CLOUDFLARE_API_TOKEN is required with --disable-access-app --apply"}, indent=2))
            return 2
        if bool(args.account_id) == bool(args.zone_id):
            print(json.dumps({"ok": False, "error": "provide exactly one of CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_ZONE_ID"}, indent=2))
            return 2
        client = CloudflareClient(api_token=args.api_token, account_id=args.account_id, zone_id=args.zone_id)
        try:
            print(json.dumps(disable_access_app(args.app_name, client), indent=2, sort_keys=True))
        except CloudflareAPIError as exc:
            print(json.dumps({"ok": False, "error": str(exc)}, indent=2))
            return 1
        return 0

    if args.create_google_idp:
        if not args.google_client_id:
            print(json.dumps({"ok": False, "error": "GOOGLE_OAUTH_CLIENT_ID is required with --create-google-idp"}, indent=2))
            return 2
        scope = "account" if args.account_id else "zone" if args.zone_id else "unset"
        if not args.apply:
            print(json.dumps(plan_google_idp(args.google_idp_name, args.google_client_id, scope), indent=2, sort_keys=True))
            return 0
        if not args.google_client_secret:
            print(
                json.dumps(
                    {
                        "ok": False,
                        "error": "GOOGLE_OAUTH_CLIENT_SECRET is required with --create-google-idp --apply. Rotate exposed secrets before use.",
                    },
                    indent=2,
                )
            )
            return 2
        if not args.api_token:
            print(json.dumps({"ok": False, "error": "CLOUDFLARE_API_TOKEN is required with --create-google-idp --apply"}, indent=2))
            return 2
        if bool(args.account_id) == bool(args.zone_id):
            print(json.dumps({"ok": False, "error": "provide exactly one of CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_ZONE_ID"}, indent=2))
            return 2
        client = CloudflareClient(api_token=args.api_token, account_id=args.account_id, zone_id=args.zone_id)
        try:
            print(
                json.dumps(
                    apply_google_idp(args.google_idp_name, args.google_client_id, args.google_client_secret, client),
                    indent=2,
                    sort_keys=True,
                )
            )
        except CloudflareAPIError as exc:
            print(json.dumps({"ok": False, "error": str(exc)}, indent=2))
            return 1
        return 0

    if args.list_idps:
        if not args.api_token:
            print(json.dumps({"ok": False, "error": "CLOUDFLARE_API_TOKEN is required with --list-idps"}, indent=2))
            return 2
        if bool(args.account_id) == bool(args.zone_id):
            print(json.dumps({"ok": False, "error": "provide exactly one of CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_ZONE_ID"}, indent=2))
            return 2
        client = CloudflareClient(api_token=args.api_token, account_id=args.account_id, zone_id=args.zone_id)
        try:
            providers = summarize_identity_providers(client.list_identity_providers())
        except CloudflareAPIError as exc:
            print(json.dumps({"ok": False, "error": str(exc)}, indent=2))
            return 1
        print(json.dumps({"ok": True, "mode": "list_idps", "identity_providers": providers}, indent=2, sort_keys=True))
        return 0

    try:
        allowlist = collect_allowlist(
            args.allowlist_email,
            args.allowlist_file,
            os.getenv("KORESIM_ACCESS_ALLOWLIST"),
        )
    except AllowlistError as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, indent=2))
        return 2
    allowed_idps = collect_allowed_idps(
        args.allowed_idp,
        os.getenv("CLOUDFLARE_ACCESS_ALLOWED_IDPS"),
        os.getenv("CLOUDFLARE_GOOGLE_IDP_ID"),
    )
    config = AccessConfig(
        hostname=args.hostname,
        app_name=args.app_name,
        policy_name=args.policy_name,
        session_duration=args.session_duration,
        protected_paths=tuple(normalize_path(path) for path in args.protected_path),
        allowlist_emails=allowlist,
        allowed_idps=allowed_idps,
        auto_redirect_to_identity=args.auto_redirect_to_idp,
    )

    if not config.allowlist_emails:
        print(json.dumps({"ok": False, "error": "allowlist is required"}, indent=2))
        return 2

    scope = "account" if args.account_id else "zone" if args.zone_id else "unset"
    if not args.apply:
        print(json.dumps(plan(config, scope), indent=2, sort_keys=True))
        return 0

    if not args.api_token:
        print(json.dumps({"ok": False, "error": "CLOUDFLARE_API_TOKEN is required with --apply"}, indent=2))
        return 2
    if bool(args.account_id) == bool(args.zone_id):
        print(json.dumps({"ok": False, "error": "provide exactly one of CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_ZONE_ID"}, indent=2))
        return 2

    client = CloudflareClient(api_token=args.api_token, account_id=args.account_id, zone_id=args.zone_id)
    try:
        print(json.dumps(apply(config, client), indent=2, sort_keys=True))
    except CloudflareAPIError as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, indent=2))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
