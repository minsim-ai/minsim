---
title: Phase 4 — React Demo Content and Trust Layer
type: phase-plan
tags: [phase-4, react, demo, content, ux, trust]
created: 2026-04-30
updated: 2026-05-03
status: completed
related: [[CLAUDE]], [[phase-1-cloudflare-tunnel]], [[../design/data-governance-and-io-boundary]], [[../execution/phase-4-demo-content-trust-layer]]
---

# Phase 4 — React Demo Content and Trust Layer

## Execution Plan

- [[../execution/phase-4-demo-content-trust-layer]]

## Goal

1. 처음 접속한 사용자가 30초 안에 첫 시뮬레이션을 시작할 수 있게 한다.
2. 기업 데모에 안전한 프리셋 3종을 제공한다.
3. 모든 결과 화면에 표본, 품질, 한계, 재현성 정보를 함께 보여준다.

## Product Surface

Primary UI is React in `frontend/`. Streamlit copy changes are not part of this phase unless they support fallback documentation.

## Demo Presets

### Preset A — Galaxy Ad Creative

- Simulation: Creative Testing
- Target: 30~49세, 직장인 중심, 무직 제외
- Options: premium, productivity, lifestyle tone
- Purpose: 메시지 선호도와 세그먼트 차이 시연

### Preset B — Coffee Price Optimization

- Simulation: Price Optimization, or Creative Testing fallback until Phase 5.1 ships
- Target: 20~39세, 무직 제외
- Options: 4,500원 / 5,500원 / 6,500원
- Purpose: 가격 민감도 시연

### Preset C — OTT Value Proposition

- Simulation: Value Proposition, or Creative Testing fallback until Phase 5.3 ships
- Target: 20~39세
- Options: content exclusivity, missed-content recovery, subscription value
- Purpose: K-content audience response 시연

Political presets are intentionally excluded from the default enterprise demo. They can be added later as a separate public-sector/political mode.

## Tasks

- [x] **4.1** React quick-start preset selector 추가
- [x] **4.2** preset schema를 API request schema와 일치시킴
- [x] **4.3** backend `/api/presets` endpoint 추가
- [x] **4.4** frontend preset fixture는 `/api/presets` contract와 일치하는 story/demo 용도로만 유지
- [x] **4.5** 첫 화면 copy를 React+FastAPI 제품 방향에 맞게 수정
- [x] **4.6** 결과 상단에 품질 카드 표시
  - 응답 수
  - 파싱 성공률
  - 표본 신뢰도
  - 종합 신뢰 등급
- [x] **4.7** 결과 상단에 sample summary 표시
  - 성별
  - 연령
  - 지역
  - 직업 top
  - 학력
- [x] **4.8** 결과 하단에 닫을 수 없는 disclaimer 표시
- [x] **4.8a** landing/result trust layer에 `NVIDIA Nemotron-Personas-Korea, CC BY 4.0` attribution 표시
- [x] **4.9** run 재현 정보 표시
  - seed
  - target filter
  - model
  - run timestamp
- [x] **4.10** React 결과 페이지의 mock data를 실제 API result로 치환
- [x] **4.11** demo script 작성: 3분 안에 보여줄 흐름

## Result Trust Requirements

Every result page must show:

- dataset attribution
- `sample_size`
- `total_responses`
- `parse_failed`
- `seed`
- `target_filter`
- `sample_summary`
- `quality`
- disclaimer

## Validation

| 검증 항목 | 시나리오 | 기대 결과 |
| --- | --- | --- |
| 첫 사용 | 새 브라우저에서 접속 | 30초 안에 preset run 시작 |
| Preset A | Galaxy run | 결과와 세그먼트 표시 |
| Preset B | Coffee price run | 가격별 반응 표시 또는 fallback 명확 |
| Preset C | OTT VP run | 메시지별 반응 표시 또는 fallback 명확 |
| 신뢰 레이어 | 결과 화면 진입 | 품질/표본/면책/seed 표시 |
| mock 제거 | 완료 결과 확인 | hardcoded mock 수치가 아님 |

## Done Definition

- [x] React에서 3개 preset을 선택하고 실행할 수 있다.
- [x] 결과 페이지가 실제 API result를 렌더링한다.
- [x] 결과마다 trust layer가 표시된다.
- [x] 기업 데모에 정치적/민감한 기본 preset이 없다.
- [x] CLAUDE.md Phase 4 체크박스가 갱신되어 있다.

## Risks

| 리스크 | 가능성 | 완화 방안 |
| --- | --- | --- |
| Price/VP simulation이 아직 없음 | 높음 | Creative Testing fallback을 명시하고 Phase 5에서 실제 모듈로 교체 |
| 과한 설명으로 제품이 무거워 보임 | 중 | trust layer는 압축 카드 + 상세 펼침으로 구성 |
| mock data 잔존 | 높음 | API result type 없이는 ResultsPage 변경 금지 |
| 프리셋 브랜드명 사용 리스크 | 낮음 | 데모용 예시임을 표기하고 필요 시 가상 브랜드로 대체 |

## Out of Scope

- PDF/Excel export
- 신규 landing page 제작 (기존 LandingPage 개선은 필요 시 포함)
- 정치/선거 데모 모드
- 다국어 지원

## Completion Evidence

- 2026-05-03: `GET /api/presets` added as the backend source of truth for three enterprise-safe presets.
- 2026-05-03: React `/app` quick-start panel loads `/api/presets` and can start each preset through `POST /api/runs`.
- 2026-05-03: `/app` first-screen copy and header links now match the React + FastAPI external demo path rather than app-local account auth.
- 2026-05-03: automated API test verifies every preset can create a queued run, and checks default presets exclude political/election wording.
- 2026-05-03: Results page renders actual API result envelopes instead of the previous static Galaxy/Samsung report narrative.
- 2026-05-03: Results page shows an API-backed trust summary when a real result is loaded: response count, parse success, sample grade, warnings, sample summary, seed, target filter, model/provider metadata, timestamp, dataset attribution, and synthetic-persona disclaimer.
- 2026-05-03: three-minute demo script added at [[../runbooks/three-minute-demo-script]].

Remaining gap:

- ResultsPage uses a generic API result renderer. Rich simulation-specific report modules for future non-Creative Testing engines remain Phase 5/6 work.
