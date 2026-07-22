"""Run a live LiteLLM/Solar AI-agent smoke test and save artifacts."""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import UTC, datetime
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any

import httpx
from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

load_dotenv(PROJECT_ROOT / ".env")
os.environ["LLM_BACKEND"] = "litellm"
os.environ.setdefault("MODEL_PERSONA_DEFAULT", "koresim/solar-persona")
os.environ.setdefault("MODEL_PERSONA_STRONG", "koresim/solar-persona")
os.environ.setdefault("MODEL_ANALYSIS_DEFAULT", "koresim/solar-analysis")
os.environ.setdefault("MODEL_REPORT_DEFAULT", "koresim/solar-report")
os.environ.setdefault("MODEL_REPAIR_DEFAULT", "koresim/solar-repair")
os.environ.setdefault("ENABLE_LLM_AGENTS", "true")
os.environ.setdefault("OBSERVABILITY_PROVIDER", "langfuse")
os.environ.setdefault("LLM_TRACE_MODE", "metadata_only")

from src.api.schemas import RunCreateRequest  # noqa: E402
from src.jobs.store import SQLiteRunStore  # noqa: E402
from src.jobs.worker import run_creative_testing_job  # noqa: E402


class LiveSmokeSampler:
    def sample(self, n: int, filter_=None, seed: int = 42) -> list[dict[str, Any]]:
        return [
            {
                "uuid": f"live-persona-{idx}",
                "age": 29 + idx,
                "sex": "여성" if idx % 2 else "남성",
                "province": "서울",
                "district": "서울-강남구",
                "occupation": "브랜드 마케터",
                "education_level": "4년제 대학교",
                "marital_status": "미혼",
                "family_type": "1인가구",
                "housing_type": "아파트",
                "professional_persona": "신제품 메시지와 캠페인 효율을 비교하는 실무자",
                "family_persona": "가족 구매에서는 가격과 실용성을 함께 봄",
                "culinary_persona": "새로운 소비재를 비교해 보고 구매함",
                "persona": "광고 문구를 빠르게 이해하고 실용적 혜택을 중시하는 소비자",
            }
            for idx in range(n)
        ]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--artifact-dir", type=Path, default=None)
    parser.add_argument("--sample-size", type=int, default=3)
    args = parser.parse_args()

    artifact_dir = args.artifact_dir or _default_artifact_dir()
    artifact = run_live_litellm_langfuse_check(artifact_dir, sample_size=args.sample_size)
    print(json.dumps({"ok": artifact["ok"], "artifact_dir": str(artifact_dir)}, ensure_ascii=False))
    return 0 if artifact["ok"] else 1


