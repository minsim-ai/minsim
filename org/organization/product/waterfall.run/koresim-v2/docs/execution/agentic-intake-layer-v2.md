---
title: Agentic Intake Layer V2
type: execution-plan
tags: [agentic-intake, safe-summary, evals, langgraph, langfuse]
created: 2026-05-13
updated: 2026-07-13
status: complete
related: [[../design/agentic-intake-workflows/intake-layer-v2-contract]], [[../design/agentic-intake-workflows/universal-agentic-intake-workflow]], [[../design/agentic-intake-workflows/intake-evaluation-fixtures-plan]]
---

# Agentic Intake Layer V2

## 1. Objective

- [x] 사용자 입력을 agentic intake layer의 공식 계약으로 승격한다.
- [x] `IntakeContextEnvelope`와 `safe_intake_summary`를 run/result/agent safe input까지 연결한다.
- [x] 9개 simulation별 intake regression fixture를 추가한다.
- [x] React planner를 V2 단일 planning policy로 확정하고 backend를 session persistence/final validation 경계로 둔다.

## 2. Scope

### In scope

- [x] V2 design contract 문서화.
- [x] frontend TypeScript schema 추가.
- [x] backend Pydantic schema 추가.
- [x] run persistence에 optional `intake_context` 저장.
- [x] result envelope에 `safe_intake_summary` 노출.
- [x] analysis/report/QA agent safe input allowlist에 `safe_intake_summary` 추가.
- [x] deterministic backend intake advance endpoint를 legacy compatibility로 유지하고 deprecated 표시.
- [x] 9 simulations x 8 categories fixture coverage 추가.

### Out of scope

- [x] backend planner를 canonical policy로 승격하지 않음.
- [x] raw chat transcript를 result agents에 전달.
- [x] native LangGraph SQLite checkpointer로 intake state 저장.
- [x] live Langfuse dashboard 검증.

## 3. Contracts

### `IntakeContextEnvelope`

- [x] `schema_version`
- [x] `intake_session_id`
- [x] `router_version`
- [x] `planner_version`
- [x] `task_frame`
- [x] `provenance`
- [x] `safe_intake_summary`

### `safe_intake_summary`

- [x] `user_goal`
- [x] `decision_question`
- [x] `simulation_type`
- [x] source-separated facts: `user_provided`, `inferred`, `generated`, `defaults`
- [x] `reviewed_assumptions`
- [x] `generated_candidates`
- [x] `constraints`
- [x] `source_counts`
- [x] `unreviewed_assumption_count`

## 4. Implementation Checklist

### Phase 1: Design/schema

- [x] Add `docs/design/agentic-intake-workflows/intake-layer-v2-contract.md`.
- [x] Add frontend `SafeIntakeSummary` and `IntakeContextEnvelope` types.
- [x] Add backend Pydantic models.

### Phase 2: Eval fixtures

- [x] Add `simulationIntakeV2Fixtures`.
- [x] Cover 9 simulations across 8 fixture categories.
- [x] Add coverage assertion to `runIntakeFixtureCheck`.

### Phase 3: Backend intake engine

- [x] Add deterministic `src/intake/engine.py`.
- [x] Add `POST /api/intake/advance`.
- [x] Persist advanced snapshots in existing intake session store.
- [x] Return LangGraph-ready checkpoint metadata.

### Phase 4: Result agent connection

- [x] Store optional `intake_context` with run records.
- [x] Add `safe_intake_summary` to result envelopes.
- [x] Include `safe_intake_summary` in LLM agent safe input.

### Phase 5: Langfuse regression

- [x] Add router/planner versions to intake context/checkpoint.
- [x] Document Langfuse dataset tags for fixture-based regression.
- [x] Keep payload metadata-only by default.

### Phase 6: V3 ownership hardening

- [x] Set `intake-planner:v3-20260713` as the canonical React policy version.
- [x] Materialize run defaults as provenance-tagged slots.
- [x] Persist Minsim V2 snapshots through `/api/intake/sessions`.
- [x] Link persisted intake sessions to created project runs.
- [x] Reject run envelopes with unreviewed assumptions.
- [x] Mark `/api/intake/advance` deprecated and document its legacy v2 scope.

## 5. Verification

- [x] `npm run check:intake` passed with 126 fixtures.
- [x] focused backend tests passed: `tests/test_api_schemas.py`, `tests/test_jobs_store.py`, `tests/test_api_app.py`, `tests/test_phase7_orchestration.py`.
- [x] `uv run python scripts/verify.py` passed.

Validation log:

- 2026-05-13: `npm run check:intake` passed.
- 2026-05-13: `uv run pytest tests/test_api_schemas.py tests/test_jobs_store.py tests/test_api_app.py tests/test_phase7_orchestration.py` passed: 48 tests.
- 2026-05-13: `uv run python scripts/verify.py` passed: ruff, deterministic evals, 152 pytest tests with 87.43% coverage, frontend lint/typecheck/build.
