"""Multi-step price research protocol for Price Optimization V2."""
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
from src.simulations.calibration import apply_categorical_calibration
from src.simulations.common import GenericSimulationResult, demographic_segments, pct
from src.simulations.protocols import ProtocolSpec, ProtocolStep


PROTOCOL_ID = "price_research_v2"


def price_research_v2_protocol() -> ProtocolSpec:
    return ProtocolSpec(
        protocol_id=PROTOCOL_ID,
        steps=[
            ProtocolStep(
                id="price_ladder",
                mode="singleton",
                task_type="pricing_response",
            ),
            ProtocolStep(
                id="rejection_conditions",
                mode="objection_probe",
                task_type="pricing_objection",
                condition="headline_intent != '구매'",
            ),
            ProtocolStep(
                id="comparison_anchor",
                mode="anchor_probe",
                task_type="pricing_anchor",
                condition="headline_intent != '구매'",
            ),
            ProtocolStep(
                id="non_price_hesitation",
                mode="follow_up",
                task_type="pricing_hesitation",
                condition="headline_intent != '구매'",
            ),
        ],
    )


class PriceResearchV2Simulation:
    simulation_type = "price_optimization"
    purpose = "pricing research"

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
        protocol = price_research_v2_protocol()
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
                    ladder_response = await self._generate_step(
                        persona=persona,
                        step=protocol.steps[0],
                        prompt=self._price_ladder_prompt(input_data),
                        llm_client=client,
                        model_alias=model_alias,
                        trace_metadata=trace_metadata,
                    )
                    provider = ladder_response.provider
                    provider_model = ladder_response.provider_model
                    trace_id = ladder_response.trace_id
                    resolved_model_alias = (
                        ladder_response.metadata.get("model_alias")
                        if isinstance(ladder_response.metadata.get("model_alias"), str)
                        else model_alias
                    )
                    response_metadata = ladder_response.metadata
                    _track_usage(ladder_response)
                    responses.append(f"[price_ladder]\n{ladder_response.content}")
                    ladder = parse_price_ladder(ladder_response.content, input_data["price_points"])
                    if ladder is None:
                        raise ValueError("PARSING_FAILED: price_ladder")
                    parsed["protocol_steps"]["price_ladder"] = ladder
                    parsed.update(
                        {
                            "primary": ladder["headline_intent"],
                            "headline_intent": ladder["headline_intent"],
                            "preferred_price": ladder["preferred_price"],
                            "willingness_to_pay": ladder["willingness_to_pay"],
                            "reason": ladder["reason"],
                        }
                    )

                    if ladder["headline_intent"] != "구매":
                        for step in protocol.steps[1:]:
                            step_response = await self._generate_step(
                                persona=persona,
                                step=step,
                                prompt=self._follow_up_prompt(step.id, input_data, ladder),
                                llm_client=client,
                                model_alias=model_alias,
                                trace_metadata=trace_metadata,
                            )
                            provider = provider or step_response.provider
                            provider_model = provider_model or step_response.provider_model
                            trace_id = trace_id or step_response.trace_id
                            _track_usage(step_response)
                            responses.append(f"[{step.id}]\n{step_response.content}")
                            step_parsed = parse_follow_up_step(step.id, step_response.content)
                            if step_parsed is None:
                                raise ValueError(f"PARSING_FAILED: {step.id}")
                            parsed["protocol_steps"][step.id] = step_parsed
                    else:
                        for step in protocol.steps[1:]:
                            parsed["protocol_steps"][step.id] = {"skipped": True}
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
        aggregate = aggregate_price_research_v2(input_data, raw_results, parsed_results)
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

    def _price_ladder_prompt(self, input_data: dict[str, Any]) -> str:
        prices = "\n".join(f"- {price:,}원" for price in input_data["price_points"])
        return (
            f"제품명: {input_data['product_name']}\n"
            f"제품 설명: {input_data['product_description']}\n"
            f"상황: {input_data.get('context_note') or '일반 소비 상황'}\n"
            f"가격 후보:\n{prices}\n\n"
            "각 가격에서 실제로 결제할지 답하세요. 예의상 긍정하지 말고 현실적으로 답하세요.\n"
            "답변 형식:\n"
            "가격별의향:\n"
            "9900원: 구매/관망/거부\n"
            "선호가격: 숫자만\n"
            "지불의향가격: 숫자만\n"
            "대표의향: 구매/관망/거부 중 하나\n"
            "이유: 한 문장"
        )

    def _follow_up_prompt(
        self,
        step_id: str,
        input_data: dict[str, Any],
        ladder: dict[str, Any],
    ) -> str:
        base = (
            f"제품명: {input_data['product_name']}\n"
            f"제품 설명: {input_data['product_description']}\n"
            f"이전 답변 요약: 대표의향={ladder['headline_intent']}, "
            f"선호가격={ladder['preferred_price']}원, 이유={ladder['reason']}\n\n"
        )
        if step_id == "rejection_conditions":
            return (
                base
                + "거절 또는 관망했다면 어떤 조건이면 결제할지 답하세요.\n"
                "조건은 도구연동/결과물증명/무료체험/ROI증명/회사결제/가격인하/기타 중 하나로 고르세요.\n"
                "답변 형식:\n"
                "조건: 도구연동/결과물증명/무료체험/ROI증명/회사결제/가격인하/기타\n"
                "조건상태: 조건부구매/여전히거부\n"
                "이유: 한 문장"
            )
        if step_id == "comparison_anchor":
            return (
                base
                + "최근 1년에 비슷한 분류라고 느낀 유료 서비스와 월 지출을 답하세요.\n"
                "답변 형식:\n"
                "유사서비스: 서비스명 또는 없음\n"
                "월지출: 숫자만 또는 0\n"
                "앵커범주: AI학습/업무툴/교육/생산성/없음/기타\n"
                "이유: 한 문장"
            )
        return (
            base
            + "가격 외에 가장 망설이는 이유를 하나만 답하세요.\n"
            "망설임은 신뢰부족/사용시간/보안/필요성낮음/학습부담/기타 중 하나로 고르세요.\n"
            "답변 형식:\n"
            "망설임: 신뢰부족/사용시간/보안/필요성낮음/학습부담/기타\n"
            "이유: 한 문장"
        )


def parse_price_ladder(response: str, price_points: list[int]) -> dict[str, Any] | None:
    intents: dict[str, str] = {}
    for price in price_points:
        pattern = rf"{price:,}원|{price}원"
        match = re.search(rf"(?:{pattern})\s*[:：-]\s*(구매|관망|거부)", response)
        if match:
            intents[str(price)] = match.group(1)
    preferred = _parse_int_line(response, "선호가격")
    wtp = _parse_int_line(response, "지불의향가격")
    headline = _parse_label(response, "대표의향", ["구매", "관망", "거부"])
    if not intents or preferred is None or headline is None:
        return None
    return {
        "price_intents": intents,
        "preferred_price": preferred,
        "willingness_to_pay": wtp or preferred,
        "headline_intent": headline,
        "reason": _parse_line(response, "이유"),
    }


def parse_follow_up_step(step_id: str, response: str) -> dict[str, Any] | None:
    if step_id == "rejection_conditions":
        condition = _parse_label(
            response,
            "조건",
            ["도구연동", "결과물증명", "무료체험", "ROI증명", "회사결제", "가격인하", "기타"],
        )
        status = _parse_label(response, "조건상태", ["조건부구매", "여전히거부"])
        if condition is None or status is None:
            return None
        return {
            "condition_category": condition,
            "condition_status": status,
            "reason": _parse_line(response, "이유"),
        }
    if step_id == "comparison_anchor":
        category = _parse_label(response, "앵커범주", ["AI학습", "업무툴", "교육", "생산성", "없음", "기타"])
        amount = _parse_int_line(response, "월지출")
        service = _parse_line(response, "유사서비스")
        if category is None:
            return None
        return {
            "anchor_category": category,
            "monthly_spend": amount or 0,
            "similar_service": service,
            "reason": _parse_line(response, "이유"),
        }
    hesitation = _parse_label(
        response,
        "망설임",
        ["신뢰부족", "사용시간", "보안", "필요성낮음", "학습부담", "기타"],
    )
    if hesitation is None:
        return None
    return {
        "hesitation_reason": hesitation,
        "reason": _parse_line(response, "이유"),
    }


def aggregate_price_research_v2(
    input_data: dict[str, Any],
    raw_results: list[SimResult],
    parsed_results: list[dict[str, Any] | None],
) -> dict[str, Any]:
    parsed = [item for item in parsed_results if item]
    total = len(parsed)
    headline_counts = Counter(item["headline_intent"] for item in parsed)
    condition_counts = Counter()
    condition_status_counts = Counter()
    anchor_counts = Counter()
    hesitation_counts = Counter()
    conditional_yes = 0
    price_intent_counts: dict[str, Counter] = {
        str(price): Counter() for price in input_data["price_points"]
    }

    for item in parsed:
        steps = item["protocol_steps"]
        for price, intent in steps["price_ladder"]["price_intents"].items():
            price_intent_counts[str(price)][intent] += 1
        rejection = steps.get("rejection_conditions") or {}
        if not rejection.get("skipped"):
            condition = rejection.get("condition_category")
            status = rejection.get("condition_status")
            if condition:
                condition_counts[condition] += 1
            if status:
                condition_status_counts[status] += 1
            if status == "조건부구매":
                conditional_yes += 1
        anchor = steps.get("comparison_anchor") or {}
        if not anchor.get("skipped") and anchor.get("anchor_category"):
            anchor_counts[anchor["anchor_category"]] += 1
        hesitation = steps.get("non_price_hesitation") or {}
        if not hesitation.get("skipped") and hesitation.get("hesitation_reason"):
            hesitation_counts[hesitation["hesitation_reason"]] += 1

    price_intent_by_price = {
        price: {
            "counts": dict(counts),
            "pct": {intent: pct(count, total) for intent, count in counts.items()},
        }
        for price, counts in price_intent_counts.items()
    }
    protocol = price_research_v2_protocol().model_dump()
    protocol["step_summaries"] = [
        {"id": "price_ladder", "parsed_count": total, "parse_failed": len(parsed_results) - total},
        {
            "id": "rejection_conditions",
            "parsed_count": sum(condition_status_counts.values()),
            "parse_failed": 0,
        },
        {"id": "comparison_anchor", "parsed_count": sum(anchor_counts.values()), "parse_failed": 0},
        {
            "id": "non_price_hesitation",
            "parsed_count": sum(hesitation_counts.values()),
            "parse_failed": 0,
        },
    ]
    protocol["interview_guide"] = build_price_research_interview_guide(
        headline_counts=headline_counts,
        condition_counts=condition_counts,
        anchor_counts=anchor_counts,
        hesitation_counts=hesitation_counts,
        conditional_yes=conditional_yes,
        total=total,
    )
    calibration = apply_categorical_calibration(
        raw_results,
        parsed_results,
        metric_key="headline_intent",
        calibration=input_data.get("calibration"),
    )
    return {
        "metrics": {
            "protocol_id": PROTOCOL_ID,
            "price_points": input_data["price_points"],
            "headline_intent_counts": dict(headline_counts),
            "headline_intent_pct": {k: pct(v, total) for k, v in headline_counts.items()},
            "price_intent_by_price": price_intent_by_price,
            "conditional_yes_count": conditional_yes,
            "conditional_yes_rate": pct(conditional_yes, total),
            "condition_category_counts": dict(condition_counts),
            "condition_status_counts": dict(condition_status_counts),
            "anchor_category_counts": dict(anchor_counts),
            "hesitation_reason_counts": dict(hesitation_counts),
            "calibration": calibration,
        },
        "segments": demographic_segments(raw_results, parsed_results, key="headline_intent"),
        "insights": _price_research_insights(headline_counts, conditional_yes, total),
        "protocol": protocol,
    }


