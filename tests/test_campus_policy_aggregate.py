from src.simulations.campus_policy import (
    LOW_CONFIDENCE_MIN_SAMPLE,
    aggregate_campus_policy,
)


class FakeSimResult:
    def __init__(self, persona):
        self.persona = persona


def persona(education_level, housing, province="대구"):
    return {
        "uuid": f"{education_level}-{housing}-{province}",
        "education_level": education_level,
        "occupation": "DGIST 구성원",
        "housing_type": housing,
        "province": province,
    }


def make(rows):
    return [FakeSimResult(p) for p, _ in rows], [answer for _, answer in rows]


def answer(stance, intensity, condition=None, reason="이유", category=None):
    from src.simulations.campus_policy import NONE_CATEGORY, is_negated_condition

    return {
        "stance": stance,
        "reason": reason,
        "condition": condition,
        "condition_category": category or NONE_CATEGORY,
        "negated": is_negated_condition(condition),
        "intensity": intensity,
    }


DORM_UNDERGRAD = ("학사 재학", "기숙사(비슬빌리지)")


def test_stance_distribution_sums_to_total():
    raw, parsed = make([
        (persona(*DORM_UNDERGRAD), answer("찬성", 5)),
        (persona(*DORM_UNDERGRAD), answer("반대", 4)),
        (persona("석사 재학", "현풍 원룸"), answer("찬성", 3, "경비 상주")),
        (persona("학사", "자가"), answer("판단유보", 1)),
    ])
    dist = aggregate_campus_policy({}, raw, parsed)["stance_distribution"]
    assert dist["찬성"]["count"] == 2
    assert dist["반대"]["count"] == 1
    assert dist["판단유보"]["count"] == 1
    assert sum(item["count"] for item in dist.values()) == 4


def test_parse_failures_excluded_from_distribution():
    raw, parsed = make([
        (persona(*DORM_UNDERGRAD), answer("찬성", 5)),
        (persona(*DORM_UNDERGRAD), None),
    ])
    out = aggregate_campus_policy({}, raw, parsed)
    assert sum(item["count"] for item in out["stance_distribution"].values()) == 1


def test_net_support_is_intensity_weighted():
    """강도 5 찬성과 강도 1 반대가 상쇄되면 안 된다."""
    raw, parsed = make([
        (persona(*DORM_UNDERGRAD), answer("찬성", 5)),
        (persona(*DORM_UNDERGRAD), answer("반대", 1)),
    ])
    assert aggregate_campus_policy({}, raw, parsed)["net_support"] > 0


def test_strong_opposition_counts_intensity_4_and_5_only():
    raw, parsed = make([
        (persona(*DORM_UNDERGRAD), answer("반대", 5)),
        (persona(*DORM_UNDERGRAD), answer("반대", 2)),
        (persona(*DORM_UNDERGRAD), answer("찬성", 5)),
        (persona(*DORM_UNDERGRAD), answer("찬성", 5)),
    ])
    assert aggregate_campus_policy({}, raw, parsed)["strong_opposition_pct"] == 25.0


def test_low_confidence_cells_are_flagged_not_hidden():
    raw, parsed = make([(persona("학사", "자가"), answer("반대", 4))])
    cell = aggregate_campus_policy({}, raw, parsed)["tier_housing_matrix"]["교직원"]["대구 시내 통근"]
    assert cell["n"] == 1
    assert cell["low_confidence"] is True
    assert "net_support" in cell


def test_low_confidence_threshold_is_the_shared_constant():
    rows = [(persona(*DORM_UNDERGRAD), answer("찬성", 3))] * LOW_CONFIDENCE_MIN_SAMPLE
    raw, parsed = make(rows)
    cell = aggregate_campus_policy({}, raw, parsed)["tier_housing_matrix"]["학부생"]["기숙사"]
    assert cell["n"] == LOW_CONFIDENCE_MIN_SAMPLE
    assert cell["low_confidence"] is False


def test_condition_clusters_only_from_conditional_support():
    raw, parsed = make([
        (persona("석사 재학", "현풍 원룸"), answer("찬성", 3, "야간 경비 상주")),
        (persona("석사 재학", "현풍 원룸"), answer("찬성", 3, "야간 경비 상주")),
        (persona("석사 재학", "현풍 원룸"), answer("반대", 5, None, "비용이 크다")),
    ])
    clusters = aggregate_campus_policy({}, raw, parsed)["condition_clusters"]
    assert clusters[0]["count"] == 2
    assert "경비" in clusters[0]["condition"]


def test_opposition_reasons_only_from_opposers():
    raw, parsed = make([
        (persona("학사", "자가"), answer("반대", 5, None, "야간 근무 부담")),
        (persona(*DORM_UNDERGRAD), answer("찬성", 5, None, "집중이 잘 된다")),
    ])
    reasons = [
        item["reason"] for item in aggregate_campus_policy({}, raw, parsed)["opposition_reasons"]
    ]
    assert "야간 근무 부담" in reasons
    assert "집중이 잘 된다" not in reasons


def test_region_breakdown_is_labeled_as_return_cost_proxy():
    raw, parsed = make([
        (persona(*DORM_UNDERGRAD, province="경기"), answer("찬성", 5)),
        (persona(*DORM_UNDERGRAD, province="대구"), answer("반대", 3)),
    ])
    region = aggregate_campus_policy({}, raw, parsed)["region_breakdown"]
    assert region["interpretation"] == "return_cost_proxy"
    assert {row["province"] for row in region["rows"]} == {"경기", "대구"}


