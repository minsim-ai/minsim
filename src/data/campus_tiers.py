"""DGIST 페르소나를 의사결정에 쓰는 계층·거주 축으로 분류한다.

education_level/housing_type 원값은 종류가 많아 교차표에 그대로 쓸 수 없다.
여기서 4x3으로 접어 계층 비교가 성립하게 만든다.
"""
from __future__ import annotations

TIER_ORDER: tuple[str, ...] = ("학부생", "석·박사 재학", "박사후연구원", "교직원")
HOUSING_ORDER: tuple[str, ...] = ("기숙사", "현풍 원룸", "대구 시내 통근")

_UNDERGRAD_LEVELS = frozenset({"학사 재학", "전문학사 재학", "전문학사"})
_GRAD_LEVELS = frozenset({"석사 재학", "박사 재학", "석박통합 재학"})
_POSTDOC_LEVELS = frozenset({"박사후연구원"})


def classify_tier(persona: dict) -> str:
    """페르소나를 4개 계층 중 하나로 분류한다.

    분류 불가는 학부생이 아니라 교직원으로 보낸다. 학부생이 표본의 다수라
    미분류를 학부생에 흡수하면 다수 계층의 수치가 조용히 오염된다.
    """
    level = (persona.get("education_level") or "").strip()
    if level in _UNDERGRAD_LEVELS:
        return "학부생"
    if level in _GRAD_LEVELS:
        return "석·박사 재학"
    if level in _POSTDOC_LEVELS:
        return "박사후연구원"
    return "교직원"


def classify_housing(persona: dict) -> str:
    """거주형태를 3개 축으로 분류한다. 캠퍼스 접근성이 기준이다."""
    housing = (persona.get("housing_type") or "").strip()
    if "기숙사" in housing:
        return "기숙사"
    if "원룸" in housing or "관사" in housing:
        return "현풍 원룸"
    return "대구 시내 통근"
