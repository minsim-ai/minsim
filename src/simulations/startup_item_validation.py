"""Multi-step startup item validation protocol (창업 아이템 검증)."""
from __future__ import annotations

import asyncio
import re
from collections import Counter
from typing import Any, Callable

from src.agent.prompt_builder import build_system_prompt
from src.agent.simulator import BatchSimulator, SimResult
from src.config import CONCURRENCY
from src.data.sampler import PersonaSampler, TargetFilter
from src.llm.base import LLMClientProtocol, LLMMessage, LLMRequest, LLMResponse
from src.llm.factory import create_llm_client
from src.simulations.common import GenericSimulationResult, demographic_segments, pct
from src.simulations.protocols import ProtocolSpec, ProtocolStep


PROTOCOL_ID = "startup_item_validation_v1"

NEED_CATEGORIES = ["시간절약", "비용절감", "건강", "불안해소", "즐거움", "성취", "기타"]
SELF_SEGMENTS = ["적극수용층", "실용검토층", "가격민감층", "대안만족층", "무관심층"]
DIFFERENTIATION_LEVELS = ["뚜렷함", "약간", "없음"]
ACCEPTANCE_LEVELS = ["수용", "관망", "거부"]
BARRIER_CATEGORIES = ["가격부담", "신뢰부족", "필요성낮음", "대안만족", "사용부담", "기타"]
CONVERSION_STATUSES = ["조건부수용", "여전히거부"]


def startup_item_validation_protocol() -> ProtocolSpec:
    return ProtocolSpec(
        protocol_id=PROTOCOL_ID,
        steps=[
            ProtocolStep(
                id="needs_segment",
                mode="singleton",
                task_type="validation_response",
            ),
            ProtocolStep(
                id="competition_positioning",
                mode="anchor_probe",
                task_type="validation_competition",
            ),
            ProtocolStep(
                id="acceptance_price",
                mode="forced_choice",
                task_type="validation_acceptance",
            ),
            ProtocolStep(
                id="adoption_barrier",
                mode="objection_probe",
                task_type="validation_objection",
                condition="headline_acceptance != '수용'",
            ),
        ],
    )


