"""Pydantic API contracts for the React/FastAPI run lifecycle."""
from __future__ import annotations

from enum import StrEnum
from typing import Any, Self

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from src.config import MAX_SAMPLE_SIZE


class APIModel(BaseModel):
    model_config = ConfigDict(protected_namespaces=())


class SimulationType(StrEnum):
    CREATIVE_TESTING = "creative_testing"
    PRICE_OPTIMIZATION = "price_optimization"
    PRODUCT_LAUNCH = "product_launch"
    VALUE_PROPOSITION = "value_proposition"
    MARKET_SEGMENTATION = "market_segmentation"
    COMPETITIVE_POSITIONING = "competitive_positioning"
    BRAND_PERCEPTION = "brand_perception"
    CHURN_PREDICTION = "churn_prediction"
    CAMPAIGN_STRATEGY = "campaign_strategy"


class RunStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELED = "canceled"
    INTERRUPTED = "interrupted"


class ErrorCode(StrEnum):
    INVALID_REQUEST = "INVALID_REQUEST"
    UNSUPPORTED_SIMULATION_TYPE = "UNSUPPORTED_SIMULATION_TYPE"
    NO_PERSONAS_MATCH_FILTER = "NO_PERSONAS_MATCH_FILTER"
    SAMPLE_SIZE_EXCEEDED = "SAMPLE_SIZE_EXCEEDED"
    RUN_NOT_FOUND = "RUN_NOT_FOUND"
    RESULT_NOT_READY = "RESULT_NOT_READY"
    RUN_NOT_CANCELABLE = "RUN_NOT_CANCELABLE"
    QUEUE_UNAVAILABLE = "QUEUE_UNAVAILABLE"
    WORKER_INTERRUPTED = "WORKER_INTERRUPTED"
    LLM_UNAVAILABLE = "LLM_UNAVAILABLE"
    LLM_TIMEOUT = "LLM_TIMEOUT"
    PARSING_FAILED = "PARSING_FAILED"
    INTERNAL_ERROR = "INTERNAL_ERROR"


class RunEventType(StrEnum):
    SNAPSHOT = "snapshot"
    CREATED = "created"
    QUEUED = "queued"
    RUNNING = "running"
    PROGRESS = "progress"
    PARTIAL_RESULT = "partial_result"
    COMPLETED = "completed"
    FAILED = "failed"
    INTERRUPTED = "interrupted"
    CANCELED = "canceled"
    HEARTBEAT = "heartbeat"


class TargetFilterModel(APIModel):
    province: list[str] | None = None
    district: list[str] | None = None
    age_min: int | None = Field(default=None, ge=0, le=120)
    age_max: int | None = Field(default=None, ge=0, le=120)
    sex: str | None = None
    education_level: list[str] | None = None
    occupation_keywords: list[str] | None = None
    exclude_unemployed: bool = False

    @model_validator(mode="after")
    def validate_age_range(self) -> Self:
        if self.age_min is not None and self.age_max is not None and self.age_min > self.age_max:
            raise ValueError("age_min must be less than or equal to age_max")
        return self


class CreativeTestingInput(APIModel):
    creatives: list[str] = Field(min_length=2, max_length=10)

    @field_validator("creatives")
    @classmethod
    def validate_creatives(cls, creatives: list[str]) -> list[str]:
        trimmed = [creative.strip() for creative in creatives]
        if any(not creative for creative in trimmed):
            raise ValueError("creatives must not contain empty values")
        return trimmed


class PriceOptimizationInput(APIModel):
    product_name: str = Field(min_length=1, max_length=120)
    product_description: str = Field(min_length=1, max_length=1200)
    price_points: list[int] = Field(min_length=3, max_length=6)
    context_note: str | None = Field(default=None, max_length=1000)

    @field_validator("price_points")
    @classmethod
    def validate_price_points(cls, price_points: list[int]) -> list[int]:
        if any(price <= 0 for price in price_points):
            raise ValueError("price_points must contain positive values")
        if len(set(price_points)) != len(price_points):
            raise ValueError("price_points must not contain duplicate values")
        return sorted(price_points)


