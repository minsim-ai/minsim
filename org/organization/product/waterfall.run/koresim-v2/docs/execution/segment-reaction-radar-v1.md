---
title: Segment Reaction Radar V1
type: execution-plan
tags: [results, segments, map, churn, landing]
created: 2026-07-13
updated: 2026-07-13
status: ready-to-deploy
related: [[../design/segment-reaction-radar]], [[minsim-v2-ux-and-mcp]]
---

# Segment Reaction Radar V1

## Objective

- [x] 이탈 예측의 유지/관망/이탈 결과가 선택지 결과와 섞이지 않는다.
- [x] 지역·성별 반응이 결과 화면 상단의 세그먼트 레이더로 제공된다.
- [x] 홈페이지에서 예시 세그먼트 결과를 제품 가치로 확인할 수 있다.

## Scope

### In scope

- [x] `minsimReport`에 선택지/의도 의미, 지역 초점 비율, 신뢰도, 표본 범위 모델 추가.
- [x] 결과 페이지에 KPI, 지도, 정렬 목록, 지역 상세, 성별 범위 구현.
- [x] 랜딩 페이지에 명시적으로 표시된 고정 예시 레이더 추가.
- [x] 모바일, 키보드, 스크린리더 대체 목록 검증.
- [x] ReactGrab 개발 모드 설치·초기화 상태 확인.

### Out of scope

- [ ] 지역×성별 교차표 생성.
- [ ] 실제 매출/캠페인 성과로의 표현 변경.
- [ ] 결과 API/DB/worker 계약 변경.

## Contracts

- [x] A/B/C/D는 `A안` 형식을 유지한다.
- [x] 유지/관망/이탈에는 `안` 접미사를 붙이지 않는다.
- [x] 지역 기본 정렬은 신뢰도와 표본을 우선한다.
- [x] 10명 미만은 `참고`로 표시한다.
- [x] 홈페이지 데이터는 `예시 데이터`로 표시한다.

## Implementation Checklist

### Frontend

- [x] `frontend/src/v2/minsimReport.ts`: 의미 및 신뢰 모델.
- [x] `frontend/src/v2/KoreaReactionMap.tsx`: 의미 팔레트, 초점 지표, 접근성 범례.
- [x] `frontend/src/v2/MinsimResultsPage.tsx`: 1급 레이더 영역과 정렬/상세.
- [x] `frontend/src/LandingPage.tsx`: 축약 데모.
- [x] `frontend/src/styles.css`: 반응형 레이아웃과 상태 스타일.

### Fixtures and validation

- [x] churn fixture에 지역·성별 세그먼트 추가.
- [x] 의미 라벨, 전체 지역명, 신뢰도, 초점 비율 회귀 검사.
- [x] frontend lint/typecheck/build.
- [x] `uv run python scripts/verify.py` 전체 게이트.
- [x] desktop/mobile 브라우저 확인.

## Rollback

- API와 저장소 변경은 없다.
- 새 레이더를 제거하고 기존 `SegmentMatrix` disclosure로 복구할 수 있다.
- 랜딩 예시 컴포넌트는 독립된 고정 fixture이므로 제거해도 실행 결과에 영향이 없다.

## Completion Log

- [x] Verification evidence: 206 pytest passed, 89.32% coverage, frontend lint/typecheck/build passed, 2 minsim fixtures passed.
- [x] Browser evidence: local desktop 1440px and mobile 390px showed no horizontal overflow or broken intent suffixes; sort and regional detail interactions passed.
- [ ] Commit:
- [ ] Deployment:
