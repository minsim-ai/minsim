"""Run deterministic 50/200-person validation for Phase 5/7 gates."""
from __future__ import annotations

import json
import sys
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from src.api.presets import list_demo_presets  # noqa: E402
from src.api.schemas import RunCreateRequest  # noqa: E402
from src.jobs.store import SQLiteRunStore  # noqa: E402
from src.jobs.worker import run_simulation_job  # noqa: E402
from src.llm.base import LLMRequest, LLMResponse  # noqa: E402


ARTIFACT_PATH = Path("docs/verification/phase-5-phase-7-deterministic-validation.json")


class DeterministicLLM:
    async def generate(self, request: LLMRequest) -> LLMResponse:
        return LLMResponse(
            content=(
                "선택: A\n"
                "선호가격: 5500\n"
                "지불의향가격: 6500\n"
                "점수: 4\n"
                "설득력: 4\n"
                "명확성: 4\n"
                "공감도: 4\n"
                "의향: 구매\n"
                "의향: 유지\n"
                "의향: 4\n"
                "세그먼트: 실용형\n"
                "니즈: 합리성\n"
                "페인: 가격 부담\n"
                "포지셔닝: 실용적인 프리미엄\n"
                "강점: 품질\n"
                "약점: 인지도\n"
                "연상어: 신뢰, 편리\n"
                "긍정: 사용감\n"
                "부정: 가격\n"
                "나를 잡으려면: 혜택 강화\n"
                "채널: 인스타그램\n"
                "메시지: 메시지 1\n"
                "반응: 클릭\n"
                "이유: deterministic validation response"
            ),
            provider="deterministic",
            provider_model="fixture-model",
            metadata={"task_type": request.task_type},
        )


class DeterministicSampler:
    def sample(self, n: int, filter_=None, seed: int = 42) -> list[dict[str, Any]]:
        return [
            {
                "uuid": f"persona-{seed}-{idx}",
                "age": 20 + (idx % 50),
                "sex": "여자" if idx % 2 else "남자",
                "province": "서울" if idx % 3 else "경기",
                "district": "서울-강남구" if idx % 3 else "경기-성남시",
                "occupation": "마케터" if idx % 2 else "개발자",
                "education_level": "4년제 대학교",
                "marital_status": "미혼",
                "family_type": "1인가구",
                "housing_type": "아파트",
                "professional_persona": "시장 조사 응답에 성실한 직장인",
                "family_persona": "가족 구매도 함께 고려함",
                "culinary_persona": "새로운 제품을 비교해 봄",
                "persona": "실용적인 소비자",
            }
            for idx in range(n)
        ]


def main() -> int:
    rows: list[dict[str, Any]] = []
    with TemporaryDirectory() as tmpdir:
        store = SQLiteRunStore(Path(tmpdir) / "validation.sqlite3")
        for preset in list_demo_presets():
            for sample_size in (50, 200):
                request = RunCreateRequest(
                    simulation_type=preset.simulation_type,
                    input=preset.input,
                    sample_size=sample_size,
                    target_filter=preset.target_filter,
                    seed=preset.seed,
                )
                run = store.create_run(request)
                run_simulation_job(
                    run.run_id,
                    sqlite_path=str(store.path),
                    llm_client=DeterministicLLM(),
                    sampler=DeterministicSampler(),
                )
                result = store.get_result(run.run_id)
                if result is None:
                    raise RuntimeError(f"missing result for {run.run_id}")
                rows.append(
                    {
                        "preset_id": preset.id,
                        "simulation_type": preset.simulation_type.value,
                        "sample_size": sample_size,
                        "run_id": run.run_id,
                        "status": store.get_run(run.run_id).status.value,
                        "total_responses": result.result["total_responses"],
                        "parse_failed": result.result["parse_failed"],
                        "quality": result.result["quality"],
                        "metric_keys": sorted(result.result["metrics"].keys()),
                    }
                )

    artifact = {
        "gate": "phase-5-phase-7-deterministic-50-200",
        "ok": all(row["status"] == "completed" and row["parse_failed"] == 0 for row in rows),
        "rows": rows,
    }
    ARTIFACT_PATH.parent.mkdir(parents=True, exist_ok=True)
    ARTIFACT_PATH.write_text(
        json.dumps(artifact, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps({"ok": artifact["ok"], "artifact": str(ARTIFACT_PATH)}, ensure_ascii=False))
    return 0 if artifact["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
