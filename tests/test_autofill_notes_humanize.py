"""Autofill notes must never show internal JSON field keys to users."""

from src.api.schemas import SimulationType
from src.services.autofill_service import _humanize_autofill_note, normalize_autofill


def test_humanize_autofill_note_replaces_slash_joined_keys() -> None:
    raw = (
        "사용자 초안에 product_context/features/prices/target_notes/alternatives가 "
        "비어 있어, 복지 항목 우선순위 조사에 필요한 최소 문맥과 타깃을 채웠습니다."
    )
    cleaned = _humanize_autofill_note(raw)
    assert "product_context" not in cleaned
    assert "target_notes" not in cleaned
    assert "features" not in cleaned
    assert "배경 정보" in cleaned
    assert "응답자 메모" in cleaned


def test_normalize_autofill_humanizes_notes() -> None:
    result = normalize_autofill(
        {
            "project": {
                "name": "복지 우선순위",
                "description": "복지 항목 우선순위",
                "product_context": "배경",
                "features": [],
                "prices": [],
                "target_notes": "학생·교직원",
                "alternatives": [],
            },
            "recommended_simulation_type": "campus_priority",
            "simulation_input": {"items": ["a", "b"]},  # invalid → validation note
            "notes": [
                "features/prices/alternatives가 비어 있어 범주형 항목을 제안했습니다.",
            ],
            "assumptions": [],
        },
        requested_type=None,
        provider="fake",
        provider_model="fake",
        trace_id=None,
    )
    joined = " ".join(result.notes)
    assert "product_context" not in joined
    assert "features" not in joined
    assert "prices" not in joined
    assert "target_notes" not in joined
    assert "alternatives" not in joined or "대안" in joined
    assert result.recommended_simulation_type == SimulationType.CAMPUS_PRIORITY
