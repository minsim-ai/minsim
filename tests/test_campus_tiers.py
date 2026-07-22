import pytest

from src.data.campus_tiers import (
    HOUSING_ORDER,
    TIER_ORDER,
    classify_housing,
    classify_tier,
)


@pytest.mark.parametrize(
    "education_level,occupation,expected",
    [
        ("학사 재학", "DGIST 기초학부 학부생(뇌과학 관심)", "학부생"),
        ("전문학사", "DGIST 기초학부 학부생(화학 관심)", "학부생"),
        ("석사 재학", "DGIST 에너지공학 석사과정생", "석·박사 재학"),
        ("석박통합 재학", "DGIST 뇌과학 통합과정생", "석·박사 재학"),
        ("박사 재학", "DGIST 뇌과학 박사과정생", "석·박사 재학"),
        ("박사후연구원", "DGIST 뇌과학 연구원", "박사후연구원"),
        ("학사", "DGIST 입학홍보 행정직원", "교직원"),
        ("박사", "DGIST 신물질과학전공 교수", "교직원"),
    ],
)
def test_classify_tier(education_level, occupation, expected):
    persona = {"education_level": education_level, "occupation": occupation}
    assert classify_tier(persona) == expected


def test_classify_tier_falls_back_to_staff_for_unknown():
    """분류 불가를 조용히 학부생으로 흡수하면 계층 비교가 오염된다."""
    assert classify_tier({"education_level": "", "occupation": ""}) == "교직원"


@pytest.mark.parametrize(
    "housing_type,expected",
    [
        ("기숙사(비슬빌리지)", "기숙사"),
        ("기숙사/원룸 혼합", "기숙사"),
        ("현풍 원룸", "현풍 원룸"),
        ("교직원 관사/임시 거주", "현풍 원룸"),
        ("대구 시내 가족 주거지", "대구 시내 통근"),
        ("대구 달성군 아파트", "대구 시내 통근"),
        ("자가", "대구 시내 통근"),
    ],
)
def test_classify_housing(housing_type, expected):
    assert classify_housing({"housing_type": housing_type}) == expected


def test_orders_are_stable():
    assert TIER_ORDER == ("학부생", "석·박사 재학", "박사후연구원", "교직원")
    assert HOUSING_ORDER == ("기숙사", "현풍 원룸", "대구 시내 통근")
