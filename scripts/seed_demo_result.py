"""결과 화면을 브라우저로 확인하기 위해 완료된 run을 스토어에 시드한다.

verify.py는 렌더를 검증하지 않는다. typecheck·lint·build를 다 통과해도 화면은
틀릴 수 있으므로(목업 첫 렌더에서 임계값 문구와 실제 표시가 어긋난 전례) 실제
화면을 눈으로 봐야 한다.

stub LLM을 쓰므로 Upstage 비용이 들지 않고 결정적이다. 응답은 계층별로 다르게
돌려주어 교차표·순위 역전에 실제 값이 차도록 한다. 전부 같은 답이면 화면이
비어 보여서 렌더 확인이 무의미해진다.

사용:
    uv run python scripts/seed_demo_result.py campus_policy
    uv run python scripts/seed_demo_result.py campus_priority
"""
from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.api.auth import local_dev_user  # noqa: E402
from src.api.schemas import RunCreateRequest, RunStatus  # noqa: E402
from src.data.campus_tiers import classify_tier  # noqa: E402
from src.jobs.store import SQLiteRunStore  # noqa: E402
from src.jobs.worker import _build_envelope  # noqa: E402
from src.llm.base import LLMResponse  # noqa: E402
from src.simulations.registry import run_registered_simulation  # noqa: E402

API_BASE = "http://127.0.0.1:8010"
SAMPLE_SIZE = 200
SEED = 42

PRESETS: dict[str, dict] = {
    "campus_policy": {
        "agenda": "중앙도서관 24시간 개방",
        "current_state": "평일 09-23시, 주말 10-18시 운영. 시험기간 2주만 익일 02시까지 연장.",
        "proposed_change": "1층 열람실과 그룹스터디존만 연중 24시간 개방.",
        "tradeoffs": "연간 운영비 1.2억 증가. 학생회비를 1인당 연 2만원 인상해 충당한다.",
    },
    "campus_priority": {
        "question": "시설 예산을 어디에 먼저 쓸까요?",
        "items": [
            "기숙사 샤워실·세탁실 개보수",
            "교직원 전용 주차장 확충",
            "학부 실험실 장비 교체",
            "대학원 연구실 공간 증설",
        ],
        "context": "총 5억 원. 올해 하나만 집행 가능.",
    },
}

# 계층별로 다른 답. 교차표와 순위 역전에 실제 신호가 차야 렌더 확인이 된다.
_POLICY_BY_TIER = {
    "학부생": ("찬성", 5, None, "기숙사에서 도서관이 가까워 심야 이용이 많다"),
    "석·박사 재학": ("조건부찬성", 3, "야간 경비 상주", "새벽에 혼자 있기 불안하다"),
    "박사후연구원": ("판단유보", 2, None, "이용 패턴을 아직 판단하기 어렵다"),
    "교직원": ("반대", 5, None, "야간 근무 부담이 행정직에 전가된다"),
}

_PRIORITY_BY_TIER = {
    "학부생": [
        "기숙사 샤워실·세탁실 개보수",
        "학부 실험실 장비 교체",
        "대학원 연구실 공간 증설",
        "교직원 전용 주차장 확충",
    ],
    "석·박사 재학": [
        "대학원 연구실 공간 증설",
        "기숙사 샤워실·세탁실 개보수",
        "학부 실험실 장비 교체",
        "교직원 전용 주차장 확충",
    ],
    "박사후연구원": [
        "학부 실험실 장비 교체",
        "대학원 연구실 공간 증설",
        "기숙사 샤워실·세탁실 개보수",
        "교직원 전용 주차장 확충",
    ],
    "교직원": [
        "교직원 전용 주차장 확충",
        "학부 실험실 장비 교체",
        "대학원 연구실 공간 증설",
        "기숙사 샤워실·세탁실 개보수",
    ],
}


class TierAwareStubClient:
    """프롬프트에 실린 페르소나 서술로 계층을 추정해 계층별 답을 돌려준다."""

    def __init__(self, simulation_type: str) -> None:
        self.simulation_type = simulation_type

    @staticmethod
    def _tier_from_prompt(content: str) -> str:
        for level, tier in (
            ("박사후연구원", "박사후연구원"),
            ("석사 재학", "석·박사 재학"),
            ("박사 재학", "석·박사 재학"),
            ("석박통합 재학", "석·박사 재학"),
            ("학사 재학", "학부생"),
            ("전문학사", "학부생"),
        ):
            if level in content:
                return tier
        return classify_tier({})

    async def generate(self, request) -> LLMResponse:
        content = "\n".join(message.content for message in request.messages)
        tier = self._tier_from_prompt(content)

        if self.simulation_type == "campus_priority":
            payload = {
                "ranking": _PRIORITY_BY_TIER[tier],
                "top_reason": f"{tier} 입장에서 본인 일과에 가장 직접적인 항목이다",
                "bottom_reason": f"{tier}에게는 체감 효과가 가장 낮은 항목이다",
            }
        else:
            stance, intensity, condition, reason = _POLICY_BY_TIER[tier]
            payload = {
                "stance": stance,
                "reason": reason,
                "condition": condition,
                "intensity": intensity,
            }

        return LLMResponse(
            content=json.dumps(payload, ensure_ascii=False),
            provider="stub",
            provider_model="seed-demo",
        )


async def seed(simulation_type: str) -> str:
    if simulation_type not in PRESETS:
        raise SystemExit(f"지원하지 않는 유형: {simulation_type}. {sorted(PRESETS)} 중에서 고르세요.")

    store = SQLiteRunStore()
    # /results 는 project_id와 run_id를 모두 요구한다. 프로젝트 없이 시드하면
    # "결과를 열 수 없습니다"만 보게 된다 (첫 렌더에서 실제로 겪음).
    user = store.upsert_user_from_auth(local_dev_user())
    project = store.create_project(
        user=user,
        name=f"[시드] {simulation_type}",
        description="브라우저 렌더 확인용 시드 데이터",
    )
    request = RunCreateRequest(
        simulation_type=simulation_type,
        input=PRESETS[simulation_type],
        sample_size=SAMPLE_SIZE,
        seed=SEED,
        persona_pool="dgist",
    )
    run = store.create_run(request, user=user)

    result = await run_registered_simulation(
        simulation_type=simulation_type,
        input_data=run.input,
        sample_size=run.sample_size,
        target_filter=run.target_filter,
        seed=run.seed,
        llm_client=TierAwareStubClient(simulation_type),
        persona_pool="dgist",
    )

    # worker와 같은 조립 경로를 쓴다. 손으로 envelope을 쓰면 실제와 다른 모양을 보게 된다.
    envelope = _build_envelope(run, result)
    store.save_result(run.run_id, envelope)
    store.update_run_status(run.run_id, status=RunStatus.COMPLETED)
    store.attach_project_run(
        user_id=user.user_id,
        project_id=project.project_id,
        run_id=run.run_id,
        run_label=f"시드 {simulation_type}",
    )

    print(f"simulation_type : {simulation_type}")
    print(f"total_responses : {result.total_responses}")
    print(f"parse_failed    : {result.parse_failed}")
    print(f"URL             : {API_BASE}/results?project_id={project.project_id}&run_id={run.run_id}")
    return run.run_id


def main() -> int:
    if len(sys.argv) < 2:
        print(f"usage: {sys.argv[0]} <{' | '.join(sorted(PRESETS))}>", file=sys.stderr)
        return 1
    asyncio.run(seed(sys.argv[1]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
