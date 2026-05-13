---
title: Phase 6 — frontend/ ↔ backend design sync
type: phase-plan
tags: [phase-6, design-sync, frontend, backend, api-contract]
created: 2026-05-02
updated: 2026-05-03
status: completed
related: [[CLAUDE]], [[README]], [[../execution/phase-6-design-sync]]
---

# Phase 6 — frontend/ ↔ backend design sync

## Execution Plan

- [[../execution/phase-6-design-sync]]

## Goal

1. `frontend/` mock UI가 실제 FastAPI contract와 어긋나지 않게 한다.
2. 디자인 변경, API 변경, result schema 변경의 책임 경계를 명확히 한다.
3. React 결과 화면이 hardcoded demo 수치에 다시 의존하지 않도록 한다.

## Why This Phase Exists

현재 저장소에는 두 개의 제품 표면이 공존한다.

- `app.py`: 실제 Streamlit MVP
- `frontend/`: polished React mock UI

앞으로 공식 외부 데모는 React+FastAPI이므로, React가 mock data만 예쁘게 보여주는 상태로 남으면 제품 판단이 왜곡된다.

## Sync Rules

### Rule 1 — API Schema First

React가 새 simulation input 또는 result field를 요구하면 먼저 `src/api/schemas.py` 또는 shared schema 문서에 반영한다.

### Rule 2 — Mock Data Must Match Real Schema

mock data는 허용하되 실제 API result envelope와 같은 shape이어야 한다.

### Rule 3 — Result Page Must Support Loading, Running, Failed, Completed

결과 화면은 완료 mock만 보여주면 안 된다.

Required states:

- no run selected
- queued
- running
- partial results available
- completed
- failed
- restored from previous run

### Rule 4 — Design Tokens Stay in `frontend/src/styles.css`

Wanted Design System tokens are the source for colors, spacing, radius, shadow, and typography.

### Rule 5 — Backend Owns Truth, Frontend Owns Presentation

- Backend owns result values, quality grades, sample summary, warnings, and run status.
- Frontend owns layout, interaction, transitions, and visualization mapping.

## Tasks

- [x] **6.1** shared API/result schema document 작성
- [x] **6.2** `frontend/src/data/mockData.ts`를 real result envelope shape으로 정리
- [x] **6.3** frontend API client 추가
- [x] **6.4** TypeScript types를 backend schema와 동기화
- [x] **6.5** ResultsPage에서 hardcoded result 제거
- [x] **6.6** Story/demo states 추가
  - running
  - failed
  - partial
  - completed
- [x] **6.7** design QA checklist 작성
- [x] **6.8** Phase 5 새 simulation 추가 시 필요한 frontend/backend checklist 작성

## Recommended File Structure

```text
frontend/src/
├── api/
│   ├── client.ts
│   └── runs.ts
├── types/
│   ├── api.ts
│   └── simulations.ts
├── data/
│   └── mockResults.ts
├── components/
│   ├── RunStatus.tsx
│   ├── QualityCards.tsx
│   ├── SampleSummary.tsx
│   └── Disclaimer.tsx
└── simulations/
    ├── registry.ts
    ├── creative-testing/
    └── price-optimization/
```

## Design QA Checklist

- [x] No mock-only numbers in production result route
- [x] All buttons have loading/disabled states
- [x] SSE disconnect has visible recovery state
- [x] Long text does not overflow on mobile
- [x] Result cards use design tokens
- [x] Trust layer is visible without scrolling too far
- [x] Disclaimer cannot be dismissed
- [x] Empty/error states are written in product language, not developer language

## Done Definition

- [x] frontend mock types match backend result envelope.
- [x] React can render real API states without hardcoded result values.
- [x] Adding a new simulation requires following a documented checklist.
- [x] Phase 5 implementation can reuse the documented schema/rendering checklist; concrete registries remain Phase 5 work.
- [x] CLAUDE.md Phase 6 checklist is added and current.

## Risks

| 리스크 | 가능성 | 완화 방안 |
| --- | --- | --- |
| React가 다시 mock 중심으로 진화 | 높음 | schema-first rule + mock shape enforcement |
| Backend schema 변경이 UI를 깨뜨림 | 중 | TypeScript API types and fixture checks |
| 디자인 QA가 구현 속도를 늦춤 | 중 | checklist를 release gate가 아니라 regression guard로 사용 |
| Streamlit fallback과 React 사이 기능 차이 | 중 | fallback은 operator-only로 명확히 표시 |

## Completion Evidence

- 2026-05-03: `frontend/src/api/client.ts` and `frontend/src/api/runs.ts` provide typed API access for presets, run creation, status, result, and partial results.
- 2026-05-03: `frontend/src/types/api.ts` is checked against backend Pydantic models by `tests/test_schema_parity.py`.
- 2026-05-03: `frontend/src/ResultsPage.tsx` renders real API result envelopes and no longer contains the previous static Galaxy/Samsung report values.
- 2026-05-03: Results UI covers no-run, loading/running, partial/not-ready, failed, and completed states.
- 2026-05-03: `docs/api-result-schema.md` documents run lifecycle, `result-envelope/v1`, common envelope fields, simulation metrics pattern, auth boundary, error shape, and verification commands.
- 2026-05-03: `docs/design-qa-checklist.md` and `docs/simulation-addition-checklist.md` define the review gates needed before Phase 5 simulation expansion.
- 2026-05-03: `frontend/src/data/mockData.ts` now contains app-input helper data only; API-envelope story states live in `frontend/src/data/runStateFixtures.ts` and typecheck against `RunSnapshot`, `RunPartialResultsResponse`, and `RunResultEnvelope`.
- 2026-05-03: `/results/story/<fixture_id>` routes expose all required result states for browser review without calling protected APIs.
- 2026-05-03: Playwright browser checks rendered completed Creative Testing, partial results, failed mobile, and Price Optimization story routes without visible overlap in inspected screenshots.