def test_bias_warning_when_tradeoffs_missing():
    raw, parsed = make([(persona(*DORM_UNDERGRAD), answer("찬성", 5))])
    assert aggregate_campus_policy({"tradeoffs": ""}, raw, parsed)["bias_warning"] is not None
    assert aggregate_campus_policy({"tradeoffs": "연 1.2억"}, raw, parsed)["bias_warning"] is None


def test_tier_weights_reweight_overall_distribution():
    """층화로 과대표집된 계층이 전체 찬성률을 끌고 가면 안 된다."""
    raw, parsed = make([
        (persona(*DORM_UNDERGRAD), answer("찬성", 5)),
        (persona("학사", "자가"), answer("반대", 5)),
    ])
    unweighted = aggregate_campus_policy({}, raw, parsed)
    weighted = aggregate_campus_policy(
        {
            "_tier_weights": {
                "학부생": 2.0,
                "석·박사 재학": 1.0,
                "박사후연구원": 1.0,
                "교직원": 0.2,
            }
        },
        raw,
        parsed,
    )
    assert weighted["net_support"] > unweighted["net_support"]



def test_condition_categories_are_counted_not_free_text():
    """30명이 30개 문자열을 내도 범주로 세면 몇 개로 수렴한다."""
    rows = [
        (persona(*DORM_UNDERGRAD), answer("찬성", 3, f"재원 조달 방식 {i}", category="재원"))
        for i in range(5)
    ] + [(persona("석사 재학", "현풍 원룸"), answer("찬성", 3, "CCTV 설치", category="안전"))]
    out = aggregate_campus_policy({}, *make(rows))
    cats = {row["category"]: row["count"] for row in out["condition_categories"]}
    assert cats == {"재원": 5, "안전": 1}
    assert out["condition_categories"][0]["representative"]


def test_other_rate_surfaces_taxonomy_failure():
    rows = [(persona(*DORM_UNDERGRAD), answer("찬성", 3, "무언가", category="기타"))] * 3 + [
        (persona(*DORM_UNDERGRAD), answer("찬성", 3, "재원", category="재원"))
    ]
    assert aggregate_campus_policy({}, *make(rows))["other_rate"] == 75.0


def test_negated_conditions_are_counted():
    rows = [(persona(*DORM_UNDERGRAD), answer("찬성", 3, "삭감 없이 시행 시 반대", category="재원"))]
    assert aggregate_campus_policy({}, *make(rows))["negated_condition_count"] == 1


def test_conflict_fires_only_when_both_sides_have_support():
    both = [(persona(*DORM_UNDERGRAD), answer("찬성", 3, "a", category="삭감없이"))] * 5 + [
        (persona(*DORM_UNDERGRAD), answer("찬성", 3, "b", category="삭감허용"))
    ] * 5
    one = [(persona(*DORM_UNDERGRAD), answer("찬성", 3, "a", category="삭감없이"))] * 10
    conflicts = [["삭감없이", "삭감허용"]]
    assert aggregate_campus_policy({"condition_conflicts": conflicts}, *make(both))["condition_conflicts"]
    assert aggregate_campus_policy({"condition_conflicts": conflicts}, *make(one))["condition_conflicts"] == []


def test_dominant_stance_surfaces_when_one_stance_swamps():
    """순찬성 하나로는 '95%가 조건부'라는 사실이 덮인다."""
    rows = [(persona(*DORM_UNDERGRAD), answer("찬성", 3, "c", category="재원"))] * 9 + [
        (persona(*DORM_UNDERGRAD), answer("반대", 5))
    ]
    out = aggregate_campus_policy({}, *make(rows))
    assert out["dominant_stance"] == {"stance": "찬성", "pct": 90.0}


def test_no_dominant_stance_when_split():
    rows = [(persona(*DORM_UNDERGRAD), answer("찬성", 3))] * 5 + [
        (persona(*DORM_UNDERGRAD), answer("반대", 3))
    ] * 5
    assert aggregate_campus_policy({}, *make(rows))["dominant_stance"] is None


def test_tier_spread_reflects_confident_cell_range():
    """계층 비교 성립 여부는 dominant_stance가 아니라 셀 간 폭이 정한다."""
    from src.simulations.campus_policy import LOW_CONFIDENCE_MIN_SAMPLE

    n = LOW_CONFIDENCE_MIN_SAMPLE
    rows = [(persona(*DORM_UNDERGRAD), answer("찬성", 5))] * n + [
        (persona("학사", "자가"), answer("반대", 5))
    ] * n
    out = aggregate_campus_policy({}, *make(rows))
    assert out["tier_spread"] > 10.0
    assert out["tier_spread_min"] == 10.0


def test_tier_spread_is_zero_when_only_one_confident_cell():
    from src.simulations.campus_policy import LOW_CONFIDENCE_MIN_SAMPLE

    rows = [(persona(*DORM_UNDERGRAD), answer("찬성", 3))] * LOW_CONFIDENCE_MIN_SAMPLE
    assert aggregate_campus_policy({}, *make(rows))["tier_spread"] == 0.0
