---
title: Project and Intake UX Polish V1
type: execution-plan
tags: [minsim-v2, projects, intake, loading, react-grab]
created: 2026-07-13
updated: 2026-07-13
status: ready-to-deploy
related: [[minsim-v2-ux-and-mcp]], [[../design/agentic-intake-workflows/intake-layer-v2-contract]]
---

# Project and Intake UX Polish V1

## 0. Metadata

- [x] Execution plan id: `project-intake-ux-polish-v1`
- [x] Target phase: Phase 5/7 post-demo product polish
- [x] Owner: Codex
- [x] Status: ready-to-deploy

## 1. Objective

- [x] 프로젝트 허브, 프로젝트 상세, 유형 선택, intake, 실행 중 화면이 여러 프로젝트·여러 실행을 자연스럽게 다룬다.
- [x] 선택한 시뮬레이션과 저장된 프로젝트 맥락이 intake 첫 화면부터 보이며 같은 정보를 다시 묻지 않는다.
- [x] 3D 합성 패널 진행 화면을 V2 프로젝트 실행 경로에서도 사용한다.

## 2. Source and Existing Code

- [x] Design: `docs/design/agentic-intake-workflows/intake-layer-v2-contract.md`
- [x] UX architecture: `docs/execution/minsim-v2-ux-and-mcp.md`
- [x] Frontend: `ProjectsPage`, `ProjectDetailPage`, `SimulationTypePage`, `MinsimIntakeFlow`, `MinsimLoadingPage`
- [x] Existing 3D implementation: `frontend/src/components/SimulationProgress.tsx`
- [x] Planner source of truth: `frontend/src/intake/planner.ts`

## 3. Scope

### In scope

- [x] `새 프로젝트` 클릭 뒤에만 생성 폼을 공개하고 취소 시 임시 랜딩 입력을 정리한다.
- [x] 실행 이력을 상태·유형·시간·진행률이 보이는 1열 목록으로 바꾸고 진행 중 실행은 loading으로 연결한다.
- [x] 선택 유형 배지와 프로젝트 기반 intake 초기화를 추가한다.
- [x] 동적 폼을 질문/답변 1열 구조로 만들고 예시 placeholder를 보강한다.
- [x] 별도 입력 폼이 활성화된 동안 하단 자유 입력 composer를 숨긴다.
- [x] 입력 글자 크기와 폭을 읽기 쉬운 수준으로 조정한다.
- [x] React Grab을 Vite 개발 환경 전용 dev dependency로 설치한다.
- [x] V2 loading 경로에 기존 3D 합성 패널 진행 화면을 연결하고 reduced-motion에는 정적 화면을 유지한다.

### Out of scope

- [x] API/DB schema 변경 없음.
- [x] 기존 persona fan-out, RQ, result envelope 변경 없음.
- [x] 새 시뮬레이션 유형 추가 없음.

## 4. Contracts

- [x] 프로젝트 정보는 사용자 제공 provenance로만 intake slot에 선반영한다.
- [x] 시뮬레이션별 핵심 slot이 프로젝트에 이미 있으면 같은 질문을 다시 하지 않는다.
- [x] 사용자가 직접 입력하지 않은 후보·가정은 기존 review gate를 그대로 통과한다.
- [x] 실행 상태별 이동: active → loading, completed → results, terminal error → project detail.

## 5. Verification

- [x] 프로젝트 기반 intake 회귀 fixture: market/churn 저장 맥락 재사용, 중복 질문·잘못된 조사 회귀 포함
- [x] `npm run check:intake`: 126 fixtures passed
- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `npm run build`
- [x] 375px/1440px 로컬 브라우저 확인: 가로 overflow 없음, 1열 폼·선택 유형·실행 이력·3D loading 확인
- [x] `uv run python scripts/verify.py`: 202 tests, 89.33% coverage, frontend gate passed
- [ ] 프로덕션 외부 readiness check

## 6. Completion Log

- [x] Implementation completed
- [x] Validation evidence recorded
- [x] `CLAUDE.md` and relevant design/execution docs updated
- [ ] Project-scoped commit created and deployed
