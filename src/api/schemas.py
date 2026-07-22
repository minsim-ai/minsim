"""Pydantic API contracts for the React/FastAPI run lifecycle."""
from __future__ import annotations

from enum import StrEnum
from typing import Annotated, Any, Literal, Self

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

from src.config import DEFAULT_COUNTRY_ID, INTERACTIVE_FOLLOWUP_MAX_SAMPLE_SIZE, MAX_SAMPLE_SIZE
from src.data.datasets import normalize_country_id
from src.llm.router import validate_requested_model_alias


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
    STARTUP_ITEM_VALIDATION = "startup_item_validation"
    CAMPUS_POLICY = "campus_policy"
    CAMPUS_PRIORITY = "campus_priority"
    OPEN_SURVEY = "open_survey"


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
    QUEUE_BUSY = "QUEUE_BUSY"
    FREE_QUOTA_EXHAUSTED = "FREE_QUOTA_EXHAUSTED"
    INTERACTIVE_RATE_LIMITED = "INTERACTIVE_RATE_LIMITED"
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
    protocol_id: Literal["price_research_v2"] | None = None
    product_name: str = Field(min_length=1, max_length=120)
    product_description: str = Field(min_length=1, max_length=1200)
    price_points: list[int] = Field(min_length=3, max_length=6)
    context_note: str | None = Field(default=None, max_length=1000)
    calibration: dict[str, Any] | None = None

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
    # Intake can mark this canInfer-critical slot satisfied without a value;
    # empty falls back to product_concept in the prompt builder.
    target_use_case: str = Field(default="", max_length=600)
    expected_price_range: str | None = Field(default=None, max_length=200)
    alternatives: list[str] = Field(default_factory=list, max_length=6)


class ValuePropositionInput(APIModel):
    protocol_id: Literal["product_qa_v1"] | None = None
    artifact_type: str | None = Field(default=None, max_length=80)
    product_context: str = Field(min_length=1, max_length=1000)
    statements: list[str] = Field(min_length=2, max_length=5)
    criteria: list[str] = Field(default_factory=list, max_length=8)

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


class CampusPolicyInput(APIModel):
    agenda: str = Field(min_length=1, max_length=240)
    current_state: str = Field(min_length=1, max_length=1200)
    proposed_change: str = Field(min_length=1, max_length=1200)
    tradeoffs: str | None = Field(default=None, max_length=1200)
    condition_taxonomy: list[str] = Field(default_factory=list, max_length=6)
    condition_conflicts: list[list[str]] = Field(default_factory=list, max_length=6)


class OpenSurveyInput(APIModel):
    question: str = Field(min_length=1, max_length=240)
    options: list[str] = Field(min_length=2, max_length=6)
    context: str | None = Field(default=None, max_length=1200)


class CampusPriorityInput(APIModel):
    question: str = Field(min_length=1, max_length=240)
    items: list[str] = Field(min_length=3, max_length=6)
    context: str | None = Field(default=None, max_length=1200)

    @field_validator("items")
    @classmethod
    def validate_priority_item_labels(cls, value: list[str]) -> list[str]:
        from src.simulations.campus_priority import validate_priority_items

        return validate_priority_items(value)


class TierHousingCell(APIModel):
    n: int
    net_support: float
    low_confidence: bool


class RegionRow(APIModel):
    province: str
    n: int
    net_support: float
    low_confidence: bool


class RegionBreakdown(APIModel):
    interpretation: str
    rows: list[RegionRow]


class StanceCount(APIModel):
    count: int
    pct: float


class ConditionCluster(APIModel):
    condition: str
    count: int


class OppositionReason(APIModel):
    reason: str
    count: int


class SamplingMeta(APIModel):
    sampling: str
    tier_counts: dict[str, int] = Field(default_factory=dict)
    tier_weights: dict[str, float] = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)


class ConditionCategory(APIModel):
    category: str
    count: int
    pct: float
    representative: str


