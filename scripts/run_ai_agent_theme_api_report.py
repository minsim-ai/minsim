"""Run all demo simulation themes through the API path and save an agent report."""
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
from fastapi.testclient import TestClient

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
os.environ["KORESIM_AUTH_REQUIRED"] = "false"

from src.api.main import create_app  # noqa: E402
from src.api.presets import list_demo_presets  # noqa: E402
from src.jobs.store import SQLiteRunStore  # noqa: E402
from src.jobs.worker import run_simulation_job  # noqa: E402


class ThemeSampler:
    def sample(self, n: int, filter_=None, seed: int = 42) -> list[dict[str, Any]]:
        return [
            {
                "uuid": f"theme-persona-{seed}-{idx}",
                "age": 24 + (idx * 7) % 35,
                "sex": "여성" if idx % 2 else "남성",
                "province": "서울" if idx % 3 else "경기",
                "district": "서울-강남구" if idx % 3 else "경기-성남시",
                "occupation": ["마케터", "개발자", "자영업자", "기획자"][idx % 4],
                "education_level": "4년제 대학교",
                "marital_status": "미혼" if idx % 2 else "기혼",
                "family_type": "1인가구" if idx % 2 else "부부",
                "housing_type": "아파트",
                "professional_persona": "브랜드와 가격 정보를 비교해 합리적으로 판단하는 소비자",
                "family_persona": "가족 구매에서는 실용성과 비용을 함께 고려함",
                "culinary_persona": "새로운 제품을 시도하지만 후기를 중요하게 봄",
                "persona": "광고 문구의 구체성과 신뢰 근거에 민감한 한국 소비자",
            }
            for idx in range(n)
        ]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--artifact-dir", type=Path, default=None)
    parser.add_argument("--sample-size", type=int, default=3)
    parser.add_argument(
        "--preset-id",
        action="append",
        default=None,
        help="Run only the selected demo preset id. Can be passed multiple times.",
    )
    args = parser.parse_args()
    artifact_dir = args.artifact_dir or _default_artifact_dir()
    artifact = run_theme_api_report(
        artifact_dir,
        sample_size=args.sample_size,
        preset_ids=set(args.preset_id or []),
    )
    print(json.dumps({"ok": artifact["ok"], "artifact_dir": str(artifact_dir)}, ensure_ascii=False))
    return 0 if artifact["ok"] else 1


