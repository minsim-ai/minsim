---
title: Agentic Intake Creative Testing v1 Execution Plan
type: execution-plan
tags: [agentic-intake, creative-testing, implementation, dynamic-form, agentic-workflow]
created: 2026-05-04
updated: 2026-05-05
status: implemented-v1
related: [[../design/agentic-intake-workflows/README]], [[../design/agentic-intake-workflows/universal-agentic-intake-workflow]], [[../design/agentic-intake-workflows/creative-testing-intake-v1]], [[../design/agentic-intake-workflows/n8n-node-algorithm]], [[../functional/01-creative-testing]]
---

# Agentic Intake Creative Testing v1 Execution Plan

> 목적: 고정 `chatSteps` 기반 입력 흐름을 goal-first agentic intake 흐름으로 확장한다.
> 첫 배포 단위는 `creative_testing` 하나만 end-to-end로 완성하되, 9개 시뮬레이션으로 확장 가능한 공통 슬롯/플래너 구조를 함께 만든다.

## 0. Metadata

- [x] Execution plan id: `agentic-intake-creative-testing-v1`
- [x] Target phase: post Phase 7 product UX expansion
- [x] Related design doc: `docs/design/agentic-intake-workflows/*`
- [x] Owner: KoreaSim product engineering
- [x] Status: draft
- [x] Created: 2026-05-04
- [x] Updated: 2026-05-04

## 1. Summary

### Objective

- [ ] 사용자가 시뮬레이션 종류를 먼저 고르지 않고 자연어 목표로 시작할 수 있다.
- [ ] 시스템이 목표를 `TaskFrame`으로 해석하고 `creative_testing`을 선택한다.
- [ ] 부족한 정보가 있으면 한 번에 하나 질문하거나 동적 폼을 보여준다.
- [ ] 후보 헤드라인/카피가 없으면 AI 또는 deterministic generator가 후보를 만든다.
- [ ] 생성/추정한 값은 사용자가 확인하거나 수정할 수 있다.
- [ ] 최종적으로 기존 `/api/runs`의 `RunCreateRequest`로 변환되어 현재 RQ worker와 결과 화면을 그대로 사용한다.

### User-visible outcome

- [ ] `/app` 첫 화면에서 "제 상품 상세페이지 헤드라인을 만들고 싶어요"처럼 자연어로 시작 가능.
- [ ] 제품 설명이 없으면 "어떤 제품인가요?"를 묻는다.
- [ ] 제품 설명이 있으면 핵심 고객, 장점, 톤 등을 받는 compact form이 채팅 안에 나타난다.
- [ ] 사용자가 일부만 입력해도 나머지 추천값과 후보 카피를 생성한다.
- [ ] 후보 카피 카드에서 수정/삭제/추가 후 "시뮬레이션 시작" 가능.
- [ ] 결과 페이지는 기존 creative testing 보고서를 사용한다.

### Engineering outcome

- [ ] `src/intake/*` 백엔드 모듈 또는 우선 `frontend/src/intake/*` 공통 planner가 생긴다.
- [ ] intake session, slot, task frame, action 타입이 명확해진다.
- [ ] `creative_testing`용 slot schema와 payload builder가 생긴다.
- [ ] 프론트엔드 채팅은 text-only message뿐 아니라 `show_form`, `candidate_review`, `confirm_assumptions`, `run_ready` action을 렌더링할 수 있다.
- [ ] 8개 추가 시뮬레이션은 slot schema와 payload builder를 추가하는 방식으로 확장 가능해진다.

## 2. Inputs

### Source documents

- [x] Design doc: [[../design/agentic-intake-workflows/universal-agentic-intake-workflow]]
- [x] Creative testing intake: [[../design/agentic-intake-workflows/creative-testing-intake-v1]]
- [x] n8n algorithm: [[../design/agentic-intake-workflows/n8n-node-algorithm]]
- [x] Functional spec: [[../functional/01-creative-testing]]
- [x] API/schema reference: `src/api/schemas.py`, `frontend/src/types/api.ts`

