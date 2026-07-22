"""Run a local AI-agent E2E check and save verification artifacts."""
from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, datetime
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from src.api.schemas import RunCreateRequest  # noqa: E402
from src.jobs.store import SQLiteRunStore  # noqa: E402
from src.jobs.worker import run_creative_testing_job  # noqa: E402
from src.llm.base import LLMRequest, LLMResponse  # noqa: E402


class E2ELLM:
    async def generate(self, request: LLMRequest) -> LLMResponse:
        agent_payloads = {
            "analysis": {
                "summary": "A안이 집계 지표에서 가장 강한 반응을 보입니다.",
                "key_findings": [
                    {
                        "metric_key": "choice_counts",
                        "finding": "A안 선택 비중이 가장 높습니다.",
                        "evidence": "choice_counts 집계에서 A안 선택이 가장 많습니다.",
                        "confidence": 0.82,
                    }
                ],
                "segment_notes": [
                    {
                        "segment_key": "sample_size",
                        "note": "소규모 표본에서는 방향성 검증으로 해석합니다.",
                        "evidence": "total_responses가 30명 미만입니다.",
                    }
                ],
            },
            "report": {
                "headline": "A안을 다음 캠페인 기준안으로 권장합니다.",
                "recommendations": [
                    {
                        "priority": "high",
                        "action": "A안을 기준으로 후속 가격/메시지 테스트를 진행합니다.",
                        "reason": "현재 집계에서 A안 반응이 가장 강합니다.",
                    }
                ],
                "risks": [
                    {
                        "severity": "medium",
                        "risk": "실제 출시 전 표본 한계를 과해석할 수 있습니다.",
                        "mitigation": "50명 이상 표본으로 재검증합니다.",
                    }
                ],
            },
            "qa": {
                "passed": True,
                "severity": "directional_only",
                "warnings": [],
                "review_notes": ["필수 agent output field와 aggregate-only 저장을 확인했습니다."],
                "confidence": 0.74,
            },
        }
        if request.task_type in agent_payloads:
            return LLMResponse(
                content=json.dumps(agent_payloads[request.task_type], ensure_ascii=False),
                provider="e2e-agent",
                provider_model=f"e2e-{request.task_type}",
                trace_id=f"trace-{request.task_type}",
                metadata={"task_type": request.task_type},
            )
        return LLMResponse(
            content="선택: A\n이유: 메시지가 명확하고 혜택이 바로 이해됩니다.",
            provider="e2e-persona",
            provider_model="e2e-persona-model",
            metadata={"task_type": request.task_type},
        )


class E2ESampler:
    def sample(self, n: int, filter_=None, seed: int = 42) -> list[dict[str, Any]]:
        return [
            {
                "uuid": f"persona-e2e-{idx}",
                "age": 28 + idx,
                "sex": "여성" if idx % 2 else "남성",
                "province": "서울",
                "district": "서울-강남구",
                "occupation": "마케터",
                "education_level": "4년제 대학교",
                "marital_status": "미혼",
                "family_type": "1인가구",
                "housing_type": "아파트",
                "professional_persona": "private-e2e-profile",
                "family_persona": "가족 구매도 함께 고려함",
                "culinary_persona": "새 제품 비교에 적극적임",
                "persona": "실용적인 소비자",
            }
            for idx in range(n)
        ]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--artifact-dir", type=Path, default=None)
    parser.add_argument("--sample-size", type=int, default=3)
    args = parser.parse_args()
    artifact_dir = args.artifact_dir or _default_artifact_dir()
    artifact = run_ai_agent_e2e_check(artifact_dir, sample_size=args.sample_size)
    print(json.dumps({"ok": artifact["ok"], "artifact_dir": str(artifact_dir)}, ensure_ascii=False))
    return 0 if artifact["ok"] else 1


def run_ai_agent_e2e_check(artifact_dir: Path, *, sample_size: int = 3) -> dict[str, Any]:
    artifact_dir.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory() as tmpdir:
        store = SQLiteRunStore(Path(tmpdir) / "ai-agent-e2e.sqlite3")
        run = store.create_run(
            RunCreateRequest.model_validate(
                {
                    "simulation_type": "creative_testing",
                    "input": {"creatives": ["A안: 즉시 이해되는 혜택", "B안: 감성 중심 메시지"]},
                    "sample_size": sample_size,
                    "seed": 20260512,
                }
            )
        )
        run_creative_testing_job(
            run.run_id,
            sqlite_path=str(store.path),
            llm_client=E2ELLM(),
            sampler=E2ESampler(),
        )
        completed = store.get_run(run.run_id)
        result = store.get_result(run.run_id)
        agent_runs = store.list_agent_runs(run.run_id)
        checkpoints = store.list_orchestration_checkpoints(run.run_id)

    if completed is None or result is None:
        raise RuntimeError("AI agent E2E run did not persist a completed result.")

    rows = [
        {
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
        for row in agent_runs
    ]
    all_scores_passed = all(
        row.scores.get("schema_valid") is True
        and row.scores.get("no_raw_leak") is True
        and row.scores.get("korean_output") is True
        and all(value is True for key, value in row.scores.items() if key.endswith("_valid"))
        for row in agent_runs
    )
    artifact = {
        "schema_version": "ai-agent-e2e/v2",
        "created_at": datetime.now(UTC).isoformat(),
        "ok": completed.status.value == "completed"
        and result.result.get("total_responses") == sample_size
        and len(agent_runs) == 3
        and all_scores_passed,
        "run": {
            "run_id": completed.run_id,
            "status": completed.status.value,
            "simulation_type": completed.simulation_type,
            "sample_size": completed.sample_size,
            "total_responses": result.result.get("total_responses"),
            "parse_failed": result.result.get("parse_failed"),
        },
        "agent_runs": {
            "count": len(agent_runs),
            "agents": [row.agent_name for row in agent_runs],
            "all_scores_passed": all_scores_passed,
            "rows": rows,
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
        "result_orchestration": result.result.get("orchestration", {}),
    }
    (artifact_dir / "artifact.json").write_text(
        json.dumps(artifact, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    (artifact_dir / "report.md").write_text(_report_markdown(artifact), encoding="utf-8")
    return artifact


def _default_artifact_dir() -> Path:
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    return PROJECT_ROOT / "docs" / "verification" / "e2e" / f"ai-agent-{stamp}"


def _report_markdown(artifact: dict[str, Any]) -> str:
    rows = artifact["agent_runs"]["rows"]
    lines = [
        "# AI Agent E2E Verification",
        "",
        f"- ok: `{artifact['ok']}`",
        f"- run_id: `{artifact['run']['run_id']}`",
        f"- status: `{artifact['run']['status']}`",
        f"- total_responses: `{artifact['run']['total_responses']}`",
        f"- agent_runs: `{artifact['agent_runs']['count']}`",
        f"- checkpoints: `{artifact['checkpoints']['count']}`",
        "",
        "## Agent Runs",
        "",
    ]
    for row in rows:
        lines.append(
            f"- `{row['agent_name']}` prompt=`{row['prompt_version']}` "
            f"mode=`{row['mode']}` trace=`{row['trace_id']}`"
        )
    lines.append("")
    return "\n".join(lines)


if __name__ == "__main__":
    raise SystemExit(main())
