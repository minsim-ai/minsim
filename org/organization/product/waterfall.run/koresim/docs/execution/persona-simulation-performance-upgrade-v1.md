---
title: Persona Simulation Performance Upgrade V1
type: execution-plan
tags: [persona-simulation, product-qa, price-research, calibration, benchmark, productization]
created: 2026-05-14
updated: 2026-05-14
status: in-progress
related: [[../templates/execution-plan-template]], [[phase-5-simulation-framework-price-optimization]], [[phase-7-llm-gateway-orchestration]], [[agentic-intake-layer-v2]], [[../design/persona-simulation-protocol-engine]], [[../design/evaluation-framework]], [[../design/llm-gateway-orchestration]], [[../design/data-governance-and-io-boundary]]
---

# Persona Simulation Performance Upgrade V1

## 0. Metadata

- [x] Execution plan id: `persona-simulation-performance-upgrade-v1`
- [x] Target phase: post-demo productization / Phase 5 and Phase 7 extension
- [x] Related design docs: [[../design/persona-simulation-protocol-engine]], [[../design/evaluation-framework]], [[../design/llm-gateway-orchestration]], [[../design/data-governance-and-io-boundary]], [[../design/agentic-intake-workflows/intake-layer-v2-contract]]
- [x] Owner: KoreaSim
- [x] Status: in-progress
- [x] Created: 2026-05-14
- [x] Updated: 2026-05-14

## 1. Summary

### Objective

- [ ] 사례에서 확인한 강점인 대규모 합성 페르소나 실험, 싱글턴/멀티턴 분리, 가격 거절 조건 분석, 실제 인터뷰 보정, Product QA형 실험 설계를 KoreaSim 제품 기능으로 흡수한다.
- [ ] KoreaSim을 단순한 "페르소나에게 물어보는 도구"가 아니라, 제품/가격/메시지 의사결정 전 리서치 프로토콜을 설계하고 결과를 인터뷰/실험으로 연결하는 B2B SaaS로 강화한다.
- [ ] 사례의 기준인 `400 personas / 7 hypotheses / 2,800 calls / about 80 minutes / about $25`를 벤치마크로 삼되, KoreaSim은 더 높은 제품화 수준, 더 명확한 trust layer, 더 안전한 데이터 경계, 더 나은 재현성을 제공해야 한다.

### User-visible outcome

- [ ] 사용자는 가격 질문을 단일 점수로 끝내지 않고, 가격 ladder, 거절 조건, 비교 앵커, 가격 외 망설임까지 포함한 멀티턴 가격 리서치를 실행할 수 있다.
- [ ] 사용자는 가설 검증 결과를 "정답"이 아니라 "다음에 더 깊게 볼 지점"으로 해석하는 리포트를 받는다.
- [ ] 사용자는 랜딩 카피, 온보딩 문구, 가격표, 리포트 초안, 기능 설명 등 실제 제품 산출물을 forced choice/ranking 방식으로 Product QA할 수 있다.
- [ ] 사용자는 시뮬레이션 결과에서 실제 인터뷰에 추가해야 할 질문 슬롯을 자동으로 얻는다.

### Engineering outcome

- [ ] 시뮬레이션 실행 방식을 단일 prompt builder에서 선언형 protocol engine으로 확장한다.
- [ ] 싱글턴, 멀티턴, forced choice, ranking, objection probing, anchor probing을 공통 step contract로 표현한다.
- [ ] 가격 리서치 V2, Product QA mode, calibration/weighting metadata, benchmark harness를 추가한다.
- [ ] 기존 RQ worker, `LLMClient`, LiteLLM/Gemini/Ollama routing, result envelope, intake safe summary, Langfuse metadata-only 정책은 유지한다.

## 2. Baseline and Case Absorption

### Current KoreaSim AS-IS