### Existing code to read first

- [x] Backend API routes: `src/api/routes.py`
- [x] Backend API schemas: `src/api/schemas.py`
- [x] Run persistence: `src/jobs/store.py`
- [x] Frontend run client: `frontend/src/api/runs.ts`
- [x] Frontend app entry: `frontend/src/App.tsx`
- [x] Existing fixed chat data: `frontend/src/data/mockData.ts`
- [x] Existing scenario fixture: `frontend/src/data/chatScenarioFixtures.ts`
- [x] Tests: `tests/test_api_app.py`, `tests/test_api_schemas.py`, `tests/test_schema_parity.py`

## 3. Scope

### In scope

- [ ] Common intake type model:
  - `TaskFrame`
  - `IntakeSlotValue`
  - `SlotRequirement`
  - `DynamicFormSchema`
  - `IntakeAction`
  - `IntakeSession`
- [ ] Creative testing slot schema.
- [ ] Goal-first router for creative/headline/copy requests.
- [ ] Slot extraction and deterministic merge.
- [ ] Gap analyzer and next action planner.
- [ ] Dynamic form rendering in chat.
- [ ] Candidate generation and review cards for creative candidates.
- [ ] Existing `/api/runs` payload creation for `creative_testing`.
- [ ] Tests for planner and payload conversion.
- [ ] Dev fixture scenarios that model incomplete, staged user input.

### Out of scope

- [ ] Full AI-native routing for all 9 simulations.
- [ ] Backend persistence of intake sessions if frontend-only MVP is selected for the first cut.
- [ ] Multi-simulation automatic run chaining.
- [ ] Uploaded file parsing.
- [ ] Image/video creative evaluation.
- [ ] Replacing the existing results page.
- [ ] Replacing `/api/runs` or RQ worker lifecycle.

### Dependencies

- [x] Existing FastAPI `/api/runs` contract.
- [x] Existing React/Vite app.
- [x] Existing authless dev mode.
- [x] Existing Gemini/Ollama LLM backend for later server-side generation.
- [ ] Decision: first candidate generation source.
  - Option A: deterministic template generator for MVP.
  - Option B: backend LLM endpoint for richer generation.
  - Recommended first cut: deterministic generator in product code plus later LLM generator behind the same interface.

## 4. Architecture Decision

### Recommended implementation shape

Use a frontend-first planner for the first product cut, but design the contracts so they can move to FastAPI later.

Reason:

- It avoids database migration before the UX is proven.
- It keeps the first iteration fast and visible in `/app`.
- It avoids adding LLM latency before the flow is validated.
- It can still call `/api/runs` exactly like existing chat/presets.
- The contract mirrors future backend `/api/intake/*`.

Planned module boundary:

```text
frontend/src/intake/
  types.ts
  universalSlots.ts
  creativeTestingSchema.ts
  router.ts
  extractor.ts
  planner.ts
  candidateGenerator.ts
  payloadBuilder.ts
  fixtures.ts
  __tests__ or adjacent tests if test infra exists later
```

Future backend migration:

```text
src/intake/
  schemas.py
  router.py
  extractor.py
  planner.py
  candidate_generator.py
  payloads.py
  store.py
```

## 5. Contracts

### Frontend intake action contract

```ts
type IntakeAction =
  | { type: "ask_question"; message: string; slotIds: string[] }
  | { type: "show_form"; message: string; form: DynamicFormSchema }
  | { type: "candidate_review"; message: string; candidates: CreativeCandidate[]; assumptions: IntakeSlotValue[] }
  | { type: "confirm_assumptions"; message: string; assumptions: IntakeSlotValue[] }
  | { type: "run_ready"; message: string; payload: RunCreateRequest; assumptions: IntakeSlotValue[] }
  | { type: "repair_input"; message: string; fieldErrors: FieldError[] };
```

### Dynamic form contract