class StartupItemValidationSimulation:
    simulation_type = "startup_item_validation"
    purpose = "startup item validation research"

    async def run(
        self,
        input_data: dict[str, Any],
        sample_size: int = 200,
        target_filter: TargetFilter | None = None,
        seed: int = 42,
        on_progress: Callable[[int, int], None] | None = None,
        on_result: Callable[[SimResult], None] | None = None,
        llm_client: LLMClientProtocol | None = None,
        sampler: PersonaSampler | None = None,
        model_alias: str | None = None,
        trace_metadata: dict[str, object] | None = None,
    ) -> GenericSimulationResult:
        sampler = sampler or PersonaSampler()
        personas = sampler.sample(n=sample_size, filter_=target_filter, seed=seed)
        protocol = startup_item_validation_protocol()
        protocol.validate()
        owns_client = llm_client is None
        client = llm_client or create_llm_client()
        semaphore = asyncio.Semaphore(CONCURRENCY)
        completed = {"n": 0}

        async def run_one(persona: dict[str, Any]) -> tuple[SimResult, dict[str, Any] | None]:
            async with semaphore:
                parsed: dict[str, Any] = {"protocol_steps": {}}
                responses: list[str] = []
                error: str | None = None
                provider: str | None = None
                provider_model: str | None = None
                trace_id: str | None = None
                resolved_model_alias: str | None = model_alias
                response_metadata: dict[str, object] = {}
                usage_totals = {
                    "input_tokens": 0,
                    "output_tokens": 0,
                    "total_tokens": 0,
                    "llm_calls": 0,
                }
                usage_by_task: dict[str, dict[str, int]] = {}

                def _track_usage(response: Any) -> None:
                    metadata = getattr(response, "metadata", None) or {}
                    task = str(metadata.get("task_type") or "unknown")
                    bucket = usage_by_task.setdefault(
                        task,
                        {
                            "input_tokens": 0,
                            "output_tokens": 0,
                            "total_tokens": 0,
                            "llm_calls": 0,
                        },
                    )
                    bucket["llm_calls"] += 1
                    usage_totals["llm_calls"] += 1
                    for key in ("input_tokens", "output_tokens", "total_tokens"):
                        value = metadata.get(key)
                        if isinstance(value, int):
                            bucket[key] += value
                            usage_totals[key] += value

                try:
                    needs_response = await self._generate_step(
                        persona=persona,
                        step=protocol.steps[0],
                        prompt=self._needs_segment_prompt(input_data),
                        llm_client=client,
                        model_alias=model_alias,
                        trace_metadata=trace_metadata,
                    )
                    provider = needs_response.provider
                    provider_model = needs_response.provider_model
                    trace_id = needs_response.trace_id
                    resolved_model_alias = (
                        needs_response.metadata.get("model_alias")
                        if isinstance(needs_response.metadata.get("model_alias"), str)
                        else model_alias
                    )
                    response_metadata = needs_response.metadata
                    _track_usage(needs_response)
                    responses.append(f"[needs_segment]\n{needs_response.content}")
                    needs = parse_needs_segment(needs_response.content)
                    if needs is None:
                        raise ValueError("PARSING_FAILED: needs_segment")
                    parsed["protocol_steps"]["needs_segment"] = needs

                    competition_response = await self._generate_step(
                        persona=persona,
                        step=protocol.steps[1],
                        prompt=self._competition_prompt(input_data),
                        llm_client=client,
                        model_alias=model_alias,
                        trace_metadata=trace_metadata,
                    )
                    provider = provider or competition_response.provider
                    provider_model = provider_model or competition_response.provider_model
                    trace_id = trace_id or competition_response.trace_id
                    _track_usage(competition_response)
                    responses.append(f"[competition_positioning]\n{competition_response.content}")
                    competition = parse_competition_positioning(
                        competition_response.content, input_data.get("alternatives") or []
                    )
                    if competition is None:
                        raise ValueError("PARSING_FAILED: competition_positioning")
                    parsed["protocol_steps"]["competition_positioning"] = competition

                    acceptance_response = await self._generate_step(
                        persona=persona,
                        step=protocol.steps[2],
                        prompt=self._acceptance_prompt(input_data),
                        llm_client=client,
                        model_alias=model_alias,
                        trace_metadata=trace_metadata,
                    )
                    provider = provider or acceptance_response.provider
                    provider_model = provider_model or acceptance_response.provider_model
                    trace_id = trace_id or acceptance_response.trace_id
                    _track_usage(acceptance_response)
                    responses.append(f"[acceptance_price]\n{acceptance_response.content}")
                    acceptance = parse_acceptance_price(acceptance_response.content)
                    if acceptance is None:
                        raise ValueError("PARSING_FAILED: acceptance_price")
                    parsed["protocol_steps"]["acceptance_price"] = acceptance
                    parsed.update(
                        {
                            "primary": acceptance["acceptance"],
                            "intent": acceptance["acceptance"],
                            "problem_empathy": needs["problem_empathy"],
                            "need_category": needs["need_category"],
                            "self_segment": needs["self_segment"],
                            "willingness_to_pay": acceptance["willingness_to_pay"],
                            "reason": acceptance["reason"],
                        }
                    )

                    if acceptance["acceptance"] != "수용":
                        barrier_response = await self._generate_step(
                            persona=persona,
                            step=protocol.steps[3],
                            prompt=self._barrier_prompt(input_data, acceptance),
                            llm_client=client,
                            model_alias=model_alias,
                            trace_metadata=trace_metadata,
                        )
                        provider = provider or barrier_response.provider
                        provider_model = provider_model or barrier_response.provider_model
                        trace_id = trace_id or barrier_response.trace_id
                        _track_usage(barrier_response)
                        responses.append(f"[adoption_barrier]\n{barrier_response.content}")
                        barrier = parse_adoption_barrier(barrier_response.content)
                        if barrier is None:
                            raise ValueError("PARSING_FAILED: adoption_barrier")
                        parsed["protocol_steps"]["adoption_barrier"] = barrier
                    else:
                        parsed["protocol_steps"]["adoption_barrier"] = {"skipped": True}
                except Exception as exc:
                    error = str(exc)
                    parsed = None  # type: ignore[assignment]

                result = SimResult(
                    uuid=persona["uuid"],
                    persona=persona,
                    response="\n\n".join(responses),
                    error=error,
                    provider=provider,
                    provider_model=provider_model,
                    trace_id=trace_id,
                    model_alias=resolved_model_alias,
                    metadata={
                        **response_metadata,
                        "usage_totals": usage_totals,
                        "usage_by_task_type": usage_by_task,
                    },
                )
                completed["n"] += 1
                if on_result:
                    on_result(result)
                if on_progress:
                    on_progress(completed["n"], len(personas))
                return result, parsed

        try:
            pairs = await asyncio.gather(*[run_one(persona) for persona in personas])
        finally:
            if owns_client:
                close = getattr(client, "close", None)
                if close:
                    await close()
        raw_results = [pair[0] for pair in pairs]
        parsed_results = [pair[1] for pair in pairs]
        parse_failed = sum(1 for raw, parsed in pairs if raw.error or parsed is None)
        aggregate = aggregate_startup_item_validation(input_data, raw_results, parsed_results)
        return GenericSimulationResult(
            simulation_type=self.simulation_type,
            input=input_data,
            total_responses=len(raw_results),
            parse_failed=parse_failed,
            metrics=aggregate["metrics"],
            segments=aggregate["segments"],
            insights=aggregate["insights"],
            raw_results=raw_results,
            parsed_results=parsed_results,
            protocol=aggregate["protocol"],
        )

    async def _generate_step(
        self,
        *,
        persona: dict[str, Any],
        step: ProtocolStep,
        prompt: str,
        llm_client: LLMClientProtocol | None,
        model_alias: str | None,
        trace_metadata: dict[str, object] | None,
    ) -> LLMResponse:
        simulator = BatchSimulator(
            purpose=self.purpose,
            llm_client=llm_client,
            model_alias=step.model_alias or model_alias,
            task_type=step.task_type,
            trace_metadata=trace_metadata,
        )
        return await simulator._generate_with_retry(
            LLMRequest(
                task_type=step.task_type,
                model_alias=simulator.model_alias,
                messages=[
                    LLMMessage(role="system", content=build_system_prompt(persona, purpose=self.purpose)),
                    LLMMessage(role="user", content=prompt),
                ],
                metadata={
                    **(trace_metadata or {}),
                    "purpose": self.purpose,
                    "persona_uuid": persona["uuid"],
                    "protocol_id": PROTOCOL_ID,
                    "step_id": step.id,
                },
            )
        )

    def _item_context(self, input_data: dict[str, Any]) -> str:
        features = input_data.get("key_features") or []
        feature_lines = (
            "\n".join(f"- {feature}" for feature in features)
            if features
            else "- (제공된 핵심 기능 없음)"
        )
        return (
            f"아이템명: {input_data['item_name']}\n"
            f"아이템 설명: {input_data['item_description']}\n"
            f"해결하려는 문제: {input_data.get('problem_statement') or input_data['item_description']}\n"
            f"핵심 기능:\n{feature_lines}\n"
        )

    def _needs_segment_prompt(self, input_data: dict[str, Any]) -> str:
        return (
            self._item_context(input_data)
            + "\n당신이 이 문제를 겪는 실제 소비자라고 가정하고 답하세요. 예의상 긍정하지 말고 현실적으로 답하세요.\n"
            "아래 형식의 예시 문구를 그대로 복사하지 말고 본인 상황으로 답하세요.\n"
            "답변 형식:\n"
            "문제공감: 1~5 정수 (1=전혀 공감 안 됨, 5=매우 공감)\n"
            "현재해결: 지금 이 문제를 어떻게 해결하는지 한 문장\n"
            "니즈: 시간절약/비용절감/건강/불안해소/즐거움/성취/기타 중 하나\n"
            "셀프세그먼트: 적극수용층/실용검토층/가격민감층/대안만족층/무관심층 중 하나\n"
            "이유: 한 문장"
        )

    def _competition_prompt(self, input_data: dict[str, Any]) -> str:
        alternatives = input_data.get("alternatives") or []
        alt_line = ", ".join(alternatives) if alternatives else "없음"
        return (
            self._item_context(input_data)
            + f"\n현재 시장의 대안: {alt_line}\n\n"
            "이 아이템을 기존 대안과 비교해 현실적으로 답하세요.\n"
            "답변 형식:\n"
            f"대안: {alt_line} 중 하나 또는 없음/기타\n"
            "대안만족도: 1~5 정수 (현재 대안에 대한 만족도)\n"
            "차별점: 뚜렷함/약간/없음 중 하나\n"
            "포지셔닝: 이 아이템을 한 문장으로 어떻게 인식하는지"
        )

    def _acceptance_prompt(self, input_data: dict[str, Any]) -> str:
        price_hint = input_data.get("price_hint")
        anchor = f"참고 가격: {price_hint}\n" if price_hint else ""
        return (
            self._item_context(input_data)
            + f"\n{anchor}"
            "이 아이템을 실제로 구매/도입할지 현실적으로 답하세요. 예의상 수용하지 마세요.\n"
            "답변 형식:\n"
            "수용의향: 수용/관망/거부 중 하나\n"
            "지불의향가격: 숫자만 (원 단위, 지불 의향이 없으면 0)\n"
            "이유: 한 문장"
        )

    def _barrier_prompt(self, input_data: dict[str, Any], acceptance: dict[str, Any]) -> str:
        return (
            self._item_context(input_data)
            + f"\n이전 답변 요약: 수용의향={acceptance['acceptance']}\n\n"
            "수용하지 않았다면 가장 큰 장벽 하나와, 어떤 조건이면 수용할지 답하세요.\n"
            "답변 형식:\n"
            "장벽: 가격부담/신뢰부족/필요성낮음/대안만족/사용부담/기타 중 하나\n"
            "전환조건상태: 조건부수용/여전히거부 중 하나\n"
            "조건: 어떤 조건이면 수용할지 한 문장"
        )