- [x] 9개 simulation type이 API/RQ/SQLite/React result renderer 경로에서 실행된다.
- [x] live external Gemini 9 simulations x 200-person validation이 통과했다.
- [x] `LLMClient`, task-based model routing, Langfuse metadata-only trace, result-level analysis/report/QA agents가 있다.
- [x] `IntakeContextEnvelope`와 `safe_intake_summary`가 run/result/agent safe input까지 연결되어 있다.
- [x] trust layer는 sample summary, parse quality, warnings, disclaimer, raw result boundary를 제공한다.

### Case strengths to absorb

- [ ] 대규모 persona run을 제품 의사결정 전에 빠르게 돌리는 benchmark mindset.
- [ ] 싱글턴과 멀티턴을 분리해 비용/속도/맥락 유지 품질을 다르게 최적화하는 운영 방식.
- [ ] 가격 질문을 yes/no 또는 단일 점수로 끝내지 않고 `거절 -> 조건 -> 비교 앵커 -> 망설임`으로 쪼개는 인터뷰형 설계.
- [ ] headline metric만 믿지 않고, 조건부 yes와 거절 이유를 별도 차원으로 해석하는 리포트 구조.
- [ ] 실제 베타/인터뷰 데이터로 시뮬레이션 응답을 보정하는 운영 방식.
- [ ] 가설 검증보다 Product QA와 인터뷰 가이드 개선에 시뮬레이션을 쓰는 방향 전환.

### KoreaSim must be better than the case

- [ ] 일회성 script가 아니라 authenticated SaaS flow에서 실행된다.
- [ ] 9개 simulation, 공통 result envelope, UI renderer, export, cancel, quota, auth, SSE progress를 유지한다.
- [ ] 결과 숫자의 절대값/상대순위/보정 여부/근거 품질을 분리해 보여준다.
- [ ] provider prompt, raw persona row, raw chat transcript, raw results는 Langfuse나 외부 관측 payload로 나가지 않는다.
- [ ] benchmark artifact는 재현 가능한 command와 run metadata로 저장된다.

## 3. Scope

### In scope

- [x] Protocol Engine V1 first slice: `price_research_v2` step contract and result envelope protocol block.
- [x] Price Research V2 first slice: 멀티턴 가격 ladder, 조건부 거절, 비교 앵커, 가격 외 망설임 집계.
- [x] Product QA Mode V1 first slice: `value_proposition` 안의 `product_qa_v1` protocol로 산출물 forced ranking 평가.
- [x] Calibration Layer V1 first slice: Price Research V2 headline intent에 aggregate post-stratification metadata 적용.
- [x] Interview Guide Generator V1 first slice: Price Research V2 aggregate signals에서 실제 인터뷰 질문 슬롯 생성.
- [x] Benchmark Harness V1 first slice: 사례 기준과 비교 가능한 fake LLM cost/latency/parse quality benchmark.
- [ ] React result renderer 확장: 멀티턴 경로, 조건부 yes, 보정 결과, Product QA ranking, interview guide 표시.
- [ ] Evaluation fixtures: deterministic fixtures for protocol, price V2, Product QA, calibration, report grounding.

### Out of scope

- [ ] persona fanout을 LangGraph branch로 이전하지 않는다.
- [ ] base Nemotron persona dataset을 수정하지 않는다.
- [ ] 실제 결제/청구 시스템은 이 plan에서 구현하지 않는다.
- [ ] 외부 패널 리크루팅이나 실제 설문 수집 시스템은 구현하지 않는다.
- [ ] causal inference 또는 실제 수요 예측 보장을 제품 문구로 만들지 않는다.
- [ ] Langfuse full prompt/persona payload tracing은 기본값으로 켜지 않는다.

### Dependencies

- [ ] Existing RQ worker and SQLite run/result store.
- [ ] Existing `LLMClient` and task-based router.
- [ ] Gemini Flash/Pro or equivalent fast/strong aliases in LiteLLM config.
- [ ] Persona parquet availability through `PersonaSampler`.
- [ ] Optional customer baseline data file or uploaded JSON/CSV for calibration fixtures.
- [ ] Existing auth/quota controls for SaaS run creation.

## 4. Contracts

### Protocol contract

- [x] Add a protocol definition shape:

