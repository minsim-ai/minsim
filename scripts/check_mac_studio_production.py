"""Check Mac Studio production readiness without printing secrets."""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Mapping
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin
from urllib.request import Request, urlopen

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))
DEFAULT_BASE_URL = "https://arabesque.cc"
DEFAULT_TUNNEL_CONFIG = Path.home() / ".cloudflared" / "koresim-arabesque.yml"

REQUIRED_ENV_NAMES = (
    "KORESIM_AUTH_BASE_URL",
    "KORESIM_AUTH_SECRET",
    "KORESIM_AUTH_REQUIRED",
    "KORESIM_AUTH_COOKIE_SECURE",
    "KORESIM_AUTH_TEST_LOGIN_ENABLED",
    "LLM_BACKEND",
    "REDIS_URL",
    "PARQUET_PATH",
    "RUNTIME_DATA_DIR",
    "SQLITE_PATH",
)


def parse_env_values(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    values: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        name, value = stripped.split("=", 1)
        name = name.strip().removeprefix("export ").strip()
        if name:
            values[name] = value.strip().strip("'\"")
    return values


def setting(name: str, dotenv_values: Mapping[str, str], env: Mapping[str, str]) -> str:
    return env.get(name) or dotenv_values.get(name, "")


def has_any(names: tuple[str, ...], dotenv_values: Mapping[str, str], env: Mapping[str, str]) -> bool:
    return any(bool(setting(name, dotenv_values, env)) for name in names)


def check_env(dotenv_values: Mapping[str, str], env: Mapping[str, str]) -> dict[str, object]:
    present = {name: bool(setting(name, dotenv_values, env)) for name in REQUIRED_ENV_NAMES}
    backend = setting("LLM_BACKEND", dotenv_values, env).strip().lower()
    provider_requirements = {
        "gemini": ("GEMINI_API_KEY", "GEMINI_MODEL"),
        "upstage": ("UPSTAGE_API_KEY", "UPSTAGE_MODEL"),
        "litellm": ("LLM_GATEWAY_BASE_URL", "LLM_GATEWAY_API_KEY"),
        # OpenAI path accepts MONO_API_KEY or OPENAI_API_KEY (see src/config.py).
        "openai": (),
        "mono": (),
    }
    provider_names = provider_requirements.get(backend)
    if provider_names is None:
        provider_names = ()
        provider = {}
        openai_key_ok = False
    elif backend in {"openai", "mono"}:
        openai_key_ok = has_any(("MONO_API_KEY", "OPENAI_API_KEY"), dotenv_values, env)
        provider = {"MONO_OR_OPENAI_API_KEY": openai_key_ok}
    else:
        openai_key_ok = True
        provider = {name: bool(setting(name, dotenv_values, env)) for name in provider_names}
    grouped = {
        "google_client": has_any(("GOOGLE_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_ID"), dotenv_values, env),
        "google_secret": has_any(("GOOGLE_CLIENT_SECRET", "GOOGLE_OAUTH_CLIENT_SECRET"), dotenv_values, env),
        "langfuse_public_key": has_any(("LANGFUSE_PUBLIC_KEY",), dotenv_values, env),
        "langfuse_secret_key": has_any(("LANGFUSE_SECRET_KEY",), dotenv_values, env),
    }
    expected_values = {
        "KORESIM_AUTH_REQUIRED": setting("KORESIM_AUTH_REQUIRED", dotenv_values, env).lower() == "true",
        "KORESIM_AUTH_COOKIE_SECURE": setting("KORESIM_AUTH_COOKIE_SECURE", dotenv_values, env).lower() == "true",
        "KORESIM_AUTH_TEST_LOGIN_ENABLED": setting(
            "KORESIM_AUTH_TEST_LOGIN_ENABLED", dotenv_values, env
        ).lower()
        == "false",
        "LLM_BACKEND": backend in provider_requirements,
    }
    provider_ok = (
        (backend in {"openai", "mono"} and openai_key_ok)
        or (backend not in {"openai", "mono"} and bool(provider_names) and all(provider.values()))
    )
    return {
        "ok": (
            all(present.values())
            and provider_ok
            and all(grouped.values())
            and all(expected_values.values())
        ),
        "present": present,
        "provider": {"backend": backend, "present": provider},
        "grouped": grouped,
        "expected_values": expected_values,
    }


def check_paths(dotenv_values: Mapping[str, str], env: Mapping[str, str]) -> dict[str, object]:
    parquet_path = Path(setting("PARQUET_PATH", dotenv_values, env)).expanduser()
    runtime_dir = Path(setting("RUNTIME_DATA_DIR", dotenv_values, env)).expanduser()
    sqlite_path = Path(setting("SQLITE_PATH", dotenv_values, env)).expanduser()
    react_dist = PROJECT_ROOT / "frontend" / "dist"
    checks = {
        "persona_parquet": parquet_path.exists() and parquet_path.is_file(),
        "runtime_dir": runtime_dir.exists() and runtime_dir.is_dir(),
        "sqlite_parent": sqlite_path.parent.exists() and sqlite_path.parent.is_dir(),
        "react_build": (react_dist / "index.html").exists(),
    }
    return {
        "ok": all(checks.values()),
        "checks": checks,
        "paths": {
            "persona_parquet": str(parquet_path),
            "runtime_dir": str(runtime_dir),
            "sqlite_path": str(sqlite_path),
            "react_build": str(react_dist),
        },
    }


def check_runtime() -> dict[str, object]:
    from src.jobs.queue import check_queue, check_redis_connection
    from src.jobs.store import SQLiteRunStore
    from src.runtime.health import check_model_provider

    checks: dict[str, dict[str, object]] = {}
    for name, checker in {
        "redis": check_redis_connection,
        "queue": check_queue,
        "sqlite": lambda: SQLiteRunStore().check(),
        "model_provider": check_model_provider,
    }.items():
        try:
            checks[name] = checker()
        except Exception as exc:
            checks[name] = {"ok": False, "error": str(exc)}
    return {"ok": all(check.get("ok") for check in checks.values()), **checks}


def check_tunnel_files(config_path: Path = DEFAULT_TUNNEL_CONFIG) -> dict[str, object]:
    config_exists = config_path.exists()
    credentials_path = None
    if config_exists:
        for line in config_path.read_text(encoding="utf-8").splitlines():
            if line.strip().startswith("credentials-file:"):
                credentials_path = Path(line.split(":", 1)[1].strip()).expanduser()
                break
    checks = {
        "config": config_exists,
        "credentials": bool(credentials_path and credentials_path.exists() and credentials_path.is_file()),
    }
    return {
        "ok": all(checks.values()),
        "checks": checks,
        "config_path": str(config_path),
        "credentials_path": str(credentials_path) if credentials_path else None,
    }


def check_command(command: list[str]) -> dict[str, object]:
    completed = subprocess.run(command, check=False, capture_output=True, text=True)
    return {
        "ok": completed.returncode == 0,
        "returncode": completed.returncode,
        "stdout_sample": completed.stdout.strip()[:500],
        "stderr_sample": completed.stderr.strip()[:500],
    }


def http_probe(base_url: str, path: str, *, timeout_seconds: int) -> dict[str, object]:
    url = urljoin(base_url.rstrip("/") + "/", path.lstrip("/"))
    request = Request(url, headers={"User-Agent": "koresim-mac-studio-production-check/1.0"})
    try:
        with urlopen(request, timeout=timeout_seconds) as response:
            body = response.read(2048).decode("utf-8", errors="replace")
            return {
                "ok": 200 <= response.status < 400,
                "status": response.status,
                "content_type": response.headers.get("content-type"),
                "body_sample": body[:200],
            }
    except HTTPError as exc:
        body = exc.read(2048).decode("utf-8", errors="replace")
        return {
            "ok": False,
            "status": exc.code,
            "content_type": exc.headers.get("content-type"),
            "body_sample": body[:200],
        }
    except URLError as exc:
        return {"ok": False, "status": None, "error": str(exc)}


def check_external(base_url: str, timeout_seconds: int) -> dict[str, object]:
    probes = {
        "/": http_probe(base_url, "/", timeout_seconds=timeout_seconds),
        "/api/config": http_probe(base_url, "/api/config", timeout_seconds=timeout_seconds),
        "/api/health": http_probe(base_url, "/api/health", timeout_seconds=timeout_seconds),
        "/api/auth/session": http_probe(base_url, "/api/auth/session", timeout_seconds=timeout_seconds),
        "/api/runs": http_probe(base_url, "/api/runs", timeout_seconds=timeout_seconds),
    }
    config_ok = probes["/api/config"]["ok"]
    health_ok = probes["/api/health"]["ok"]
    auth_session_ok = probes["/api/auth/session"]["status"] == 200
    api_runs_protected = probes["/api/runs"]["status"] == 401
    return {
        "ok": bool(config_ok and health_ok and auth_session_ok and api_runs_protected),
        "base_url": base_url,
        "expected": {
            "/api/auth/session": "200",
            "/api/runs": "401 when unauthenticated",
        },
        "probes": probes,
    }


def build_report(
    *,
    project_root: Path = PROJECT_ROOT,
    env: Mapping[str, str] = os.environ,
    external: bool = False,
    base_url: str = DEFAULT_BASE_URL,
    timeout_seconds: int = 12,
    tunnel_config: Path = DEFAULT_TUNNEL_CONFIG,
) -> dict[str, object]:
    dotenv_values = parse_env_values(project_root / ".env")
    checks = {
        "env": check_env(dotenv_values, env),
        "paths": check_paths(dotenv_values, env),
        "runtime": check_runtime(),
        "tunnel_files": check_tunnel_files(tunnel_config),
    }
    if external:
        checks["external"] = check_external(base_url, timeout_seconds)
    blockers = [name for name, check in checks.items() if not check.get("ok")]
    return {
        "ok": not blockers,
        "status": "ready" if not blockers else "blocked",
        "project_root": str(project_root),
        "checks": checks,
        "blockers": blockers,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-root", type=Path, default=PROJECT_ROOT)
    parser.add_argument("--external", action="store_true", help="Probe https://arabesque.cc too.")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--timeout-seconds", type=int, default=12)
    parser.add_argument("--tunnel-config", type=Path, default=DEFAULT_TUNNEL_CONFIG)
    args = parser.parse_args()

    report = build_report(
        project_root=args.project_root.resolve(),
        external=args.external,
        base_url=args.base_url,
        timeout_seconds=args.timeout_seconds,
        tunnel_config=args.tunnel_config.expanduser(),
    )
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
