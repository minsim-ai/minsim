export type SimulationType =
  | 'creative_testing'
  | 'price_optimization'
  | 'product_launch'
  | 'value_proposition'
  | 'market_segmentation'
  | 'competitive_positioning'
  | 'brand_perception'
  | 'churn_prediction'
  | 'campaign_strategy'

export type RunStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'canceled'
  | 'interrupted'

export type RunEventType =
  | 'snapshot'
  | 'created'
  | 'queued'
  | 'running'
  | 'progress'
  | 'partial_result'
  | 'completed'
  | 'failed'
  | 'interrupted'
  | 'canceled'
  | 'heartbeat'

export type ErrorCode =
  | 'INVALID_REQUEST'
  | 'UNSUPPORTED_SIMULATION_TYPE'
  | 'NO_PERSONAS_MATCH_FILTER'
  | 'SAMPLE_SIZE_EXCEEDED'
  | 'RUN_NOT_FOUND'
  | 'RESULT_NOT_READY'
  | 'RUN_NOT_CANCELABLE'
  | 'QUEUE_UNAVAILABLE'
  | 'FREE_QUOTA_EXHAUSTED'
  | 'WORKER_INTERRUPTED'
  | 'LLM_UNAVAILABLE'
  | 'LLM_TIMEOUT'
  | 'PARSING_FAILED'
  | 'INTERNAL_ERROR'

export type JsonObject = Record<string, unknown>

export interface TargetFilter {
  province?: string[] | null
  district?: string[] | null
  age_min?: number | null
  age_max?: number | null
  sex?: string | null
  education_level?: string[] | null
  occupation_keywords?: string[] | null
  exclude_unemployed?: boolean
}

export interface CreativeTestingInput {
  creatives: string[]
}

export interface PriceOptimizationInput {
  protocol_id?: 'price_research_v2' | null
  product_name: string
  product_description: string
  price_points: number[]
  context_note?: string | null
  calibration?: JsonObject | null
}

export interface ProductLaunchInput {
  product_concept: string
  key_features: string[]
  target_use_case: string
  expected_price_range?: string | null
  alternatives?: string[]
}

export interface ValuePropositionInput {
  protocol_id?: 'product_qa_v1' | null
  artifact_type?: string | null
  product_context: string
  statements: string[]
  criteria?: string[]
}

export interface MarketSegmentationInput {
  category: string
  product_family?: string | null
  core_questions: string[]
  n_segments?: number
}

export interface CompetitivePositioningInput {
  category_context: string
  products: string[]
  attributes?: string[]
}

export interface BrandPerceptionInput {
  brand_name: string
  category: string
  attributes: string[]
  context_note?: string | null
}

export interface ChurnPredictionInput {
  service_name: string
  current_situation: string
  trigger_event: string
  competitor_offer?: string | null
}

export interface CampaignChannel {
  name: string
  description?: string | null
  cost_per_reach?: number | null
}

export interface CampaignMessage {
  name: string
  creative: string
}

export interface CampaignStrategyInput {
  product_context: string
  channels: CampaignChannel[]
  messages: CampaignMessage[]
  budget?: number
}

export type SimulationInput =
  | CreativeTestingInput
  | PriceOptimizationInput
  | ProductLaunchInput
  | ValuePropositionInput
  | MarketSegmentationInput
  | CompetitivePositioningInput
  | BrandPerceptionInput
  | ChurnPredictionInput
  | CampaignStrategyInput
  | JsonObject

export interface DemoPreset {
  id: string
  title: string
  description: string
  simulation_type: SimulationType
  input: SimulationInput
  target_filter: TargetFilter
  sample_size: number
  seed: number
  fallback_simulation_type?: SimulationType | null
  fallback_reason?: string | null
  demo_notes: string[]
}

export interface RunCreateRequest {
  simulation_type: SimulationType
  input: SimulationInput
  sample_size?: number
  target_filter?: TargetFilter
  seed?: number
  model_alias?: string | null
  intake_context?: IntakeContextEnvelope | null
}

export interface RunCreateResponse {
  run_id: string
  status: RunStatus
  simulation_type: SimulationType
  events_url: string
  status_url: string
  result_url: string
}

export interface IntakeSessionSaveRequest {
  session_id?: string | null
  status: string
  snapshot: JsonObject
}

export interface IntakeAdvanceRequest {
  session_id?: string | null
  snapshot?: JsonObject
  event: JsonObject
}

export interface IntakeAdvanceResponse {
  session_id: string
  status: string
  snapshot: JsonObject
  action?: JsonObject | null
  safe_intake_summary?: SafeIntakeSummary | null
  checkpoint: JsonObject
}

export interface IntakeSessionResponse {
  session_id: string
  status: string
  snapshot: JsonObject
  title?: string | null
  run_id?: string | null
  created_at: string
  updated_at: string
}

export interface IntakeSessionListResponse {
  sessions: IntakeSessionResponse[]
}

export interface IntakeSessionRunLinkRequest {
  run_id: string
}

export interface SafeIntakeSummary {
  schema_version: string
  user_goal: string
  decision_question: string
  simulation_type: SimulationType
  user_provided: JsonObject
  inferred: JsonObject
  generated: JsonObject
  defaults: JsonObject
  reviewed_assumptions: JsonObject
  generated_candidates: unknown[]
  constraints: JsonObject
  source_counts: JsonObject
  unreviewed_assumption_count: number
}