```ts
type DynamicFormSchema = {
  id: string;
  fields: DynamicFormField[];
  primaryAction: string;
  secondaryAction?: string;
};
```

### Creative candidate contract

```ts
type CreativeCandidate = {
  id: string;
  text: string;
  angle: "outcome" | "pain_relief" | "automation" | "differentiation" | "trust";
  why: string;
  source: "user" | "generated";
};
```

### Final run payload

Must validate as:

```json
{
  "simulation_type": "creative_testing",
  "input": {
    "creatives": ["...", "..."]
  },
  "sample_size": 200,
  "target_filter": {},
  "seed": 42
}
```

## 6. Implementation Checklist

### 6.1 Planner and schema

- [ ] Add `frontend/src/intake/types.ts`.
  - [ ] Define `TaskFrame`, `IntakeSlotValue`, `SlotRequirement`, `IntakeAction`, `IntakeSession`.
  - [ ] Validation: `npm run typecheck`.
- [ ] Add `frontend/src/intake/creativeTestingSchema.ts`.
  - [ ] Define critical/recommended/optional slots.
  - [ ] Include `creative_surface`, `product_description`, `creative_candidates`, `target_customers`, `main_benefit`, `tone`, `sample_size`, `seed`.
  - [ ] Validation: schema covers `creative_testing` payload needs.
- [ ] Add `frontend/src/intake/router.ts`.
  - [ ] Detect headline/ad copy/message/detail page copy requests.
  - [ ] Return `primarySimulationType = creative_testing`.
  - [ ] Include `generate_creative_candidates` when no candidates are supplied.
- [ ] Add `frontend/src/intake/extractor.ts`.
  - [ ] Extract product description and creative surface from Korean user text.
  - [ ] Extract obvious candidate lines if user pasted 2+ alternatives.
  - [ ] Keep extraction deterministic for first cut.
- [ ] Add `frontend/src/intake/planner.ts`.
  - [ ] Implement `planNextAction(session)`.
  - [ ] Apply critical/recommended/optional policy.
  - [ ] Return one action per user turn.

### 6.2 Candidate generation

- [ ] Add `frontend/src/intake/candidateGenerator.ts`.
  - [ ] Generate 3-5 Korean headline candidates from product/audience/benefit slots.
  - [ ] Use different strategic angles.
  - [ ] Avoid unverifiable claims.
  - [ ] Mark generated candidates as generated.
- [ ] Add editing affordances in UI.
  - [ ] Candidate card text editable.
  - [ ] Candidate delete/add supported.
  - [ ] Enforce 2-10 candidates before run.

### 6.3 Payload builder

- [ ] Add `frontend/src/intake/payloadBuilder.ts`.
  - [ ] Convert accepted candidates to `RunCreateRequest`.
  - [ ] Clamp `sample_size` to 1-200.
  - [ ] Parse basic target filter from audience/advanced text.
  - [ ] Default seed to 42.
- [ ] Keep existing `buildRunPayload` temporarily.
  - [ ] Existing preset flow must keep working.
  - [ ] Old fixed simulation picker can remain as shortcut until new flow is stable.

### 6.4 Frontend UI

- [ ] Refactor `frontend/src/App.tsx`.
  - [ ] Add a goal-first start mode.
  - [ ] Keep simulation picker as secondary shortcut.
  - [ ] Connect `IntakeSession` state to chat.
- [ ] Add `frontend/src/components/intake/DynamicFormMessage.tsx`.
  - [ ] Render text, textarea, single select, multi text fields.
  - [ ] Allow partial submit for non-critical fields.
  - [ ] Preserve design tokens and compact layout.
- [ ] Add `frontend/src/components/intake/CandidateReviewMessage.tsx`.
  - [ ] Editable candidate cards.
  - [ ] Show angle and short rationale.
  - [ ] Primary action: "이대로 시뮬레이션".
- [ ] Add `frontend/src/components/intake/AssumptionReviewMessage.tsx`.
  - [ ] Show generated assumptions clearly.
  - [ ] Allow proceed/edit.
