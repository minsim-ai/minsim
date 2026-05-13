---
title: Phase 5 Execution — Simulation Framework and Price Optimization
type: execution-plan
tags: [phase-5, execution, simulations, price-optimization, registry, result-schema]
created: 2026-05-02
updated: 2026-05-03
status: implementation-complete-live-validated
related: [[../templates/execution-plan-template]], [[../phases/phase-5-simulations]], [[../design/react-fastapi-migration]]
---

# Phase 5 Execution — Simulation Framework and Price Optimization

## 0. Metadata

- [x] Execution plan id: `phase-5-simulation-framework-price-optimization`
- [x] Target phase: Phase 5
- [x] Related design doc: [[../design/react-fastapi-migration]]
- [x] Owner: KoreaSim
- [x] Status: implementation-complete-live-validated
- [x] Created: 2026-05-02
- [x] Updated: 2026-05-03

## 1. Summary

### Objective

- [x] Creative Testing 전용 구조를 multi-simulation framework로 확장한다.
- [x] Price Optimization을 reference implementation으로 완성한다.
- [x] Product Launch, Value Proposition, Market Segmentation, Competitive Positioning, Brand Perception, Churn Prediction, Campaign Strategy를 같은 contract로 확장한다.
- [x] 9개 simulation을 API/RQ worker/SQLite/result envelope/React renderer 경로에서 실행한다.
- [x] 모든 simulation을 50/200-person deterministic gate와 live external 200-person gate로 검증한다.

### Current implementation

- [x] Backend registry: `src/simulations/registry.py`
- [x] Common runner/envelope/quality: `src/simulations/common.py`, `src/jobs/result_envelope.py`
- [x] Generic simulation suite: `src/simulations/generic_suite.py`
- [x] API schemas and supported simulation config: `src/api/schemas.py`
- [x] RQ worker dispatch and result persistence: `src/jobs/worker.py`, `src/jobs/store.py`
- [x] Frontend run form and preset selection: `frontend/src/App.tsx`, `frontend/src/data/presets.ts`
- [x] Frontend API result renderer registry: `frontend/src/simulations/registry.ts`
- [x] Result trust, metric, segment, persona, crowd renderer: `frontend/src/ResultsPage.tsx`

## 2. Contracts

### API contract

- [x] `SimulationType` includes `creative_testing`.
- [x] `SimulationType` includes `price_optimization`.
- [x] `SimulationType` includes `product_launch`.
- [x] `SimulationType` includes `value_proposition`.
- [x] `SimulationType` includes `market_segmentation`.
- [x] `SimulationType` includes `competitive_positioning`.
- [x] `SimulationType` includes `brand_perception`.
- [x] `SimulationType` includes `churn_prediction`.
- [x] `SimulationType` includes `campaign_strategy`.
- [x] `POST /api/runs` accepts `simulation_type`, `input`, `target_filter`, `sample_size`, `seed`, and optional `model_alias`.
- [x] Unsupported simulation values return structured API errors.
- [x] `/api/config` exposes supported simulations and presets.

### Data contract

- [x] Common result envelope includes `schema_version`, `run_id`, `simulation_type`, `status`, `seed`, `sample_size`, `total_responses`, `parse_failed`, `target_filter`, `sample_summary`, `quality`, `warnings`, `metrics`, `segments`, `insights`, `raw_results`, and model metadata.
- [x] Simulation-specific aggregates live under `metrics`.
- [x] Full protected `raw_results` remains available in persisted envelopes for MVP analysis.
- [x] Operational secrets, provider keys, Cloudflare credentials, Langfuse keys, and internal stack traces are not committed or emitted in third-party trace payloads.

### Frontend contract

- [x] Frontend type union matches backend simulation types.
- [x] Preset cards create the correct simulation input payload.
- [x] Renderer registry maps all 9 simulation types to metric sections.
- [x] Unknown or unsupported state renders a safe user-facing error.
- [x] Trust layer renders for every simulation result.
- [x] V1 crowd visualization renders up to 100 persona icons, a rotating quote, and a persona detail modal.

