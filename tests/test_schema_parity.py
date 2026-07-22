import re
from pathlib import Path

from src.api.schemas import (
    CreativeTestingInput,
    DemoPreset,
    ErrorCode,
    ErrorResponse,
    RawPersonaResult,
    RunCreateRequest,
    RunCreateResponse,
    RunEventType,
    RunResultEnvelope,
    RunSnapshot,
    RunStatus,
    SimulationType,
    TargetFilterModel,
)

PROJECT_ROOT = Path(__file__).resolve().parents[1]
API_TYPES = (PROJECT_ROOT / "frontend" / "src" / "types" / "api.ts").read_text(
    encoding="utf-8"
)


def _ts_union_values(type_name: str) -> set[str]:
    match = re.search(rf"export type {type_name} =(?P<body>.*?)(?:\n\n|$)", API_TYPES, re.S)
    assert match, f"Missing TypeScript union: {type_name}"
    return set(re.findall(r"'([^']+)'", match.group("body")))


def _ts_interface_fields(interface_name: str) -> set[str]:
    match = re.search(rf"export interface {interface_name} \{{(?P<body>.*?)\n\}}", API_TYPES, re.S)
    assert match, f"Missing TypeScript interface: {interface_name}"
    return set(re.findall(r"^\s*([A-Za-z_][A-Za-z0-9_]*)\??:", match.group("body"), re.M))


def _pydantic_fields(model: type) -> set[str]:
    return set(model.model_fields)


def test_enum_unions_match_backend_schema() -> None:
    assert _ts_union_values("SimulationType") == {item.value for item in SimulationType}
    assert _ts_union_values("RunStatus") == {item.value for item in RunStatus}
    assert _ts_union_values("RunEventType") == {item.value for item in RunEventType}
    assert _ts_union_values("ErrorCode") == {item.value for item in ErrorCode}


def test_interface_fields_match_backend_schema() -> None:
    mapping = {
        "TargetFilter": TargetFilterModel,
        "CreativeTestingInput": CreativeTestingInput,
        "DemoPreset": DemoPreset,
        "RunCreateRequest": RunCreateRequest,
        "RunCreateResponse": RunCreateResponse,
        "ErrorResponse": ErrorResponse,
        "RunSnapshot": RunSnapshot,
        "RawPersonaResult": RawPersonaResult,
        "RunResultEnvelope": RunResultEnvelope,
    }

    for ts_name, py_model in mapping.items():
        assert _ts_interface_fields(ts_name) == _pydantic_fields(py_model), ts_name


def test_campus_policy_metrics_parity() -> None:
    """campus_policy 결과 스키마는 백엔드와 프론트가 같은 필드를 가져야 한다."""
    from src.api.schemas import CampusPolicyMetrics

    assert _pydantic_fields(CampusPolicyMetrics) == _ts_interface_fields("CampusPolicyMetrics")


def test_campus_policy_nested_models_parity() -> None:
    from src.api.schemas import (
        ConditionCluster,
        OppositionReason,
        RegionBreakdown,
        RegionRow,
        SamplingMeta,
        StanceCount,
        TierHousingCell,
    )

    for model in (
        TierHousingCell,
        RegionRow,
        RegionBreakdown,
        StanceCount,
        ConditionCluster,
        OppositionReason,
        SamplingMeta,
    ):
        assert _pydantic_fields(model) == _ts_interface_fields(model.__name__), model.__name__


def test_campus_priority_metrics_parity() -> None:
    from src.api.schemas import CampusPriorityMetrics

    assert _pydantic_fields(CampusPriorityMetrics) == _ts_interface_fields("CampusPriorityMetrics")


def test_campus_priority_nested_models_parity() -> None:
    from src.api.schemas import PriorityItemRow, PriorityReason, RankInversion, TierRanking

    for model in (PriorityItemRow, TierRanking, RankInversion, PriorityReason):
        assert _pydantic_fields(model) == _ts_interface_fields(model.__name__), model.__name__


def test_campus_policy_condition_models_parity() -> None:
    from src.api.schemas import ConditionCategory, ConditionConflict, DominantStance

    for model in (ConditionCategory, ConditionConflict, DominantStance):
        assert _pydantic_fields(model) == _ts_interface_fields(model.__name__), model.__name__


def test_unresolved_choice_parity() -> None:
    from src.api.schemas import UnresolvedChoice

    assert _pydantic_fields(UnresolvedChoice) == _ts_interface_fields("UnresolvedChoice")


def test_campus_policy_metrics_parity_after_split() -> None:
    from src.api.schemas import CampusPolicyMetrics

    fields = _pydantic_fields(CampusPolicyMetrics)
    assert "tier_spread" in fields
    assert fields == _ts_interface_fields("CampusPolicyMetrics")
