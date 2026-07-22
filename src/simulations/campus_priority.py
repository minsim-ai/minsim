"""campus_priority — N개 항목의 우선순위 여론조사.

모든 여론조사가 찬반형은 아니다. "복지예산을 어디에 먼저 쓸까"처럼
순위를 묻는 질문은 기존 엔진 어디에도 맞지 않는다. 배분(몇 대 몇)도
실무에서는 순위로 근사할 수 있으므로 순위 하나로 커버한다.

집계는 Borda count를 쓴다. 1위 지목률만 보면 2~3위 선호가 통째로
버려지고, 평균 순위만 보면 극단적 호불호가 평균에 묻힌다.
"""
from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from typing import Any

from src.agent.simulator import BatchSimulator
from src.data.pools import DEFAULT_PERSONA_POOL
from src.data.respondent_axes import (
    classify_primary,
    normalize_pool,
    primary_axis_label,
    primary_axis_order,
    respondent_role_line,
)
from src.data.sampler import PersonaSampler, TargetFilter
from src.data.stratified import sample_stratified
from src.llm.base import LLMClientProtocol
from src.simulations.common import GenericPersonaSimulation, GenericSimulationResult

MIN_ITEMS = 3
MAX_ITEMS = 6
# 항목 라벨 품질 게이트. 긴 조사 설명 문장이 후보로 들어오면 Borda가 무의미해진다.
MAX_ITEM_LABEL_LEN = 40
# 이 미만의 유효 응답 또는 파싱 성공률이면 순위를 "승자"로 노출하지 않는다.
MIN_RANKING_ANSWERS = 20
MIN_PARSE_SUCCESS_RATE = 15.0

# 계층 간 순위가 이만큼 벌어지면 집행 갈등으로 본다.
INVERSION_THRESHOLD = 2
_PROSE_MARKERS = re.compile(
    r"입니다|이에요|예요|파악하기|선정합니다|조사입니다|수요 및|우선순위를 파악|예산 편성|정책 개선|에 대한|위한 조사"
)

_FENCE = re.compile(r"^\s*```(?:json)?\s*|\s*```\s*$", re.MULTILINE)
_OBJECT = re.compile(r"\{.*\}", re.DOTALL)
# 모델이 "1. 학식 질 개선"처럼 순번을 붙여 돌려주는 경우가 있다.
# 항목 정체성은 그대로이므로 강등이 아니라 서식 정규화로 처리한다.
_ORDINAL_PREFIX = re.compile(r"^\s*\d+\s*[.)]\s*")


def build_campus_priority_prompt(input_data: dict[str, Any]) -> str:
    question = (input_data.get("question") or "").strip()
    context = (input_data.get("context") or "").strip()
    items = [str(item).strip() for item in (input_data.get("items") or []) if str(item).strip()]

    listed = "\n".join(f"- {item}" for item in items)
    context_block = f"\n■ 배경·제약\n{context}\n" if context else "\n"
    # 이 엔진의 기본 맥락은 학내 조사. 전국민 풀은 런타임이 _persona_pool로 넘긴다.
    pool = normalize_pool(input_data.get("_persona_pool") or "dgist")
    role = respondent_role_line(pool)
    context_hint = (
        "- 당신의 신분, 거주 형태, 하루 일과에 비추어 판단하세요."
        if pool == "dgist"
        else "- 당신의 직업, 거주 지역, 생활 여건에 비추어 판단하세요."
    )

    return f"""{role} 아래 항목들의 우선순위를 매기세요.

■ 질문
{question}
{context_block}
■ 항목
{listed}

■ 판단 지침
{context_hint}
- 일반론이 아니라 본인에게 무엇이 달라지는지를 기준으로 매기세요.
- 모든 항목을 빠짐없이, 중복 없이 한 번씩 나열하세요.
- 항목 이름은 위에 적힌 그대로 쓰세요. 번호나 순번을 앞에 붙이지 마세요.

■ 출력 형식 (JSON만, 다른 텍스트 금지)
{{
  "ranking": ["1순위 항목", "2순위 항목", "... 전체 항목을 순서대로"],
  "top_reason": "1순위를 고른 이유 한두 문장",
  "bottom_reason": "최하위를 고른 이유 한두 문장"
}}"""