export interface IntakeContextEnvelope {
  schema_version: string
  intake_session_id: string
  router_version: string
  planner_version: string
  task_frame: JsonObject
  provenance: JsonObject
  safe_intake_summary: SafeIntakeSummary
}

export interface IntakeMessageResponse {
  role: 'assistant' | 'user' | string
  content: string
  created_at: string
}

export interface IntakeHistoryItem {
  session_id: string
  status: string
  title: string
  run_id?: string | null
  messages: IntakeMessageResponse[]
  created_at: string
  updated_at: string
}

export interface IntakeHistoryResponse {
  items: IntakeHistoryItem[]
}

export interface IntakeCandidateRequest {
  product_description: string
  target_customers: string[]
  main_benefit?: string | null
  tone?: string | null
  count?: number
}

export interface IntakeCreativeCandidate {
  id: string
  text: string
  angle: string
  why: string
  source: string
}

export interface IntakeAssumption {
  slot_id: string
  value: unknown
  confidence: number
}

export interface IntakeCandidateResponse {
  candidates: IntakeCreativeCandidate[]
  assumptions: IntakeAssumption[]
  provider: string
  provider_model: string
  trace_id?: string | null
}

export interface ErrorResponse {
  code: ErrorCode
  message: string
  details?: JsonObject | null
}

export interface RunSnapshot {
  run_id: string
  simulation_type: SimulationType
  status: RunStatus
  sample_size: number
  done_count: number
  total_count: number
  progress_pct: number
  eta_seconds?: number | null
  rate_per_min?: number | null
  created_at: string
  started_at?: string | null
  updated_at: string
  completed_at?: string | null
  error?: ErrorResponse | null
  result_available: boolean
}

export interface RawPersonaResult {
  uuid: string
  persona: JsonObject
  response: string
  parsed?: JsonObject | null
  error?: string | null
}

export interface RunResultEnvelope {
  schema_version: string
  run_id: string
  simulation_type: SimulationType
  status: RunStatus
  seed: number
  sample_size: number
  total_responses: number
  parse_failed: number
  target_filter: JsonObject
  sample_summary: JsonObject
  quality: JsonObject
  warnings: string[]
  metrics: JsonObject
  segments: JsonObject
  insights: JsonObject[]
  raw_results: RawPersonaResult[]
  model_alias?: string | null
  provider?: string | null
  provider_model?: string | null
  llm_backend?: string | null
  trace_id?: string | null
  orchestration?: JsonObject
  safe_intake_summary?: SafeIntakeSummary | null
  protocol?: JsonObject | null
}

export interface RunPartialResultsResponse {
  run_id: string
  status: RunStatus
  done_count: number
  total_count: number
  partial_count: number
  raw_results: RawPersonaResult[]
}

export interface AuthUser {
  id?: string | null
  email: string
  name?: string | null
  picture?: string | null
  provider: string
}

export interface AuthSessionResponse {
  authenticated: boolean
  user?: AuthUser | null
  provider?: string | null
  auth_enabled: boolean
  auth_required: boolean
  test_login_enabled: boolean
  login_url: string
  logout_url: string
}

export interface UserUsageResponse {
  user_id: string
  email: string
  plan: string
  free_run_limit: number
  used_runs: number
  remaining_runs: number
  can_create_run: boolean
  quota_bypass: boolean
}

export interface AnalyticsEventRequest {
  event_name: string
  session_id?: string | null
  run_id?: string | null
  page?: string | null
  simulation_type?: SimulationType | null
  payload?: JsonObject
}

export interface AnalyticsEventResponse {
  event_id: string
  event_name: string
  created_at: string
}

export interface RunFeedbackRequest {
  intake_session_id?: string | null
  usefulness_score?: number | null
  trust_score?: number | null
  actionability_score?: number | null
  result_expectation?: string | null
  free_text?: string | null
  intended_action?: string | null
  decision_confidence_before?: number | null
  decision_confidence_after?: number | null
  shared_with_team?: boolean
  exported_report?: boolean
}

export interface RunFeedbackResponse {
  feedback_id: string
  followup_id: string
  run_id: string
  created_at: string
}

export interface AdminOverviewResponse {
  users: number
  runs: number
  completed_runs: number
  failed_runs: number
  intake_sessions: number
  feedback: number
  analytics_events: number
  by_simulation: JsonObject[]
  recent_events: JsonObject[]
  funnel: JsonObject
  accounts: JsonObject[]
  policy: JsonObject
}

export interface AdminListResponse {
  items: JsonObject[]
}

export interface AdminExportResponse {
  schema_version: string
  generated_at: string
  policy: JsonObject
  overview: JsonObject
  funnel: JsonObject
  accounts: JsonObject[]
  users: JsonObject[]
  runs: JsonObject[]
  feedback: JsonObject[]
}

export interface AdminMutationResponse {
  ok: boolean
  action: string
  dry_run: boolean
  result: JsonObject
}

export interface RunExportResponse {
  schema_version: 'koresim-export/v1'
  run_id: string
  simulation_type: SimulationType
  status: RunStatus
  seed: number
  sample_size: number
  total_responses: number
  parse_failed: number
  target_filter: JsonObject
  sample_summary: JsonObject
  quality: JsonObject
  warnings: string[]
  metrics: JsonObject
  segments: JsonObject
  insights: JsonObject[]
  model_alias?: string | null
  provider?: string | null
  provider_model?: string | null
  llm_backend?: string | null
  trace_id?: string | null
  human_review_required: boolean
  raw_results_included: boolean
  disclaimer: string
}
