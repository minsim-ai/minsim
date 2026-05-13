---
title: Phase 4 Execution — Demo Content and Trust Layer
type: execution-plan
tags: [phase-4, execution, react, demo, presets, trust-layer]
created: 2026-05-02
updated: 2026-05-03
status: completed
related: [[../templates/execution-plan-template]], [[../phases/phase-4-demo-content]], [[../design/react-fastapi-migration]], [[../design/data-governance-and-io-boundary]]
---

# Phase 4 Execution — Demo Content and Trust Layer

## 0. Metadata

- [x] Execution plan id: `phase-4-demo-content-trust-layer`
- [x] Target phase: Phase 4
- [x] Related design doc: [[../design/react-fastapi-migration]]
- [x] Owner: KoreaSim
- [x] Status: completed
- [x] Created: 2026-05-02
- [x] Updated: 2026-05-03

## 1. Summary

### Objective

- [x] React app에서 30초 안에 첫 run을 시작할 수 있는 preset-first demo flow를 만든다.
- [x] Galaxy Creative, Coffee Price, OTT Value Proposition 3개 demo preset을 제공한다.
- [x] API result가 연결된 결과 화면에 sample, quality, limitation, reproducibility 정보를 표시한다.

### User-visible outcome

- [x] 사용자는 `/app`에서 demo preset을 선택하고 바로 실행할 수 있다.
- [x] 결과 화면에서 이 결과가 어떤 표본과 조건으로 생성됐는지 확인할 수 있다.
- [x] Coffee/OTT preset은 Phase 5 구현 전까지 fallback 여부가 명확하게 보인다.

### Engineering outcome

- [x] preset schema가 API request schema와 맞춰진다.
- [x] ResultsPage가 mock-only 화면에서 실제 API result 중심 화면으로 이동한다.
- [x] trust layer component가 Phase 5의 모든 simulation에 재사용 가능해진다.

## 2. Inputs

### Source documents

- [x] Phase plan: [[../phases/phase-4-demo-content]]
- [x] Design doc: [[../design/react-fastapi-migration]]
- [x] Functional overview: [[../functional/overview]]
- [x] Quality spec: [[../functional/quality-and-trust]]
- [x] Visualization spec: [[../functional/visualization-spec]]
- [x] Data governance: [[../design/data-governance-and-io-boundary]]

### Existing code to read first

- [x] `frontend/src/App.tsx`
- [x] `frontend/src/LandingPage.tsx`
- [x] `frontend/src/ResultsPage.tsx`
- [x] `frontend/src/data/mockData.ts`
- [x] `frontend/src/styles.css`
- [x] `src/api/schemas.py`
- [x] `src/api/routes.py`

## 3. Scope

### In scope

- [x] quick-start preset selector.
- [x] preset schema and fixture data.
- [x] backend `/api/presets` endpoint as the preset source of truth.
- [x] result trust layer components.
- [x] sample summary component.
- [x] run reproducibility metadata display.
- [x] non-dismissible disclaimer.
- [x] dataset attribution in landing/result trust surfaces.
- [x] demo script for a 3-minute flow.

### Out of scope

Retained as deferred notes, not Phase 4 completion tasks:

- new landing page from scratch.
- PDF/Excel export.
- political/election preset.
- multilingual content.
- real Price Optimization or Value Proposition engine implementation.

### Dependencies

- [x] Phase 1 run API completed.
- [x] Phase 2 recovery contract available or stubbed.
- [x] actual result envelope shape available.
- [x] frontend build passes.

## 4. Contracts

### API contract

- [x] `GET /api/presets`
- [x] preset item shape:
  - [x] `id`
  - [x] `title`
  - [x] `simulation_type`
  - [x] `description`
  - [x] `input`
  - [x] `target_filter`
  - [x] `sample_size`
  - [x] `seed`
  - [x] `fallback_simulation_type`
  - [x] `demo_notes`
- [x] `POST /api/runs` accepts preset-derived request without frontend-only fields.

### Data contract

- [x] trust layer fields:
  - [x] `sample_size`
  - [x] `total_responses`
  - [x] `parse_failed`
  - [x] `seed`
  - [x] `target_filter`
  - [x] `sample_summary`
  - [x] `quality`
  - [x] `warnings`
  - [x] `model`
  - [x] `created_at`
- [x] fallback preset must include `fallback_reason`.

### Frontend contract

- [x] `/app` shows preset-first entry and keeps chat-style/custom entry.
- [x] preset run uses same API client as custom run.
- [x] ResultsPage renders loading, running, failed, and completed states.
- [x] trust layer is visible without being hidden behind dismissible UI.

## 5. Implementation Checklist

### 5.1 Backend

- [x] `src/api/schemas.py`
  - [x] add or align preset request schema.
  - [x] ensure trust fields exist in result envelope.
- [x] `src/api/routes.py`
  - [x] add `/api/presets` as the canonical preset source.
  - [x] validate preset request can be passed to `POST /api/runs`.

### 5.2 Worker / Queue

- [x] no new queue behavior required.
- [x] ensure worker writes model, seed, target filter, quality, and warning metadata.

### 5.3 Database / Persistence

- [x] result envelope persists trust fields.
- [x] no production result depends on static fixture numbers.
- preset id/source persistence remains optional; Phase 4 keeps `/api/presets` as the source of truth and does not require a separate top-level run field.

### 5.4 Frontend

