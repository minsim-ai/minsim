"""Deterministic local LLM client for E2E and offline development."""
from __future__ import annotations

import hashlib
import json
import re

from src.llm.base import LLMClientProtocol, LLMRequest, LLMResponse


class FakeLLMClient(LLMClientProtocol):
    async def generate(self, request: LLMRequest) -> LLMResponse:
        return LLMResponse(
            content=_content_for(request),
            provider="fake",
            provider_model=request.model_alias or "koresim-fake-v1",
            trace_id=_trace_id(request),
            metadata={"task_type": request.task_type},
        )


def _content_for(request: LLMRequest) -> str:
    if request.task_type == "analysis":
        return json.dumps(
            {
                "summary": "상위 선택지가 명확하게 앞서며, 실행 전 후속 질문으로 거절 이유를 좁힐 수 있습니다.",
                "key_findings": [
                    {
                        "metric_key": "choice_counts",
                        "finding": "선호 선택지가 집계 지표에서 우세합니다.",
                        "evidence": "choice_counts와 choice_pct를 기준으로 판단했습니다.",
                        "confidence": 0.78,
                    }
                ],
                "segment_notes": [
                    {
                        "segment_key": "segments",
                        "note": "세그먼트별 차이는 후속 실험에서 분리 검증하는 것이 좋습니다.",
                        "evidence": "segments 집계가 결과에 포함되어 있습니다.",
                    }
                ],
            },
            ensure_ascii=False,
        )
    if request.task_type == "report":
        return json.dumps(
            {
                "headline": "우세한 메시지를 기준안으로 두고 후속 검증을 진행하세요.",
                "recommendations": [
                    {
                        "priority": "high",
                        "action": "우세 선택지를 기준안으로 랜딩/카피 초안을 만듭니다.",
                        "reason": "현재 합성 패널 집계에서 가장 높은 반응을 얻었습니다.",
                    },
                    {
                        "priority": "medium",
                        "action": "부정층에 후속 질문을 던져 가격, 신뢰, 이해도 중 핵심 장벽을 분리합니다.",
                        "reason": "거절 이유를 좁혀야 다음 실험 변수를 작게 만들 수 있습니다.",
                    },
                ],
                "risks": [
                    {
                        "severity": "medium",
                        "risk": "소표본 결과를 확정 의사결정으로 과해석할 수 있습니다.",
                        "mitigation": "표본을 키우거나 동일 시드 재실행으로 방향성을 재확인합니다.",
                    }
                ],
            },
            ensure_ascii=False,
        )
    if request.task_type == "qa":
        return json.dumps(
            {
                "passed": True,
                "severity": "directional_only",
                "warnings": [],
                "review_notes": ["로컬 fake LLM 기반 E2E 결과이므로 외부 공유 전 실제 모델로 재검증하세요."],
                "confidence": 0.72,
            },
            ensure_ascii=False,
        )
    if request.task_type == "intake_autofill":
        return json.dumps(
            {
                "project": {
                    "name": "슬립웨이브 수면 머리띠",
                    "description": "뇌파 유도로 입면 시간을 줄여주는 웨어러블 수면 밴드",
                    "product_context": (
                        "수면 유도 주파수를 재생하는 헤드밴드형 웨어러블입니다. "
                        "앱과 연동해 수면 단계를 기록하고 아침 리포트를 제공합니다. "
                        "약물 없이 입면 습관을 개선하려는 사용자를 겨냥합니다."
                    ),
                    "features": ["뇌파 유도 사운드", "수면 단계 측정", "앱 수면 리포트"],
                    "prices": ["129,000원 일시불", "월 9,900원 구독"],
                    "target_notes": "입면에 30분 이상 걸리는 25~45세 직장인",
                    "alternatives": ["멜라토닌 보조제", "수면 유도 앱", "일반 안대"],
                },
                "recommended_simulation_type": "startup_item_validation",
                "simulation_input": {
                    "item_name": "슬립웨이브",
                    "item_description": (
                        "뇌파 유도로 입면 시간을 줄여주는 웨어러블 수면 밴드로, "
                        "앱과 연동해 수면 단계를 기록하고 아침 리포트를 제공합니다."
                    ),
                    "problem_statement": "약 없이 잠들기까지 시간이 오래 걸리는 사람들의 입면 어려움",
                    "key_features": ["뇌파 유도 사운드", "수면 단계 측정", "앱 수면 리포트"],
                    "price_hint": "129,000원",
                    "alternatives": ["멜라토닌 보조제", "수면 유도 앱", "일반 안대"],
                },
                "assumptions": [
                    {"slot_id": "price_points", "value": ["99000", "129000", "159000"], "confidence": 0.55},
                    {"slot_id": "target_customers", "value": ["25~45세 수면 고민 직장인"], "confidence": 0.7},
                ],
                "notes": ["가격 후보는 시장 정보 없이 추정한 값입니다. 확인 후 수정하세요."],
            },
            ensure_ascii=False,
        )
    if request.task_type == "pricing_objection":
        return "조건: 실제 결과물 확인\n조건상태: 조건부구매\n이유: 효용을 확인하면 결제할 수 있습니다."
    if request.task_type == "pricing_anchor":
        return "유사서비스: 업무 자동화 SaaS\n월지출: 12000\n앵커범주: SaaS\n이유: 매월 쓰는 생산성 도구와 비교합니다."
    if request.task_type == "pricing_hesitation":
        return "망설임: 신뢰부족\n이유: 실제 품질과 운영 안정성을 먼저 보고 싶습니다."
    if request.task_type == "product_qa_response":
        return (
            "순위: A > B > C\n"
            "최상위: A\n"
            "최하위: C\n"
            "명확성: 4\n"
            "신뢰도: 4\n"
            "행동가능성: 5\n"
            "이유: 비교 기준이 명확해서 선택하기 쉽습니다."
        )
    if request.task_type == "validation_response":
        seed = str(request.metadata.get("persona_uuid") or "persona")
        need = _VALIDATION_NEEDS[_hash_index(seed, "need", len(_VALIDATION_NEEDS))]
        segment = _VALIDATION_SELF_SEGMENTS[
            _hash_index(seed, "segment", len(_VALIDATION_SELF_SEGMENTS))
        ]
        return (
            "문제공감: 4\n"
            "현재해결: 지금은 안대와 수면 앱으로 버팁니다.\n"
            f"니즈: {need}\n"
            f"셀프세그먼트: {segment}\n"
            "이유: 입면 시간을 확실히 줄여준다면 관심이 있습니다."
        )
    if request.task_type == "validation_structured_response":
        seed = str(request.metadata.get("persona_uuid") or "persona")
        need = _VALIDATION_NEEDS[_hash_index(seed, "need", len(_VALIDATION_NEEDS))]
        segment = _VALIDATION_SELF_SEGMENTS[
            _hash_index(seed, "segment", len(_VALIDATION_SELF_SEGMENTS))
        ]
        acceptance = _weighted_acceptance(seed)
        wtp = {"수용": 129000, "관망": 99000, "거부": 0}[acceptance]
        barrier = None
        if acceptance != "수용":
            barrier_name = _VALIDATION_BARRIERS[
                _hash_index(seed, "barrier", len(_VALIDATION_BARRIERS))
            ]
            status = "조건부수용" if _hash_index(seed, "status", 3) < 2 else "여전히거부"
            barrier = {
                "barrier": barrier_name,
                "condition_status": status,
                "condition": "임상 근거와 환불 보장이 있으면 수용하겠습니다.",
            }
        return json.dumps(
            {
                "needs_segment": {
                    "problem_empathy": 4,
                    "current_solution": "지금은 안대와 수면 앱으로 버팁니다.",
                    "need_category": need,
                    "self_segment": segment,
                    "reason": "입면 시간을 확실히 줄여준다면 관심이 있습니다.",
                },
                "competition_positioning": {
                    "alternative": "기타",
                    "alternative_satisfaction": 3,
                    "differentiation": "약간",
                    "positioning": "약물 없이 습관을 바꾸는 웨어러블로 인식합니다.",
                },
                "acceptance_price": {
                    "acceptance": acceptance,
                    "willingness_to_pay": wtp,
                    "reason": "실제 수면 개선 효과가 검증되는지가 관건입니다.",
                },
                "adoption_barrier": barrier,
            },
            ensure_ascii=False,
        )
    if request.task_type == "validation_competition":
        return (
            "대안: 기타\n"
            "대안만족도: 3\n"
            "차별점: 약간\n"
            "포지셔닝: 약물 없이 습관을 바꾸는 웨어러블로 인식합니다."
        )
    if request.task_type == "validation_acceptance":
        seed = str(request.metadata.get("persona_uuid") or "persona")
        acceptance = _weighted_acceptance(seed)
        wtp = {"수용": "129000", "관망": "99000", "거부": "0"}[acceptance]
        return (
            f"수용의향: {acceptance}\n"
            f"지불의향가격: {wtp}\n"
            "이유: 실제 수면 개선 효과가 검증되는지가 관건입니다."
        )
    if request.task_type == "validation_objection":
        seed = str(request.metadata.get("persona_uuid") or "persona")
        barrier = _VALIDATION_BARRIERS[_hash_index(seed, "barrier", len(_VALIDATION_BARRIERS))]
        status = "조건부수용" if _hash_index(seed, "status", 3) < 2 else "여전히거부"
        return (
            f"장벽: {barrier}\n"
            f"전환조건상태: {status}\n"
            "조건: 임상 근거와 환불 보장이 있으면 수용하겠습니다."
        )
    return _persona_response(request)


def _persona_response(request: LLMRequest) -> str:
    options = _option_letters(request)
    choice = _weighted_choice(options, str(request.metadata.get("persona_uuid") or "persona"))
    return (
        f"선택: {choice}\n"
        "가격별의향:\n"
        "9900원: 구매\n"
        "14900원: 관망\n"
        "19900원: 거부\n"
        "선호가격: 9900\n"
        "지불의향가격: 14900\n"
        "대표의향: 구매\n"
        "점수: 4\n"
        "설득력: 4\n"
        "명확성: 4\n"
        "공감도: 4\n"
        "의향: 구매\n"
        "세그먼트: 실용형\n"
        "니즈: 신뢰\n"
        "페인: 가격 부담\n"
        "포지셔닝: 실용적인 프리미엄\n"
        "강점: 명확성\n"
        "약점: 신뢰 검증 필요\n"
        "연상어: 신뢰, 편리\n"
        "긍정: 문제 해결이 분명함\n"
        "부정: 가격 검증 필요\n"
        "나를 잡으려면: 실제 사례 제시\n"
        "채널: 인스타그램\n"
        "메시지: 메시지 1\n"
        "반응: 클릭\n"
        f"이유: {choice}안은 효용과 신뢰를 가장 빨리 이해할 수 있어서 선택했습니다."
    )


def _option_letters(request: LLMRequest) -> list[str]:
    prompt = "\n".join(message.content for message in request.messages)
    options = re.findall(r"\[([A-J])\]", prompt)
    return options or ["A", "B"]


def _weighted_choice(options: list[str], seed: str) -> str:
    digest = int(hashlib.sha256(seed.encode("utf-8")).hexdigest()[:8], 16)
    preferred = "B" if "B" in options else options[0]
    if digest % 10 < 6:
        return preferred
    return options[digest % len(options)]


_VALIDATION_NEEDS = ["불안해소", "건강", "시간절약"]
_VALIDATION_SELF_SEGMENTS = ["적극수용층", "실용검토층", "가격민감층", "대안만족층", "무관심층"]
_VALIDATION_BARRIERS = ["신뢰부족", "가격부담", "필요성낮음"]


def _hash_index(seed: str, salt: str, modulo: int) -> int:
    digest = int(hashlib.sha256(f"{seed}:{salt}".encode("utf-8")).hexdigest()[:8], 16)
    return digest % modulo


def _weighted_acceptance(seed: str) -> str:
    bucket = int(hashlib.sha256(seed.encode("utf-8")).hexdigest()[:8], 16) % 100
    if bucket < 60:
        return "수용"
    if bucket < 85:
        return "관망"
    return "거부"


def _trace_id(request: LLMRequest) -> str:
    base = f"{request.task_type}:{request.metadata.get('persona_uuid', '')}:{request.model_alias or ''}"
    return f"fake-{hashlib.sha1(base.encode('utf-8')).hexdigest()[:12]}"