def parse_needs_segment(response: str) -> dict[str, Any] | None:
    empathy = _parse_score_line(response, "문제공감")
    need = _parse_label(response, "니즈", NEED_CATEGORIES)
    segment = _parse_label(response, "셀프세그먼트", SELF_SEGMENTS)
    if empathy is None or need is None or segment is None:
        return None
    return {
        "problem_empathy": empathy,
        "current_solution": _parse_line(response, "현재해결"),
        "need_category": need,
        "self_segment": segment,
        "reason": _parse_line(response, "이유"),
    }


def parse_competition_positioning(
    response: str, alternatives: list[str]
) -> dict[str, Any] | None:
    differentiation = _parse_label(response, "차별점", DIFFERENTIATION_LEVELS)
    if differentiation is None:
        return None
    allowed_alternatives = [*alternatives, "없음", "기타"]
    alternative = _parse_label(response, "대안", allowed_alternatives)
    return {
        "alternative": alternative or "기타",
        "alternative_satisfaction": _parse_score_line(response, "대안만족도"),
        "differentiation": differentiation,
        "positioning": _parse_line(response, "포지셔닝"),
    }


def parse_acceptance_price(response: str) -> dict[str, Any] | None:
    acceptance = _parse_label(response, "수용의향", ACCEPTANCE_LEVELS)
    if acceptance is None:
        return None
    return {
        "acceptance": acceptance,
        "willingness_to_pay": _parse_int_line(response, "지불의향가격"),
        "reason": _parse_line(response, "이유"),
    }


