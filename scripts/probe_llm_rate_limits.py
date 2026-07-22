"""Probe the configured LLM backend for sustainable request concurrency.

Escalates through concurrency levels, fires representative persona-sized
requests through the production client boundary, and records success rate,
latency percentiles, throughput, and rate-limit signals per level. Stops when
the error rate crosses the threshold. Writes JSON + Markdown artifacts under
docs/verification/benchmarks/.

Usage:
    uv run python scripts/probe_llm_rate_limits.py \
        --levels 8,16,32,64,96,128 --requests-per-level 32

The backend/model come from the environment (LLM_BACKEND, MODEL_*), so the
same script probes Upstage today and the Mono router once its key arrives.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import statistics
import sys
import time
from datetime import UTC, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.config import LLM_BACKEND, LLM_TIMEOUT_SECONDS  # noqa: E402
from src.llm.base import LLMMessage, LLMRequest  # noqa: E402
from src.llm.factory import create_llm_client  # noqa: E402
from src.llm.router import resolve_model_route  # noqa: E402

PROBE_SYSTEM_PROMPT = (
    "당신은 35세 서울 거주 직장인 소비자입니다. 제품 설명을 읽고 "
    "구매 의향과 이유를 간결하게 답합니다."
)


def _probe_user_prompt(prompt_chars: int) -> str:
    base = (
        "다음 제품에 대한 구매 의향을 답해주세요.\n"
        "제품: 수면 유도 웨어러블 헤드밴드. 뇌파 측정과 수면 리포트를 제공합니다.\n"
        "답변 형식:\n의향: 구매/관망/거부 중 하나\n이유: 한 문장\n"
    )
    filler = "제품 상세 설명: 착용감이 가볍고 앱과 연동됩니다. "
    while len(base) < prompt_chars:
        base += filler
    return base[:prompt_chars]


def _status_code(exc: Exception) -> int | None:
    for attr in ("status_code", "http_status"):
        value = getattr(exc, attr, None)
        if isinstance(value, int):
            return value
    response = getattr(exc, "response", None)
    value = getattr(response, "status_code", None)
    return value if isinstance(value, int) else None


def _retry_after(exc: Exception) -> str | None:
    response = getattr(exc, "response", None)
    headers = getattr(response, "headers", None)
    if headers is None:
        return None
    return headers.get("retry-after-ms") or headers.get("retry-after")


async def _run_level(
    client,
    *,
    level: int,
    requests_per_level: int,
    task_type: str,
    prompt_chars: int,
    temperature: float,
) -> dict:
    route = resolve_model_route(task_type)
    user_prompt = _probe_user_prompt(prompt_chars)
    sem = asyncio.Semaphore(level)
    latencies: list[float] = []
    errors: list[dict] = []
    rate_limited = 0
    retry_after_seen: list[str] = []
    tokens_in = 0
    tokens_out = 0

    async def one(index: int) -> None:
        nonlocal rate_limited, tokens_in, tokens_out
        async with sem:
            started = time.monotonic()
            try:
                response = await asyncio.wait_for(
                    client.generate(
                        LLMRequest(
                            task_type=task_type,
                            model_alias=route.model_alias,
                            messages=[
                                LLMMessage(role="system", content=PROBE_SYSTEM_PROMPT),
                                LLMMessage(role="user", content=user_prompt),
                            ],
                            temperature=temperature,
                            metadata={"probe": True, "probe_index": index},
                        )
                    ),
                    timeout=LLM_TIMEOUT_SECONDS,
                )
            except TimeoutError:
                errors.append({"index": index, "kind": "timeout"})
                return
            except Exception as exc:
                status = _status_code(exc)
                if status == 429:
                    rate_limited += 1
                    header = _retry_after(exc)
                    if header:
                        retry_after_seen.append(header)
                errors.append(
                    {
                        "index": index,
                        "kind": type(exc).__name__,
                        "status": status,
                        "message": str(exc)[:200],
                    }
                )
                return
            latencies.append(time.monotonic() - started)
            metadata = response.metadata or {}
            if isinstance(metadata.get("input_tokens"), int):
                tokens_in += metadata["input_tokens"]
            if isinstance(metadata.get("output_tokens"), int):
                tokens_out += metadata["output_tokens"]

    level_started = time.monotonic()
    await asyncio.gather(*[one(index) for index in range(requests_per_level)])
    wall_clock = time.monotonic() - level_started

    success = len(latencies)
    sorted_latencies = sorted(latencies)

    def _pct(p: float) -> float | None:
        if not sorted_latencies:
            return None
        position = min(len(sorted_latencies) - 1, int(len(sorted_latencies) * p))
        return round(sorted_latencies[position], 2)

    return {
        "concurrency": level,
        "requests": requests_per_level,
        "success": success,
        "errors": len(errors),
        "error_rate": round(len(errors) / requests_per_level, 4),
        "rate_limited_429": rate_limited,
        "retry_after_headers": retry_after_seen[:5],
        "latency_p50_s": _pct(0.5),
        "latency_p95_s": _pct(0.95),
        "latency_avg_s": round(statistics.mean(latencies), 2) if latencies else None,
        "wall_clock_s": round(wall_clock, 2),
        "achieved_rps": round(success / wall_clock, 2) if wall_clock > 0 else None,
        "tokens_in_total": tokens_in,
        "tokens_out_total": tokens_out,
        "error_samples": errors[:5],
    }


async def _main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--levels", default="8,16,32,64,96,128")
    parser.add_argument("--requests-per-level", type=int, default=32)
    parser.add_argument("--prompt-chars", type=int, default=2000)
    parser.add_argument("--temperature", type=float, default=0.7)
    parser.add_argument("--task-type", default="persona_response")
    parser.add_argument("--stop-error-rate", type=float, default=0.02)
    parser.add_argument("--max-total-requests", type=int, default=600)
    parser.add_argument(
        "--artifact-dir", default="docs/verification/benchmarks", type=Path
    )
    args = parser.parse_args()

    levels = [int(part) for part in args.levels.split(",") if part.strip()]
    client = create_llm_client()
    results: list[dict] = []
    total_requests = 0
    recommended = None

    try:
        for level in levels:
            per_level = max(args.requests_per_level, level)
            if total_requests + per_level > args.max_total_requests:
                print(f"[probe] max-total-requests reached before level {level}; stopping.")
                break
            print(f"[probe] level={level} requests={per_level} ...", flush=True)
            level_result = await _run_level(
                client,
                level=level,
                requests_per_level=per_level,
                task_type=args.task_type,
                prompt_chars=args.prompt_chars,
                temperature=args.temperature,
            )
            total_requests += per_level
            results.append(level_result)
            print(
                f"[probe]   success={level_result['success']}/{per_level}"
                f" err_rate={level_result['error_rate']}"
                f" p50={level_result['latency_p50_s']}s"
                f" p95={level_result['latency_p95_s']}s"
                f" rps={level_result['achieved_rps']}",
                flush=True,
            )
            if level_result["error_rate"] <= args.stop_error_rate:
                recommended = level
            else:
                print(
                    f"[probe] error rate {level_result['error_rate']} exceeds"
                    f" {args.stop_error_rate}; stopping escalation."
                )
                break
    finally:
        close = getattr(client, "close", None)
        if close:
            await close()

    timestamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    artifact = {
        "schema_version": "llm-rate-limit-probe/v1",
        "backend": LLM_BACKEND,
        "task_type": args.task_type,
        "prompt_chars": args.prompt_chars,
        "stop_error_rate": args.stop_error_rate,
        "generated_at": timestamp,
        "levels": results,
        "recommended_concurrency": recommended,
        "recommendation": (
            f"CONCURRENCY={recommended}" if recommended else "No level passed the threshold."
        ),
    }

    args.artifact_dir.mkdir(parents=True, exist_ok=True)
    json_path = args.artifact_dir / f"rate-limit-probe-{LLM_BACKEND}-{timestamp}.json"
    json_path.write_text(json.dumps(artifact, ensure_ascii=False, indent=2))

    lines = [
        f"# LLM rate-limit probe — {LLM_BACKEND} ({timestamp})",
        "",
        f"- task_type: `{args.task_type}` · prompt_chars: {args.prompt_chars}",
        f"- stop_error_rate: {args.stop_error_rate}",
        f"- **recommended CONCURRENCY: {recommended}**",
        "",
        "| concurrency | requests | success | err_rate | 429 | p50(s) | p95(s) | rps |",
        "|---|---|---|---|---|---|---|---|",
    ]
    for row in results:
        lines.append(
            f"| {row['concurrency']} | {row['requests']} | {row['success']} "
            f"| {row['error_rate']} | {row['rate_limited_429']} "
            f"| {row['latency_p50_s']} | {row['latency_p95_s']} | {row['achieved_rps']} |"
        )
    md_path = args.artifact_dir / f"rate-limit-probe-{LLM_BACKEND}-{timestamp}.md"
    md_path.write_text("\n".join(lines) + "\n")

    print(f"[probe] artifacts: {json_path} / {md_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(_main()))
