import pytest

from src.services.tradeoff_validation import detect_unresolved_choice


def test_detects_unresolved_either_or():
    """200명 전원 조건부찬성을 만든 바로 그 입력."""
    out = detect_unresolved_choice("연 1.2억 증가. 학생회비 인상 또는 타 복지예산 삭감 중 택일.")
    assert out["unresolved"] is True
    assert len(out["branches"]) == 2
    assert "갈래 질문" in out["reason"]


def test_resolved_funding_is_not_flagged():
    out = detect_unresolved_choice("연 1.2억 증가. 전액 본예산 재배분으로 충당하며 학생회비는 동결한다.")
    assert out["unresolved"] is False


def test_resolved_burden_is_not_flagged():
    out = detect_unresolved_choice("연 1.2억 증가. 학생회비를 1인당 연 2만원 인상해 충당한다.")
    assert out["unresolved"] is False


def test_or_without_deferral_marker_is_not_flagged():
    """'또는'이 선택 유보 맥락이 아니면 오탐하지 않는다."""
    out = detect_unresolved_choice("야간 경비 또는 CCTV 같은 안전 설비 비용이 추가된다.")
    assert out["unresolved"] is False


def test_deferral_marker_without_branches_is_not_flagged():
    out = detect_unresolved_choice("재원은 아직 정해지지 않았다.")
    assert out["unresolved"] is False


@pytest.mark.parametrize("value", ["", "   ", None])
def test_empty_input_is_not_flagged(value):
    assert detect_unresolved_choice(value)["unresolved"] is False