def parse_adoption_barrier(response: str) -> dict[str, Any] | None:
    barrier = _parse_label(response, "장벽", BARRIER_CATEGORIES)
    status = _parse_label(response, "전환조건상태", CONVERSION_STATUSES)
    if barrier is None or status is None:
        return None
    return {
        "barrier": barrier,
        "condition_status": status,
        "condition": _parse_line(response, "조건"),
    }


def aggregate_startup_item_validation(
    input_data: dict[str, Any],
    raw_results: list[SimResult],
    parsed_results: list[dict[str, Any] | None],
    protocol_spec: ProtocolSpec | None = None,
) -> dict[str, Any]:
    parsed = [item for item in parsed_results if item]
    total = len(parsed)
    intent_counts = Counter(item["intent"] for item in parsed)
    segment_counts = Counter(item["self_segment"] for item in parsed)
    need_counts = Counter(item["need_category"] for item in parsed)
    empathy_values = [
        item["problem_empathy"] for item in parsed if isinstance(item.get("problem_empathy"), int)
    ]
    empathy_distribution = Counter(str(value) for value in empathy_values)
    alternative_counts: Counter[str] = Counter()
    satisfaction_values: list[int] = []
    differentiation_counts: Counter[str] = Counter()
    barrier_counts: Counter[str] = Counter()
    condition_status_counts: Counter[str] = Counter()
    conditional_yes = 0
    wtp_values: list[int] = []

    for item in parsed:
        steps = item["protocol_steps"]
        competition = steps.get("competition_positioning") or {}
        if competition.get("alternative"):
            alternative_counts[competition["alternative"]] += 1
        if isinstance(competition.get("alternative_satisfaction"), int):
            satisfaction_values.append(competition["alternative_satisfaction"])
        if competition.get("differentiation"):
            differentiation_counts[competition["differentiation"]] += 1
        wtp = item.get("willingness_to_pay")
        if isinstance(wtp, int) and wtp > 0:
            wtp_values.append(wtp)
        if item["intent"] != "수용":
            barrier = steps.get("adoption_barrier") or {}
            if not barrier.get("skipped"):
                if barrier.get("barrier"):
                    barrier_counts[barrier["barrier"]] += 1
                status = barrier.get("condition_status")
                if status:
                    condition_status_counts[status] += 1
                if status == "조건부수용":
                    conditional_yes += 1

    recognized = differentiation_counts.get("뚜렷함", 0) + differentiation_counts.get("약간", 0)
    resolved_protocol = protocol_spec or startup_item_validation_protocol()
    atomic_protocol = resolved_protocol.protocol_id == "startup_item_validation_v2"
    atomic_parse_failed = len(parsed_results) - total
    protocol = resolved_protocol.model_dump()
    protocol["step_summaries"] = [
        {"id": "needs_segment", "parsed_count": total, "parse_failed": atomic_parse_failed},
        {
            "id": "competition_positioning",
            "parsed_count": total,
            "parse_failed": atomic_parse_failed if atomic_protocol else 0,
        },
        {
            "id": "acceptance_price",
            "parsed_count": total,
            "parse_failed": atomic_parse_failed if atomic_protocol else 0,
        },
        {
            "id": "adoption_barrier",
            "parsed_count": sum(condition_status_counts.values()),
            "parse_failed": atomic_parse_failed if atomic_protocol else 0,
        },
    ]
    protocol["interview_guide"] = build_startup_validation_interview_guide(
        intent_counts=intent_counts,
        barrier_counts=barrier_counts,
        alternative_counts=alternative_counts,
        differentiation_counts=differentiation_counts,
        conditional_yes=conditional_yes,
        total=total,
    )
    return {
        "metrics": {
            "protocol_id": resolved_protocol.protocol_id,
            "intent_counts": dict(intent_counts),
            "intent_pct": {k: pct(v, total) for k, v in intent_counts.items()},
            "segment_counts": dict(segment_counts),
            "segment_pct": {k: pct(v, total) for k, v in segment_counts.items()},
            "problem_empathy_avg": _avg(empathy_values),
            "problem_empathy_distribution": {
                str(score): empathy_distribution.get(str(score), 0) for score in range(1, 6)
            },
            "need_category_counts": dict(need_counts),
            "alternative_counts": dict(alternative_counts),
            "alternative_satisfaction_avg": _avg(satisfaction_values),
            "differentiation_counts": dict(differentiation_counts),
            "differentiation_recognized_pct": pct(recognized, total),
            "wtp_median": _percentile(wtp_values, 0.5),
            "wtp_p25": _percentile(wtp_values, 0.25),
            "wtp_p75": _percentile(wtp_values, 0.75),
            "barrier_counts": dict(barrier_counts),
            "condition_status_counts": dict(condition_status_counts),
            "conditional_yes_count": conditional_yes,
            "conditional_yes_rate": pct(conditional_yes, total),
        },
        "segments": demographic_segments(raw_results, parsed_results, key="intent"),
        "insights": _startup_validation_insights(
            intent_counts, need_counts, barrier_counts, conditional_yes, total
        ),
        "protocol": protocol,
    }


