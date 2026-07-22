import pytest
from pydantic import ValidationError

from src.api.schemas import (
    CreativeTestingInput,
    DemoPreset,
    ErrorCode,
    ErrorResponse,
    RawPersonaResult,
    RunCreateRequest,
    RunEventType,
    RunResultEnvelope,
    RunStatus,
    SimulationType,
    TargetFilterModel,
)


def test_valid_creative_testing_request_defaults_seed() -> None:
    request = RunCreateRequest(
        simulation_type=SimulationType.CREATIVE_TESTING,
        input={"creatives": ["A안", "B안"]},
    )

    assert request.sample_size == 50
    assert request.seed == 42
    assert request.target_filter == TargetFilterModel()
    assert isinstance(request.input, CreativeTestingInput)
    assert request.input.creatives == ["A안", "B안"]


def test_run_create_request_accepts_intake_context() -> None:
    request = RunCreateRequest(
        simulation_type=SimulationType.CREATIVE_TESTING,
        input={"creatives": ["A안", "B안"]},
        intake_context={
            "intake_session_id": "intake-test",
            "task_frame": {"primarySimulationType": "creative_testing"},
            "provenance": {"user_provided": {"product_description": "AI 리서치 SaaS"}},
            "safe_intake_summary": {
                "user_goal": "상세페이지 헤드라인을 테스트하고 싶어요.",
                "decision_question": "어떤 문구가 설득력 있는가?",
                "simulation_type": "creative_testing",
                "user_provided": {"product_description": "AI 리서치 SaaS"},
            },
        },
    )

    assert request.intake_context is not None
    assert request.intake_context.safe_intake_summary.user_provided == {
        "product_description": "AI 리서치 SaaS"
    }


def test_run_create_request_rejects_unreviewed_intake_assumptions() -> None:
    with pytest.raises(ValidationError, match="must be reviewed"):
        RunCreateRequest(
            simulation_type=SimulationType.CREATIVE_TESTING,
            input={"creatives": ["A안", "B안"]},
            intake_context={
                "intake_session_id": "intake-unreviewed",
                "safe_intake_summary": {
                    "simulation_type": "creative_testing",
                    "unreviewed_assumption_count": 1,
                },
            },
        )


def test_run_create_request_rejects_unapproved_model_alias() -> None:
    with pytest.raises(ValidationError, match="not allowed"):
        RunCreateRequest(
            simulation_type=SimulationType.CREATIVE_TESTING,
            input={"creatives": ["A안", "B안"]},
            model_alias="unapproved-expensive-model",
        )


def test_sample_size_at_configured_limit_passes() -> None:
    request = RunCreateRequest(
        simulation_type=SimulationType.CREATIVE_TESTING,
        input={"creatives": ["A안", "B안"]},
        sample_size=2000,
    )
    assert request.sample_size == 2000


def test_sample_size_above_configured_limit_fails() -> None:
    with pytest.raises(ValidationError):
        RunCreateRequest(
            simulation_type=SimulationType.CREATIVE_TESTING,
            input={"creatives": ["A안", "B안"]},
            sample_size=2001,
        )


def test_one_creative_fails() -> None:
    with pytest.raises(ValidationError):
        RunCreateRequest(
            simulation_type=SimulationType.CREATIVE_TESTING,
            input={"creatives": ["A안"]},
        )


def test_empty_creative_fails() -> None:
    with pytest.raises(ValidationError):
        RunCreateRequest(
            simulation_type=SimulationType.CREATIVE_TESTING,
            input={"creatives": ["A안", "   "]},
        )


def test_invalid_age_range_fails() -> None:
    with pytest.raises(ValidationError):
        TargetFilterModel(age_min=50, age_max=30)


def test_run_status_contains_interrupted_and_canceled() -> None:
    values = {status.value for status in RunStatus}

    assert "interrupted" in values
    assert "canceled" in values


