"""A-4: bounded segment-tag normalization, merging, and interest split."""
from collections import Counter

from src.simulations.generic_suite import _aggregate_market_segmentation
from src.simulations.tagging import (
    RESIDUAL_TAG,
    SEGMENT_TAG_CAP,
    merge_similar_tags,
    normalize_tag,
)


def test_normalize_tag_collapses_spacing_and_punctuation() -> None:
    assert normalize_tag("  바쁜   건강관리족!! ") == "바쁜 건강관리족"
    assert normalize_tag("“감성 선물족”") == "감성 선물족"
    assert normalize_tag("실용파들") == "실용파"


def test_merge_similar_tags_merges_variants_into_larger_bucket() -> None:
    counts = Counter(
        {
            "감성 선물 준비 직장인": 9,
            "감성선물 준비 직장인": 3,
            "가성비 중시형": 6,
            "가성비중시형": 2,
        }
    )

    merged, aliases = merge_similar_tags(counts, cap=8)

    assert merged["감성 선물 준비 직장인"] == 12
    assert merged["가성비 중시형"] == 8
    assert aliases["감성선물 준비 직장인"] == "감성 선물 준비 직장인"
    assert RESIDUAL_TAG not in merged


REALISTIC_LABELS = [
    "감성 선물 준비 직장인",
    "가성비 중시 자취생",
    "건강 관리 시니어",
    "추억 선물 사는 중년층",
    "트렌드 민감 대학생",
    "프리미엄 선호 전문직",
    "육아 맞벌이 부부",
    "혼술 즐기는 1인가구",
    "운동 루틴 관리족",
    "캠핑 마니아 가족",
    "재테크 공부 사회초년생",
    "브랜드 충성 고객",
    "비교 검색 신중파",
    "즉흥 구매 얼리어답터",
]


def test_merge_similar_tags_enforces_hard_cap_with_residual() -> None:
    counts = Counter({label: 40 - index for index, label in enumerate(REALISTIC_LABELS)})

    merged, aliases = merge_similar_tags(counts, cap=SEGMENT_TAG_CAP)

    named = [label for label in merged if label != RESIDUAL_TAG]
    assert len(named) <= SEGMENT_TAG_CAP
    assert merged[RESIDUAL_TAG] > 0
    assert sum(merged.values()) == sum(counts.values())
    assert all(target == RESIDUAL_TAG or target in merged for target in aliases.values())

    # Deterministic across runs.
    assert merge_similar_tags(counts, cap=SEGMENT_TAG_CAP) == (merged, aliases)


def test_aggregate_market_segmentation_bounds_tags_and_splits_interest() -> None:
    parsed_results = []
    for index in range(30):
        label = REALISTIC_LABELS[index % len(REALISTIC_LABELS)]
        parsed_results.append(
            {
                "primary": label,
                "segment": label,
                "interest": "관심있음",
                "need": "핵심 효용",
                "pain": "가격",
                "reason": "필요해서요.",
            }
        )
    for _ in range(4):
        parsed_results.append(
            {
                "primary": "관심없음",
                "segment": "관심없음",
                "interest": "관심없음",
                "need": "",
                "pain": "필요를 못 느낌",
                "reason": "안 씁니다.",
            }
        )
    parsed_results.append(
        {
            "primary": "가격저항",
            "segment": "가격저항",
            "interest": "가격저항",
            "need": "",
            "pain": "가격",
            "reason": "너무 비쌉니다.",
        }
    )
    raw_results = [type("Raw", (), {"persona": {"age": 30 + i, "sex": "여성", "province": "서울"}})() for i in range(len(parsed_results))]

    aggregate = _aggregate_market_segmentation(
        {"category": "건강 간식", "core_questions": ["?"]}, raw_results, parsed_results
    )

    metrics = aggregate["metrics"]
    named = [label for label in metrics["segment_counts"] if label != RESIDUAL_TAG]
    assert len(named) <= SEGMENT_TAG_CAP
    assert metrics["interest_breakdown"] == {"관심있음": 30, "관심없음": 4, "가격저항": 1}
    # Non-interest responses never become segments or the recommended target.
    assert "관심없음" not in metrics["segment_counts"]
    assert metrics["recommended_first_target"] not in {"관심없음", "가격저항", RESIDUAL_TAG}