## 3. Implementation Checklist

### Backend

- [x] Register all 9 simulations in backend registry.
- [x] Add all input schemas.
- [x] Add common run request and result envelope schemas.
- [x] Implement generic prompt building and schema-specific parser requirements.
- [x] Compute simulation-specific metrics for all 9 simulation types.
- [x] Compute shared quality, sample summary, warnings, segments, and insights.
- [x] Dispatch worker jobs by `simulation_type`.
- [x] Persist common envelopes for all simulation types.
- [x] Keep API route thin and simulation-agnostic.
- [x] Store simulation-specific input JSON in `runs.input`.
- [x] Store common envelope JSON in `run_results.result_json`.

### Frontend

- [x] Add simulation type union and common result envelope type.
- [x] Add presets for all 9 simulation types.
- [x] Switch Coffee preset to native Price Optimization.
- [x] Render Price Optimization demand, intent, recommendation, segment, persona, and trust outputs through common sections.
- [x] Render Product Launch metrics and insights.
- [x] Render Value Proposition choice and persuasion metrics.
- [x] Render Market Segmentation segment candidates.
- [x] Render Competitive Positioning preference and attribute metrics.
- [x] Render Brand Perception score and association metrics.
- [x] Render Churn Prediction intent, risk, reason, and retention metrics.
- [x] Render Campaign Strategy channel/message/combination metrics with modeled assumptions labeled.
- [x] Restore completed results after refresh.
- [x] Add `/validation` page for public validation evidence.

### Documentation

- [x] Update Phase 5 status.
- [x] Update functional specs 02-09 from planned placeholders to implemented V1.
- [x] Update quality/trust spec with result envelope and `/validation` status.
- [x] Update visualization spec with V1 crowd renderer status.
- [x] Document simulation addition path in `docs/simulation-addition-checklist.md`.
- [x] Document result schema in `docs/api-result-schema.md`.

## 4. Simulation Rollout Gates

### 5.0 Common Simulation Framework

- [x] `SimulationType` enum exists.
- [x] Backend registry exists.
- [x] Frontend renderer registry exists.
- [x] Common result envelope is used by Creative Testing and all expanded simulations.
- [x] Preset schema is aligned with `POST /api/runs`.

### 5.1 Price Optimization

- [x] Backend implementation exists.
- [x] Frontend form/preset exists.
- [x] Frontend result renderer exists.
- [x] Coffee preset switched to native Price Optimization.
- [x] 50 deterministic and 200 external runs pass.

### 5.2 Product Launch

- [x] Input schema: product concept, features, use case, price range, alternatives.
- [x] Metrics: intent distribution, score distribution, high-intent segments, rejection clusters, positioning angle.
- [x] Preset added.
- [x] Renderer added.
- [x] Local deterministic 50/200 and external 200 validation pass.

### 5.3 Value Proposition

- [x] Input schema: statements, product/category context, target filter.
- [x] Metrics: preference ranking, persuasiveness, clarity, emotional resonance, segments.
- [x] Native Value Proposition preset added.
- [x] Renderer added.
- [x] Local deterministic 50/200 and external 200 validation pass.

### 5.4 Market Segmentation

- [x] Input schema: category, product family, core questions, target filter.
- [x] LLM-coded label flow implemented first.
- [x] Metrics: segment candidates, size estimates, needs/pains/jobs, quotes, first target.
- [x] Embeddings/KMeans deferred until label quality fails.
- [x] Local deterministic 50/200 and external 200 validation pass.

### 5.5 Competitive Positioning

- [x] Input schema: products, competitors, attributes, category context.
- [x] Metrics: preference share, attribute matrix, positioning map, strengths/weaknesses, segment preference.
- [x] Renderer added.
- [x] Local deterministic 50/200 and external 200 validation pass.