class ConditionConflict(APIModel):
    left: str
    right: str
    left_pct: float
    right_pct: float


class DominantStance(APIModel):
    stance: str
    pct: float


class UnresolvedChoice(APIModel):
    unresolved: bool
    branches: list[str]
    reason: str


class CampusPolicyMetrics(APIModel):
    tier_spread: float = 0.0
    tier_spread_min: float = 10.0
    unresolved_choice: UnresolvedChoice | None = None
    condition_categories: list[ConditionCategory]
    other_rate: float
    negated_condition_count: int
    condition_conflicts: list[ConditionConflict]
    dominant_stance: DominantStance | None = None
    conflict_min_share: float
    stance_distribution: dict[str, StanceCount]
    net_support: float
    strong_opposition_pct: float
    tier_housing_matrix: dict[str, dict[str, TierHousingCell]]
    tier_axis: list[str] | None = None
    housing_axis: list[str] | None = None
    tier_axis_label: str | None = None
    housing_axis_label: str | None = None
    persona_pool: str | None = None
    region_breakdown: RegionBreakdown
    condition_clusters: list[ConditionCluster]
    opposition_reasons: list[OppositionReason]
    low_confidence_min_sample: int
    bias_warning: str | None = None
    sampling: SamplingMeta


class PolicyDraftRequest(APIModel):
    agenda: str = Field(min_length=1, max_length=240)
    fields: dict[str, str] | None = None


class PolicyDraftResponse(APIModel):
    fields: dict[str, str]
    ai_generated: list[str]


class SurveyQuestion(APIModel):
    kind: str
    text: str
    options: list[str]


class SurveyExportResponse(APIModel):
    agenda: str
    markdown: str
    plain_text: str
    questions: list[SurveyQuestion]


class PriorityItemRow(APIModel):
    item: str
    borda_score: float
    mean_rank: float
    top_choice_count: int
    top_choice_pct: float
    overall_rank: int


class TierRanking(APIModel):
    n: int
    order: list[str]
    low_confidence: bool


class RankInversion(APIModel):
    item: str
    gap: int
    highest_tier: str
    highest_rank: int
    lowest_tier: str
    lowest_rank: int


class PriorityReason(APIModel):
    reason: str
    count: int


class CampusPriorityMetrics(APIModel):
    items: list[str]
    item_count: int
    overall_order: list[str]
    item_rows: list[PriorityItemRow]
    tier_rankings: dict[str, TierRanking]
    tier_axis: list[str] | None = None
    tier_axis_label: str | None = None
    persona_pool: str | None = None
    rank_inversions: list[RankInversion]
    inversion_threshold: int
    top_reasons: list[PriorityReason]
    bottom_reasons: list[PriorityReason]
    low_confidence_min_sample: int
    sampling: SamplingMeta
    ranking_available: bool = True
    valid_answer_count: int = 0
    ranking_suppressed_reason: str | None = None


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


