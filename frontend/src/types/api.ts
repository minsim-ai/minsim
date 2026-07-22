export type SimulationType =
  | 'startup_item_validation'
  | 'creative_testing'
  | 'price_optimization'
  | 'product_launch'
  | 'value_proposition'
  | 'market_segmentation'
  | 'competitive_positioning'
  | 'brand_perception'
  | 'churn_prediction'
  | 'campaign_strategy'
  | 'campus_policy'
  | 'campus_priority'
  | 'open_survey'

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
  | 'QUEUE_BUSY'
  | 'FREE_QUOTA_EXHAUSTED'
  | 'INTERACTIVE_RATE_LIMITED'
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

export interface StartupItemValidationInput {
  item_name: string
  item_description: string
  problem_statement: string
  key_features?: string[]
  price_hint?: string | null
  alternatives?: string[]
}

export interface CampusPolicyInput {
  agenda: string
  current_state: string
  proposed_change: string
  tradeoffs?: string | null
  condition_taxonomy?: string[]
  condition_conflicts?: string[][]
}

export interface TierHousingCell {
  n: number
  net_support: number
  low_confidence: boolean
}

export interface RegionRow {
  province: string
  n: number
  net_support: number
  low_confidence: boolean
}

export interface RegionBreakdown {
  interpretation: string
  rows: RegionRow[]
}

export interface StanceCount {
  count: number
  pct: number
}

export interface ConditionCluster {
  condition: string
  count: number
}

export interface OppositionReason {
  reason: string
  count: number
}

export interface SamplingMeta {
  sampling: string
  tier_counts: Record<string, number>
  tier_weights: Record<string, number>
  warnings: string[]
}

export interface ConditionCategory {
  category: string
  count: number
  pct: number
  representative: string
}

export interface ConditionConflict {
  left: string
  right: string
  left_pct: number
  right_pct: number
}

export interface DominantStance {
  stance: string
  pct: number
}

export interface UnresolvedChoice {
  unresolved: boolean
  branches: string[]
  reason: string
}

export interface CampusPolicyMetrics {
  tier_spread: number
  tier_spread_min: number
  unresolved_choice: UnresolvedChoice | null
  condition_categories: ConditionCategory[]
  other_rate: number
  negated_condition_count: number
  condition_conflicts: ConditionConflict[]
  dominant_stance: DominantStance | null
  conflict_min_share: number
  stance_distribution: Record<string, StanceCount>
  net_support: number
  strong_opposition_pct: number
  tier_housing_matrix: Record<string, Record<string, TierHousingCell>>
  tier_axis?: string[]
  housing_axis?: string[]
  tier_axis_label?: string
  housing_axis_label?: string
  persona_pool?: string
  region_breakdown: RegionBreakdown
  condition_clusters: ConditionCluster[]
  opposition_reasons: OppositionReason[]
  low_confidence_min_sample: number
  bias_warning: string | null
  sampling: SamplingMeta
}

export interface CampusPriorityInput {
  question: string
  items: string[]
  context?: string | null
}

export interface PriorityItemRow {
  item: string
  borda_score: number
  mean_rank: number
  top_choice_count: number
  top_choice_pct: number
  overall_rank: number
}

export interface TierRanking {
  n: number
  order: string[]
  low_confidence: boolean
}

export interface RankInversion {
  item: string
  gap: number
  highest_tier: string
  highest_rank: number
  lowest_tier: string
  lowest_rank: number
}

export interface PriorityReason {
  reason: string
  count: number
}

export interface CampusPriorityMetrics {
  items: string[]
  item_count: number
  overall_order: string[]
  item_rows: PriorityItemRow[]
  tier_rankings: Record<string, TierRanking>
  tier_axis?: string[]
  tier_axis_label?: string
  persona_pool?: string
  rank_inversions: RankInversion[]
  inversion_threshold: number
  top_reasons: PriorityReason[]
  bottom_reasons: PriorityReason[]
  low_confidence_min_sample: number
  sampling: SamplingMeta
  ranking_available?: boolean
  valid_answer_count?: number
  ranking_suppressed_reason?: string | null
}

export interface OpenSurveyChoiceRow {
  option: string
  count: number
  pct: number
}

export interface OpenSurveyTierRow {
  tier: string
  n: number
  top_option: string
  low_confidence: boolean
  distribution: Record<string, number>
}

export interface OpenSurveyReason {
  reason: string
  count: number
}

export interface OpenSurveyMetrics {
  question: string
  options: string[]
  choice_rows: OpenSurveyChoiceRow[]
  tier_rows: OpenSurveyTierRow[]
  tier_axis?: string[]
  tier_axis_label?: string
  persona_pool?: string
  reasons_by_choice: Record<string, OpenSurveyReason[]>
  low_confidence_min_sample: number
}

export interface OpenSurveyInput {
  question: string
  options: string[]
  context?: string | null
}

export type SimulationInput =
  | StartupItemValidationInput
  | CreativeTestingInput
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

export interface PersonaCountryOption {
  country_id: string
  country_name: string
  country_name_ko: string
  hf_id: string
  language: string
  supports_region_filter: boolean
  supports_korea_map: boolean
  available: boolean
  path: string
  size_bytes?: number | null
  notes?: string
}