- [ ] Update styles in `frontend/src/styles.css`.
  - [ ] Match existing design system.
  - [ ] Avoid nested cards and oversized marketing layout.
  - [ ] Verify mobile text does not overflow.

### 6.5 Backend

First cut does not require backend intake persistence.

Optional backend work if selected before implementation:

- [ ] Add `src/api/intake_routes.py`.
- [ ] Add `/api/intake/messages`.
- [ ] Add `/api/intake/forms/{form_id}/submit`.
- [ ] Add SQLite tables `intake_sessions`, `intake_events`.
- [ ] Add run metadata link to intake session.

Recommendation: defer backend persistence until frontend planner UX passes local validation.

### 6.6 Documentation

- [ ] Update [[../design/agentic-intake-workflows/creative-testing-intake-v1]] with implementation decisions.
- [ ] Add completion notes to this execution plan.
- [ ] Update `docs/execution/README.md` index after implementation starts.

## 7. Test Plan

### Automated tests

- [ ] Frontend typecheck:

```bash
cd frontend
npm run typecheck
```

- [ ] Frontend lint:

```bash
cd frontend
npm run lint
```

- [ ] Frontend build:

```bash
cd frontend
npm run build
```

- [ ] Backend unit/API tests if backend files change:

```bash
uv run pytest tests/test_api_app.py tests/test_api_schemas.py tests/test_schema_parity.py
```

### Planner test cases

Add deterministic fixture tests or a script that verifies:

- [ ] "제 상품 상세페이지 헤드라인을 만들고 싶어요" -> asks product question.
- [ ] "블로그 작성 윈도우 프로그램 헤드라인 만들고 싶어요" -> shows form.
- [ ] Product + one target customer -> generates assumptions and candidates.
- [ ] User provides 3 headlines -> skips candidate generation and can build run payload.
- [ ] User provides 1 headline -> asks/generates enough candidates before run.
- [ ] User provides 12 headlines -> requires reduction to 10 or less.
- [ ] Empty product after goal -> does not run.
- [ ] Final accepted candidates -> valid `RunCreateRequest`.

### Manual browser checks

- [ ] Open `http://127.0.0.1:5173/app`.
- [ ] Type: "제 상품 상세페이지 헤드라인을 만들고 싶어요."
- [ ] Confirm assistant asks for product.
- [ ] Type: "블로그를 작성하는 소프트웨어예요. 윈도우 프로그램이고요."
- [ ] Confirm compact form appears.
- [ ] Fill one target customer and submit.
- [ ] Confirm candidate cards appear.
- [ ] Edit one candidate.
- [ ] Start simulation.
- [ ] Confirm `SimulationProgress` appears.
- [ ] Confirm result page opens when run completes.

## 8. Acceptance Criteria

### Pass conditions

- [x] User can complete the full headline generation -> candidate review -> creative simulation path.
- [x] The final payload is accepted by existing `/api/runs`.
- [x] Existing preset quick-start still works.
- [x] Existing simulation picker still works or is intentionally hidden behind a stable fallback.
- [x] The planner never runs with fewer than 2 creative candidates.
- [x] Generated assumptions are visible before run.
- [x] Typecheck, lint, build pass.

### Must not regress

- [x] `/api/config` still reports 9 enabled simulations.
- [x] `/api/presets` still returns executable presets.
- [x] `/api/runs` existing contract is unchanged.
- [x] Results page for creative testing still renders.
- [x] Dev authless mode still works.
- [x] React Grab dev setup still works.

## 9. Risks and Mitigations

| Risk | Mitigation |
| --- | --- |
| Planner becomes too magical and unpredictable | Keep first cut deterministic; use explicit route/extract/gap rules. |
| User dislikes generated assumptions | Show assumptions before run and make them editable. |
| Candidate generator produces generic copy | Use angle-based generation and editable review cards. |
| Scope expands to all 9 simulations too early | Only `creative_testing` gets E2E; others get schema placeholders later. |
| Intake session is lost on refresh | Persist the current intake snapshot through `/api/intake/sessions` and restore the last session id from local storage. |
| Existing fixed chat conflicts with new flow | Keep old flow as shortcut/fallback until new flow is stable. |
| Result report lacks assumption context | Store assumption summary in frontend state first; later pass to backend/run metadata. |