class ProductLaunchInput(APIModel):
    product_concept: str = Field(min_length=1, max_length=1200)
    key_features: list[str] = Field(min_length=1, max_length=8)
    target_use_case: str = Field(min_length=1, max_length=600)
    expected_price_range: str | None = Field(default=None, max_length=200)
    alternatives: list[str] = Field(default_factory=list, max_length=6)


class ValuePropositionInput(APIModel):
    product_context: str = Field(min_length=1, max_length=1000)
    statements: list[str] = Field(min_length=2, max_length=5)

    @field_validator("statements")
    @classmethod
    def validate_statements(cls, statements: list[str]) -> list[str]:
        trimmed = [statement.strip() for statement in statements]
        if any(not statement for statement in trimmed):
            raise ValueError("statements must not contain empty values")
        return trimmed


class MarketSegmentationInput(APIModel):
    category: str = Field(min_length=1, max_length=200)
    product_family: str | None = Field(default=None, max_length=400)
    core_questions: list[str] = Field(min_length=1, max_length=6)
    n_segments: int = Field(default=6, ge=3, le=8)


class CompetitivePositioningInput(APIModel):
    category_context: str = Field(min_length=1, max_length=1000)
    products: list[str] = Field(min_length=2, max_length=5)
    attributes: list[str] = Field(default_factory=list, max_length=8)


class BrandPerceptionInput(APIModel):
    brand_name: str = Field(min_length=1, max_length=120)
    category: str = Field(min_length=1, max_length=240)
    attributes: list[str] = Field(min_length=3, max_length=15)
    context_note: str | None = Field(default=None, max_length=1000)


class ChurnPredictionInput(APIModel):
    service_name: str = Field(min_length=1, max_length=240)
    current_situation: str = Field(min_length=1, max_length=1200)
    trigger_event: str = Field(min_length=1, max_length=1200)
    competitor_offer: str | None = Field(default=None, max_length=1000)


class CampaignChannel(APIModel):
    name: str = Field(min_length=1, max_length=80)
    description: str | None = Field(default=None, max_length=500)
    cost_per_reach: int | None = Field(default=None, ge=1)


class CampaignMessage(APIModel):
    name: str = Field(min_length=1, max_length=80)
    creative: str = Field(min_length=1, max_length=600)


class CampaignStrategyInput(APIModel):
    product_context: str = Field(min_length=1, max_length=1200)
    channels: list[CampaignChannel] = Field(min_length=2, max_length=5)
    messages: list[CampaignMessage] = Field(min_length=2, max_length=4)
    budget: int = Field(default=100_000_000, ge=1)


class SafeIntakeSummary(APIModel):
    schema_version: str = "safe-intake-summary/v1"
    user_goal: str = ""
    decision_question: str = ""
    simulation_type: SimulationType
    user_provided: dict[str, Any] = Field(default_factory=dict)
    inferred: dict[str, Any] = Field(default_factory=dict)
    generated: dict[str, Any] = Field(default_factory=dict)
    defaults: dict[str, Any] = Field(default_factory=dict)
    reviewed_assumptions: dict[str, Any] = Field(default_factory=dict)
    generated_candidates: list[Any] = Field(default_factory=list)
    constraints: dict[str, Any] = Field(default_factory=dict)
    source_counts: dict[str, Any] = Field(default_factory=dict)
    unreviewed_assumption_count: int = Field(default=0, ge=0)


class IntakeContextEnvelope(APIModel):
    schema_version: str = "intake-context/v1"
    intake_session_id: str = Field(min_length=1, max_length=160)
    router_version: str = Field(default="goal-router:v1", max_length=80)
    planner_version: str = Field(default="intake-planner:v2-20260513", max_length=80)
    task_frame: dict[str, Any] = Field(default_factory=dict)
    provenance: dict[str, Any] = Field(default_factory=dict)
    safe_intake_summary: SafeIntakeSummary


