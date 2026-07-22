"""campus_policy — 단일 안건에 대한 찬반 여론조사.

기존 10종 중 찬성/반대 비율을 직접 산출하는 엔진이 없어 신설한다.
churn_prediction이 3분할로 구조는 비슷하나 프롬프트가 고객 이탈 맥락이라
캠퍼스 정책 안건에 재사용하면 응답 품질이 떨어진다.
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
    classify_secondary,
    ensure_campus_sampler,
    normalize_pool,
    primary_axis_label,
    primary_axis_order,
    respondent_role_line,
    secondary_axis_label,
    secondary_axis_order,
)
from src.data.sampler import PersonaSampler, TargetFilter
from src.data.stratified import sample_stratified
from src.llm.base import LLMClientProtocol
from src.services.tradeoff_validation import detect_unresolved_choice
from src.simulations.common import GenericPersonaSimulation, GenericSimulationResult

# 2026-07-21 실측: 조건부찬성이 선택지에 있으면 200명 전원이 그리로 몰려
# (dominant 100%) 계층 비교가 성립하지 않는다. 찬반과 조건을 분리한다.
STANCES: tuple[str, ...] = ("찬성", "반대", "판단유보")
MIN_INTENSITY = 1
MAX_INTENSITY = 5

# 저신뢰 표본 임계값. 렌더러와 안내 문구가 반드시 이 상수를 참조한다.
LOW_CONFIDENCE_MIN_SAMPLE = 20

OTHER_CATEGORY = "기타"
NONE_CATEGORY = "없음"
# 한 입장이 이 비율을 넘으면 "찬반이 아니라 다른 문제"라는 뜻이다.
DOMINANT_STANCE_PCT = 80.0
# 상충 카테고리가 둘 다 이만큼 지지받으면 집행 갈등으로 본다.
CONFLICT_MIN_SHARE = 5.0
# 계층 셀 간 순찬성 폭이 이보다 작으면 계층 비교를 주장하지 않는다.
TIER_SPREAD_MIN = 10.0
# 조건 칸에 부정문을 쓰면 반대가 조건부찬성으로 흡수된다 (원문 14번).
_NEGATION_MARKERS = ("반대", "안 된다", "안된다", "못 한다", "못한다", "불가")

_FENCE = re.compile(r"^\s*```(?:json)?\s*|\s*```\s*$", re.MULTILINE)
_OBJECT = re.compile(r"\{.*\}", re.DOTALL)

_SUPPORT = {"찬성": 1.0}
_OPPOSE = {"반대": 1.0}
_STRONG = 4

BIAS_WARNING = (
    "예상 비용·부작용이 입력되지 않았습니다. 비용 없는 안건은 찬성률이 "
    "실제보다 높게 나옵니다. 이 결과를 의사결정 근거로 쓰기 전에 비용을 "
    "입력하고 다시 실행하세요."
)


def build_campus_policy_prompt(input_data: dict[str, Any]) -> str:
    agenda = (input_data.get("agenda") or "").strip()
    current_state = (input_data.get("current_state") or "").strip()
    proposed_change = (input_data.get("proposed_change") or "").strip()
    tradeoffs = (input_data.get("tradeoffs") or "").strip()

    taxonomy = condition_taxonomy(input_data)
    if taxonomy:
        listed = "\n".join(f"- {item}" for item in taxonomy)
        taxonomy_block = (
            "\n■ 조건 범주 (아래에서 하나를 고르세요)\n"
            f"{listed}\n- {OTHER_CATEGORY} (위에 없는 조건)\n- {NONE_CATEGORY} (조건 없음)\n"
        )
        category_hint = '"위 범주 중 하나를 그대로"'
    else:
        taxonomy_block = ""
        category_hint = f'"{NONE_CATEGORY}"'

    if tradeoffs:
        tradeoff_block = f"■ 예상 비용·부작용\n{tradeoffs}"
    else:
        # 비용이 비었을 때 모델이 유리한 비용을 상상하면 찬성으로 쏠린다.
        tradeoff_block = (
            "■ 예상 비용·부작용\n"
            "비용 정보가 제공되지 않았습니다. 비용을 임의로 가정하지 말고, "
            "비용을 모르는 상태에서 판단한다는 점을 이유에 밝히세요."
        )

    # 이 엔진의 기본 맥락은 학내 조사. 전국민 풀은 런타임이 _persona_pool로 넘긴다.
    pool = normalize_pool(input_data.get("_persona_pool") or "dgist")
    role = respondent_role_line(pool)
    context_hint = (
        "- 당신의 신분, 거주 형태, 하루 일과에 비추어 판단하세요."
        if pool == "dgist"
        else "- 당신의 직업, 거주 지역, 생활 여건에 비추어 판단하세요."
    )

    return f"""{role} 아래 안건에 대한 당신의 입장을 밝히세요.