def build_price_research_interview_guide(
    *,
    headline_counts: Counter[str],
    condition_counts: Counter[str],
    anchor_counts: Counter[str],
    hesitation_counts: Counter[str],
    conditional_yes: int,
    total: int,
) -> dict[str, Any]:
    questions: list[dict[str, Any]] = []
    if anchor_counts:
        questions.append(
            {
                "slot_id": "comparison_anchor",
                "question": "최근 1년에 만족스럽게 결제한 서비스 중 이 제품과 같은 분류라고 느낀 것이 있나요?",
                "why_this_question": "시뮬레이션에서 비교 앵커가 가격 판단에 영향을 주는 신호로 나타났습니다.",
                "evidence": dict(anchor_counts),
            }
        )
    if condition_counts:
        questions.append(
            {
                "slot_id": "purchase_condition",
                "question": "지금은 결제하지 않더라도, 어떤 조건이 충족되면 결제할 수 있나요?",
                "why_this_question": "헤드라인 구매 의향과 조건부 구매 가능성을 분리해 확인해야 합니다.",
                "evidence": dict(condition_counts),
            }
        )
    if hesitation_counts:
        questions.append(
            {
                "slot_id": "non_price_hesitation",
                "question": "가격 외에 결정을 가장 망설이게 만드는 이유는 무엇인가요?",
                "why_this_question": "가격 인하보다 신뢰, 사용시간, 보안 등 비가격 장벽이 더 중요할 수 있습니다.",
                "evidence": dict(hesitation_counts),
            }
        )
    if not questions:
        questions.append(
            {
                "slot_id": "headline_validation",
                "question": "이 가격대에서 실제 결제를 떠올릴 때 가장 먼저 확인하고 싶은 것은 무엇인가요?",
                "why_this_question": "시뮬레이션 결과를 실제 인터뷰에서 검증하기 위한 기본 확인 질문입니다.",
                "evidence": dict(headline_counts),
            }
        )
    return {
        "schema_version": "interview-guide/v1",
        "conditional_yes_rate": pct(conditional_yes, total),
        "questions": questions,
    }


def _price_research_insights(
    headline_counts: Counter[str],
    conditional_yes: int,
    total: int,
) -> list[dict[str, Any]]:
    purchase_rate = pct(headline_counts.get("구매", 0), total)
    conditional_rate = pct(conditional_yes, total)
    insights = [
        {
            "type": "headline_purchase_intent",
            "title": "Headline purchase intent",
            "value": purchase_rate,
            "evidence": "대표의향 기준 구매 비율입니다.",
        }
    ]
    if conditional_rate > purchase_rate:
        insights.append(
            {
                "type": "conditional_yes_gap",
                "title": "Conditional yes exceeds headline intent",
                "value": conditional_rate,
                "evidence": "거절/관망 응답 중 조건 충족 시 결제 가능성이 드러났습니다.",
            }
        )
    return insights


def _parse_int_line(response: str, label: str) -> int | None:
    match = re.search(rf"{label}[:\s]*([\d,]+)", response)
    if not match:
        return None
    return int(match.group(1).replace(",", ""))


def _parse_label(response: str, label: str, allowed: list[str]) -> str | None:
    match = re.search(rf"{label}[:\s]*({'|'.join(map(re.escape, allowed))})", response)
    if match:
        return match.group(1)
    return next((value for value in allowed if value in response), None)


def _parse_line(response: str, label: str) -> str:
    match = re.search(rf"{label}[:\s]*(.+?)(?:\n|$)", response)
    return match.group(1).strip()[:240] if match else ""