```json
{
  "schema_version": "simulation-protocol/v1",
  "protocol_id": "price-research-v2",
  "steps": [
    {
      "id": "price_ladder",
      "mode": "singleton",
      "task_type": "pricing_response",
      "model_alias": "persona_default",
      "output_schema": {}
    },
    {
      "id": "rejection_conditions",
      "mode": "follow_up",
      "task_type": "pricing_objection",
      "model_alias": "persona_strong",
      "condition": "previous.intent != 'purchase'",
      "output_schema": {}
    }
  ]
}
```

- [x] Protocol steps support the declared mode vocabulary in the backend contract.
- [x] Step output is parseable into structured JSON-like records before aggregation for `price_research_v2`.
- [ ] Step metadata must include `latency_ms`, `retry_count`, and `fallback_used` in addition to current task/provider metadata.

### API contract

- [x] Keep `POST /api/runs` backward compatible for existing 9 simulations.
- [x] Add optional `protocol_id` to `PriceOptimizationInput`.
- [x] Add `price_research_v2` as a versioned mode under `price_optimization`.
- [x] Add `product_qa_v1` as a versioned mode under `value_proposition`.
- [ ] Result lookup remains `GET /api/results/{run_id}`.
- [ ] SSE progress must include protocol step progress without exposing raw prompts.

### Data contract

- [x] Result envelope keeps existing fields and adds optional `protocol` block.

```json
{
  "protocol": {
    "schema_version": "simulation-protocol-result/v1",
    "protocol_id": "price-research-v2",
    "step_summaries": [],
    "multi_turn_metrics": {},
    "benchmark": {},
    "calibration": {},
    "interview_guide": {}
  }
}
```

- [ ] `raw_results` may store protected per-persona step responses inside product storage.
- [ ] Export and result-agent safe input exclude raw persona rows and raw multi-turn transcripts by default.
- [x] Calibration metadata stores weights and source distribution summaries, not private customer rows.

### Frontend contract

- [x] Existing result page renders legacy envelopes unchanged.
- [ ] Protocol-aware results render:
  - [ ] step progress.
  - [x] headline metric.
  - [x] conditional yes / rejection condition breakdown.
  - [x] anchor distribution.
  - [x] hesitation reasons.
  - [x] Product QA ranking.
  - [x] calibrated vs uncalibrated view.
  - [x] generated interview guide.
- [ ] Trust layer labels absolute values, relative rankings, modeled assumptions, and calibration status separately.

## 5. Implementation Checklist

### 5.1 Backend protocol engine

- [x] Add `src/simulations/protocols.py`.
  - [x] Define `ProtocolSpec` and `ProtocolStep`.
  - [ ] Validation: unit tests for valid/invalid protocol specs.
- [x] Add `src/simulations/price_research_v2.py` as the first protocol runner slice.
  - [x] Execute per-persona step sequences while preserving current RQ fanout boundary.
  - [x] Support conditional follow-up steps.
  - [x] Validation: deterministic fake LLM fixture for multi-step execution.
- [ ] Extend `src/agent/simulator.py` or add a sibling runner.
  - [ ] Keep existing `BatchSimulator` behavior intact.
  - [ ] Add per-step model alias routing.
  - [ ] Validation: existing Phase 5 fixtures still pass.

### 5.2 Price Research V2

- [x] Add price V2 input model.
  - [ ] Fields: product, description, price points, context, target decision, optional competitor/service anchors.
  - [ ] Validation: 3-7 price points, positive unique values, bounded text.
- [x] Add price ladder step.
  - [ ] Ask purchase/watch/reject for each price option.
  - [ ] Output: per-price intent, selected price, WTP, reason.
- [x] Add rejection condition step.
  - [ ] Trigger only for non-purchase or low-confidence responses.
  - [ ] Categorize conditions: integration/proof/free trial/ROI/company payment/discount/other.
- [x] Add comparison anchor step.
  - [ ] Ask recent similar paid service and monthly spend range.
  - [ ] Store anchor category and amount.
- [x] Add hesitation step.
  - [ ] Ask non-price blockers.
  - [ ] Categorize blocker themes.
