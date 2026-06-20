---
title: Free Trial Quota Launch Guard
type: execution-plan
tags: [koresim, quota, auth, launch-guard]
created: 2026-05-13
updated: 2026-05-13
status: complete
---

# Free Trial Quota Launch Guard

## 0. Metadata

- [x] Execution plan id: `free-trial-quota-launch-guard`
- [x] Target phase: Phase 5/7 post-demo productization
- [x] Related design doc: `README.md`, `docs/design/data-governance-and-io-boundary.md`
- [x] Owner: Codex
- [x] Status: complete
- [x] Created: 2026-05-13
- [x] Updated: 2026-05-13

## 1. Summary

### Objective

- [x] SNS prototype launch before billing by enforcing a server-side free trial quota for authenticated users.

### User-visible outcome

- [x] New signed-in users receive 5 free simulation runs.
- [x] The app shows remaining free runs near login/run controls.
- [x] When the quota is exhausted, run creation is blocked with a clear Korean message.

### Engineering outcome

- [x] Google/test/local-dev auth users are persisted as app users.
- [x] Run creation is linked to a user and guarded by a SQLite usage ledger.
- [x] Admin/test allowlists can bypass the quota without frontend-only trust.

## 2. Policy

- A "free run" is counted when `POST /api/runs` accepts a request and the run is successfully queued.
- The API reserves 1 free-run credit before enqueueing, then refunds it automatically if the queue step fails before worker execution.
- If the worker starts and later fails, the credit remains consumed for the launch MVP. Manual support can issue an adjustment later if needed.
- Canceling a queued/running run does not automatically refund a credit in this MVP.
- Default free limit is 5 runs per user.
- Admin or unlimited emails configured by environment bypass the free quota.
- The quota is enforced only on the server. Frontend display is informational and ergonomic, not a security boundary.

## 3. Scope

### In Scope

- [x] `users` table.
- [x] `usage_ledger` table.
- [x] `runs.user_id` and `runs.user_email`.
- [x] `/api/me/usage` endpoint.
- [x] `/api/runs` quota enforcement.
- [x] Frontend quota badge and run-button disabled state.
- [x] API/store tests for 5-success/6th-block, queue refund, admin bypass.

### Out of Scope

- [x] Payment integration.
- [x] Organizations, teams, seats, invoices.
- [x] Per-sample billing.
- [x] Automated refund for every worker/provider failure mode.

## 4. Contracts

### API Contract

- `GET /api/me/usage`
  - Auth: app session required when auth is configured.
  - Response:

```json
{
  "user_id": "google-123",
  "email": "user@example.com",
  "plan": "free",
  "free_run_limit": 5,
  "used_runs": 2,
  "remaining_runs": 3,
  "can_create_run": true,
  "quota_bypass": false
}
```

- `POST /api/runs`
  - If quota remains: creates and queues the run.
  - If quota is exhausted: returns `403` with `FREE_QUOTA_EXHAUSTED`.

### Environment

- `KORESIM_FREE_RUN_LIMIT`: default `5`.
- `KORESIM_QUOTA_BYPASS_EMAILS`: comma-separated emails that bypass quota.
- `KORESIM_ADMIN_EMAILS`: comma-separated emails that bypass quota.

## 5. Implementation Checklist

- [x] Backend tests first.
- [x] SQLite schema and store methods.
- [x] Auth session user upsert.
- [x] Run ownership persistence.
- [x] API quota guard and refund on queue failure.
- [x] Frontend usage API/types.
- [x] Frontend quota display.
- [x] Verification.