SIMULATION_INPUT_MODELS: dict[SimulationType, type[APIModel]] = {
    SimulationType.CREATIVE_TESTING: CreativeTestingInput,
    SimulationType.PRICE_OPTIMIZATION: PriceOptimizationInput,
    SimulationType.PRODUCT_LAUNCH: ProductLaunchInput,
    SimulationType.VALUE_PROPOSITION: ValuePropositionInput,
    SimulationType.MARKET_SEGMENTATION: MarketSegmentationInput,
    SimulationType.COMPETITIVE_POSITIONING: CompetitivePositioningInput,
    SimulationType.BRAND_PERCEPTION: BrandPerceptionInput,
    SimulationType.CHURN_PREDICTION: ChurnPredictionInput,
    SimulationType.CAMPAIGN_STRATEGY: CampaignStrategyInput,
}


class RunCreateRequest(APIModel):
    simulation_type: SimulationType
    input: (
        CreativeTestingInput
        | PriceOptimizationInput
        | ProductLaunchInput
        | ValuePropositionInput
        | MarketSegmentationInput
        | CompetitivePositioningInput
        | BrandPerceptionInput
        | ChurnPredictionInput
        | CampaignStrategyInput
        | dict[str, Any]
    )
    sample_size: int = Field(default=50, ge=1, le=MAX_SAMPLE_SIZE)
    target_filter: TargetFilterModel = Field(default_factory=TargetFilterModel)
    seed: int = 42
    model_alias: str | None = None
    intake_context: IntakeContextEnvelope | None = None

    @model_validator(mode="after")
    def validate_simulation_input(self) -> Self:
        model = SIMULATION_INPUT_MODELS[self.simulation_type]
        if not isinstance(self.input, model):
            self.input = model.model_validate(self.input)
        return self


class DemoPreset(APIModel):
    id: str
    title: str
    description: str
    simulation_type: SimulationType
    input: (
        CreativeTestingInput
        | PriceOptimizationInput
        | ProductLaunchInput
        | ValuePropositionInput
        | MarketSegmentationInput
        | CompetitivePositioningInput
        | BrandPerceptionInput
        | ChurnPredictionInput
        | CampaignStrategyInput
        | dict[str, Any]
    )
    target_filter: TargetFilterModel
    sample_size: int = Field(ge=1, le=MAX_SAMPLE_SIZE)
    seed: int
    fallback_simulation_type: SimulationType | None = None
    fallback_reason: str | None = None
    demo_notes: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_executable_input(self) -> Self:
        model = SIMULATION_INPUT_MODELS[self.simulation_type]
        if not isinstance(self.input, model):
            self.input = model.model_validate(self.input)
        return self

    def to_run_request(self) -> RunCreateRequest:
        return RunCreateRequest(
            simulation_type=self.simulation_type,
            input=self.input,
            sample_size=self.sample_size,
            target_filter=self.target_filter,
            seed=self.seed,
        )


class ErrorResponse(APIModel):
    code: ErrorCode
    message: str
    details: dict[str, Any] | None = None


class RunCreateResponse(APIModel):
    run_id: str
    status: RunStatus
    simulation_type: SimulationType
    events_url: str
    status_url: str
    result_url: str


class IntakeSessionSaveRequest(APIModel):
    session_id: str | None = Field(default=None, min_length=1, max_length=120)
    status: str = Field(default="collecting", min_length=1, max_length=40)
    snapshot: dict[str, Any] = Field(default_factory=dict)


class IntakeSessionResponse(APIModel):
    session_id: str
    status: str
    snapshot: dict[str, Any]
    title: str | None = None
    run_id: str | None = None
    created_at: str
    updated_at: str


class IntakeSessionListResponse(APIModel):
    sessions: list[IntakeSessionResponse]


class IntakeSessionRunLinkRequest(APIModel):
    run_id: str = Field(min_length=1, max_length=120)


class IntakeMessageResponse(APIModel):
    role: str
    content: str
    created_at: str


class IntakeHistoryItem(APIModel):
    session_id: str
    status: str
    title: str
    run_id: str | None = None
    messages: list[IntakeMessageResponse]
    created_at: str
    updated_at: str


class IntakeHistoryResponse(APIModel):
    items: list[IntakeHistoryItem]


class IntakeAdvanceRequest(APIModel):
    session_id: str | None = Field(default=None, min_length=1, max_length=120)
    snapshot: dict[str, Any] = Field(default_factory=dict)
    event: dict[str, Any] = Field(default_factory=dict)