- [x] Aggregate price V2.
  - [ ] Metrics: headline purchase intent, conditional yes rate, condition categories, anchor distribution, non-price blockers, recommended next test.
  - [ ] Insight rule: warn when headline intent and conditional yes diverge.

### 5.3 Product QA Mode V1

- [x] Define Product QA input model.
  - [ ] Artifact type: landing copy, onboarding copy, price table, report snippet, feature description, campaign draft.
  - [ ] Candidates: 2-6 items.
  - [ ] Evaluation criteria: clarity, credibility, usefulness, shareability, purchase relevance.
- [x] Add forced choice/ranking protocol.
  - [ ] Each persona ranks candidates and explains top/bottom choice.
  - [ ] Optional direct score is secondary, not primary.
- [x] Add artifact-specific prompt.
  - [ ] Landing copy: clarity and credibility.
  - [ ] Price table: comprehension and perceived value.
  - [ ] Report snippet: trust and actionability.
  - [ ] Onboarding: completion confidence.
- [x] Aggregate Product QA.
  - [ ] Metrics: ranking distribution, win rate, clarity/credibility/actionability, segment differences, top objections.
  - [ ] Insight rule: detect "nice but not decisive" responses.

### 5.4 Calibration Layer V1

- [x] Add optional calibration input.
  - [ ] Source: beta applicants, customer list summary, interview sample, survey summary.
  - [ ] Supported dimensions: occupation, age bucket, province/metro, sex, education, custom segment labels.
- [x] Add weighting helper.
  - [ ] Compute post-stratification weights for matched dimensions.
  - [ ] Cap extreme weights and report cap rate.
- [x] Add calibrated aggregate output metadata.
  - [ ] Show unweighted and weighted values side by side.
  - [ ] Add warning if calibration sample is too small or mismatched.
- [x] Add fixture-style unit test.
  - [ ] Reproduce case-like correction using a 62-person beta applicant distribution fixture.

### 5.5 Interview Guide Generator V1

- [x] Add deterministic generator first.
  - [ ] Inputs: headline metric, conditional yes divergence, top rejection categories, anchor gaps, Product QA contradictions.
  - [ ] Output: interview guide sections and question slots.
- [ ] Add optional LLM report-agent enhancement later.
  - [ ] Use only aggregate metrics and `safe_intake_summary`.
  - [ ] Do not pass raw persona transcripts.
- [x] Add output contract.
  - [ ] `questions`: ordered list.
  - [ ] `why_this_question`: aggregate evidence.
  - [ ] `target_segment`: optional.
  - [ ] `risk_if_unasked`: concise reason.

### 5.6 Benchmark Harness V1

- [x] Add `scripts/check_persona_simulation_benchmark.py`.
  - [ ] Run case-like benchmark: 400 personas, 7 hypotheses, price V2 multi-turn subset, deterministic option for fake LLM.
  - [ ] Record total calls, wall clock, parse failures, provider, model aliases, estimated cost.
- [x] Add benchmark artifact format under `docs/verification/benchmarks/`.
  - [ ] Include command, env summary, run IDs, protocol IDs, cost/latency summary, parse quality.
- [ ] Add pass thresholds.
  - [ ] Completion rate: 100% for deterministic, >= 98% for external provider.
  - [ ] Parse success: >= 95% for structured protocol steps.
  - [ ] Wall clock: target <= 80 minutes for case-equivalent external run on configured concurrency.
  - [ ] Cost: target <= case baseline for equivalent provider tier, or explicitly document quality/cost tradeoff.

### 5.7 Frontend

- [x] Add protocol-aware result types.
- [x] Add Price Research V2 metric section renderer.
- [x] Add Product QA metric section renderer.
- [x] Add calibrated/unweighted toggle.
- [x] Add interview guide section.
- [ ] Add benchmark evidence card on validation/admin surface if appropriate.
- [ ] Preserve existing 9 simulation renderers and fixture parity.

### 5.8 Documentation

