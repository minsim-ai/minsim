---
title: Phase 6 Execution — Frontend Backend Design Sync
type: execution-plan
tags: [phase-6, execution, design-sync, frontend, backend, api-contract]
created: 2026-05-02
updated: 2026-05-03
status: completed
related: [[../templates/execution-plan-template]], [[../phases/phase-6-design-sync]], [[../design/react-fastapi-migration]]
---

# Phase 6 Execution — Frontend Backend Design Sync

## 0. Metadata

- [x] Execution plan id: `phase-6-design-sync`
- [x] Target phase: Phase 6
- [x] Related design doc: [[../design/react-fastapi-migration]]
- [x] Owner: KoreaSim
- [x] Status: completed
- [x] Created: 2026-05-02
- [x] Updated: 2026-05-03

## 1. Summary

### Objective

- [x] React UI, mock fixtures, FastAPI schema, persisted result envelope의 drift를 막는다.
- [x] 새로운 simulation 추가 시 frontend/backend 변경 절차를 고정한다.
- [x] ResultsPage가 hardcoded demo result에 다시 의존하지 않게 한다.

### User-visible outcome

- [x] 결과 화면은 실제 run 상태에 맞게 loading/running/partial/completed/failed/restored를 보여준다.
- [x] 새 simulation이 추가돼도 UI 품질과 trust layer가 유지된다.

### Engineering outcome

- [x] shared schema document and TypeScript types exist.
- [x] mock data is contract-compatible.
- [x] simulation addition checklist becomes repeatable.

## 2. Inputs

### Source documents

- [x] Phase plan: [[../phases/phase-6-design-sync]]
- [x] Design doc: [[../design/react-fastapi-migration]]
- [x] Execution template: [[../templates/execution-plan-template]]
- [x] Visualization spec: [[../functional/visualization-spec]]
- [x] Quality spec: [[../functional/quality-and-trust]]

### Existing code to read first

- [x] `src/api/schemas.py`
- [x] `src/jobs/store.py`
- [x] `frontend/src/ResultsPage.tsx`
- [x] `frontend/src/data/mockData.ts`
- [x] `frontend/src/styles.css`
- [x] `frontend/src/App.tsx`
- [x] `frontend/src/main.tsx`

## 3. Scope

### In scope

- [x] shared API/result schema document.
- [x] TypeScript API/result types.
- [x] mock fixture reshaping.
- [x] API client consolidation.
- [x] ResultsPage state model.
- [x] reusable trust rendering pattern.
- [x] design QA checklist.
- [x] simulation addition checklist.

### Out of scope

Retained as deferred notes, not Phase 6 completion tasks:

- visual redesign unrelated to schema sync.
- design system migration to a new UI library.
- backend engine quality improvements.
- Cloudflare policy changes.

### Dependencies

- [x] Phase 1 API contract.
- [x] Phase 4 trust layer requirements.
- [x] Phase 5 common envelope decision is documented as a reusable checklist; concrete simulation registries remain Phase 5 work.

## 4. Contracts

### API contract

- [x] schema doc records endpoint, request, response, error, and auth rule.
- [x] backend schema change must update TypeScript types or generation step.
- [x] API errors have stable shape:
  - [x] `code`
  - [x] `message`
  - [x] `details`

### Data contract

- [x] mock fixtures have the same top-level envelope as real API results.
- [x] simulation-specific data is inside `metrics`.
- [x] status values are shared between backend and frontend.
- [x] no fixture-only field is required by production UI.

### Frontend contract

- [x] route states:
  - [x] no run selected.
  - [x] queued.
  - [x] running.
  - [x] partial results available.
  - [x] completed.
  - [x] failed.
  - [x] interrupted.
  - [x] restored from previous run.
- [x] all visual tokens remain in `frontend/src/styles.css`.

## 5. Implementation Checklist

### 5.1 Backend

- [x] `src/api/schemas.py`
  - [x] ensure schema names are stable.
  - [x] add comments or doc references for result envelope fields.
- [x] `docs/api-result-schema.md`
  - [x] document run lifecycle.
  - [x] document common result envelope.
  - [x] document simulation-specific metrics pattern.

### 5.2 Worker / Queue

- [x] no queue behavior change required.
- [x] confirm worker writes all frontend-required status fields.
- [x] confirm partial result fields match frontend partial state.

### 5.3 Database / Persistence

- [x] persisted JSON envelope has schema version or compatible field.
- [x] mock fixtures and stored results can be compared by a lightweight script/test.
- [x] no UI-required state exists only in memory.

### 5.4 Frontend

- [x] `frontend/src/api/client.ts`
  - [x] centralize fetch and error handling.
- [x] `frontend/src/api/runs.ts`
  - [x] typed run API functions.
- [x] `frontend/src/types/api.ts`
  - [x] run lifecycle types.
  - [x] error response type.
- Result envelope and simulation metric types live in `frontend/src/types/api.ts`; a separate `frontend/src/types/simulations.ts` split is deferred until Phase 5 adds native non-Creative Testing engines.
- [x] `frontend/src/data/runStateFixtures.ts`
  - [x] replace incompatible mock data.
  - [x] include all required route states.