class IntakeAdvanceResponse(APIModel):
    session_id: str
    status: str
    snapshot: dict[str, Any]
    action: dict[str, Any] | None = None
    safe_intake_summary: SafeIntakeSummary | None = None
    checkpoint: dict[str, Any] = Field(default_factory=dict)


class IntakeCandidateRequest(APIModel):
    product_description: str = Field(min_length=1, max_length=1000)
    target_customers: list[str] = Field(default_factory=list, max_length=5)
    main_benefit: str | None = Field(default=None, max_length=600)
    tone: str | None = Field(default=None, max_length=80)
    count: int = Field(default=4, ge=2, le=5)


class IntakeCreativeCandidate(APIModel):
    id: str
    text: str = Field(min_length=1, max_length=120)
    angle: str = Field(min_length=1, max_length=40)
    why: str = Field(default="", max_length=300)
    source: str = "generated"


class IntakeAssumption(APIModel):
    slot_id: str
    value: Any
    confidence: float = Field(default=0.7, ge=0.0, le=1.0)


class IntakeCandidateResponse(APIModel):
    candidates: list[IntakeCreativeCandidate]
    assumptions: list[IntakeAssumption] = Field(default_factory=list)
    provider: str
    provider_model: str
    trace_id: str | None = None


class RunSnapshot(APIModel):
    run_id: str
    simulation_type: SimulationType
    status: RunStatus
    sample_size: int
    done_count: int = Field(default=0, ge=0)
    total_count: int = Field(ge=0)
    progress_pct: float = Field(default=0, ge=0, le=100)
    eta_seconds: int | None = Field(default=None, ge=0)
    rate_per_min: float | None = Field(default=None, ge=0)
    created_at: str
    started_at: str | None = None
    updated_at: str
    completed_at: str | None = None
    error: ErrorResponse | None = None
    result_available: bool = False


class RawPersonaResult(APIModel):
    uuid: str
    persona: dict[str, Any]
    response: str
    parsed: dict[str, Any] | None = None
    error: str | None = None


class RunResultEnvelope(APIModel):
    schema_version: str = "result-envelope/v1"
    run_id: str
    simulation_type: SimulationType
    status: RunStatus
    seed: int
    sample_size: int
    total_responses: int = Field(ge=0)
    parse_failed: int = Field(ge=0)
    target_filter: dict[str, Any]
    sample_summary: dict[str, Any]
    quality: dict[str, Any]
    warnings: list[str]
    metrics: dict[str, Any]
    segments: dict[str, Any]
    insights: list[dict[str, Any]]
    raw_results: list[RawPersonaResult]
    model_alias: str | None = None
    provider: str | None = None
    provider_model: str | None = None
    llm_backend: str | None = None
    trace_id: str | None = None
    orchestration: dict[str, Any] = Field(default_factory=dict)
    safe_intake_summary: SafeIntakeSummary | None = None


class RunPartialResultsResponse(APIModel):
    run_id: str
    status: RunStatus
    done_count: int = Field(ge=0)
    total_count: int = Field(ge=0)
    partial_count: int = Field(ge=0)
    raw_results: list[RawPersonaResult | dict[str, Any]]


class AuthUser(APIModel):
    id: str | None = None
    email: str
    name: str | None = None
    picture: str | None = None
    provider: str


class AuthSessionResponse(APIModel):
    authenticated: bool
    user: AuthUser | None = None
    provider: str | None = None
    auth_enabled: bool
    auth_required: bool
    test_login_enabled: bool
    login_url: str
    logout_url: str


class RunExportResponse(APIModel):
    schema_version: str = "koresim-export/v1"
    run_id: str
    simulation_type: SimulationType
    status: RunStatus
    seed: int
    sample_size: int
    total_responses: int = Field(ge=0)
    parse_failed: int = Field(ge=0)
    target_filter: dict[str, Any]
    sample_summary: dict[str, Any]
    quality: dict[str, Any]
    warnings: list[str]
    metrics: dict[str, Any]
    segments: dict[str, Any]
    insights: list[dict[str, Any]]
    model_alias: str | None = None
    provider: str | None = None
    provider_model: str | None = None
    llm_backend: str | None = None
    trace_id: str | None = None
    human_review_required: bool = True
    raw_results_included: bool = False
    disclaimer: str