- [x] backend `src/api/presets.py`
  - [x] keep only contract-compatible frontend fixture/story data.
  - [x] production source of truth is the backend preset endpoint.
- [x] `src/api/presets.py`
  - [x] add Galaxy Creative preset.
  - [x] add Coffee Price preset with explicit fallback until 5.1.
  - [x] add OTT Value Proposition preset with explicit fallback until 5.3.
- [x] `frontend/src/App.tsx`
  - [x] compact preset selector.
  - [x] visible fallback label for non-native simulations.
- [x] `frontend/src/ResultsPage.tsx`
  - [x] total responses.
  - [x] parse success/failure.
  - [x] sample confidence grade.
  - [x] warnings count.
  - [x] sample summary.
  - [x] seed, model, timestamp, target filter.
  - [x] non-dismissible simulation limitation copy.
  - [x] `NVIDIA Nemotron-Personas-Korea, CC BY 4.0` attribution or linked data-source detail.
- [x] `frontend/src/ResultsPage.tsx`
  - [x] render trust layer from API result.
  - [x] remove hardcoded completed-only assumptions.
- [x] `frontend/src/App.tsx`
  - [x] preset selection creates a real run request.
  - [x] custom/chat flow remains available.

### 5.5 Documentation

- [x] demo script added to docs or README.
- [x] Phase 4 checkbox status updated.
- [x] preset fallback behavior documented.

## 6. Mock Data and Fixtures

### Required mock data

- [x] `preset_galaxy_creative_testing`
- [x] `preset_coffee_price_fallback`
- [x] `preset_ott_value_prop_fallback`
- [x] `trust_layer_good_quality`
- [x] `trust_layer_low_parse_rate`
- [x] `completed_result_with_warnings`

### Mock data details

- [x] Galaxy options: premium tone, productivity tone, lifestyle tone.
- [x] Coffee demo options: 4,500 KRW, 5,500 KRW, 6,500 KRW.
- [x] OTT options: content exclusivity, missed-content recovery, subscription value.
- [x] target filters include age range and employment exclusions.
- [x] quality includes parse rate and warnings.
- [x] run metadata includes model, seed, timestamp.

### Fixture rules

- [x] fixture shape must match actual API result envelope.
- [x] fallback preset must not pretend to be a completed native simulation.
- [x] brand/product names must be safe demo examples.

## 7. Edge Cases and Exceptions

### Input validation

- [x] preset missing required input.
- [x] preset references unsupported simulation type.
- [x] fallback simulation missing.
- [x] target filter returns no personas.

### Runtime failures

- [x] run creation fails.
- [x] API preset endpoint unavailable.
- [x] completed result lacks quality field.
- [x] completed result has warnings.
- [x] `raw_results` too large for smooth rendering.

### Access/security

- [x] preset data contains no secrets.
- [x] public landing must not expose protected API result.
- [x] `/app` remains protected after Phase 3.

## 8. Tests

### Automated tests

- [x] frontend typecheck.
- [x] frontend build.
- [x] preset schema test or fixture shape check.
- [x] ResultsPage completed/failed/running render states are covered by typed fixtures and Phase 6 story routes.

### Manual checks

- [x] new browser can start first preset in under 30 seconds.
- [x] Galaxy preset completes and displays trust layer.
- [x] Coffee preset shows native or fallback state clearly.
- [x] OTT preset shows native or fallback state clearly.
- [x] long Korean text does not overflow on mobile.

### Commands

```bash
cd frontend && npm run typecheck && npm run build
curl http://127.0.0.1:8000/api/presets
```

## 9. Acceptance Criteria

### Pass conditions

- [x] three demo presets are selectable and executable.
- [x] result page renders real API result values.
- [x] trust layer appears on every completed result.
- [x] dataset attribution appears in required trust surfaces.
- [x] fallback simulations are labeled honestly.

### Must not regress

- [x] custom/chat-style flow remains usable.
- [x] landing remains public.
- [x] Streamlit fallback remains available.

### Demo-ready criteria

- [x] first-time user can start a run without reading instructions.
- [x] reviewer can explain result quality and limitations from the page itself.

## 10. Observability and Debugging

- preset id is not persisted as a top-level field; run metadata records simulation type, seed, model, and request payload.
- [x] result includes model/seed/timestamp.
- [x] warnings visible in UI.
- [x] fallback state visible in UI and API response.

## 11. Rollback Plan

Rollback notes retained for operational reference; no Phase 4 rollback was required:

- disable preset selector and keep custom run form.
- revert to previous ResultsPage rendering while preserving API client.
- keep trust fields in backend result envelope if already persisted.

## 12. Review Checklist

- [x] no mock-only numbers in production result route.
- [x] trust layer is visible and not dismissible.
- [x] attribution is present and does not imply real survey respondents.
- [x] political or sensitive preset is not in default enterprise demo.
- [x] fallback is clearly labeled.

## 13. Completion Log

- [x] Implementation completed: Phase 4 demo preset and trust-layer minimum completed on 2026-05-03.
- [x] Tests run: `uv run python scripts/verify.py`; `uv run pytest tests/test_api_app.py tests/test_api_schemas.py tests/test_schema_parity.py tests/test_result_envelope_fixtures.py`; frontend lint/typecheck/build.
- [x] Known gaps: preset id/source is not separately persisted as a top-level run field; authenticated Access validation remains Phase 3 blocker.
- [x] Phase docs updated:
- [x] Next execution plan: [[phase-5-simulation-framework-price-optimization]]