def build_startup_validation_interview_guide(
    *,
    intent_counts: Counter[str],
    barrier_counts: Counter[str],
    alternative_counts: Counter[str],
    differentiation_counts: Counter[str],
    conditional_yes: int,
    total: int,
) -> dict[str, Any]:
    questions: list[dict[str, Any]] = []
    if barrier_counts:
        top_barrier = barrier_counts.most_common(1)[0][0]
        questions.append(
            {
                "slot_id": "adoption_barrier",
                "question": f"'{top_barrier}'이(가) 실제 도입을 막는 가장 큰 이유가 맞는지, 어떤 상황에서 그렇게 느끼는지 알려주세요.",
                "why_this_question": "시뮬레이션에서 가장 자주 나타난 도입 장벽을 실제 인터뷰로 검증해야 합니다.",
                "evidence": dict(barrier_counts),
            }
        )
    if alternative_counts:
        top_alternative = alternative_counts.most_common(1)[0][0]
        questions.append(
            {
                "slot_id": "competition_positioning",
                "question": f"지금 '{top_alternative}'(으)로 이 문제를 해결하고 있다면, 무엇이 부족해서 새 대안을 고려하게 되나요?",
                "why_this_question": "가장 많이 언급된 대안 대비 차별점이 실제 구매 결정에 영향을 주는지 확인해야 합니다.",
                "evidence": dict(alternative_counts),
            }
        )
    if differentiation_counts.get("없음"):
        questions.append(
            {
                "slot_id": "differentiation_gap",
                "question": "이 아이템이 기존 대안과 뚜렷이 다르지 않다고 느꼈다면, 어떤 점이 비슷하게 보였나요?",
                "why_this_question": "차별점을 '없음'으로 응답한 표본이 있어 포지셔닝 재설계 신호를 확인해야 합니다.",
                "evidence": {"없음": differentiation_counts.get("없음", 0)},
            }
        )
    if not questions:
        questions.append(
            {
                "slot_id": "acceptance_validation",
                "question": "이 아이템을 실제로 결제한다고 상상할 때 가장 먼저 확인하고 싶은 것은 무엇인가요?",
                "why_this_question": "시뮬레이션 결과를 실제 인터뷰에서 검증하기 위한 기본 확인 질문입니다.",
                "evidence": dict(intent_counts),
            }
        )
    return {
        "schema_version": "interview-guide/v1",
        "conditional_yes_rate": pct(conditional_yes, total),
        "questions": questions,
    }