def run_theme_api_report(
    artifact_dir: Path,
    *,
    sample_size: int = 3,
    preset_ids: set[str] | None = None,
) -> dict[str, Any]:
    artifact_dir.mkdir(parents=True, exist_ok=True)
    proxy = _check_litellm_proxy()
    presets = [
        preset for preset in list_demo_presets() if not preset_ids or preset.id in preset_ids
    ]
    if not presets:
        requested = ", ".join(sorted(preset_ids or [])) or "all"
        raise ValueError(f"No demo presets matched: {requested}")
    with TemporaryDirectory() as tmpdir:
        store = SQLiteRunStore(Path(tmpdir) / "theme-api.sqlite3")

        client = TestClient(
            create_app(store=store, enqueue_run_func=lambda run_id: f"sync-{run_id}")
        )
        rows = []
        for preset in presets:
            payload = _run_payload(preset, sample_size=sample_size)
            create_response = client.post("/api/runs", json=payload)
            create_response.raise_for_status()
            run_id = create_response.json()["run_id"]
            run_simulation_job(
                run_id,
                sqlite_path=str(store.path),
                sampler=ThemeSampler(),
            )
            result_response = client.get(f"/api/runs/{run_id}/result")
            result_response.raise_for_status()
            result = result_response.json()
            rows.append(_theme_row(store, preset, result))

    artifact = {
        "schema_version": "ai-agent-theme-api-report/v2",
        "created_at": datetime.now(UTC).isoformat(),
        "ok": all(row["ok"] for row in rows),
        "proxy": proxy,
        "sample_size": sample_size,
        "theme_count": len(rows),
        "rows": rows,
        "cross_theme_improvements": _cross_theme_improvements(rows),
    }
    (artifact_dir / "artifact.json").write_text(
        json.dumps(artifact, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    (artifact_dir / "report.md").write_text(_report_markdown(artifact), encoding="utf-8")
    return artifact


def _run_payload(preset: Any, *, sample_size: int) -> dict[str, Any]:
    request = preset.to_run_request()
    payload = request.model_dump(mode="json")
    payload["sample_size"] = sample_size
    payload["model_alias"] = _model_alias_for_simulation(payload["simulation_type"])
    return payload


def _model_alias_for_simulation(simulation_type: str) -> str:
    if simulation_type in {"market_segmentation", "churn_prediction", "campaign_strategy"}:
        return os.environ["MODEL_PERSONA_STRONG"]
    return os.environ["MODEL_PERSONA_DEFAULT"]


def _theme_row(store: SQLiteRunStore, preset: Any, result: dict[str, Any]) -> dict[str, Any]:
    run_id = result["run_id"]
    agent_runs = store.list_agent_runs(run_id)
    agents = result.get("orchestration", {}).get("agents", {})
    analysis = agents.get("analysis", {}) if isinstance(agents, dict) else {}
    report = agents.get("report", {}) if isinstance(agents, dict) else {}
    qa = agents.get("qa", {}) if isinstance(agents, dict) else {}
    metric_preview = _metric_preview(result.get("metrics", {}))
    warnings = list(result.get("warnings") or [])
    agent_score_ok = all(_agent_scores_passed(row.scores) for row in agent_runs)
    return {
        "ok": result.get("status") == "completed" and len(agent_runs) == 3 and agent_score_ok,
        "preset_id": preset.id,
        "title": preset.title,
        "simulation_type": result["simulation_type"],
        "run_id": run_id,
        "sample_size": result.get("sample_size"),
        "total_responses": result.get("total_responses"),
        "parse_failed": result.get("parse_failed"),
        "provider": result.get("provider"),
        "provider_model": result.get("provider_model"),
        "quality": result.get("quality", {}),
        "warnings": warnings,
        "metric_preview": metric_preview,
        "agent_report": {
            "analysis_summary": analysis.get("summary") or analysis.get("primary_insight"),
            "key_findings": analysis.get("key_findings", []),
            "headline": report.get("headline"),
            "recommendations": report.get("recommendations", []),
            "risks": report.get("risks", []),
            "qa_passed": qa.get("passed"),
            "qa_severity": qa.get("severity"),
            "qa_warnings": qa.get("warnings", []),
            "qa_review_notes": qa.get("review_notes", []),
        },
        "agent_runs": [
            {
                "agent_name": row.agent_name,
                "prompt_version": row.prompt_version,
                "provider": row.provider,
                "provider_model": row.provider_model,
                "trace_id": row.trace_id,
                "scores": row.scores,
            }
            for row in agent_runs
        ],
        "improvement_notes": _theme_improvement_notes(result, analysis, report, qa, agent_runs),
    }


def _agent_scores_passed(scores: dict[str, Any]) -> bool:
    return (
        scores.get("schema_valid") is True
        and scores.get("no_raw_leak") is True
        and scores.get("korean_output") is True
        and all(value is True for key, value in scores.items() if key.endswith("_valid"))
    )


def _metric_preview(metrics: dict[str, Any]) -> dict[str, Any]:
    preview: dict[str, Any] = {}
    for key, value in metrics.items():
        if isinstance(value, dict):
            preview[key] = dict(list(value.items())[:5])
        elif isinstance(value, list):
            preview[key] = value[:5]
        else:
            preview[key] = value
    return preview


def _theme_improvement_notes(
    result: dict[str, Any],
    analysis: dict[str, Any],
    report: dict[str, Any],
    qa: dict[str, Any],
    agent_runs: list[Any],
) -> list[str]:
    notes: list[str] = []
    if result.get("parse_failed", 0):
        notes.append("응답 파싱 실패가 있어 simulation별 출력 포맷 지시를 강화해야 합니다.")
    if not report.get("recommendations"):
        notes.append("ReportAgent가 실행 권고를 충분히 구조화하지 못했습니다.")
    if not report.get("risks"):
        notes.append("ReportAgent가 리스크/한계를 명시하도록 prompt를 강화해야 합니다.")
    if qa.get("severity") == "directional_only":
        notes.append("QAAgent가 소표본을 품질 실패가 아닌 방향성 검증으로 분리했습니다.")
    elif qa.get("passed") is not True:
        notes.append("QAAgent가 결과 품질 문제를 감지했습니다.")
    if not analysis.get("key_findings"):
        notes.append("AnalysisAgent가 핵심 발견을 리스트로 정리하도록 개선해야 합니다.")
    failed_scores = [
        row.agent_name
        for row in agent_runs
        if not _agent_scores_passed(row.scores)
    ]
    if failed_scores:
        notes.append(f"Eval gate V2 실패 agent: {', '.join(failed_scores)}.")
    if not notes:
        notes.append("소표본 smoke에서는 agent output 구조가 정상입니다. 다음 개선은 큰 표본과 UI 가독성 검증입니다.")
    return notes


def _cross_theme_improvements(rows: list[dict[str, Any]]) -> list[str]:
    notes = []
    if any(row["parse_failed"] for row in rows):
        notes.append("테마별 persona 응답 파서 실패 케이스를 줄이기 위해 task별 응답 포맷 예시를 추가합니다.")
    if any(not row["agent_report"]["risks"] for row in rows):
        notes.append("모든 ReportAgent 출력에 risks를 필수로 유지하는 eval gate를 강화합니다.")
    if any(row["agent_report"].get("qa_severity") == "directional_only" for row in rows):
        notes.append("소표본 테마는 QA severity를 directional_only로 저장해 품질 실패와 표본 한계를 분리합니다.")
    if any(not _row_agent_scores_passed(row) for row in rows):
        notes.append("V2 eval gate 실패 테마는 prompt/schema를 재조정한 뒤 동일 fixture로 회귀 비교합니다.")
    notes.append("브라우저 UI에서는 headline/recommendations/risks/QA를 한 화면에서 비교 가능하게 노출합니다.")
    notes.append("Langfuse trace와 agent_runs score를 연결해 prompt version별 회귀 여부를 추적합니다.")
    return notes


def _check_litellm_proxy() -> dict[str, Any]:
    base_url = os.getenv("LLM_GATEWAY_BASE_URL", "http://127.0.0.1:4000/v1")
    root_url = base_url.removesuffix("/v1")
    try:
        response = httpx.get(f"{root_url}/health", timeout=5)
        return {"url": root_url, "reachable": response.status_code < 500}
    except httpx.HTTPError as exc:
        return {"url": root_url, "reachable": False, "error": type(exc).__name__}


def _default_artifact_dir() -> Path:
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    return PROJECT_ROOT / "docs" / "verification" / "e2e" / f"ai-agent-theme-api-v2-{stamp}"


def _row_agent_scores_passed(row: dict[str, Any]) -> bool:
    return all(_agent_scores_passed(agent_run.get("scores", {})) for agent_run in row["agent_runs"])


def _report_markdown(artifact: dict[str, Any]) -> str:
    lines = [
        "# AI Agent Theme API Report",
        "",
        f"- ok: `{artifact['ok']}`",
        f"- sample_size: `{artifact['sample_size']}`",
        f"- theme_count: `{artifact['theme_count']}`",
        "",
        "## 테마별 결과",
        "",
    ]
    for row in artifact["rows"]:
        report = row["agent_report"]
        lines.extend(
            [
                f"### {row['title']} (`{row['simulation_type']}`)",
                "",
                f"- run_id: `{row['run_id']}`",
                f"- provider: `{row['provider']}` / `{row['provider_model']}`",
                f"- responses: `{row['total_responses']}`, parse_failed: `{row['parse_failed']}`",
                f"- headline: {report.get('headline') or 'N/A'}",
                f"- analysis: {report.get('analysis_summary') or 'N/A'}",
                f"- qa: passed=`{report.get('qa_passed')}`, severity=`{report.get('qa_severity')}`",
                "- recommendations:",
                *[f"  - {_format_recommendation(item)}" for item in report.get("recommendations", [])],
                "- risks:",
                *[f"  - {_format_risk(item)}" for item in report.get("risks", [])],
                "- key findings:",
                *[f"  - {_format_finding(item)}" for item in report.get("key_findings", [])],
                "- improvement notes:",
                *[f"  - {item}" for item in row["improvement_notes"]],
                "",
            ]
        )
    lines.extend(["## 공통 개선점", ""])
    lines.extend(f"- {item}" for item in artifact["cross_theme_improvements"])
    lines.append("")
    return "\n".join(lines)


def _format_finding(item: Any) -> str:
    if isinstance(item, dict):
        metric = item.get("metric_key") or "metric"
        confidence = item.get("confidence")
        suffix = f" (confidence={confidence})" if confidence is not None else ""
        return f"[{metric}] {item.get('finding') or ''} - evidence: {item.get('evidence') or 'N/A'}{suffix}"
    return str(item)


def _format_recommendation(item: Any) -> str:
    if isinstance(item, dict):
        priority = item.get("priority") or "medium"
        return f"[{priority}] {item.get('action') or ''} - reason: {item.get('reason') or 'N/A'}"
    return str(item)


def _format_risk(item: Any) -> str:
    if isinstance(item, dict):
        severity = item.get("severity") or "medium"
        return f"[{severity}] {item.get('risk') or ''} - mitigation: {item.get('mitigation') or 'N/A'}"
    return str(item)


if __name__ == "__main__":
    raise SystemExit(main())