class StartupItemValidationInput(APIModel):
    item_name: str = Field(min_length=1, max_length=120)
    item_description: str = Field(min_length=1, max_length=1200)
    # Intake can mark this canInfer-critical slot satisfied without a value;
    # empty falls back to item_description in the prompt builder.
    problem_statement: str = Field(default="", max_length=600)
    key_features: list[
        Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=240)]
    ] = Field(default_factory=list, max_length=8)
    price_hint: str | None = Field(default=None, max_length=200)
    alternatives: list[
        Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
    ] = Field(default_factory=list, max_length=6)


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
    planner_version: str = Field(default="intake-planner:v3-20260713", max_length=80)
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
    SimulationType.CAMPUS_POLICY: CampusPolicyInput,
    SimulationType.CAMPUS_PRIORITY: CampusPriorityInput,
    SimulationType.OPEN_SURVEY: OpenSurveyInput,
    SimulationType.STARTUP_ITEM_VALIDATION: StartupItemValidationInput,
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
        | CampusPolicyInput
        | CampusPriorityInput
        | OpenSurveyInput
        | StartupItemValidationInput
        | dict[str, Any]
    )
    sample_size: int = Field(default=50, ge=1, le=MAX_SAMPLE_SIZE)
    target_filter: TargetFilterModel = Field(default_factory=TargetFilterModel)
    seed: int = 42
    model_alias: str | None = None
    persona_pool: str = "nationwide"
    intake_context: IntakeContextEnvelope | None = None
    country_id: str = Field(default=DEFAULT_COUNTRY_ID, min_length=2, max_length=8)

    @field_validator("persona_pool", mode="before")
    @classmethod
    def _normalize_persona_pool(cls, value: object) -> str:
        from src.data.pools import resolve_pool

        return resolve_pool(str(value) if value is not None else None).pool_id

    @field_validator("country_id", mode="before")
    @classmethod
    def _normalize_country_id(cls, value: object) -> str:
        return normalize_country_id(str(value) if value is not None else DEFAULT_COUNTRY_ID)

    @field_validator("model_alias", mode="before")
    @classmethod
    def _normalize_model_alias(cls, value: object) -> str | None:
        if value is None or value == "":
            return None
        return validate_requested_model_alias(str(value))

    @model_validator(mode="after")
    def validate_simulation_input(self) -> Self:
        model = SIMULATION_INPUT_MODELS[self.simulation_type]
        if not isinstance(self.input, model):
            self.input = model.model_validate(self.input)
        if (
            self.intake_context
            and self.intake_context.safe_intake_summary.unreviewed_assumption_count > 0
        ):
            raise ValueError("Intake assumptions must be reviewed before a run can start.")
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
        | CampusPolicyInput
        | CampusPriorityInput
        | OpenSurveyInput
        | StartupItemValidationInput
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


class ProjectKind(StrEnum):
    POLL = "poll"
    VENTURE = "venture"


class ProjectCreateRequest(APIModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=800)
    kind: ProjectKind = ProjectKind.VENTURE
    product_context: dict[str, Any] = Field(default_factory=dict)
    features: list[str] = Field(default_factory=list, max_length=30)
    prices: list[str] = Field(default_factory=list, max_length=20)
    target_notes: str = Field(default="", max_length=1200)
    alternatives: list[str] = Field(default_factory=list, max_length=30)


class ProjectUpdateRequest(ProjectCreateRequest):
    # 상세 화면의 '저장'은 kind를 보내지 않는다. 기본값을 상속하면 갈래가
    # 조용히 venture로 되돌아가므로, 미지정은 '유지'로 다룬다.
    kind: ProjectKind | None = None


class ProjectResponse(APIModel):
    project_id: str
    user_id: str
    name: str
    description: str
    kind: ProjectKind = ProjectKind.VENTURE
    product_context: dict[str, Any]
    features: list[str]
    prices: list[str]
    target_notes: str
    alternatives: list[str]
    created_at: str
    updated_at: str
    archived_at: str | None = None


class ProjectListResponse(APIModel):
    projects: list[ProjectResponse]


class ProjectRunCreateRequest(RunCreateRequest):
    run_label: str | None = Field(default=None, max_length=160)
    derived_from_run_id: str | None = Field(default=None, max_length=160)


class ProjectRunCreateResponse(APIModel):
    project_id: str
    run: RunCreateResponse


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


class ProjectAutofillCurrentFields(APIModel):
    """Optional on-screen draft fields sent as LLM context for regenerate/refine."""

    name: str = Field(default="", max_length=120)
    description: str = Field(default="", max_length=800)
    product_context: str = Field(default="", max_length=1200)
    features: list[str] = Field(default_factory=list, max_length=30)
    prices: list[str] = Field(default_factory=list, max_length=20)
    target_notes: str = Field(default="", max_length=1200)
    alternatives: list[str] = Field(default_factory=list, max_length=30)


