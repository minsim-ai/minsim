---
title: Results Research Workspace V1
type: execution-plan
tags: [results, interview, followup, ui]
created: 2026-07-13
updated: 2026-07-13
status: complete
related: [[../design/results-research-workspace]], [[minsim-v2-ux-and-mcp]]
---

# Results Research Workspace V1

## Objective

- [x] 결과 페이지에서 근거 발언과 응답자를 한곳에서 탐색한다.
- [x] 코호트 질문과 개인 인터뷰를 하나의 대상 기반 입력 흐름으로 실행한다.
- [x] 개인 인터뷰가 응답자별로 저장되고 새로고침 후에도 이어진다.

## Scope

### In scope

- [x] SQLite interview thread/message 저장소와 사용자 삭제·retention 연계.
- [x] 프로젝트/run 소유권을 확인하는 thread list/create/message API.
- [x] 실제 raw result UUID를 쓰는 응답자 데이터.
- [x] 발언/응답자 탐색, 코호트 필터, 집단 질문, 누적 채팅 통합 UI.
- [x] desktop/mobile 브라우저 회귀 검증.

### Out of scope

- [ ] 집단 follow-up 전체 이력의 서버 영속화.
- [ ] 다른 run 간 인터뷰 병합.
- [ ] 음성/파일 인터뷰.

## Contracts

- [x] `interview_threads`와 `interview_messages`는 run/user ownership에 묶인다.
- [x] interview create는 결과의 실제 `subject_uuid`만 허용한다.
- [x] message response는 갱신된 전체 thread를 반환한다.
- [x] 기존 `/followup`, `/interview`, MCP contract는 회귀하지 않는다.
- [x] frontend TypeScript type과 Pydantic schema를 함께 갱신한다.

## Implementation Checklist

### Backend

- [x] `src/jobs/models.py`: thread/message records.
- [x] `src/jobs/store.py`: schema, CRUD, exchange append, deletion/retention.
- [x] `src/services/followup_service.py`: 원 발언과 누적 대화를 사용하는 interview turn.
- [x] `src/services/project_service.py`: ownership, respondent validation, thread orchestration.
- [x] `src/api/schemas.py`, `src/api/routes.py`: public contract and routes.

### Frontend

- [x] `frontend/src/types/api.ts`, `frontend/src/api/projects.ts`: thread client.
- [x] `frontend/src/v2/minsimReport.ts`: crowd에 실제 UUID 포함.
- [x] `frontend/src/v2/ResearchWorkspace.tsx`: 통합 탐색·대화 화면.
- [x] `frontend/src/v2/MinsimResultsPage.tsx`: 기존 3개 분리 영역 교체.
- [x] `frontend/src/styles.css`: responsive workspace.

### Tests and verification

- [x] Store persistence and ordering test.
- [x] API persistence, refresh/list, ownership, invalid respondent tests.
- [x] Follow-up interview prompt history test.
- [x] Frontend lint/typecheck/build.
- [x] `uv run python scripts/verify.py` full gate.
- [x] agent-browser desktop/mobile happy path and console error check.
- [x] production deployment smoke check.

## Acceptance Criteria

- [x] 근거 발언과 응답자 목록이 같은 섹션의 보기 전환으로 제공된다.
- [x] 군중감 카드가 클릭한 실제 응답자 UUID를 사용한다.
- [x] 집단 질문 응답에서 특정 응답자를 개인 인터뷰 대상으로 전환할 수 있다.
- [x] 같은 응답자의 두 번째 질문이 첫 문답을 포함한 맥락으로 실행된다.
- [x] 페이지 새로고침 후 저장된 인터뷰 문답이 복구된다.
- [x] 모바일에서 탐색과 대화가 가로 overflow 없이 사용 가능하다.

## Rollback

- 새 테이블은 additive이며 기존 run/result 읽기에 영향을 주지 않는다.
- 새 React workspace를 제거하면 기존 follow-up/interview endpoint는 그대로 남는다.
- 서비스 재시작 전 이전 frontend build로 되돌릴 수 있다.

## Completion Log

- [x] Implementation completed: persistent interview store/API and unified React workspace.
- [x] Tests run: focused 25 passed; full gate 196 passed with 88.92% coverage; frontend lint/typecheck/build passed.
- [x] Browser evidence: production desktop/mobile, two cumulative turns, refresh restore (4 messages), no page/workspace overflow, empty console/errors.
- [x] Commit: `0a1d6e1 feat: add persistent results research workspace`.
- [x] Deployment: API/worker restarted; external Mac Studio production check returned `status=ready`.
