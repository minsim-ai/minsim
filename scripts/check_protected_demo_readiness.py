"""Summarize KoreaSim protected-demo readiness without printing secrets."""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Mapping

PROJECT_ROOT = Path(__file__).resolve().parents[1]

REQUIRED_ARTIFACTS = (
    "AGENTS.md",
    "CLAUDE.md",
    "docs/runbooks/next-autonomous-implementation.md",
    "docs/runbooks/autonomous-work-session.md",
    "docs/runbooks/cloudflare-tunnel-operations.md",
    "docs/runbooks/llm-solar-langfuse-operations.md",
    "docs/execution/protected-demo-completion-audit.md",
    "docs/execution/phase-3-access-path-policy.md",
    "scripts/check_cloudflare_access.py",
    "scripts/configure_cloudflare_access.py",
)

SECRET_FILE_PATTERNS = (
    "client_secret*.json",
    "*_client_secret*.json",
    "oauth_client*.json",
    "google-oauth*.json",
)

SKIP_DIRS = {
    ".git",
    ".mypy_cache",
    ".pytest_cache",
    ".ruff_cache",
    ".venv",
    "__pycache__",
    "dist",
    "node_modules",
}


def parse_env_names(path: Path) -> set[str]:
    return {name for name, value in parse_env_values(path).items() if value}


def parse_env_values(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}

    values: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        name, value = stripped.split("=", 1)
        name = name.strip()
        if name.startswith("export "):
            name = name.removeprefix("export ").strip()
        if name:
            values[name] = value.strip().strip("'\"")
    return values


def has_setting(name: str, env: Mapping[str, str], dotenv_names: set[str]) -> bool:
    return bool(env.get(name)) or name in dotenv_names


def has_any_setting(names: tuple[str, ...], env: Mapping[str, str], dotenv_names: set[str]) -> bool:
    return any(has_setting(name, env, dotenv_names) for name in names)


def setting_sources(name: str, env: Mapping[str, str], dotenv_names: set[str]) -> list[str]:
    sources: list[str] = []
    if env.get(name):
        sources.append("environment")
    if name in dotenv_names:
        sources.append(".env")
    return sources


def check_access_prerequisites(
    env: Mapping[str, str],
    dotenv_names: set[str],
    *,
    require_google_idp: bool,
) -> dict[str, object]:
    checks = {
        "CLOUDFLARE_API_TOKEN": has_setting("CLOUDFLARE_API_TOKEN", env, dotenv_names),
        "CLOUDFLARE_ACCOUNT_ID": has_setting("CLOUDFLARE_ACCOUNT_ID", env, dotenv_names),
        "CLOUDFLARE_ZONE_ID": has_setting("CLOUDFLARE_ZONE_ID", env, dotenv_names),
        "allowlist": has_any_setting(
            ("KORESIM_ACCESS_ALLOWLIST", "KORESIM_ACCESS_ALLOWLIST_FILE"),
            env,
            dotenv_names,
        ),
    }
    account_or_zone_ok = checks["CLOUDFLARE_ACCOUNT_ID"] != checks["CLOUDFLARE_ZONE_ID"]
    google_idp_ok = True
    if require_google_idp:
        google_idp_ok = has_any_setting(
            ("CLOUDFLARE_ACCESS_ALLOWED_IDPS", "CLOUDFLARE_GOOGLE_IDP_ID"),
            env,
            dotenv_names,
        )

    ok = bool(checks["CLOUDFLARE_API_TOKEN"] and account_or_zone_ok and checks["allowlist"] and google_idp_ok)
    return {
        "ok": ok,
        "checks": checks,
        "account_or_zone_ok": account_or_zone_ok,
        "google_idp_required": require_google_idp,
        "google_idp_ok": google_idp_ok,
        "sources": {
            name: setting_sources(name, env, dotenv_names)
            for name in [
                "CLOUDFLARE_API_TOKEN",
                "CLOUDFLARE_ACCOUNT_ID",
                "CLOUDFLARE_ZONE_ID",
                "KORESIM_ACCESS_ALLOWLIST",
                "KORESIM_ACCESS_ALLOWLIST_FILE",
                "CLOUDFLARE_ACCESS_ALLOWED_IDPS",
                "CLOUDFLARE_GOOGLE_IDP_ID",
            ]
        },
    }


def check_allowlist_file(env: Mapping[str, str], dotenv_values: Mapping[str, str]) -> dict[str, object]:
    file_value = env.get("KORESIM_ACCESS_ALLOWLIST_FILE") or dotenv_values.get("KORESIM_ACCESS_ALLOWLIST_FILE")
    if not file_value:
        return {
            "ok": True,
            "configured": False,
            "exists": None,
            "is_file": None,
            "readable": None,
        }

    path = Path(file_value).expanduser()
    exists = path.exists()
    is_file = path.is_file()
    readable = os.access(path, os.R_OK) if exists else False
    return {
        "ok": exists and is_file and readable,
        "configured": True,
        "exists": exists,
        "is_file": is_file,
        "readable": readable,
    }