■ 안건
{agenda}

■ 현행 상태
{current_state}

■ 변경 내용
{proposed_change}

{tradeoff_block}

■ 판단 절차 (반드시 순서대로)
1단계. 지금 이 안이 적힌 그대로, 조건을 붙일 수 없이 시행됩니다.
        찬성입니까 반대입니까? "판단유보"는 안건 자체를 이해할 수 없을 때만 고르세요.
2단계. 그와 별개로, 무엇이 보장되면 마음이 바뀌겠습니까?
        찬성이든 반대든 조건이 있으면 적으세요. 없으면 null.

{context_hint}
- 일반론이 아니라 본인에게 무엇이 달라지는지를 이유로 쓰세요.
- 비용을 누가 부담하는지 고려하세요.
{taxonomy_block}
■ 조건 작성 규칙
- 조건은 반드시 "~하면 찬성" 형태로 쓰세요.
- "~하면 반대" 같은 부정문으로 쓰지 마세요.

■ 출력 형식 (JSON만, 다른 텍스트 금지)
{{
  "stance": "찬성" 또는 "반대" 또는 "판단유보",
  "reason": "본인 맥락에 근거한 이유 한두 문장",
  "condition_category": {category_hint},
  "condition": "마음을 바꿀 조건 한 문장. 없으면 null",
  "intensity": 1~5 정수 (1=매우 약함, 5=매우 강함)
}}"""


def condition_taxonomy(input_data: dict[str, Any]) -> list[str]:
    raw = input_data.get("condition_taxonomy") or []
    return [str(item).strip() for item in raw if str(item).strip()]


def is_negated_condition(condition: str | None) -> bool:
    """조건 칸의 부정문은 반대를 조건부찬성으로 흡수한다. 강등하지 않고 표시만 한다."""
    if not condition:
        return False
    return any(marker in condition for marker in _NEGATION_MARKERS)


def make_campus_policy_parser(input_data: dict[str, Any]):
    """taxonomy를 고정한 파서. 범주 이탈은 강등 없이 파싱 실패로 처리한다."""
    allowed = set(condition_taxonomy(input_data)) | {OTHER_CATEGORY, NONE_CATEGORY}

    def parse(response: str) -> dict[str, Any] | None:
        parsed = parse_campus_policy_response(response)
        if parsed is None:
            return None
        category = parsed.get("condition_category") or NONE_CATEGORY
        if category not in allowed:
            return None
        parsed["condition_category"] = category
        return parsed

    return parse


def parse_campus_policy_response(response: str) -> dict[str, Any] | None:
    """응답을 파싱한다. 규격을 벗어나면 강등하지 않고 None을 반환한다.

    알 수 없는 stance를 판단유보로 흡수하면 찬반 비율이 조용히 왜곡되므로,
    파싱 실패로 처리해 parse_failed 카운터에 드러나게 한다.
    """
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

    stance = payload.get("stance")
    if stance not in STANCES:
        return None

    reason = payload.get("reason")
    if not isinstance(reason, str) or not reason.strip():
        return None

    intensity = payload.get("intensity")
    if isinstance(intensity, bool) or not isinstance(intensity, int):
        return None
    if not MIN_INTENSITY <= intensity <= MAX_INTENSITY:
        return None

    condition = payload.get("condition")
    if isinstance(condition, str) and condition.strip():
        condition = condition.strip()
    else:
        condition = None
    category = payload.get("condition_category")
    category = category.strip() if isinstance(category, str) and category.strip() else NONE_CATEGORY

    return {
        "stance": stance,
        "reason": reason.strip(),
        "condition": condition,
        "condition_category": category,
        "negated": is_negated_condition(condition),
        "intensity": intensity,
    }


def _net_support(
    answers: list[dict[str, Any]],
    weights: dict[str, float] | None = None,
) -> float:
    """강도 가중 순찬성(%p). 찬성은 1.0, 조건부찬성은 0.5로 계산한다."""
    if not answers:
        return 0.0
    numerator = 0.0
    denominator = 0.0
    for item in answers:
        weight = (weights or {}).get(item.get("_tier", ""), 1.0)
        scaled = item["intensity"] / MAX_INTENSITY * weight
        denominator += weight
        numerator += _SUPPORT.get(item["stance"], 0.0) * scaled
        numerator -= _OPPOSE.get(item["stance"], 0.0) * scaled
    if denominator == 0:
        return 0.0
    return round(numerator / denominator * 100, 1)


def aggregate_campus_policy(
    input_data: dict[str, Any],
    raw_results: list[Any],
    parsed_results: list[dict[str, Any] | None],
) -> dict[str, Any]:
    weights: dict[str, float] | None = input_data.get("_tier_weights")
    pool = normalize_pool(input_data.get("_persona_pool") or "dgist")
    tiers = primary_axis_order(pool)
    housings = secondary_axis_order(pool)

    answers: list[dict[str, Any]] = []
    for raw, parsed in zip(raw_results, parsed_results, strict=False):
        if parsed is None:
            continue
        persona = getattr(raw, "persona", {}) or {}
        answers.append(
            {
                **parsed,
                "_tier": classify_primary(persona, pool),
                "_housing": classify_secondary(persona, pool),
                "_province": (persona.get("province") or "미상").strip(),
            }
        )

    total = len(answers)
    counter = Counter(item["stance"] for item in answers)
    stance_distribution = {
        stance: {
            "count": counter.get(stance, 0),
            "pct": round(counter.get(stance, 0) / total * 100, 1) if total else 0.0,
        }
        for stance in STANCES
    }

    strong_opposition = sum(
        1 for item in answers if item["stance"] == "반대" and item["intensity"] >= _STRONG
    )

    grid: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for item in answers:
        grid[(item["_tier"], item["_housing"])].append(item)
    matrix: dict[str, dict[str, Any]] = {}
    for tier in tiers:
        matrix[tier] = {}
        for housing in housings:
            cell = grid.get((tier, housing), [])
            matrix[tier][housing] = {
                "n": len(cell),
                "net_support": _net_support(cell),
                "low_confidence": len(cell) < LOW_CONFIDENCE_MIN_SAMPLE,
            }

    by_province: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for item in answers:
        by_province[item["_province"]].append(item)
    region_rows = [
        {
            "province": province,
            "n": len(group),
            "net_support": _net_support(group),
            "low_confidence": len(group) < LOW_CONFIDENCE_MIN_SAMPLE,
        }
        for province, group in by_province.items()
    ]
    # 신뢰 우선 정렬: 표본이 많은 순. 최고 비율 순이 아니다.
    region_rows.sort(key=lambda row: (-row["n"], row["province"]))

    # 조건은 stance와 무관하게 전원에게서 모은다. 찬성자의 조건도 실행 조건이다.
    condition_counter = Counter(item["condition"] for item in answers if item["condition"])
    condition_clusters = [
        {"condition": condition, "count": count}
        for condition, count in condition_counter.most_common()
    ]

    opposition_counter = Counter(
        item["reason"] for item in answers if item["stance"] == "반대"
    )
    opposition_reasons = [
        {"reason": reason, "count": count}
        for reason, count in opposition_counter.most_common(10)
    ]

    # ── 조건 범주 집계 (D-2/D-3) ──
    # 자유서술을 Counter에 넣으면 30명이 30개 문자열을 만든다. 범주로 센다.
    category_counter = Counter(
        item["condition_category"]
        for item in answers
        if item["condition_category"] != NONE_CATEGORY
    )
    category_total = sum(category_counter.values())
    representative: dict[str, str] = {}
    for item in answers:
        cat = item["condition_category"]
        if cat != NONE_CATEGORY and cat not in representative and item["condition"]:
            representative[cat] = item["condition"]
    condition_categories = [
        {
            "category": category,
            "count": count,
            "pct": round(count / total * 100, 1) if total else 0.0,
            "representative": representative.get(category, ""),
        }
        for category, count in category_counter.most_common()
    ]
    other_rate = (
        round(category_counter.get(OTHER_CATEGORY, 0) / category_total * 100, 1)
        if category_total
        else 0.0
    )

    # ── 상충 조건 (D-6) ──
    # "복지예산 삭감 없이"와 "복지예산 삭감으로"가 같은 칸에 묻히면
    # 집행 단계에서 터질 갈등이 화면에서 사라진다.
    share = {
        category: (count / total * 100 if total else 0.0)
        for category, count in category_counter.items()
    }
    condition_conflicts = []
    for pair in input_data.get("condition_conflicts") or []:
        if not isinstance(pair, (list, tuple)) or len(pair) != 2:
            continue
        left, right = str(pair[0]).strip(), str(pair[1]).strip()
        if share.get(left, 0.0) >= CONFLICT_MIN_SHARE and share.get(right, 0.0) >= CONFLICT_MIN_SHARE:
            condition_conflicts.append(
                {
                    "left": left,
                    "right": right,
                    "left_pct": round(share[left], 1),
                    "right_pct": round(share[right], 1),
                }
            )

    # ── 지배 입장 (HEAD) ──
    # 순찬성 하나로는 "95%가 조건부"라는 사실이 덮인다.
    dominant_stance = None
    for stance, item in stance_distribution.items():
        if item["pct"] >= DOMINANT_STANCE_PCT:
            dominant_stance = {"stance": stance, "pct": item["pct"]}
            break

    # 미확정 택일이면 애초에 찬반 질문이 아니다. 결과에 그 사실을 드러낸다.
    unresolved = detect_unresolved_choice(input_data.get("tradeoffs"))

    # 계층 비교가 성립하는지는 dominant_stance가 아니라 셀 간 폭이 결정한다.
    # 전원이 같은 stance여도 강도 차이로 계층이 갈릴 수 있다 (2026-07-21 실측 20%p).
    confident_cells = [
        cell["net_support"]
        for row in matrix.values()
        for cell in row.values()
        if not cell["low_confidence"]
    ]
    tier_spread = (
        round(max(confident_cells) - min(confident_cells), 1) if len(confident_cells) >= 2 else 0.0
    )

    return {
        "tier_spread": tier_spread,
        "tier_spread_min": TIER_SPREAD_MIN,
        "unresolved_choice": unresolved if unresolved["unresolved"] else None,
        "condition_categories": condition_categories,
        "other_rate": other_rate,
        "negated_condition_count": sum(1 for item in answers if item.get("negated")),
        "condition_conflicts": condition_conflicts,
        "dominant_stance": dominant_stance,
        "conflict_min_share": CONFLICT_MIN_SHARE,
        "stance_distribution": stance_distribution,
        "net_support": _net_support(answers, weights),
        "strong_opposition_pct": (
            round(strong_opposition / total * 100, 1) if total else 0.0
        ),
        "tier_housing_matrix": matrix,
        "tier_axis": list(tiers),
        "housing_axis": list(housings),
        "tier_axis_label": primary_axis_label(pool),
        "housing_axis_label": secondary_axis_label(pool),
        "persona_pool": pool,
        "region_breakdown": {
            "interpretation": "return_cost_proxy" if pool == "dgist" else "residence_region",
            "rows": region_rows,
        },
        "condition_clusters": condition_clusters,
        "opposition_reasons": opposition_reasons,
        "low_confidence_min_sample": LOW_CONFIDENCE_MIN_SAMPLE,
        "bias_warning": (
            None if (input_data.get("tradeoffs") or "").strip() else BIAS_WARNING
        ),
    }


class CampusPolicySimulation(GenericPersonaSimulation):
    """DGIST 등 전용 풀에서는 계층 최소 표본을 보장한 뒤 실행한다."""

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
        sampler = sampler or PersonaSampler()
        # nationwide + campus tier/housing axis → 전원 교직원·대구 시내 통근.
        sampler, pool_warnings = ensure_campus_sampler(sampler)
        runtime_input = {**input_data, "_persona_pool": "dgist"}
        stratified = sample_stratified(
            sampler, n=sample_size, seed=seed, target_filter=target_filter
        )
        personas = stratified.personas
        sampling_meta = {
            **stratified.meta,
            "warnings": list(stratified.meta.get("warnings") or []) + pool_warnings,
        }

        simulator = BatchSimulator(
            purpose=self.purpose,
            llm_client=llm_client,
            model_alias=model_alias,
            task_type=self.task_type,
            trace_metadata=trace_metadata,
        )
        results = await simulator.run(
            personas,
            self.prompt_builder(runtime_input),
            on_progress=on_progress,
            on_result=on_result,
        )
        parser = make_campus_policy_parser(runtime_input)
        parsed = [parser(item.response) for item in results]
        aggregate_input = {
            **runtime_input,
            "_tier_weights": sampling_meta.get("tier_weights"),
        }
        metrics = self.aggregator(aggregate_input, results, parsed)
        metrics["sampling"] = sampling_meta

        return GenericSimulationResult(
            simulation_type=self.simulation_type,
            input=input_data,
            total_responses=len(results),
            parse_failed=sum(1 for item in parsed if item is None),
            metrics=metrics,
            segments=metrics["tier_housing_matrix"],
            insights=[],
            raw_results=results,
            parsed_results=parsed,
        )


def campus_policy_runner() -> CampusPolicySimulation:
    return CampusPolicySimulation(
        simulation_type="campus_policy",
        purpose="campus policy referendum",
        task_type="policy_response",
        prompt_builder=build_campus_policy_prompt,
        parser=parse_campus_policy_response,
        aggregator=aggregate_campus_policy,
    )