def _startup_validation_insights(
    intent_counts: Counter[str],
    need_counts: Counter[str],
    barrier_counts: Counter[str],
    conditional_yes: int,
    total: int,
) -> list[dict[str, Any]]:
    acceptance_rate = pct(intent_counts.get("수용", 0), total)
    conditional_rate = pct(conditional_yes, total)
    insights: list[dict[str, Any]] = [
        {
            "type": "headline_acceptance_intent",
            "title": "Headline acceptance intent",
            "value": acceptance_rate,
            "evidence": "수용의향 기준 '수용' 비율입니다.",
        }
    ]
    if need_counts:
        top_need, need_count = need_counts.most_common(1)[0]
        insights.append(
            {
                "type": "top_need_category",
                "title": "Most common need",
                "label": top_need,
                "value": pct(need_count, total),
                "evidence": f"가장 많이 선택된 핵심 니즈는 '{top_need}'입니다.",
            }
        )
    if barrier_counts:
        top_barrier, barrier_count = barrier_counts.most_common(1)[0]
        insights.append(
            {
                "type": "top_adoption_barrier",
                "title": "Top adoption barrier",
                "label": top_barrier,
                "value": pct(barrier_count, total),
                "evidence": f"비수용 응답에서 가장 자주 나온 장벽은 '{top_barrier}'입니다.",
            }
        )
    if conditional_rate > acceptance_rate:
        insights.append(
            {
                "type": "conditional_yes_gap",
                "title": "Conditional yes exceeds headline acceptance",
                "value": conditional_rate,
                "evidence": "관망/거부 응답 중 조건 충족 시 수용 가능성이 드러났습니다.",
            }
        )
    return insights


def _percentile(values: list[int], quantile: float) -> int | None:
    if not values:
        return None
    ordered = sorted(values)
    if len(ordered) == 1:
        return int(ordered[0])
    rank = (len(ordered) - 1) * quantile
    low = int(rank)
    high = min(low + 1, len(ordered) - 1)
    frac = rank - low
    return int(round(ordered[low] * (1 - frac) + ordered[high] * frac))


def _avg(values: list[int]) -> float:
    return round(sum(values) / len(values), 2) if values else 0.0


def _parse_int_line(response: str, label: str) -> int | None:
    match = re.search(rf"{label}[:\s]*([\d,]+)", response)
    if not match:
        return None
    return int(match.group(1).replace(",", ""))


def _parse_score_line(response: str, label: str) -> int | None:
    match = re.search(rf"{label}[:\s]*([1-5])", response)
    return int(match.group(1)) if match else None


def _parse_label(response: str, label: str, allowed: list[str]) -> str | None:
    match = re.search(rf"{label}[:\s]*({'|'.join(map(re.escape, allowed))})", response)
    if match:
        return match.group(1)
    return next((value for value in allowed if value in response), None)


def _parse_line(response: str, label: str) -> str:
    match = re.search(rf"{label}[:\s]*(.+?)(?:\n|$)", response)
    return match.group(1).strip()[:240] if match else ""