def check_google_oauth_client(
    env: Mapping[str, str],
    dotenv_values: Mapping[str, str],
    dotenv_names: set[str],
) -> dict[str, object]:
    client_id = env.get("GOOGLE_OAUTH_CLIENT_ID") or dotenv_values.get("GOOGLE_OAUTH_CLIENT_ID")
    client_secret = env.get("GOOGLE_OAUTH_CLIENT_SECRET") or dotenv_values.get("GOOGLE_OAUTH_CLIENT_SECRET")
    secret_status = env.get("GOOGLE_OAUTH_CLIENT_SECRET_STATUS") or dotenv_values.get("GOOGLE_OAUTH_CLIENT_SECRET_STATUS")
    rotation_required = secret_status == "ROTATE_EXPOSED_SECRET_BEFORE_USE"
    return {
        "client_id_configured": bool(client_id),
        "client_secret_configured": bool(client_secret),
        "secret_rotation_required": rotation_required,
        "create_google_idp_gate": "uv run python scripts/configure_cloudflare_access.py --create-google-idp --apply ...",
        "ok_for_idp_apply": bool(client_id and client_secret and not rotation_required),
        "sources": {
            "GOOGLE_OAUTH_CLIENT_ID": setting_sources("GOOGLE_OAUTH_CLIENT_ID", env, dotenv_names),
            "GOOGLE_OAUTH_CLIENT_SECRET": setting_sources(
                "GOOGLE_OAUTH_CLIENT_SECRET",
                env,
                dotenv_names,
            ),
            "GOOGLE_OAUTH_CLIENT_SECRET_STATUS": setting_sources(
                "GOOGLE_OAUTH_CLIENT_SECRET_STATUS",
                env,
                dotenv_names,
            ),
        },
    }


def find_secret_files(root: Path) -> list[str]:
    matches: set[Path] = set()
    for pattern in SECRET_FILE_PATTERNS:
        for path in root.rglob(pattern):
            if any(part in SKIP_DIRS for part in path.relative_to(root).parts):
                continue
            matches.add(path)
    return sorted(str(path.relative_to(root)) for path in matches)


def check_required_artifacts(root: Path) -> dict[str, object]:
    artifacts = {path: (root / path).exists() for path in REQUIRED_ARTIFACTS}
    return {
        "ok": all(artifacts.values()),
        "artifacts": artifacts,
    }


def build_report(root: Path, env: Mapping[str, str], *, require_google_idp: bool) -> dict[str, object]:
    dotenv_values = parse_env_values(root / ".env")
    dotenv_names = parse_env_names(root / ".env")
    access_prereqs = check_access_prerequisites(env, dotenv_names, require_google_idp=require_google_idp)
    allowlist_file = check_allowlist_file(env, dotenv_values)
    google_oauth_client = check_google_oauth_client(env, dotenv_values, dotenv_names)
    required_artifacts = check_required_artifacts(root)
    secret_files = find_secret_files(root)

    deterministic_gates = {
        "verify": "uv run python scripts/verify.py",
        "access_gate": "uv run python scripts/check_cloudflare_access.py",
        "access_apply": "uv run python scripts/configure_cloudflare_access.py --apply ...",
    }
    blockers = []
    if not access_prereqs["ok"]:
        blockers.append("Cloudflare Access apply prerequisites are incomplete.")
    if not allowlist_file["ok"]:
        blockers.append("KORESIM_ACCESS_ALLOWLIST_FILE is configured but not readable as a file.")
    if secret_files:
        blockers.append("OAuth client secret JSON files exist inside the project tree.")
    if require_google_idp and not access_prereqs["google_idp_ok"] and not google_oauth_client["ok_for_idp_apply"]:
        blockers.append("Cloudflare Google IdP UUID is missing and rotated Google OAuth credentials are not ready for IdP apply.")
    if not required_artifacts["ok"]:
        blockers.append("Required audit/runbook artifacts are missing.")

    return {
        "ok": not blockers,
        "status": "ready_to_apply_access" if not blockers else "blocked",
        "objective": "externally protected KoreaSim demo",
        "deterministic_gates": deterministic_gates,
        "required_artifacts": required_artifacts,
        "access_apply_prerequisites": access_prereqs,
        "allowlist_file": allowlist_file,
        "google_oauth_client": google_oauth_client,
        "secret_file_scan": {
            "ok": not secret_files,
            "patterns": SECRET_FILE_PATTERNS,
            "matches": secret_files,
        },
        "blockers": blockers,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-root", type=Path, default=PROJECT_ROOT)
    parser.add_argument(
        "--require-google-idp",
        action="store_true",
        help="Require a Cloudflare Access Google IdP UUID for the Google social-login Access path.",
    )
    args = parser.parse_args()

    report = build_report(args.project_root.resolve(), os.environ, require_google_idp=args.require_google_idp)
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