### 5.6 Brand Perception

- [x] Input schema: brand, category, optional context, attributes.
- [x] Metrics: familiarity proxy, association keywords, attribute scores, positive/negative themes.
- [x] Limitation copy states this is not true time-series tracking.
- [x] Renderer added.
- [x] Local deterministic 50/200 and external 200 validation pass.

### 5.7 Churn Prediction

- [x] Input schema: service description, customer situation, pain points/recent changes, retention offers.
- [x] Metrics: churn intent, high-risk segments, churn reasons, retention message recommendations.
- [x] Renderer added.
- [x] Local deterministic 50/200 and external 200 validation pass.

### 5.8 Campaign Strategy

- [x] Input schema: channels, messages, budget/context assumptions, target filter.
- [x] Metrics: channel-message matrix, segment fit, qualitative rationale.
- [x] ROI/viral values are labeled as modeled assumptions.
- [x] Renderer added.
- [x] Local deterministic 50/200 and external 200 validation pass.

## 5. Tests and Evidence

- [x] Deterministic 50/200-person validation passed for all Phase 5 simulations.
  - Artifact: `docs/verification/phase-5-phase-7-deterministic-validation.json`
- [x] Live external 200-person validation passed for all 9 simulations through `https://arabesque.cc/api/runs`.
  - Artifact: `docs/verification/external-gemini-9-simulations-200-2026-05-03.json`
  - Scope: 1,800 total persona responses, 9 completed runs, 0 failed runs, 3 parse failures total.
- [x] Public external route and SSE replay gate passed.
  - Command: `uv run python scripts/check_public_external_demo.py --timeout-seconds 15`
  - SSE evidence: completed Creative Testing run replay returned `snapshot`, `created`, `queued`, `running`, and `progress` events.
- [x] Frontend typecheck/build and full project verify passed before this reconciliation pass.
- [x] Current reconciliation pass adds the V1 crowd renderer and `/validation` page, then re-runs full verify before commit.

## 6. Acceptance Criteria

- [x] 9 simulation types are registered.
- [x] 9 simulation types run through API/RQ worker.
- [x] 9 simulation types persist common result envelopes.
- [x] 9 simulation types render in React.
- [x] Every simulation has at least one preset.
- [x] Trust layer and disclaimer render for every result.
- [x] Results restore after refresh.
- [x] Price Optimization no longer falls back to Creative Testing.
- [x] Creative Testing still runs.
- [x] API route remains thin.
- [x] Streamlit remains an internal fallback and was not expanded as the external demo path.

## 7. Out of Scope

- Multi-tenant customer accounts.
- PDF/Excel export.
- External survey ingestion.
- Causal inference claims.
- V2 node graph/Canvas LOD visualization.

## 8. Completion Log

- [x] Implementation completed: common runner, backend registry, all 9 input schemas and presets, generic worker dispatch, result envelope builder, React result renderer registry, trust layer, crowd renderer, validation page, and chat payload builders.
- [x] Tests run: targeted pytest suite, ruff, frontend lint/typecheck/build, deterministic 50/200-person validation, live external Gemini 9x200 validation.
- [x] Known gap: local `smollm2:135m` Ollama fallback can complete 50-person Creative Testing but is too slow for a full local 200-person workload on this machine; this is documented as `LOCAL_MODEL_THROUGHPUT_LIMIT`.
- [x] Phase docs updated: [[../phases/phase-5-simulations]]
- [x] Functional specs updated: [[../functional/02-price-optimization]], [[../functional/03-product-launch]], [[../functional/04-value-proposition]], [[../functional/05-market-segmentation]], [[../functional/06-competitive-positioning]], [[../functional/07-brand-perception]], [[../functional/08-churn-prediction]], [[../functional/09-campaign-strategy]], [[../functional/quality-and-trust]], [[../functional/visualization-spec]]
- [x] Next execution plan: [[phase-7-llm-gateway-orchestration]]