class ProjectAutofillRequest(APIModel):
    prompt: str = Field(min_length=4, max_length=1000)
    simulation_type: SimulationType | None = None
    # 갈래를 모르면 여론조사 안건에도 가격·타깃 고객·경쟁사를 지어낸다.
    kind: ProjectKind | None = None
    # 상세 화면의 이름·설명·배경 등 현재 값을 함께 넘기면 재생성 시 참조한다.
    current_fields: ProjectAutofillCurrentFields | None = None


class ProjectAutofillFields(APIModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=800)
    product_context: str = Field(default="", max_length=1200)
    features: list[str] = Field(default_factory=list, max_length=30)
    prices: list[str] = Field(default_factory=list, max_length=20)
    target_notes: str = Field(default="", max_length=1200)
    alternatives: list[str] = Field(default_factory=list, max_length=30)


class ProjectAutofillResponse(APIModel):
    project_fields: ProjectAutofillFields
    recommended_simulation_type: SimulationType
    simulation_input: dict[str, Any] = Field(default_factory=dict)
    assumptions: list[IntakeAssumption] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)
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
    country_id: str = DEFAULT_COUNTRY_ID
    persona_pool: str = "nationwide"
    created_at: str
    started_at: str | None = None
    updated_at: str
    completed_at: str | None = None
    error: ErrorResponse | None = None
    result_available: bool = False


class ProjectRunItem(APIModel):
    project_id: str
    run_label: str | None = None
    derived_from_run_id: str | None = None
    created_at: str
    run: RunSnapshot


class ProjectRunListResponse(APIModel):
    project_id: str
    runs: list[ProjectRunItem]


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
    token_usage: dict[str, Any] | None = None
    persona_pool: str | None = None
    safe_intake_summary: SafeIntakeSummary | None = None
    protocol: dict[str, Any] | None = None
    country_id: str = DEFAULT_COUNTRY_ID
    dataset_name: str | None = None
    language: str | None = None


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


class UserUsageResponse(APIModel):
    user_id: str
    email: str
    plan: str
    free_run_limit: int = Field(ge=0)
    used_runs: int = Field(ge=0)
    remaining_runs: int = Field(ge=0)
    can_create_run: bool
    quota_bypass: bool = False


ReferralSource = Literal["referral", "sns", "search", "school", "work", "other"]
LifeStage = Literal["student", "worker", "other"]


class UserOnboardingResponse(APIModel):
    completed: bool
    referral_source: ReferralSource | None = None
    life_stage: LifeStage | None = None
    occupation: str | None = None
    completed_at: str | None = None
    bypassed: bool = False


class UserOnboardingRequest(APIModel):
    referral_source: ReferralSource
    life_stage: LifeStage
    occupation: str = Field(min_length=1, max_length=80)


class AnalyticsEventRequest(APIModel):
    event_name: str = Field(min_length=1, max_length=80)
    session_id: str | None = Field(default=None, max_length=160)
    run_id: str | None = Field(default=None, max_length=160)
    page: str | None = Field(default=None, max_length=120)
    simulation_type: SimulationType | None = None
    payload: dict[str, Any] = Field(default_factory=dict)


class AnalyticsEventResponse(APIModel):
    event_id: str
    event_name: str
    created_at: str


class RunFeedbackRequest(APIModel):
    intake_session_id: str | None = Field(default=None, max_length=160)
    usefulness_score: int | None = Field(default=None, ge=1, le=5)
    trust_score: int | None = Field(default=None, ge=1, le=5)
    actionability_score: int | None = Field(default=None, ge=1, le=5)
    result_expectation: str | None = Field(default=None, max_length=80)
    free_text: str | None = Field(default=None, max_length=1200)
    intended_action: str | None = Field(default=None, max_length=240)
    decision_confidence_before: int | None = Field(default=None, ge=1, le=5)
    decision_confidence_after: int | None = Field(default=None, ge=1, le=5)
    shared_with_team: bool = False
    exported_report: bool = False