def test_demo_preset_validates_creative_testing_input_and_builds_run_request() -> None:
    preset = DemoPreset(
        id="demo",
        title="Demo",
        description="Demo preset",
        simulation_type=SimulationType.CREATIVE_TESTING,
        input={"creatives": ["A", "B"]},
        target_filter=TargetFilterModel(age_min=20, age_max=39),
        sample_size=10,
        seed=7,
        fallback_simulation_type=SimulationType.PRICE_OPTIMIZATION,
        fallback_reason="Native engine is pending.",
    )

    assert isinstance(preset.input, CreativeTestingInput)
    run_request = preset.to_run_request()
    assert run_request.simulation_type == SimulationType.CREATIVE_TESTING
    assert run_request.sample_size == 10
    assert run_request.seed == 7
    assert run_request.target_filter.age_min == 20


def test_run_event_type_contains_initial_taxonomy() -> None:
    values = {event_type.value for event_type in RunEventType}

    assert {
        "created",
        "snapshot",
        "queued",
        "running",
        "progress",
        "partial_result",
        "completed",
        "failed",
        "interrupted",
        "canceled",
        "heartbeat",
    } <= values


def test_raw_persona_result_accepts_full_persona_dict() -> None:
    raw = RawPersonaResult(
        uuid="persona-1",
        persona={
            "uuid": "persona-1",
            "age": 37,
            "sex": "여자",
            "province": "서울",
            "district": "서울-강남구",
            "occupation": "마케팅 매니저",
            "education_level": "4년제 대학교",
            "professional_persona": "브랜드 캠페인을 운영합니다.",
            "family_persona": "주말에는 가족과 시간을 보냅니다.",
            "persona": "신제품 경험에 적극적인 소비자입니다.",
        },
        response="선택: A\n이유: 메시지가 선명합니다.",
        parsed={"choice": "A"},
    )

    assert raw.persona["professional_persona"] == "브랜드 캠페인을 운영합니다."
    assert raw.parsed == {"choice": "A"}


def test_error_response_accepts_code_message_details() -> None:
    error = ErrorResponse(
        code=ErrorCode.INVALID_REQUEST,
        message="Invalid request",
        details={"field": "sample_size"},
    )

    assert error.code == ErrorCode.INVALID_REQUEST
    assert error.details == {"field": "sample_size"}


def test_result_envelope_keeps_evidence_fields_separate() -> None:
    envelope = RunResultEnvelope(
        run_id="run-1",
        simulation_type=SimulationType.CREATIVE_TESTING,
        status=RunStatus.COMPLETED,
        seed=42,
        sample_size=2,
        total_responses=2,
        parse_failed=0,
        target_filter={},
        sample_summary={"age": {"30대": 2}},
        quality={"parse_success_rate": 100},
        warnings=[],
        metrics={"choice_counts": {"A": 1, "B": 1}},
        segments={"age": {}},
        insights=[{"title": "A and B tie"}],
        raw_results=[
            RawPersonaResult(
                uuid="persona-1",
                persona={"uuid": "persona-1", "age": 37},
                response="선택: A\n이유: 좋습니다.",
                parsed={"choice": "A"},
            )
        ],
        model_alias="persona_default",
        provider="gemini",
        provider_model="gemini-3-flash-preview",
        llm_backend="gemini",
        trace_id=None,
        safe_intake_summary={
            "user_goal": "헤드라인을 테스트하고 싶어요.",
            "decision_question": "어떤 문구가 설득력 있는가?",
            "simulation_type": "creative_testing",
            "user_provided": {"product_description": "AI 리서치 SaaS"},
        },
    )

    assert envelope.schema_version == "result-envelope/v1"
    assert envelope.quality == {"parse_success_rate": 100}
    assert envelope.metrics == {"choice_counts": {"A": 1, "B": 1}}
    assert envelope.raw_results[0].persona["uuid"] == "persona-1"
    assert envelope.safe_intake_summary is not None
    assert envelope.safe_intake_summary.user_goal == "헤드라인을 테스트하고 싶어요."