## 10. Rollback Plan

- [ ] New intake components should be isolated under `frontend/src/intake` and `frontend/src/components/intake`.
- [ ] Existing `PresetSelector`, `SimulationProgress`, `createRun`, and results route should remain unchanged.
- [ ] If intake UX breaks, hide goal-first intake behind a dev flag and keep old `ChatFlow`.
- [ ] No DB migration in first cut, so rollback is file-level only.

## 11. Implementation Order

### Step 1 — Planner core

- [ ] Add intake types and creative schema.
- [ ] Add deterministic router/extractor/planner.
- [ ] Add payload builder.
- [ ] Verify with a small local script or unit-like fixture check.

### Step 2 — UI messages

- [ ] Add dynamic form component.
- [ ] Add candidate review component.
- [ ] Add assumption review component.
- [ ] Wire into `/app`.

### Step 3 — Creative testing E2E

- [ ] Goal -> product question.
- [ ] Product -> form.
- [ ] Form -> generated candidates.
- [ ] Candidate review -> `/api/runs`.
- [ ] Progress -> results.

### Step 4 — Verification

- [ ] Run frontend verification.
- [ ] Run backend tests if touched.
- [ ] Manual browser walkthrough.
- [ ] Update this plan with completion log.

### Step 5 — Expansion prep

- [ ] Add placeholder schemas for the other 8 simulation types.
- [ ] Add TODOs mapping each simulation to critical/recommended/optional slots.
- [ ] Do not expose those paths until tested.

## 12. Completion Log

- [x] Implementation started: 2026-05-05.
- [x] Planner core completed: frontend-first intake engine added under `frontend/src/intake`.
- [x] UI completed: goal-first chat, dynamic form, candidate review, assumption review, and run-ready summary added under `frontend/src/components/intake`.
- [x] E2E completed: creative testing goal -> product question -> form -> generated candidates -> `/api/runs` payload path wired in `/app`.
- [x] Verification completed: `npm run verify` passed, including lint, typecheck, intake fixture check, and production build.
- [x] Known gap closed: backend intake persistence and LLM-native candidate generation are implemented for creative candidate review, with deterministic generation retained as a fallback.
- [x] Continuation 2026-05-05: expanded all 9 simulation packs from placeholders to slot skeletons, added route fixtures for the remaining 8 simulations, increased intake fixture coverage from 5 to 52 checks, and added frontend `IntakeRunProvenance` to preserve user/inferred/generated/default boundaries before future backend persistence.
- [x] Continuation verification: `npm run verify` passed after expansion; Vite still reports only the pre-existing large chunk warning.
- [x] Continuation 2026-05-05: added SQLite-backed intake persistence (`intake_sessions`, `intake_events`) and `/api/intake/sessions` POST/PUT/GET endpoints.
- [x] Continuation 2026-05-05: added `/api/intake/candidates` to call the configured LLM backend for Korean headline candidates and normalize generated assumptions.
- [x] Continuation 2026-05-05: connected `/app` goal-first intake to backend session persistence/restore and replaced the visible candidate-review source with LLM-generated candidates when available.
- [x] Continuation verification: `uv run pytest tests/test_api_app.py tests/test_jobs_store.py tests/test_api_schemas.py tests/test_schema_parity.py` passed.
- [x] Continuation verification: `npm run verify` passed after backend persistence and LLM candidate wiring; Vite still reports only the pre-existing large chunk warning.
- [x] Local smoke 2026-05-05: restarted authless dev backend on `127.0.0.1:8001`; `/api/intake/sessions` returned 200 and `/api/intake/candidates` returned 2 Gemini candidates with provider `gemini`, model `gemini-3-flash-preview`.
