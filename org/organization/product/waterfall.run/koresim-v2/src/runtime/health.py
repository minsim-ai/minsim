"""Local runtime readiness checks for the API."""
from __future__ import annotations

from pathlib import Path
from typing import Any

import httpx

from src.config import (
    GEMINI_API_KEY,
    GEMINI_BASE_URL,
    GEMINI_MODEL,
    LLM_BACKEND,
    LLM_GATEWAY_BASE_URL,
    PARQUET_PATH,
    PROJECT_ROOT,
    SUPPORTED_LLM_BACKENDS,
    UPSTAGE_API_KEY,
    UPSTAGE_BASE_URL,
    UPSTAGE_MODEL,
)
from src.jobs.queue import check_queue, check_redis_connection
from src.jobs.store import SQLiteRunStore


def check_sqlite(store: SQLiteRunStore | None = None) -> dict[str, Any]:
    return (store or SQLiteRunStore()).check()


def check_redis_queue() -> dict[str, Any]:
    return check_queue()


def check_redis() -> dict[str, Any]:
    return check_redis_connection()


def check_persona_data(path: Path = PARQUET_PATH) -> dict[str, Any]:
    if not path.exists():
        return {
            "ok": False,
            "path": str(path),
            "error": "Persona parquet is missing. Run `uv run python scripts/download_dataset.py`.",
        }
    return {"ok": True, "path": str(path), "size_bytes": path.stat().st_size}


def check_react_build(dist_dir: Path | None = None) -> dict[str, Any]:
    dist = dist_dir or PROJECT_ROOT / "frontend" / "dist"
    index = dist / "index.html"
    if not index.exists():
        return {
            "ok": False,
            "path": str(dist),
            "error": "React build is missing. Run `cd frontend && npm run build`.",
        }
    return {"ok": True, "path": str(dist), "index": str(index)}


def check_model_provider() -> dict[str, Any]:
    if LLM_BACKEND == "litellm":
        models_url = f"{LLM_GATEWAY_BASE_URL.rstrip('/')}/models"
        try:
            response = httpx.get(models_url, timeout=0.75)
            response.raise_for_status()
            data = response.json()
        except Exception as exc:
            return {
                "ok": False,
                "backend": "litellm",
                "base_url": LLM_GATEWAY_BASE_URL,
                "models_url": models_url,
                "error": str(exc),
            }
        return {
            "ok": True,
            "backend": "litellm",
            "base_url": LLM_GATEWAY_BASE_URL,
            "models_url": models_url,
            "model_count": len(data.get("data", [])) if isinstance(data, dict) else None,
        }
    if LLM_BACKEND == "upstage":
        return {
            "ok": bool(UPSTAGE_API_KEY),
            "backend": "upstage",
            "base_url": UPSTAGE_BASE_URL,
            "model": UPSTAGE_MODEL,
            "error": None if UPSTAGE_API_KEY else "UPSTAGE_API_KEY is not configured.",
        }
    if LLM_BACKEND == "gemini":
        return {
            "ok": bool(GEMINI_API_KEY),
            "backend": "gemini",
            "base_url": GEMINI_BASE_URL,
            "model": GEMINI_MODEL,
            "error": None if GEMINI_API_KEY else "GEMINI_API_KEY is not configured.",
        }
    if LLM_BACKEND == "fake":
        return {
            "ok": True,
            "backend": "fake",
            "model": "koresim-fake-v1",
            "non_production": True,
        }
    return {
        "ok": False,
        "backend": LLM_BACKEND,
        "error": (
            f"Unsupported LLM backend. Expected one of: {', '.join(sorted(SUPPORTED_LLM_BACKENDS))}."
        ),
    }


def collect_runtime_health(store: SQLiteRunStore | None = None) -> dict[str, Any]:
    checks: dict[str, dict[str, Any]] = {}
    for name, checker in {
        "sqlite": lambda: check_sqlite(store),
        "redis": check_redis,
        "queue": check_redis_queue,
        "persona_data": check_persona_data,
        "react_build": check_react_build,
        "model_provider": check_model_provider,
    }.items():
        try:
            checks[name] = checker()
        except Exception as exc:
            checks[name] = {"ok": False, "error": str(exc)}

    return {
        "ok": all(check.get("ok") for check in checks.values()),
        **checks,
    }
