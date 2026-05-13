---
title: Phase 2 Execution — Stability and Recovery
type: execution-plan
tags: [phase-2, execution, stability, sse, recovery, timeout]
created: 2026-05-02
updated: 2026-05-03
status: completed
related: [[../templates/execution-plan-template]], [[../phases/phase-2-stability]], [[../design/react-fastapi-migration]]
---

# Phase 2 Execution — Stability and Recovery

## 0. Metadata

- [x] Execution plan id: `phase-2-stability-recovery`
- [x] Target phase: Phase 2
- [x] Related design doc: [[../design/react-fastapi-migration]]
- [x] Owner: KoreaSim
- [x] Status: completed
- [x] Created: 2026-05-02
- [x] Updated: 2026-05-02

## 1. Summary

### Objective

- [x] Make a running or completed simulation recoverable after refresh, SSE disconnect, or process/worker interruption.

### User-visible outcome

- [x] User can refresh during a run and return to the same progress/result state.
- [x] User sees clear failed/interrupted states.
- [x] 200-person Creative Testing completes externally.

### Engineering outcome

- [x] robust SQLite event replay.
- [x] timeout/retry around LLM calls.
- [x] RQ worker interruption handling.
- [x] polling fallback when SSE fails.

## 2. Inputs

### Source documents

- [x] Phase plan: [[../phases/phase-2-stability]]
- [x] Design doc: [[../design/react-fastapi-migration]]
- [x] Quality spec: [[../functional/quality-and-trust]]

### Existing code to read first

- [x] `src/jobs/store.py`
- [x] `src/jobs/events.py`
- [x] `src/jobs/worker.py`
- [x] `src/llm/client.py`
- [x] `src/agent/simulator.py`
- [x] `frontend/src/hooks/useRunEvents.ts`
- [x] `frontend/src/ResultsPage.tsx`

## 3. Scope

### In scope

- [x] event replay cursor or last event id.
- [x] heartbeat every 15 seconds.
- [x] polling fallback every 2 seconds.
- [x] interrupted state for worker death/restart.
- [x] 60-second LLM timeout and 1 retry.
- [x] ETA/rate calculation.
- [x] partial result recovery.
- [x] 200-person run validation.

### Out of scope

Retained as deferred notes, not Phase 2 completion tasks:

- multi-instance worker orchestration.
- automatic job resume after worker crash.
- Celery.
- automatic retention cleanup implementation.

### Dependencies

- [x] Phase 1 API/RQ/SQLite completed.
- [x] Redis running.
- Ollama running.
  - Not installed on this machine during validation; Gemini primary and adapter/factory-level Ollama fallback were validated instead.

## 4. Contracts

### API contract

- [x] `GET /api/runs/{run_id}` includes `interrupted`, `failed`, `result_available`, `eta_seconds`, and `rate_per_min`.
- [x] `GET /api/runs/{run_id}/events` emits snapshot first.
- [x] `GET /api/runs/{run_id}/result` works after API restart for completed runs.

### Data contract

- [x] `run_events.event_id` is now assigned from monotonic SQLite `rowid`.
- [x] `run_partial_results` has unique `(run_id, persona_uuid)`.
- [x] `runs.error` contains user-readable summary.
- [x] completed run/result retention is indefinite for the local MVP until a customer PoC policy is defined.

### Frontend contract

- [x] localStorage stores latest `run_id`.
- [x] recovery flow handles running/completed/failed/interrupted.
- [x] failed/interrupted screen returns to the start flow and shows a recoverable message.

## 5. Implementation Checklist

### 5.1 Backend

- [x] `src/jobs/events.py`
  - [x] replay events after cursor.
  - [x] heartbeat loop.
- [x] `src/api/routes.py`
  - [x] polling snapshot endpoint hardened.
  - [x] result endpoint works without worker.
- [x] `src/jobs/worker.py`
  - [x] mark stale running jobs interrupted at startup or via health routine.

### 5.2 Worker / Queue

