"""Strict structured-output contract for startup item validation V2."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

NeedCategory = Literal["시간절약", "비용절감", "건강", "불안해소", "즐거움", "성취", "기타"]
SelfSegment = Literal["적극수용층", "실용검토층", "가격민감층", "대안만족층", "무관심층"]
Differentiation = Literal["뚜렷함", "약간", "없음"]
Acceptance = Literal["수용", "관망", "거부"]
BarrierCategory = Literal["가격부담", "신뢰부족", "필요성낮음", "대안만족", "사용부담", "기타"]
ConversionStatus = Literal["조건부수용", "여전히거부"]


class _StrictContract(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True, str_strip_whitespace=True)


class NeedsSegmentContract(_StrictContract):
    problem_empathy: int = Field(ge=1, le=5)
    current_solution: str = Field(min_length=1, max_length=240)
    need_category: NeedCategory
    self_segment: SelfSegment
    reason: str = Field(min_length=1, max_length=240)


class CompetitionPositioningContract(_StrictContract):
    alternative: str = Field(min_length=1, max_length=120)
    alternative_satisfaction: int = Field(ge=1, le=5)
    differentiation: Differentiation
    positioning: str = Field(min_length=1, max_length=240)


class AcceptancePriceContract(_StrictContract):
    acceptance: Acceptance
    willingness_to_pay: int = Field(ge=0)
    reason: str = Field(min_length=1, max_length=240)


class AdoptionBarrierContract(_StrictContract):
    barrier: BarrierCategory
    condition_status: ConversionStatus
    condition: str = Field(min_length=1, max_length=240)


class StartupValidationStructuredResponse(_StrictContract):
    needs_segment: NeedsSegmentContract
    competition_positioning: CompetitionPositioningContract
    acceptance_price: AcceptancePriceContract
    adoption_barrier: AdoptionBarrierContract | None

    @model_validator(mode="after")
    def validate_conditional_barrier(self) -> StartupValidationStructuredResponse:
        accepted = self.acceptance_price.acceptance == "수용"
        if accepted and self.adoption_barrier is not None:
            raise ValueError("adoption_barrier must be null when acceptance is 수용")
        if not accepted and self.adoption_barrier is None:
            raise ValueError("adoption_barrier is required when acceptance is 관망 or 거부")
        return self

    def validate_alternative(self, alternatives: list[str]) -> None:
        allowed = {*alternatives, "없음", "기타"}
        if self.competition_positioning.alternative not in allowed:
            raise ValueError("competition_positioning.alternative is not an allowed alternative")

    def to_legacy_parsed(self) -> dict[str, object]:
        needs = self.needs_segment.model_dump()
        competition = self.competition_positioning.model_dump()
        acceptance = self.acceptance_price.model_dump()
        barrier: dict[str, object] = (
            {"skipped": True}
            if self.adoption_barrier is None
            else self.adoption_barrier.model_dump()
        )
        return {
            "protocol_steps": {
                "needs_segment": needs,
                "competition_positioning": competition,
                "acceptance_price": acceptance,
                "adoption_barrier": barrier,
            },
            "primary": acceptance["acceptance"],
            "intent": acceptance["acceptance"],
            "problem_empathy": needs["problem_empathy"],
            "need_category": needs["need_category"],
            "self_segment": needs["self_segment"],
            "willingness_to_pay": acceptance["willingness_to_pay"],
            "reason": acceptance["reason"],
        }