export interface RunCreateRequest {
  simulation_type: SimulationType
  input: SimulationInput
  sample_size?: number
  target_filter?: TargetFilter
  seed?: number
  model_alias?: string | null
  persona_pool?: string
  intake_context?: IntakeContextEnvelope | null
  country_id?: string
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

export interface ProjectAutofillCurrentFields {
  name?: string
  description?: string
  product_context?: string
  features?: string[]
  prices?: string[]
  target_notes?: string
  alternatives?: string[]
}

export interface ProjectAutofillRequest {
  prompt: string
  simulation_type?: SimulationType | null
  kind?: ProjectKind | null
  /** On-screen draft fields used as LLM context when regenerating. */
  current_fields?: ProjectAutofillCurrentFields | null
}

export interface ProjectAutofillFields {
  name: string
  description: string
  product_context: string
  features: string[]
  prices: string[]
  target_notes: string
  alternatives: string[]
}

export interface ProjectAutofillResponse {
  project_fields: ProjectAutofillFields
  recommended_simulation_type: SimulationType
  simulation_input: JsonObject
  assumptions: IntakeAssumption[]
  notes: string[]
  provider: string
  provider_model: string
  trace_id?: string | null
}

export interface ProjectAutofillMeta {
  source: 'generated'
  prompt: string
  recommended_simulation_type: SimulationType
  simulation_input: JsonObject
  assumptions: IntakeAssumption[]
  notes: string[]
  filled_fields: string[]
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
  country_id?: string
  persona_pool?: string
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
  token_usage?: JsonObject | null
  persona_pool?: string | null
  safe_intake_summary?: SafeIntakeSummary | null
  protocol?: JsonObject | null
  country_id?: string
  dataset_name?: string | null
  language?: string | null
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

export interface McpToolSummary {
  name: string
  description: string
}

export interface McpGrant {
  grant_id: string
  client_id: string
  user_id: string
  client_name: string
  scope: string
  resource: string
  created_at: string
  last_used_at?: string | null
  revoked_at?: string | null
}

export interface McpConnectResponse {
  oauth_ready: boolean
  resource: string
  issuer: string
  authorization_endpoint: string
  token_endpoint: string
  registration_endpoint: string
  protected_resource_metadata_url: string
  authorization_server_metadata_url: string
  scopes: string[]
  tools: McpToolSummary[]
  grants: McpGrant[]
  configs: {
    cursor: JsonObject
    claude_desktop: JsonObject
  }
  notes: string[]
}

export interface McpGrantsResponse {
  grants: McpGrant[]
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

export type ReferralSource = 'referral' | 'sns' | 'search' | 'school' | 'work' | 'other'
export type LifeStage = 'student' | 'worker' | 'other'

export interface UserOnboardingResponse {
  completed: boolean
  referral_source?: ReferralSource | null
  life_stage?: LifeStage | null
  occupation?: string | null
  completed_at?: string | null
  bypassed?: boolean
}

export interface UserOnboardingRequest {
  referral_source: ReferralSource
  life_stage: LifeStage
  occupation: string
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

export interface ProjectCreateRequest {
  name: string
  kind?: ProjectKind
  description?: string
  product_context?: JsonObject
  features?: string[]
  prices?: string[]
  target_notes?: string
  alternatives?: string[]
}

export type ProjectUpdateRequest = ProjectCreateRequest

export type ProjectKind = 'poll' | 'venture'

export interface ProjectResponse {
  project_id: string
  user_id: string
  name: string
  description: string
  kind: ProjectKind
  product_context: JsonObject
  features: string[]
  prices: string[]
  target_notes: string
  alternatives: string[]
  created_at: string
  updated_at: string
  archived_at?: string | null
}

export interface ProjectListResponse {
  projects: ProjectResponse[]
}

export interface ProjectRunCreateRequest extends RunCreateRequest {
  run_label?: string | null
  derived_from_run_id?: string | null
}

export interface ProjectRunItem {
  project_id: string
  run_label?: string | null
  derived_from_run_id?: string | null
  created_at: string
  run: RunSnapshot
}

export interface ProjectRunListResponse {
  project_id: string
  runs: ProjectRunItem[]
}

export interface ProjectRunCreateResponse {
  project_id: string
  run: RunCreateResponse
}

export interface ProjectRunFollowupRequest {
  question: string
  cohort?: string
  sample_size?: number
}

export interface FollowupAnswer {
  uuid: string
  name: string
  age?: number | null
  sex: string
  province?: string | null
  answer: string
}

export interface ProjectRunFollowupResponse {
  question: string
  cohort: string
  panel_seed: number
  answers: FollowupAnswer[]
  summary: string
}

export interface ProjectRunInterviewRequest {
  subject_uuid?: string | null
  question: string
  sample_size?: number
}

export interface ProjectRunInterviewResponse {
  subject_uuid?: string | null
  question: string
  answers: FollowupAnswer[]
  summary: string
}

export interface InterviewThreadCreateRequest {
  subject_uuid: string
  subject_label?: string
  subject_meta?: string
  context_quote?: string
}

export interface InterviewThreadMessageRequest {
  question: string
}

export interface InterviewMessageResponse {
  message_id: string
  role: 'user' | 'assistant'
  content: string
  ordinal: number
  metadata: JsonObject
  created_at: string
}

export interface InterviewThreadResponse {
  thread_id: string
  project_id: string
  run_id: string
  subject_uuid: string
  subject_label: string
  subject_meta: string
  context_quote: string
  messages: InterviewMessageResponse[]
  created_at: string
  updated_at: string
}

export interface InterviewThreadListResponse {
  threads: InterviewThreadResponse[]
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