- [x] worker startup logs queue and DB path.
- [x] failed job handler writes `failed` status.
- [x] interruption strategy documented.
- [x] worker concurrency limit documented.

### 5.3 Database / Persistence

- [x] partials are queryable through `/api/runs/{run_id}/partials` when final result is unavailable.
- [x] partial write is idempotent.
- [x] DB errors are surfaced in run status.

### 5.4 Frontend

- [x] `useRunEvents` consumes snapshot/replay and closes on terminal states.
- [x] fallback polling when EventSource errors.
- [x] refresh recovery from localStorage.
- [x] failure/interrupted UI copy.
- [x] partial result summary UI when complete result is unavailable.

### 5.5 Documentation

- [x] recovery runbook.
- [x] 200-person validation result log.
- [x] health endpoint field documentation.

## 6. Mock Data and Fixtures

### Required mock data

- [x] `run_running_with_events`
- [x] `run_completed_after_refresh`
- [x] `run_interrupted_with_partials`
- [x] `run_failed_timeout`
- [x] `sse_disconnect_then_polling_success`

### Mock data details

- [x] include `event_id`.
- [x] include `eta_seconds`.
- [x] include `rate_per_min`.
- [x] include partial raw results for interrupted case.
- [x] include timeout error persona.

### Fixture rules

- [x] fixtures must use real envelope.
- [x] no production dependency on fixtures.

## 7. Edge Cases and Exceptions

### Input validation

- [x] old `run_id` not found.
- [x] result requested before completion.
- [x] invalid cursor.

### Runtime failures

- [x] SSE disconnect.
- [x] browser refresh.
- [x] API restart after completion.
- [x] RQ worker restart while running.
- [x] Redis unavailable after run queued.
- [x] LLM timeout on one persona.

### Access/security

- [x] protected API behavior is later validated in Phase 3.

## 8. Tests

### Automated tests

- [x] store replay test.
- [x] timeout/retry test with mocked LLM client.
- [x] event endpoint smoke.
- [x] frontend typecheck/build.

### Manual checks

- [x] start 200-person external run and observe progress.
- [x] worker crash/restart recovery verified with interrupted state.
- [x] SSE replay and polling fallback paths covered by API/frontend tests.
- [x] complete 200-person run externally.

### Commands

```bash
cd frontend && npm run typecheck && npm run build
curl http://127.0.0.1:8000/api/runs/<run_id>
curl -N http://127.0.0.1:8000/api/runs/<run_id>/events
```

## 9. Acceptance Criteria

### Pass conditions

- [x] running run recovers after refresh.
- [x] completed result survives API restart.
- [x] interrupted run shows partial results.
- [x] LLM timeout retries once and records failure cleanly.
- [x] 200-person Creative Testing completes externally.

### Must not regress

- [x] Phase 1 50-person happy path still works.
- [x] landing remains public.
- [x] Streamlit fallback remains unchanged.

### Demo-ready criteria

- [x] user can trust that refreshing does not destroy progress.
- [x] error messages are understandable.

## 10. Observability and Debugging

- [x] run event cursor visible.
- [x] health shows Redis/RQ/SQLite/model backend.
- [x] worker logs startup/recovery and failed handler context.
- [x] DB/API query for partial count documented.

## 11. Rollback Plan

- [x] revert timeout/retry changes if they break Ollama client.
- [x] keep DB schema backward-compatible.
- [x] disable SSE replay optimization and use polling if needed.

## 12. Review Checklist

- [x] no event data stored only in memory.
- [x] final result can be fetched after restart; partials are fetchable before final result.
- [x] frontend has all status states.

## 13. Completion Log

- [x] Implementation completed: 2026-05-03.
- [x] Tests run: targeted ruff/pytest, `scripts/verify.py --skip-build`, live 1/10/50/200-person Gemini runs, API restart recovery, SSE replay smoke.
- [x] Known gaps: Cloudflare Access policy is not yet applied; Ollama is not installed on this machine for live fallback validation.
- [x] Phase docs updated: [[../phases/phase-2-stability]]
- [x] Next execution plan: [[phase-3-access-path-policy]]
