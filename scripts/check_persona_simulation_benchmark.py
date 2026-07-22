"""Run a case-equivalent persona simulation benchmark."""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from src.llm.base import LLMRequest, LLMResponse  # noqa: E402
from src.simulations.price_research_v2 import PriceResearchV2Simulation  # noqa: E402


class BenchmarkFakeLLM:
    def __init__(self) -> None:
        self.call_count = 0
        self.task_counts: dict[str, int] = {}

    async def generate(self, request: LLMRequest) -> LLMResponse:
        self.call_count += 1
        self.task_counts[request.task_type] = self.task_counts.get(request.task_type, 0) + 1
        persona_uuid = str(request.metadata["persona_uuid"])
        idx = int(persona_uuid.rsplit("-", 1)[1])
        if request.task_type == "pricing_response":
            if idx % 4 == 0:
                content = (
                    "가격별의향:\n"
                    "9900원: 구매\n"
                    "14900원: 구매\n"
                    "19900원: 관망\n"
                    "선호가격: 14900\n"
                    "지불의향가격: 19900\n"
                    "대표의향: 구매\n"
                    "이유: 업무에 바로 쓰이면 가격을 낼 수 있습니다."
                )
            else:
                content = (
                    "가격별의향:\n"
                    "9900원: 관망\n"
                    "14900원: 거부\n"
                    "19900원: 거부\n"
                    "선호가격: 9900\n"
                    "지불의향가격: 9900\n"
                    "대표의향: 거부\n"
                    "이유: 가격값을 증명하는 결과물이 먼저 필요합니다."
                )
        elif request.task_type == "pricing_objection":
            content = "조건: 결과물증명\n조건상태: 조건부구매\n이유: 내 업무 산출물 예시가 있으면 검토합니다."
        elif request.task_type == "pricing_anchor":
            content = "유사서비스: AI 업무 강의\n월지출: 12000\n앵커범주: AI학습\n이유: 업무 학습 예산과 비교합니다."
        elif request.task_type == "pricing_hesitation":
            content = "망설임: 신뢰부족\n이유: 실제 결과 품질을 먼저 봐야 합니다."
        else:
            raise RuntimeError(f"Unsupported benchmark task: {request.task_type}")
        return LLMResponse(
            content=content,
            provider="fake",
            provider_model=f"fake-{request.task_type}",
            metadata={"task_type": request.task_type},
        )


class BenchmarkSampler:
    def sample(self, n: int, filter_=None, seed: int = 42) -> list[dict[str, Any]]:
        occupations = ["마케터", "기획자", "HRD 담당자", "사무직"]
        return [
            {
                "uuid": f"persona-{idx}",
                "age": 25 + (idx % 30),
                "sex": "여성" if idx % 2 else "남성",
                "province": "서울" if idx % 10 < 7 else "부산",
                "district": "서울-강남구" if idx % 10 < 7 else "부산-해운대구",
                "occupation": occupations[idx % len(occupations)],
                "education_level": "4년제 대학교",
                "marital_status": "미혼" if idx % 3 else "기혼",
                "family_type": "1인가구",
                "housing_type": "아파트",
                "professional_persona": "업무 생산성과 학습 비용을 신중히 비교하는 직장인",
                "family_persona": "구독 지출을 현실적으로 따짐",
                "culinary_persona": "새 상품을 비교한 뒤 선택함",
                "persona": "실용적인 한국 소비자",
            }
            for idx in range(n)
        ]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sample-size", type=int, default=400)
    parser.add_argument("--fake-llm", action="store_true", help="Use deterministic fake LLM.")
    parser.add_argument("--external", action="store_true", help="Use configured external LLM client.")
    parser.add_argument("--timeout-seconds", type=int, default=5400)
    parser.add_argument(
        "--artifact-dir",
        default="docs/verification/benchmarks",
        help="Directory for benchmark artifact JSON.",
    )
    args = parser.parse_args()
    if not args.fake_llm and not args.external:
        parser.error("Choose --fake-llm or --external.")

    started = time.perf_counter()
    fake_llm = BenchmarkFakeLLM() if args.fake_llm else None
    result = asyncio.run(
        asyncio.wait_for(
            PriceResearchV2Simulation().run(
                {
                    "protocol_id": "price_research_v2",
                    "product_name": "KoreaSim",
                    "product_description": "한국형 AI 페르소나 리서치 SaaS",
                    "price_points": [9900, 14900, 19900],
                    "calibration": {
                        "dimensions": {
                            "occupation": {
                                "마케터": 0.35,
                                "기획자": 0.35,
                                "HRD 담당자": 0.2,
                                "사무직": 0.1,
                            }
                        }
                    },
                },
                sample_size=args.sample_size,
                seed=20260514,
                llm_client=fake_llm,
                sampler=BenchmarkSampler() if args.fake_llm else None,
            ),
            timeout=args.timeout_seconds,
        )
    )
    elapsed = round(time.perf_counter() - started, 3)
    artifact = {
        "schema_version": "persona-simulation-benchmark/v1",
        "created_at": datetime.now(UTC).isoformat(),
        "mode": "fake_llm" if args.fake_llm else "external",
        "simulation_type": result.simulation_type,
        "protocol_id": result.metrics.get("protocol_id"),
        "sample_size": args.sample_size,
        "total_responses": result.total_responses,
        "parse_failed": result.parse_failed,
        "parse_success_rate": round(
            (result.total_responses - result.parse_failed) / result.total_responses * 100,
            1,
        )
        if result.total_responses
        else 0.0,
        "wall_clock_seconds": elapsed,
        "call_count": fake_llm.call_count if fake_llm else None,
        "task_counts": fake_llm.task_counts if fake_llm else None,
        "metrics": {
            "headline_intent_counts": result.metrics.get("headline_intent_counts"),
            "conditional_yes_rate": result.metrics.get("conditional_yes_rate"),
            "condition_category_counts": result.metrics.get("condition_category_counts"),
            "anchor_category_counts": result.metrics.get("anchor_category_counts"),
            "hesitation_reason_counts": result.metrics.get("hesitation_reason_counts"),
        },
    }
    artifact_dir = Path(args.artifact_dir)
    artifact_dir.mkdir(parents=True, exist_ok=True)
    suffix = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    artifact_path = artifact_dir / f"persona-simulation-benchmark-{artifact['mode']}-{suffix}.json"
    artifact_path.write_text(json.dumps(artifact, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({**artifact, "artifact_path": str(artifact_path)}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
