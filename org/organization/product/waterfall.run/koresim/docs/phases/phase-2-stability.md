---
title: Phase 2 — FastAPI 안정성, SQLite 복구 강화, SSE
type: phase-plan
tags: [phase-2, fastapi, sqlite, sse, stability]
created: 2026-04-30
updated: 2026-05-03
status: completed
related: [[CLAUDE]], [[phase-1-cloudflare-tunnel]], [[../design/react-fastapi-migration]], [[../execution/phase-2-stability-recovery]]
---

# Phase 2 — FastAPI 안정성, SQLite 복구 강화, SSE

## Execution Plan

- [[../execution/phase-2-stability-recovery]]

## Goal

1. 브라우저 새로고침, 네트워크 단절, SSE 재연결 후에도 run 상태와 완료 결과를 복원한다.
2. LLM 장기 호출에 timeout, retry, partial result 저장을 적용한다.
3. React는 `run_id` 기반으로 진행 중/완료/실패 상태를 일관되게 복구한다.

## Files

```text
.
├── src/api/
│   ├── main.py
│   ├── routes.py
│   └── schemas.py
├── src/jobs/
│   ├── store.py                    # SQLite store
│   ├── models.py                   # run 상태 모델
│   ├── queue.py                    # Redis/RQ queue helpers
│   ├── worker.py                   # RQ worker entrypoint
│   └── events.py                   # SSE event helpers
├── src/llm/client.py                # timeout + retry
├── src/agent/simulator.py           # partial result callback
├── frontend/src/
│   ├── api/                         # 신규 API client
│   ├── hooks/                       # useRun, useRunEvents
│   └── ResultsPage.tsx
└── data/runtime/koresim.sqlite3     # gitignore 대상
```

## Tasks

- [x] **2.1** Phase 1 SQLite schema 검증 및 복구 동작 보강
  - `runs`
  - `run_events`
  - `run_partial_results`
  - `run_results`
- [x] **2.2** run lifecycle 구현
  - `queued`
  - `running`
  - `completed`
  - `failed`
  - `canceled`
- [x] **2.3** RQ worker 장애/재시작 시 interrupted 처리
- [x] **2.4** SSE endpoint를 SQLite event log와 연결
- [x] **2.5** polling fallback 추가: `GET /api/runs/{run_id}`
- [x] **2.6** React localStorage에 최근 `run_id` 저장
- [x] **2.7** 새로고침 시 최근 run 복원
- [x] **2.8** LLM timeout 60초 + retry 1회 적용
- [x] **2.9** persona 단위 partial result 저장
- [x] **2.10** ETA와 처리율 계산
- [x] **2.11** 실패/취소/부분 완료 UI 상태 추가
- [x] **2.12** 장기 실행 중 SSE heartbeat 추가

## SQLite Minimum Schema

```sql
create table runs (
  id text primary key,
  simulation_type text not null,
  status text not null,
  input_json text not null,
  target_filter_json text not null,
  seed integer not null,
  sample_size integer not null,
  done_count integer not null default 0,
  total_count integer not null,
  error text,
  created_at text not null,
  updated_at text not null,
  completed_at text
);

create table run_events (
  id integer primary key autoincrement,
  run_id text not null,
  event_type text not null,
  payload_json text not null,
  created_at text not null
);

create table run_results (
  run_id text primary key,
  result_json text not null,
  created_at text not null,
  updated_at text not null
);
```

## SSE Behavior

- On connect, emit the current run snapshot first.
- Then replay events after the requested cursor if supported.
- Emit `heartbeat` every 15 seconds while running.
- If SSE fails, React falls back to polling every 2 seconds.
- Completed and failed runs must be recoverable without SSE.

## Validation

| 검증 항목 | 시나리오 | 기대 결과 |
| --- | --- | --- |
| 새로고침 복원 | run 진행 중 새로고침 | 같은 `run_id` 진행 화면 복원 |
| SSE 재연결 | DevTools에서 네트워크 offline 후 online | polling 또는 SSE로 상태 복구 |
| 부분 결과 | 100명 중 30명 완료 후 실패 유도 | 30명 결과가 DB에 남음 |
| timeout | 단일 LLM 호출 70초 지연 | timeout 후 retry, 실패 시 persona error 저장 |
| 결과 조회 | 완료 후 브라우저 재접속 | 결과 페이지 복원 |
| 서버 재시작 | 완료 결과 저장 후 API 재시작 | 결과 조회 가능 |

## Done Definition

- [x] run 상태와 결과가 SQLite에 저장된다.
- [x] 브라우저 새로고침으로 진행 상태가 사라지지 않는다.
- [x] SSE와 polling fallback이 모두 작동한다.
- [x] 단일 LLM 호출 timeout/retry가 적용된다.
- [x] 200명 Creative Testing이 외부에서 완주한다.
- [x] CLAUDE.md Phase 2 체크박스가 갱신되어 있다.

## Completion Evidence

- 2026-05-03: local readiness passed with Redis, RQ worker, SQLite, persona parquet, React build, and Gemini backend.
- 2026-05-03: interrupted recovery validated with run `694b074e-8f09-4631-93f1-9c3aa6e56507` after macOS RQ work-horse failure; worker restart marked it `interrupted`.
- 2026-05-03: API restart recovery validated with completed run `21ca4219-e0a1-4ef9-89c5-c7397d2e914f`; result remained available after `uvicorn` restart.
- 2026-05-03: external 200-person Creative Testing completed through `https://arabesque.cc/api/runs`, run `ead192c8-5c47-43b1-9a04-e6dc9dc0bd67`, `parse_failed=0`, provider `gemini`.

## Risks

| 리스크 | 가능성 | 완화 방안 |
| --- | --- | --- |
| RQ worker 재시작 시 running job 유실 | 중 | `interrupted`로 표시, 재실행 버튼 제공 |
| 동시 실행으로 Ollama 과부하 | 높음 | 전역 concurrency 제한 |
| Redis 장애 | 중 | health check + 명확한 에러 표시 |
| SQLite write lock | 중 | 단일 프로세스 MVP로 제한, write transaction 짧게 유지 |
| SSE가 프록시에서 끊김 | 중 | heartbeat + polling fallback |
| partial result와 final aggregation 불일치 | 중 | final result는 partial table에서 재집계 |

## Out of Scope

- Celery 도입
- 멀티 인스턴스 배포
- 사용자별 계정/프로젝트 공간
- 영구 고객 데이터 저장 정책