def run_live_litellm_langfuse_check(artifact_dir: Path, *, sample_size: int = 3) -> dict[str, Any]:
    artifact_dir.mkdir(parents=True, exist_ok=True)
    proxy = _check_litellm_proxy()
    with TemporaryDirectory() as tmpdir:
        store = SQLiteRunStore(Path(tmpdir) / "ai-agent-live.sqlite3")
        run = store.create_run(
            RunCreateRequest.model_validate(
                {
                    "simulation_type": "creative_testing",
                    "input": {
                        "creatives": [
                            "A안: 10분 만에 시장 반응을 확인하세요",
                            "B안: 고객의 진짜 목소리를 AI로 먼저 들어보세요",
                        ]
                    },
                    "sample_size": sample_size,
                    "seed": 20260512,
                    "model_alias": os.environ["MODEL_PERSONA_STRONG"],
                }
            )
        )
        run_creative_testing_job(
            run.run_id,
            sqlite_path=str(store.path),
            sampler=LiveSmokeSampler(),
        )
        completed = store.get_run(run.run_id)
        result = store.get_result(run.run_id)
        agent_runs = store.list_agent_runs(run.run_id)
        checkpoints = store.list_orchestration_checkpoints(run.run_id)

    if completed is None or result is None:
        raise RuntimeError("Live AI agent run did not persist a completed result.")

    agent_rows = [_agent_row(row) for row in agent_runs]
    langfuse_checks = [_check_langfuse_trace(row["trace_id"]) for row in agent_rows if row["trace_id"]]
    all_scores_passed = all(
        row["scores"].get("schema_valid") is True and row["scores"].get("no_raw_leak") is True
        for row in agent_rows
    )
    all_traces_api_checked = len(langfuse_checks) == 3 and all(
        check.get("api_checked") is True for check in langfuse_checks
    )
    metadata_only_ok = all_traces_api_checked and all(
        check.get("metadata_only_ok") is True for check in langfuse_checks
    )
    artifact = {
        "schema_version": "ai-agent-live-litellm-langfuse/v1",
        "created_at": datetime.now(UTC).isoformat(),
        "ok": completed.status.value == "completed"
        and result.result.get("provider") == "litellm"
        and len(agent_rows) == 3
        and all_scores_passed
        and all(row["trace_id"] for row in agent_rows)
        and metadata_only_ok,
        "proxy": proxy,
        "run": {
            "run_id": completed.run_id,
            "status": completed.status.value,
            "simulation_type": completed.simulation_type,
            "sample_size": completed.sample_size,
            "total_responses": result.result.get("total_responses"),
            "parse_failed": result.result.get("parse_failed"),
            "provider": result.result.get("provider"),
            "provider_model": result.result.get("provider_model"),
            "llm_backend": result.result.get("llm_backend"),
        },
        "agent_runs": {
            "count": len(agent_rows),
            "agents": [row["agent_name"] for row in agent_rows],
            "all_scores_passed": all_scores_passed,
            "rows": agent_rows,
        },
        "langfuse": {
            "base_url": _langfuse_base_url(),
            "trace_api_checks": langfuse_checks,
            "all_traces_api_checked": all_traces_api_checked,
            "metadata_only_ok": metadata_only_ok,
        },
        "checkpoints": {
            "count": len(checkpoints),
            "rows": [
                {
                    "graph_name": row.graph_name,
                    "checkpoint_name": row.checkpoint_name,
                    "state_steps": row.state.get("steps", []),
                }
                for row in checkpoints
            ],
        },
    }
    (artifact_dir / "artifact.json").write_text(
        json.dumps(artifact, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    (artifact_dir / "report.md").write_text(_report_markdown(artifact), encoding="utf-8")
    return artifact


def _check_litellm_proxy() -> dict[str, Any]:
    base_url = os.getenv("LLM_GATEWAY_BASE_URL", "http://127.0.0.1:4000/v1")
    root_url = base_url.removesuffix("/v1")
    try:
        response = httpx.get(f"{root_url}/health", timeout=5)
        return {"url": root_url, "reachable": response.status_code < 500}
    except httpx.HTTPError as exc:
        return {"url": root_url, "reachable": False, "error": type(exc).__name__}


def _agent_row(row: Any) -> dict[str, Any]:
    return {
        "agent_name": row.agent_name,
        "task_type": row.task_type,
        "prompt_version": row.prompt_version,
        "mode": row.mode,
        "provider": row.provider,
        "provider_model": row.provider_model,
        "trace_id": row.trace_id,
        "safe_input_digest": row.safe_input_digest,
        "scores": row.scores,
    }


def _check_langfuse_trace(trace_id: str) -> dict[str, Any]:
    base_url = _langfuse_base_url()
    public_key = os.getenv("LANGFUSE_PUBLIC_KEY", "")
    secret_key = os.getenv("LANGFUSE_SECRET_KEY", "")
    if not base_url or not public_key or not secret_key:
        return {"trace_id": trace_id, "api_checked": False, "reason": "langfuse_env_missing"}
    response = None
    for _attempt in range(6):
        try:
            response = httpx.get(
                f"{base_url.rstrip('/')}/api/public/traces/{trace_id}",
                auth=(public_key, secret_key),
                timeout=10,
            )
        except httpx.HTTPError as exc:
            return {"trace_id": trace_id, "api_checked": False, "error": type(exc).__name__}
        if response.status_code != 404:
            break
        import time

        time.sleep(2)
    if response is None:
        return {"trace_id": trace_id, "api_checked": False, "error": "no_response"}
    if response.status_code >= 400:
        return {
            "trace_id": trace_id,
            "api_checked": False,
            "status_code": response.status_code,
        }
    data = response.json()
    return {
        "trace_id": trace_id,
        "api_checked": True,
        "status_code": response.status_code,
        "metadata_only_ok": _trace_payload_is_metadata_only(data),
    }


def _trace_payload_is_metadata_only(data: dict[str, Any]) -> bool:
    text = json.dumps(data, ensure_ascii=False)
    forbidden = ("live-persona-", "professional_persona", "raw_results", "system_prompt")
    return all(term not in text for term in forbidden)


def _langfuse_base_url() -> str:
    return os.getenv("LANGFUSE_BASE_URL") or os.getenv("LANGFUSE_HOST", "")


def _default_artifact_dir() -> Path:
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    return PROJECT_ROOT / "docs" / "verification" / "e2e" / f"ai-agent-live-{stamp}"


def _report_markdown(artifact: dict[str, Any]) -> str:
    lines = [
        "# AI Agent Live LiteLLM/Langfuse Verification",
        "",
        f"- ok: `{artifact['ok']}`",
        f"- run_id: `{artifact['run']['run_id']}`",
        f"- status: `{artifact['run']['status']}`",
        f"- provider: `{artifact['run']['provider']}`",
        f"- provider_model: `{artifact['run']['provider_model']}`",
        f"- agent_runs: `{artifact['agent_runs']['count']}`",
        f"- langfuse_metadata_only_ok: `{artifact['langfuse']['metadata_only_ok']}`",
        "",
        "## Agent Runs",
        "",
    ]
    for row in artifact["agent_runs"]["rows"]:
        lines.append(
            f"- `{row['agent_name']}` prompt=`{row['prompt_version']}` "
            f"provider=`{row['provider']}` model=`{row['provider_model']}` "
            f"trace=`{row['trace_id']}`"
        )
    lines.append("")
    return "\n".join(lines)


if __name__ == "__main__":
    raise SystemExit(main())
