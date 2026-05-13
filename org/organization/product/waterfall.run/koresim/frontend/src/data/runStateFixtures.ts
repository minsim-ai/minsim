import { creativeTestingSuccess10Envelope } from "./apiFixtures";
import type {
  ErrorResponse,
  RunPartialResultsResponse,
  RunResultEnvelope,
  RunSnapshot,
} from "../types/api";

const CREATED_AT = "2026-05-03T00:00:00+00:00";
const UPDATED_AT = "2026-05-03T00:01:00+00:00";
const COMPLETED_AT = "2026-05-03T00:02:00+00:00";

type RunStoryFixture = {
  id: string;
  label: string;
  snapshot: RunSnapshot | null;
  result?: RunResultEnvelope;
  partials?: RunPartialResultsResponse;
  error?: ErrorResponse;
  restored?: boolean;
};

function snapshot(overrides: Partial<RunSnapshot>): RunSnapshot {
  return {
    run_id: "fixture-run-story",
    simulation_type: "creative_testing",
    status: "queued",
    sample_size: 10,
    done_count: 0,
    total_count: 10,
    progress_pct: 0,
    eta_seconds: null,
    rate_per_min: null,
    created_at: CREATED_AT,
    started_at: null,
    updated_at: UPDATED_AT,
    completed_at: null,
    error: null,
    result_available: false,
    ...overrides,
  };
}

const resultFixture = creativeTestingSuccess10Envelope satisfies RunResultEnvelope;

const priceOptimizationResult = {
  schema_version: "result-envelope/v1",
  run_id: "fixture-price-optimization",
  simulation_type: "price_optimization",
  status: "completed",
  seed: 44,
  sample_size: 50,
  total_responses: 50,
  parse_failed: 0,
  target_filter: {
    age_min: 25,
    age_max: 54,
    province: ["서울", "경기"],
  },
  sample_summary: {
    actual_sample_size: 50,
    age_buckets: { "20대": 10, "30대": 18, "40대": 16, "50대": 6 },
    sex: { 여성: 25, 남성: 25 },
  },
  quality: {
    parse_success_rate: 100,
    sample_quality_grade: "A",
    overall_grade: "A",
  },
  warnings: ["Price Optimization native engine is pending; this story fixture verifies envelope shape only."],
  metrics: {
    candidate_prices: [4500, 5500, 6500],
    preferred_price_counts: { "4500": 18, "5500": 23, "6500": 9 },
    preferred_price_pct: { "4500": 36, "5500": 46, "6500": 18 },
  },
  segments: {
    breakdown_by_age: {
      "20대": { "4500": 5, "5500": 4, "6500": 1 },
      "30대": { "4500": 5, "5500": 10, "6500": 3 },
    },
  },
  insights: [
    {
      type: "preferred_price",
      title: "5,500 KRW leads",
      evidence: "46% of fixture responses prefer the middle price point.",
    },
  ],
  raw_results: [],
  model_alias: "fixture_persona_default",
  provider: "fixture",
  provider_model: "price_story_fixture",
  llm_backend: "fixture",
  trace_id: null,
} satisfies RunResultEnvelope;

export const runStateFixtures = [
  {
    id: "no_run_selected",
    label: "No run selected",
    snapshot: null,
  },
  {
    id: "run_queued",
    label: "Queued run",
    snapshot: snapshot({ run_id: "fixture-run-queued", status: "queued" }),
  },
  {
    id: "run_running",
    label: "Running run",
    snapshot: snapshot({
      run_id: "fixture-run-running",
      status: "running",
      done_count: 4,
      progress_pct: 40,
      started_at: CREATED_AT,
    }),
  },
  {
    id: "run_partial_results",
    label: "Partial results available",
    snapshot: snapshot({
      run_id: "fixture-run-partial",
      status: "running",
      done_count: 6,
      progress_pct: 60,
      started_at: CREATED_AT,
    }),
    partials: {
      run_id: "fixture-run-partial",
      status: "running",
      done_count: 6,
      total_count: 10,
      partial_count: 2,
      raw_results: resultFixture.raw_results,
    },
  },
  {
    id: "run_completed_creative_testing",
    label: "Completed Creative Testing",
    snapshot: snapshot({
      run_id: resultFixture.run_id,
      status: "completed",
      done_count: 10,
      progress_pct: 100,
      completed_at: COMPLETED_AT,
      result_available: true,
    }),
    result: resultFixture,
  },
  {
    id: "run_completed_price_optimization",
    label: "Completed Price Optimization",
    snapshot: snapshot({
      run_id: priceOptimizationResult.run_id,
      simulation_type: "price_optimization",
      status: "completed",
      sample_size: 50,
      done_count: 50,
      total_count: 50,
      progress_pct: 100,
      completed_at: COMPLETED_AT,
      result_available: true,
    }),
    result: priceOptimizationResult,
  },
  {
    id: "run_failed",
    label: "Failed run",
    snapshot: snapshot({
      run_id: "fixture-run-failed",
      status: "failed",
      done_count: 3,
      progress_pct: 30,
      completed_at: COMPLETED_AT,
      error: {
        code: "LLM_TIMEOUT",
        message: "LLM request timed out after retry.",
        details: { worker: "creative_testing" },
      },
    }),
  },
  {
    id: "run_interrupted",
    label: "Interrupted run",
    snapshot: snapshot({
      run_id: "fixture-run-interrupted",
      status: "interrupted",
      done_count: 7,
      progress_pct: 70,
      completed_at: COMPLETED_AT,
      error: {
        code: "WORKER_INTERRUPTED",
        message: "Worker stopped before final envelope persistence.",
        details: { worker: "creative_testing" },
      },
    }),
  },
  {
    id: "run_restored",
    label: "Restored completed run",
    snapshot: snapshot({
      run_id: resultFixture.run_id,
      status: "completed",
      done_count: 10,
      progress_pct: 100,
      completed_at: COMPLETED_AT,
      result_available: true,
    }),
    result: resultFixture,
    restored: true,
  },
] satisfies RunStoryFixture[];