class RunFeedbackResponse(APIModel):
    feedback_id: str
    followup_id: str
    run_id: str
    created_at: str


class ProjectRunFollowupRequest(APIModel):
    question: str = Field(min_length=1, max_length=500)
    cohort: str = Field(default="all", max_length=80)
    sample_size: int = Field(default=12, ge=1, le=INTERACTIVE_FOLLOWUP_MAX_SAMPLE_SIZE)


class FollowupAnswer(APIModel):
    uuid: str
    name: str
    age: int | None = None
    sex: str = ""
    province: str | None = None
    answer: str


class ProjectRunFollowupResponse(APIModel):
    question: str
    cohort: str
    panel_seed: int
    answers: list[FollowupAnswer]
    summary: str


class ProjectRunPersuasionRequest(APIModel):
    condition: str = Field(min_length=1, max_length=500)
    sample_size: int = Field(default=12, ge=1, le=INTERACTIVE_FOLLOWUP_MAX_SAMPLE_SIZE)


class ProjectRunPersuasionResponse(APIModel):
    condition: str
    cohort_size: int
    converted: int
    held: int
    conversion_rate: float
    conversion_reasons: list[str]
    holdout_reasons: list[str]


class ProjectRunInterviewRequest(APIModel):
    subject_uuid: str | None = Field(default=None, max_length=160)
    question: str = Field(min_length=1, max_length=500)
    sample_size: int = Field(default=1, ge=1, le=10)


class ProjectRunInterviewResponse(APIModel):
    subject_uuid: str | None = None
    question: str
    answers: list[FollowupAnswer]
    summary: str


class InterviewThreadCreateRequest(APIModel):
    subject_uuid: str = Field(min_length=1, max_length=160)
    subject_label: str = Field(default="", max_length=160)
    subject_meta: str = Field(default="", max_length=300)
    context_quote: str = Field(default="", max_length=1000)


class InterviewThreadMessageRequest(APIModel):
    question: str = Field(min_length=1, max_length=500)


class InterviewMessageResponse(APIModel):
    message_id: str
    role: Literal["user", "assistant"]
    content: str
    ordinal: int
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: str


class InterviewThreadResponse(APIModel):
    thread_id: str
    project_id: str
    run_id: str
    subject_uuid: str
    subject_label: str
    subject_meta: str
    context_quote: str
    messages: list[InterviewMessageResponse] = Field(default_factory=list)
    created_at: str
    updated_at: str


class InterviewThreadListResponse(APIModel):
    threads: list[InterviewThreadResponse]


class AdminOverviewResponse(APIModel):
    users: int
    runs: int
    completed_runs: int
    failed_runs: int
    intake_sessions: int
    feedback: int
    analytics_events: int
    by_simulation: list[dict[str, Any]]
    recent_events: list[dict[str, Any]]
    funnel: dict[str, Any] = Field(default_factory=dict)
    accounts: list[dict[str, Any]] = Field(default_factory=list)
    policy: dict[str, Any] = Field(default_factory=dict)


class AdminListResponse(APIModel):
    items: list[dict[str, Any]]


class AdminExportResponse(APIModel):
    schema_version: str
    generated_at: str
    policy: dict[str, Any]
    overview: dict[str, Any]
    funnel: dict[str, Any]
    accounts: list[dict[str, Any]]
    users: list[dict[str, Any]]
    runs: list[dict[str, Any]]
    feedback: list[dict[str, Any]]


class AdminRetentionPruneRequest(APIModel):
    retention_days: int = Field(default=180, ge=1, le=3650)
    dry_run: bool = True
    confirm: bool = False


class AdminDeleteUserRequest(APIModel):
    confirm_user_id: str = Field(min_length=1, max_length=200)


class AdminMutationResponse(APIModel):
    ok: bool = True
    action: str
    dry_run: bool = False
    result: dict[str, Any]


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