def make_campus_priority_parser(items: list[str]):
    """항목 집합을 고정한 파서를 만든다.

    순위는 항목 집합과 정확히 일치해야 의미가 있다. 누락·중복·오탈자를
    관대하게 흡수하면 Borda 점수가 조용히 왜곡되므로 파싱 실패로 처리한다.
    """
    expected = [str(item).strip() for item in items if str(item).strip()]
    expected_set = set(expected)

    def parse(response: str) -> dict[str, Any] | None:
        if not response:
            return None
        text = _FENCE.sub("", response).strip()
        match = _OBJECT.search(text)
        if not match:
            return None
        try:
            payload = json.loads(match.group(0))
        except (json.JSONDecodeError, ValueError):
            return None
        if not isinstance(payload, dict):
            return None

        ranking = payload.get("ranking")
        if not isinstance(ranking, list):
            return None
        ranking = [_ORDINAL_PREFIX.sub("", str(item)).strip() for item in ranking]
        if len(ranking) != len(expected):
            return None
        if len(set(ranking)) != len(ranking):
            return None
        if set(ranking) != expected_set:
            return None

        top_reason = payload.get("top_reason")
        bottom_reason = payload.get("bottom_reason")
        if not isinstance(top_reason, str) or not top_reason.strip():
            return None
        if not isinstance(bottom_reason, str) or not bottom_reason.strip():
            return None

        return {
            "ranking": ranking,
            "top_reason": top_reason.strip(),
            "bottom_reason": bottom_reason.strip(),
        }

    return parse


def _borda(rankings: list[list[str]], items: list[str]) -> dict[str, float]:
    """i위(1-indexed) 항목에 n-i점. 1위가 n-1점, 최하위가 0점."""
    n = len(items)
    scores = {item: 0.0 for item in items}
    for ranking in rankings:
        for index, item in enumerate(ranking):
            scores[item] += n - 1 - index
    return scores


def _rank_order(scores: dict[str, float]) -> list[str]:
    """점수 내림차순. 동점은 항목명으로 안정 정렬한다."""
    return [item for item, _ in sorted(scores.items(), key=lambda pair: (-pair[1], pair[0]))]


def validate_priority_items(items: list[str]) -> list[str]:
    """Return normalized items or raise ValueError when labels look like prose."""
    cleaned = [str(item).strip() for item in items if str(item).strip()]
    if not MIN_ITEMS <= len(cleaned) <= MAX_ITEMS:
        raise ValueError(
            f"우선순위 항목은 {MIN_ITEMS}~{MAX_ITEMS}개여야 합니다. 현재 {len(cleaned)}개."
        )
    bad: list[str] = []
    for item in cleaned:
        if len(item) > MAX_ITEM_LABEL_LEN or _PROSE_MARKERS.search(item):
            bad.append(item)
            continue
        if item.count("(") != item.count(")"):
            bad.append(item)
    if bad:
        preview = bad[0][:48]
        raise ValueError(
            "우선순위 항목에 조사 설명 문장 조각이 포함되어 있습니다. "
            f"짧은 후보 라벨만 입력하세요. 예: '{preview}'"
        )
    return cleaned


def ranking_is_available(*, valid_answers: int, total_responses: int) -> tuple[bool, str | None]:
    """Hide winner rankings when parse yield is zero or too thin to trust.

    Small intentional panels (unit tests, <20 total) still rank when every
    response parses. Production-scale runs with near-total parse failure must
    not crown a 1-person Borda winner.
    """
    if valid_answers <= 0:
        return False, "zero_parse" if total_responses > 0 else "no_responses"
    if total_responses >= MIN_RANKING_ANSWERS:
        rate = valid_answers / total_responses * 100
        if valid_answers < MIN_RANKING_ANSWERS or rate < MIN_PARSE_SUCCESS_RATE:
            return False, "low_parse_yield"
    return True, None


def aggregate_campus_priority(
    input_data: dict[str, Any],
    raw_results: list[Any],
    parsed_results: list[dict[str, Any] | None],
) -> dict[str, Any]:
    items = [str(item).strip() for item in (input_data.get("items") or []) if str(item).strip()]
    n = len(items)
    pool = normalize_pool(input_data.get("_persona_pool") or "dgist")
    tiers = primary_axis_order(pool)

    answers: list[dict[str, Any]] = []
    for raw, parsed in zip(raw_results, parsed_results, strict=False):
        if parsed is None:
            continue
        persona = getattr(raw, "persona", {}) or {}
        answers.append({**parsed, "_tier": classify_primary(persona, pool)})

    total = len(answers)
    total_responses = len(parsed_results)
    available, suppress_reason = ranking_is_available(
        valid_answers=total,
        total_responses=total_responses or total,
    )

    # Empty / ultra-low parse: do not invent alphabetical 0-score winners.
    if not available:
        empty_tiers = {
            tier: {"n": 0, "order": [], "low_confidence": True} for tier in tiers
        }
        return {
            "items": items,
            "item_count": n,
            "overall_order": [],
            "item_rows": [],
            "tier_rankings": empty_tiers,
            "tier_axis": list(tiers),
            "tier_axis_label": primary_axis_label(pool),
            "persona_pool": pool,
            "rank_inversions": [],
            "inversion_threshold": INVERSION_THRESHOLD,
            "top_reasons": [],
            "bottom_reasons": [],
            "low_confidence_min_sample": 20,
            "ranking_available": False,
            "valid_answer_count": total,
            "ranking_suppressed_reason": suppress_reason,
        }

    rankings = [item["ranking"] for item in answers]
    scores = _borda(rankings, items)
    overall_order = _rank_order(scores)

    top_counts = defaultdict(int)
    for ranking in rankings:
        top_counts[ranking[0]] += 1

    mean_rank: dict[str, float] = {}
    for item in items:
        positions = [ranking.index(item) + 1 for ranking in rankings]
        mean_rank[item] = round(sum(positions) / len(positions), 2) if positions else 0.0

    item_rows = [
        {
            "item": item,
            "borda_score": scores[item],
            "mean_rank": mean_rank[item],
            "top_choice_count": top_counts.get(item, 0),
            "top_choice_pct": round(top_counts.get(item, 0) / total * 100, 1) if total else 0.0,
            "overall_rank": overall_order.index(item) + 1,
        }
        for item in overall_order
    ]

    by_tier: dict[str, list[list[str]]] = defaultdict(list)
    for item in answers:
        by_tier[item["_tier"]].append(item["ranking"])

    tier_rankings: dict[str, Any] = {}
    tier_positions: dict[str, dict[str, int]] = {}
    for tier in tiers:
        group = by_tier.get(tier, [])
        if not group:
            tier_rankings[tier] = {"n": 0, "order": [], "low_confidence": True}
            continue
        order = _rank_order(_borda(group, items))
        tier_rankings[tier] = {
            "n": len(group),
            "order": order,
            # 표본이 적은 계층의 순위는 방향만 참고해야 한다.
            "low_confidence": len(group) < 20,
        }
        tier_positions[tier] = {item: order.index(item) + 1 for item in items}

    # 계층 간 순위 역전: 평균 하나만 보면 집행 갈등이 통째로 묻힌다.
    inversions: list[dict[str, Any]] = []
    tiers_present = [tier for tier in tiers if tier in tier_positions]
    for item in items:
        positions = {tier: tier_positions[tier][item] for tier in tiers_present}
        if len(positions) < 2:
            continue
        high_tier = min(positions, key=lambda tier: positions[tier])
        low_tier = max(positions, key=lambda tier: positions[tier])
        gap = positions[low_tier] - positions[high_tier]
        if gap >= INVERSION_THRESHOLD:
            inversions.append(
                {
                    "item": item,
                    "gap": gap,
                    "highest_tier": high_tier,
                    "highest_rank": positions[high_tier],
                    "lowest_tier": low_tier,
                    "lowest_rank": positions[low_tier],
                }
            )
    inversions.sort(key=lambda row: (-row["gap"], row["item"]))

    # 이유를 그대로 나열하면 같은 문장이 수십 줄 반복된다 (첫 렌더에서 확인).
    # opposition_reasons와 같이 빈도로 집계한다.
    top_counter = Counter(
        item["top_reason"] for item in answers if overall_order and item["ranking"][0] == overall_order[0]
    )
    bottom_counter = Counter(
        item["bottom_reason"] for item in answers if overall_order and item["ranking"][-1] == overall_order[-1]
    )
    top_reasons = [{"reason": r, "count": c} for r, c in top_counter.most_common(10)]
    bottom_reasons = [{"reason": r, "count": c} for r, c in bottom_counter.most_common(10)]

    return {
        "items": items,
        "item_count": n,
        "overall_order": overall_order,
        "item_rows": item_rows,
        "tier_rankings": tier_rankings,
        "tier_axis": list(tiers),
        "tier_axis_label": primary_axis_label(pool),
        "persona_pool": pool,
        "rank_inversions": inversions,
        "inversion_threshold": INVERSION_THRESHOLD,
        "top_reasons": top_reasons[:10],
        "bottom_reasons": bottom_reasons[:10],
        "low_confidence_min_sample": 20,
        "ranking_available": True,
        "valid_answer_count": total,
        "ranking_suppressed_reason": None,
    }


class CampusPrioritySimulation(GenericPersonaSimulation):
    """파서가 항목 집합에 의존하므로 실행 시점에 파서를 만든다.

    DGIST 등 전용 풀에서는 계층 최소 표본을 보장한다. 순위 역전 탐지는
    계층별 표본이 있어야 성립하므로 층화가 특히 중요하다.
    """

    async def run(
        self,
        input_data: dict[str, Any],
        sample_size: int = 200,
        target_filter: TargetFilter | None = None,
        seed: int = 42,
        on_progress: Any = None,
        on_result: Any = None,
        llm_client: LLMClientProtocol | None = None,
        sampler: PersonaSampler | None = None,
        model_alias: str | None = None,
        trace_metadata: dict[str, object] | None = None,
    ) -> GenericSimulationResult:
        items = validate_priority_items(
            [str(item).strip() for item in (input_data.get("items") or []) if str(item).strip()]
        )

        sampler = sampler or PersonaSampler()
        runtime_input = {**input_data, "_persona_pool": getattr(sampler, "pool", DEFAULT_PERSONA_POOL)}
        sampling_meta: dict[str, Any] = {
            "sampling": "random",
            "tier_counts": {},
            "tier_weights": {},
            "warnings": [],
        }
        if sampler.pool != DEFAULT_PERSONA_POOL:
            stratified = sample_stratified(
                sampler, n=sample_size, seed=seed, target_filter=target_filter
            )
            personas = stratified.personas
            sampling_meta = stratified.meta
        else:
            personas = sampler.sample(n=sample_size, filter_=target_filter, seed=seed)

        # 항목 제시 순서가 1위를 바꾼다 (2026-07-20 실측: 순서를 뒤집자 1위가
        # 학부실험실 → 기숙사로 이동). 설문 방법론의 counterbalancing을 적용해
        # 페르소나를 항목 수만큼 나누고 각 그룹에 다른 회전을 준다.
        #
        # BatchSimulator는 소유한 클라이언트를 run() 후 닫으므로 인스턴스 하나로
        # 여러 배치를 돌릴 수 없다. 배치마다 새 인스턴스를 만든다.
        groups = [(offset, group) for offset, group in _rotate_groups(personas, len(items)) if group]
        total = len(personas)
        done = {"n": 0}

        def bump(_completed: int, _total: int) -> None:
            done["n"] += 1
            if on_progress:
                on_progress(done["n"], total)

        # 회전 기준을 입력 순서가 아니라 정규 순서로 잡는다. 그러지 않으면
        # 입력이 [A,B,C,D]냐 [D,C,B,A]냐에 따라 회전 집합이 통째로 달라져
        # 순서효과가 상쇄되지 않는다 (2026-07-21 실측: tau +0.33 그대로).
        canonical = sorted(items)

        results: list[Any] = []
        for offset, group in groups:
            simulator = BatchSimulator(
                purpose=self.purpose,
                llm_client=llm_client,
                model_alias=model_alias,
                task_type=self.task_type,
                trace_metadata=trace_metadata,
            )
            rotated = canonical[offset:] + canonical[:offset]
            results.extend(
                await simulator.run(
                    group,
                    self.prompt_builder({**runtime_input, "items": rotated}),
                    on_progress=bump if on_progress else None,
                    on_result=on_result,
                )
            )
        parser = make_campus_priority_parser(items)
        parsed = [parser(item.response) for item in results]
        metrics = self.aggregator(runtime_input, results, parsed)
        metrics["sampling"] = sampling_meta

        return GenericSimulationResult(
            simulation_type=self.simulation_type,
            input=input_data,
            total_responses=len(results),
            parse_failed=sum(1 for item in parsed if item is None),
            metrics=metrics,
            segments=metrics["tier_rankings"],
            insights=[],
            raw_results=results,
            parsed_results=parsed,
        )


def _rotate_groups(
    personas: list[dict[str, Any]], item_count: int
) -> list[tuple[int, list[dict[str, Any]]]]:
    """페르소나를 항목 수만큼 결정적으로 분할한다. 시드가 같으면 배치도 같다."""
    if item_count <= 1:
        return [(0, personas)]
    buckets: list[list[dict[str, Any]]] = [[] for _ in range(item_count)]
    for index, persona in enumerate(personas):
        buckets[index % item_count].append(persona)
    return list(enumerate(buckets))


def campus_priority_runner() -> CampusPrioritySimulation:
    return CampusPrioritySimulation(
        simulation_type="campus_priority",
        purpose="campus priority ranking",
        task_type="priority_response",
        prompt_builder=build_campus_priority_prompt,
        # 실행 시점에 항목 기반 파서로 교체된다.
        parser=make_campus_priority_parser([]),
        aggregator=aggregate_campus_priority,
    )
