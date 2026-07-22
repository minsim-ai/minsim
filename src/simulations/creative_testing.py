"""크리에이티브 테스트 시뮬레이션"""
import re
from collections import Counter
from dataclasses import dataclass
from typing import Callable, Optional

from src.agent.simulator import BatchSimulator, SimResult
from src.data.sampler import PersonaSampler, TargetFilter
from src.llm.base import LLMClientProtocol

LETTERS = "ABCDEFGHIJ"


def _build_user_prompt(creatives: list[str]) -> str:
    options = "\n".join(f"[{LETTERS[i]}] {c}" for i, c in enumerate(creatives))
    return (
        f"다음 광고 문구들 중 어떤 것이 가장 마음에 드시나요?\n\n"
        f"{options}\n\n"
        f"답변 형식 (반드시 지켜주세요):\n"
        f"선택: A/B/C 중 하나\n"
        f"이유: 한 문장으로 짧게"
    )


def _parse_choice(response: str, n_options: int) -> Optional[str]:
    valid = set(LETTERS[:n_options])
    m = re.search(r"선택[:\s]*([A-J])", response)
    if m and m.group(1) in valid:
        return m.group(1)
    for char in response.upper():
        if char in valid:
            return char
    return None


def _parse_reason(response: str) -> str:
    m = re.search(r"이유[:\s]*(.+?)(?:\n|$)", response, re.DOTALL)
    if m:
        return m.group(1).strip()[:200]
    return response.strip()[:200]


@dataclass
class CreativeResult:
    creatives: list[str]
    total_responses: int
    parse_failed: int
    choice_counts: dict[str, int]
    choice_pct: dict[str, float]
    reasons_by_choice: dict[str, list[str]]
    breakdown_by_age: dict[str, dict[str, int]]
    breakdown_by_sex: dict[str, dict[str, int]]
    breakdown_by_province: dict[str, dict[str, int]]
    raw_results: list[SimResult]


def _age_bucket(age: int) -> str:
    if age < 20:
        return "10대"
    if age < 30:
        return "20대"
    if age < 40:
        return "30대"
    if age < 50:
        return "40대"
    if age < 60:
        return "50대"
    if age < 70:
        return "60대"
    return "70대+"


class CreativeTesting:
    async def run(
        self,
        creatives: list[str],
        sample_size: int = 200,
        target_filter: Optional[TargetFilter] = None,
        seed: int = 42,
        on_progress: Optional[Callable[[int, int], None]] = None,
        on_result: Optional[Callable[[SimResult], None]] = None,
        llm_client: LLMClientProtocol | None = None,
        sampler: PersonaSampler | None = None,
        model_alias: str | None = None,
        trace_metadata: dict[str, object] | None = None,
    ) -> CreativeResult:
        if not 2 <= len(creatives) <= 10:
            raise ValueError("크리에이티브는 2~10개여야 합니다")

        sampler = sampler or PersonaSampler()
        personas = sampler.sample(n=sample_size, filter_=target_filter, seed=seed)

        simulator = BatchSimulator(
            purpose="marketing",
            llm_client=llm_client,
            model_alias=model_alias,
            trace_metadata=trace_metadata,
        )
        user_prompt = _build_user_prompt(creatives)
        results = await simulator.run(
            personas,
            user_prompt,
            on_progress=on_progress,
            on_result=on_result,
        )

        return self._aggregate(creatives, results)

    def _aggregate(self, creatives: list[str], results: list[SimResult]) -> CreativeResult:
        n_options = len(creatives)
        choice_counts: Counter = Counter()
        reasons_by_choice: dict[str, list[str]] = {LETTERS[i]: [] for i in range(n_options)}
        breakdown_age: dict[str, Counter] = {}
        breakdown_sex: dict[str, Counter] = {}
        breakdown_prov: dict[str, Counter] = {}
        parse_failed = 0

        for r in results:
            if r.error or not r.response:
                parse_failed += 1
                continue
            choice = _parse_choice(r.response, n_options)
            if not choice:
                parse_failed += 1
                continue
            choice_counts[choice] += 1
            reasons_by_choice[choice].append(_parse_reason(r.response))

            age_b = _age_bucket(r.persona["age"])
            sex = r.persona["sex"]
            prov = r.persona["province"]
            breakdown_age.setdefault(age_b, Counter())[choice] += 1
            breakdown_sex.setdefault(sex, Counter())[choice] += 1
            breakdown_prov.setdefault(prov, Counter())[choice] += 1

        total_valid = sum(choice_counts.values()) or 1
        choice_pct = {
            LETTERS[i]: round(choice_counts.get(LETTERS[i], 0) / total_valid * 100, 1)
            for i in range(n_options)
        }

        return CreativeResult(
            creatives=creatives,
            total_responses=len(results),
            parse_failed=parse_failed,
            choice_counts={LETTERS[i]: choice_counts.get(LETTERS[i], 0) for i in range(n_options)},
            choice_pct=choice_pct,
            reasons_by_choice=reasons_by_choice,
            breakdown_by_age={k: dict(v) for k, v in breakdown_age.items()},
            breakdown_by_sex={k: dict(v) for k, v in breakdown_sex.items()},
            breakdown_by_province={k: dict(v) for k, v in breakdown_prov.items()},
            raw_results=results,
        )