- Run status, quality cards, and sample summary rendering remain in `frontend/src/ResultsPage.tsx` for this phase; separate component extraction is deferred until repeated simulation renderers justify it.
- [x] `frontend/src/ResultsPage.tsx`
  - [x] remove hardcoded result values.
  - [x] render from API result or contract-compatible fixture only.

### 5.5 Documentation

- [x] design QA checklist created or updated.
- [x] simulation addition checklist created.
- [x] Phase 6 checkboxes updated.
- [x] CLAUDE.md references schema-first workflow.

## 6. Mock Data and Fixtures

### Required mock data

- [x] `no_run_selected`
- [x] `run_queued`
- [x] `run_running`
- [x] `run_partial_results`
- [x] `run_completed_creative_testing`
- [x] `run_completed_price_optimization`
- [x] `run_failed`
- [x] `run_interrupted`
- [x] `run_restored`

### Mock data details

- [x] all fixtures include `run_id`.
- [x] all fixtures include `simulation_type`.
- [x] all fixtures include status.
- [x] completed fixtures include `quality`, `sample_summary`, `metrics`, `raw_results`.
- [x] failed/interrupted fixtures include readable `error`.
- [x] partial fixture includes partial count and available partial summaries.

### Fixture rules

- [x] mock data must be contract-compatible.
- [x] production UI may use fixtures only for demo/story states, not live route data.
- [x] changing backend schema requires fixture update in the same change.

## 7. Edge Cases and Exceptions

### Input validation

- [x] frontend sends invalid simulation type.
- [x] backend result lacks optional metrics.
- [x] API error does not include details.

### Runtime failures

- [x] API unavailable.
- [x] SSE unavailable.
- [x] result endpoint returns 404 after localStorage restore.
- [x] schema version mismatch.
- [x] raw result too large for immediate render.

### Access/security

- [x] protected API returns Access redirect instead of JSON.
- [x] frontend handles auth/session failure without corrupting run state.
- [x] no secrets in mock fixtures.

## 8. Tests

### Automated tests

- [x] frontend typecheck.
- [x] frontend build.
- [x] fixture schema validation.
- [x] API schema smoke if backend tests exist.
- [x] ResultsPage state render route exists for each fixture state.

### Manual checks

- [x] inspect no-run state.
- [x] inspect queued/running/partial/completed/failed/interrupted states.
- [x] refresh completed result.
- [x] simulate API error.
- [x] mobile viewport overflow check.

### Commands

```bash
cd frontend && npm run typecheck && npm run build
curl http://127.0.0.1:8000/api/config
curl http://127.0.0.1:8000/api/runs/<run_id>
```

## 9. Acceptance Criteria

### Pass conditions

- [x] frontend types match documented backend envelope.
- [x] mock fixtures match real API shape.
- [x] ResultsPage has no hardcoded production result numbers.
- [x] every required run state has UI coverage.

### Must not regress

- [x] existing landing/app routes still render.
- [x] Creative Testing result still displays.
- [x] Phase 4 trust layer remains visible.

### Demo-ready criteria

- [x] UI can be reviewed in every run state.
- [x] schema drift is visible during review instead of during demo.

## 10. Observability and Debugging

- [x] schema version visible in result envelope or docs.
- [x] fixture validation command documented.
- [x] API client normalizes non-JSON Access redirects/challenges into user-facing errors.
- [x] browser route for each mock state documented.

## 11. Rollback Plan

Rollback notes retained for operational reference; no Phase 6 rollback was required:

- keep old mock fixtures until new fixtures pass validation.
- revert ResultsPage in isolation if renderer fails.
- preserve API client if it already works for live runs.
- do not revert backend schema unless live API is broken.

## 12. Review Checklist

- [x] API schema changed before UI field dependency.
- [x] mock data does not invent fields.
- [x] route states are complete.
- [x] visual changes respect `frontend/src/styles.css`.
- [x] no unrelated redesign.

## 13. Completion Log

- [x] Implementation completed: `schema_version` added to `RunResultEnvelope`, frontend type, deterministic fixture, and worker-persisted envelopes; `docs/api-result-schema.md`, `docs/design-qa-checklist.md`, and `docs/simulation-addition-checklist.md` added; legacy result-style values were removed from `frontend/src/data/mockData.ts`; `frontend/src/data/runStateFixtures.ts` now holds typed API-envelope story states; frontend API client normalizes non-JSON Cloudflare Access redirects/challenges; `/results/story/<fixture_id>` routes expose every fixture state for browser review.
- [x] Tests run: `uv run pytest tests/test_api_schemas.py tests/test_schema_parity.py tests/test_result_envelope_fixtures.py tests/test_jobs_worker.py`; `uv run python evals/run_result_envelope_fixture_eval.py`; `npm run typecheck`; `npm run lint && npm run typecheck && npm run build`; `uv run python scripts/verify.py`.
- [x] Known gaps: story-state fixtures have browser routes, but no automated visual regression harness yet.
- [x] Phase docs updated: Phase 6 checkboxes and CLAUDE.md updated for schema doc, design QA checklist, and simulation addition checklist.
- [x] Next execution plan: [[phase-5-simulation-framework-price-optimization]]
