"""페르소나 풀에 따라 응답자 분류 축을 고른다.

DGIST 풀은 학내 신분·거주 축이 의미가 있다. 전국민 풀에 그 축을 쓰면
education_level이 맞지 않아 전원이 '교직원'·'대구 시내 통근'으로 뭉개진다.
"""
from __future__ import annotations

from typing import Any

from src.data.campus_tiers import (
    HOUSING_ORDER as CAMPUS_HOUSING_ORDER,
)
from src.data.campus_tiers import (
    TIER_ORDER as CAMPUS_TIER_ORDER,
)
from src.data.campus_tiers import (
    classify_housing as classify_campus_housing,
)
from src.data.campus_tiers import (
    classify_tier as classify_campus_tier,
)
from src.data.pools import DEFAULT_PERSONA_POOL

AGE_TIER_ORDER: tuple[str, ...] = ("10대", "20대", "30대", "40대", "50대", "60대", "70대+")
SEX_ORDER: tuple[str, ...] = ("남자", "여자", "기타")

_MALE = frozenset(
    {
        "남자",
        "남성",
        "Male",
        "male",
        "M",
        "Masculino",
        "Homme",
        "Nam",
        "Man",
        "Mannelijk",
        "Mann",
        "Masculin",
    }
)
_FEMALE = frozenset(
    {
        "여자",
        "여성",
        "Female",
        "female",
        "F",
        "Feminino",
        "Femenino",
        "Femme",
        "Nữ",
        "Vrouw",
        "Vrouwelijk",
        "Frau",
        "Féminin",
    }
)


def normalize_pool(pool: str | None) -> str:
    return (pool or DEFAULT_PERSONA_POOL).strip().lower() or DEFAULT_PERSONA_POOL


def is_campus_pool(pool: str | None) -> bool:
    return normalize_pool(pool) == "dgist"


def pool_from_input(input_data: dict[str, Any] | None) -> str:
    if not input_data:
        return DEFAULT_PERSONA_POOL
    return normalize_pool(input_data.get("_persona_pool"))


def respondent_role_line(pool: str | None, *, for_survey: bool = False) -> str:
    """프롬프트 첫 줄. 풀이 전국민이면 DGIST 역할 강제를 하지 않는다."""
    if is_campus_pool(pool):
        if for_survey:
            return "당신은 DGIST 구성원입니다. 아래 설문의 응답자입니다."
        return "당신은 DGIST 구성원입니다."
    if for_survey:
        return "당신은 아래 설문의 응답자입니다."
    return "당신은 일반 시민 응답자입니다."


def primary_axis_order(pool: str | None) -> tuple[str, ...]:
    return CAMPUS_TIER_ORDER if is_campus_pool(pool) else AGE_TIER_ORDER


def secondary_axis_order(pool: str | None) -> tuple[str, ...]:
    return CAMPUS_HOUSING_ORDER if is_campus_pool(pool) else SEX_ORDER


def primary_axis_label(pool: str | None) -> str:
    return "소속" if is_campus_pool(pool) else "연령대"


def secondary_axis_label(pool: str | None) -> str:
    return "거주" if is_campus_pool(pool) else "성별"


def classify_primary(persona: dict[str, Any], pool: str | None) -> str:
    if is_campus_pool(pool):
        return classify_campus_tier(persona)
    return _age_bucket(persona.get("age"))


def classify_secondary(persona: dict[str, Any], pool: str | None) -> str:
    if is_campus_pool(pool):
        return classify_campus_housing(persona)
    return _sex_bucket(persona.get("sex"))


def pool_display_label(pool: str | None) -> str:
    key = normalize_pool(pool)
    if key == "dgist":
        return "DGIST 구성원"
    return "전 국민"


def _age_bucket(age: Any) -> str:
    if not isinstance(age, int):
        try:
            age = int(age)  # type: ignore[arg-type]
        except (TypeError, ValueError):
            return "30대"
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


def _sex_bucket(sex: Any) -> str:
    value = str(sex or "").strip()
    if value in _MALE:
        return "남자"
    if value in _FEMALE:
        return "여자"
    return "기타"
