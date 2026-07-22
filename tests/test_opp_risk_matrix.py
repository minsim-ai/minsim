"""A-3: backend opp-risk matrix port and deterministic verdicts."""
from src.simulations.opp_risk import (
    build_opp_risk_matrix,
    deterministic_generation_verdicts,
    deterministic_verdict,
)

GOLDEN_ENVELOPE = {
    "metrics": {"choice_counts": {"A": 3, "B": 7}},
    "segments": {
        "breakdown_by_age": {
            "30대": {"A": 1, "B": 5},
            "50대": {"A": 2, "B": 2},
        }
    },
    "raw_results": [
        {
            "persona": {"age": 34},
            "response": "선택: B\n점수: 5\n이유: 효용이 분명해서 좋습니다.",
            "parsed": {"score": 5, "reason": "효용이 분명해서 좋습니다."},
        },
        {
            "persona": {"age": 36},
            "response": "선택: B\n점수: 4\n이유: 신뢰할 수 있어 보입니다.",
            "parsed": {"score": 4, "reason": "신뢰할 수 있어 보입니다."},
        },
        {
            "persona": {"age": 52},
            "response": "선택: A\n점수: 2\n이유: 가격이 부담됩니다.",
            "parsed": {"score": 2, "reason": "가격이 부담됩니다."},
        },
        {
            "persona": {"age": 55},
            "response": "선택: A\n점수: 3\n이유: 이미 쓰던 대안으로 충분합니다.",
            "parsed": {"score": 3, "reason": "이미 쓰던 대안으로 충분합니다."},
        },
        {
            "persona": {"age": 57},
            "response": "",
            "parsed": None,
            "error": "PARSING_FAILED",
        },
    ],
}


def test_build_opp_risk_matrix_golden() -> None:
    matrix = build_opp_risk_matrix(GOLDEN_ENVELOPE)

    assert matrix is not None
    assert matrix["version"] == "opp-risk/v1"
    assert [col["k"] for col in matrix["cols"]] == [
        "수용도",
        "니즈 강도",
        "가격 저항",
        "신뢰 우려",
        "경쟁 압력",
    ]
    assert [row["seg"] for row in matrix["rows"]] == ["30대", "50대"]
    assert [row["n"] for row in matrix["rows"]] == [6, 4]
    for row in matrix["rows"]:
        assert len(row["v"]) == 5
        assert all(0 <= value <= 100 for value in row["v"])
    thirties, fifties = matrix["rows"]
    # 30대 responded positively (score 4-5, winner B dominant) → higher acceptance.
    assert thirties["v"][0] > fifties["v"][0]
    # 50대 reasons mention 가격/대안 → visible price & competition pressure.
    assert fifties["v"][2] > 0
    assert fifties["v"][4] > thirties["v"][4]
    assert thirties["sweet"] is True

    # Deterministic re-run yields identical output.
    assert build_opp_risk_matrix(GOLDEN_ENVELOPE) == matrix


def test_build_opp_risk_matrix_requires_age_segments() -> None:
    assert build_opp_risk_matrix({"segments": {}, "raw_results": []}) is None
    assert (
        build_opp_risk_matrix(
            {"segments": {"breakdown_by_age": {"30대": {}}}, "raw_results": []}
        )
        is None
    )


def test_deterministic_verdict_labels() -> None:
    sweet_low_risk = {"seg": "30대", "v": [80, 75, 20, 15, 30], "sweet": True}
    assert deterministic_verdict(sweet_low_risk)["verdict"] == "매력적"

    conditional = {"seg": "40대", "v": [50, 65, 70, 30, 40], "sweet": False}
    verdict = deterministic_verdict(conditional)
    assert verdict["verdict"] == "조건부"
    assert "가격 저항" in verdict["rationale"]

    hold = {"seg": "60대", "v": [30, 30, 60, 50, 70], "sweet": False}
    assert deterministic_verdict(hold)["verdict"] == "보류"


def test_deterministic_generation_verdicts_from_matrix() -> None:
    matrix = build_opp_risk_matrix(GOLDEN_ENVELOPE)
    verdicts, overall = deterministic_generation_verdicts(matrix)

    assert len(verdicts) == 2
    assert {item["segment_key"] for item in verdicts} == {"30대", "50대"}
    assert all(item["verdict"] in {"매력적", "조건부", "보류"} for item in verdicts)
    assert all(item["rationale"] for item in verdicts)
    assert overall is not None
    assert "30대" in overall["rationale"]

    assert deterministic_generation_verdicts(None) == ([], None)
    assert deterministic_generation_verdicts({"rows": []}) == ([], None)