- [x] Add or update design doc for protocol engine and research QA boundary.
- [ ] Update evaluation framework with protocol, calibration, and Product QA evals.
- [ ] Update Phase 5/7 extension status after implementation.
- [ ] Update `CLAUDE.md` only after actual implementation or validation evidence changes.
- [ ] Add validation evidence only after commands pass.

## 6. Mock Data and Fixtures

### Required fixtures

- [ ] `price_research_v2_multiturn_20.json`
  - [ ] Contains mixed purchase, reject, conditional yes, and malformed responses.
- [ ] `product_qa_ranking_20.json`
  - [ ] Contains forced ranking and top/bottom reasons.
- [ ] `calibration_beta_applicants_62.json`
  - [ ] Contains aggregate distribution only, not private rows.
- [ ] `protocol_step_errors.json`
  - [ ] Contains timeout, parse failure, conditional skip, and partial completion cases.
- [ ] `benchmark_case_equivalent_fake_llm.json`
  - [ ] Enables fast deterministic benchmark without provider cost.

### Fixture rules

- [ ] Mock data must match real API schema.
- [ ] Mock values must be clearly marked as fixture data.
- [ ] Production route must not depend on hardcoded result numbers.
- [ ] No fixture may contain real customer PII, secrets, provider prompts, or raw private interview transcripts.

## 7. Edge Cases and Exceptions

### Input validation

- [ ] Too few or too many price points.
- [ ] Duplicate price points.
- [ ] Empty artifact candidates.
- [ ] Product QA candidate count mismatch.
- [ ] Calibration dimension not present in sampled personas.
- [ ] Calibration source distribution sums to zero.
- [ ] Unsupported protocol step mode.

### Runtime failures

- [ ] LLM timeout in one step.
- [ ] Follow-up step skipped because previous output failed to parse.
- [ ] Partial multi-turn transcript available but final aggregate incomplete.
- [ ] Redis or worker unavailable.
- [ ] SQLite write failure during step result persistence.
- [ ] SSE disconnect during protocol step progress.

### Access/security

- [ ] Existing app-level auth remains enforced for run creation/result access.
- [ ] Public landing/status routes remain public.
- [ ] Export excludes raw multi-turn transcripts unless explicitly allowed by protected product policy.
- [ ] Langfuse metadata-only mode remains default.

## 8. Tests

### Automated tests

- [ ] Unit tests for protocol spec validation.
- [x] Unit tests for protocol runner conditional steps.
- [x] Unit tests for price V2 parser and aggregation.
- [x] Unit tests for Product QA parser and aggregation.
- [x] Unit tests for calibration weighting.
- [x] Integration tests for `POST /api/runs` with price V2/Product QA payloads through `RunCreateRequest`.
- [x] Worker tests for protocol run persistence.
- [x] Frontend typecheck for protocol result types.
- [ ] Frontend renderer tests or fixture contract checks for new result sections.
- [ ] Report grounding eval: no invented numeric claims and no raw transcript leak.

### Manual checks

- [ ] Run 20-person local deterministic price V2.
- [ ] Run 50-person external provider price V2.
- [ ] Run 50-person Product QA.
- [ ] Confirm result restore after refresh.
- [ ] Confirm interview guide appears and cites aggregate evidence.
- [ ] Confirm calibrated/unweighted toggle works when calibration data is present.

### Commands

```bash
uv run pytest tests/test_protocols.py tests/test_price_research_v2.py tests/test_product_qa.py tests/test_calibration.py
uv run pytest tests/test_api_app.py tests/test_jobs_worker.py tests/test_phase7_orchestration.py
uv run python evals/run_result_envelope_fixture_eval.py
uv run python evals/run_agent_eval.py
npm --prefix frontend run lint
npm --prefix frontend run typecheck
npm --prefix frontend run build
uv run python scripts/check_persona_simulation_benchmark.py --fake-llm --sample-size 400
uv run python scripts/verify.py
```

External benchmark command after deterministic gates pass:

```bash
uv run python scripts/check_persona_simulation_benchmark.py --external --sample-size 400 --timeout-seconds 5400
```

