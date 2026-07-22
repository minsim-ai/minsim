"""계층 최소 표본을 보장하는 층화 추출.

단순 무작위로 200명을 뽑으면 교직원이 소수만 나와 계층 비교가 성립하지
않는다. 계층별 최소치를 보장하되, 왜곡된 비율을 전체 집계에 그대로 쓰지
않도록 모집단 복원용 역가중치를 함께 돌려준다.
"""
from __future__ import annotations

import random
from typing import Any, NamedTuple

from src.data.campus_tiers import TIER_ORDER, classify_tier
from src.data.sampler import PersonaSampler, TargetFilter

DEFAULT_TIER_MINIMUMS: dict[str, int] = {
    "학부생": 40,
    "석·박사 재학": 40,
    "박사후연구원": 20,
    "교직원": 30,
}

# 모집단 전체를 읽기 위한 상한. 풀 parquet 행 수보다 크기만 하면 된다.
_POPULATION_CEILING = 10_000_000


class StratifiedSample(NamedTuple):
    personas: list[dict[str, Any]]
    meta: dict[str, Any]


def sample_stratified(
    sampler: PersonaSampler,
    n: int,
    seed: int = 42,
    target_filter: TargetFilter | None = None,
    minimums: dict[str, int] | None = None,
) -> StratifiedSample:
    """계층 최소 표본을 보장해 n명을 추출한다.

    모집단 전체를 한 번 읽어 계층별로 나눈 뒤, 최소치를 먼저 채우고
    남은 자리를 모집단 비율대로 분배한다.
    """
    quotas = dict(minimums or DEFAULT_TIER_MINIMUMS)
    warnings: list[str] = []

    population = sampler.sample(n=_POPULATION_CEILING, filter_=target_filter, seed=seed)
    buckets: dict[str, list[dict[str, Any]]] = {tier: [] for tier in TIER_ORDER}
    for persona in population:
        buckets[classify_tier(persona)].append(persona)

    pop_total = len(population)
    if pop_total == 0:
        raise ValueError("필터 조건에 해당하는 페르소나가 없습니다")
    if n > pop_total:
        warnings.append(
            f"요청 표본 {n}명이 모집단 {pop_total}명보다 큽니다. {pop_total}명으로 축소합니다."
        )
        n = pop_total

    # 최소치 합이 요청 표본을 넘으면 오류로 막지 않고 비례 축소한다.
    min_total = sum(quotas.values())
    if min_total > n:
        scale = n / min_total
        quotas = {tier: max(1, int(count * scale)) for tier, count in quotas.items()}
        warnings.append(
            f"요청 표본 {n}명이 계층 최소 표본 합 {min_total}명보다 작아 최소치를 비례 축소했습니다."
        )

    allocation: dict[str, int] = {}
    for tier in TIER_ORDER:
        available = len(buckets[tier])
        want = quotas.get(tier, 0)
        if available < want:
            warnings.append(
                f"{tier} 계층 모집단이 {available}명뿐이라 최소 표본 {want}명을 채우지 못했습니다."
            )
        allocation[tier] = min(want, available)

    # 남은 자리를 모집단 비율대로 분배한다.
    remaining = n - sum(allocation.values())
    while remaining > 0:
        progressed = False
        for tier in sorted(TIER_ORDER, key=lambda t: -len(buckets[t])):
            headroom = len(buckets[tier]) - allocation[tier]
            if headroom <= 0:
                continue
            share = max(1, round(remaining * len(buckets[tier]) / pop_total))
            take = min(headroom, share, remaining)
            allocation[tier] += take
            remaining -= take
            progressed = True
            if remaining == 0:
                break
        if not progressed:
            warnings.append(f"모집단이 부족해 {remaining}명을 채우지 못했습니다.")
            break

    rng = random.Random(seed)
    personas: list[dict[str, Any]] = []
    for tier in TIER_ORDER:
        pool = sorted(buckets[tier], key=lambda persona: persona["uuid"])
        personas.extend(rng.sample(pool, allocation[tier]))

    tier_counts = {tier: allocation[tier] for tier in TIER_ORDER}
    sampled_total = sum(tier_counts.values())
    tier_weights: dict[str, float] = {}
    for tier in TIER_ORDER:
        if tier_counts[tier] == 0:
            tier_weights[tier] = 0.0
            continue
        population_share = len(buckets[tier]) / pop_total
        sample_share = tier_counts[tier] / sampled_total
        tier_weights[tier] = population_share / sample_share

    return StratifiedSample(
        personas=personas,
        meta={
            "sampling": "stratified",
            "tier_counts": tier_counts,
            "tier_weights": tier_weights,
            "warnings": warnings,
        },
    )