## 9. Acceptance Criteria

### Pass conditions

- [x] Existing 9 simulation types still pass full verification.
- [x] Price Research V2 can run a multi-turn protocol and produce structured step summaries.
- [x] Product QA can rank 2-6 artifacts and produce aggregate recommendations.
- [x] Calibration layer can produce unweighted and weighted metrics with warnings.
- [x] Interview guide generator produces questions grounded in aggregate metrics.
- [x] Benchmark harness records call count, wall clock, parse quality, and artifact path.
- [ ] Result agents consume only safe aggregate/protocol summaries, not raw transcripts.

### Must not regress

- [ ] Streamlit fallback still imports.
- [x] Existing `price_optimization` V1 payloads remain valid.
- [x] Existing result envelope fields remain backward compatible.
- [ ] Existing frontend result fixtures typecheck.
- [ ] Public route policy and app-level auth remain unchanged.
- [ ] Langfuse trace payloads remain metadata-only by default.

### Demo-ready criteria

- [x] User can complete a price V2 run from UI and understand headline vs conditional yes.
- [x] User can run Product QA with multiple copy/artifact candidates.
- [ ] User can export a human-review artifact without raw persona rows.
- [ ] Failure and partial states are understandable.
- [ ] Result page clearly states that outputs are simulation signals, not real survey proof.

## 10. Observability and Debugging

- [ ] Per-step trace metadata includes protocol id and step id.
- [ ] Queue events include protocol step progress.
- [x] Benchmark artifact includes protocol id, provider mode, task counts, parse quality, and artifact path for fake LLM runs.
- [ ] Parse failures are counted by step, not only by run.
- [ ] Cost estimates are grouped by task type and model alias.
- [ ] Data-governance checks assert no raw persona narrative in trace payloads.

## 11. Rollback Plan

- [ ] Keep existing simulation runners as the default path until protocol runs pass gates.
- [ ] Feature flag Price Research V2 and Product QA UI entry points.
- [ ] If protocol runner fails, disable new protocol IDs without changing existing `price_optimization`.
- [ ] If calibration produces unstable weights, show unweighted-only results with a warning.
- [ ] If external benchmark exceeds cost/latency threshold, keep deterministic benchmark as evidence and mark external benchmark blocked.

## 12. Review Checklist

### Self review

- [ ] Scope matches post-demo productization and does not expand into billing/account systems.
- [ ] No provider SDK is imported from simulation modules.
- [ ] No raw transcript/persona row is sent to result agents or Langfuse by default.
- [ ] API/schema changes are reflected in frontend types and fixtures.
- [ ] Existing Phase 5/7 validations are not invalidated.

### Human review notes

- [ ] Decide whether `price_research_v2` is a new simulation type or a versioned mode under `price_optimization`.
- [x] Decide whether Product QA is a new simulation type or a mode spanning creative/value proposition/report QA: V1 uses `value_proposition` + `product_qa_v1`.
- [ ] Decide benchmark provider aliases and max acceptable external run budget.

## 13. Completion Log

- [x] Implementation completed: first vertical slice for `price_research_v2`; continued slices for `product_qa_v1`, calibration helper, interview guide generator, and fake benchmark harness.
- [x] Tests run: `uv run python scripts/verify.py` passed on 2026-05-14 with 170 pytest tests and 87.84% total coverage.
- [x] Benchmark evidence: `uv run python scripts/check_persona_simulation_benchmark.py --fake-llm --sample-size 400` wrote `docs/verification/benchmarks/persona-simulation-benchmark-fake_llm-20260514T022109Z.json`.
- [x] Small external benchmark evidence: `uv run python scripts/check_persona_simulation_benchmark.py --external --sample-size 10 --timeout-seconds 900` completed in 33.162 seconds with 10 responses, 0 parse failures, 100.0% parse success, and wrote `docs/verification/benchmarks/persona-simulation-benchmark-external-20260514T032811Z.json`.
- [ ] Known gaps:
- [ ] Phase docs updated:
- [ ] Next execution plan:
