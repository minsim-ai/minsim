---
title: Admin Analytics and Feedback V1
type: execution-plan
tags: [admin, analytics, feedback, sqlite, react, fastapi]
created: 2026-06-03
updated: 2026-06-03
status: complete
related: [[../design/admin-analytics-data-layer]]
---

# Admin Analytics and Feedback V1

## 0. Metadata

- [x] Execution plan id: `admin-analytics-feedback-mvp`
- [x] Target phase: post-demo productization
- [x] Related design doc: [[../design/admin-analytics-data-layer]]
- [x] Owner: Codex
- [x] Status: complete
- [x] Created: 2026-06-03
- [x] Updated: 2026-06-03

## 1. Summary

### Objective

- [x] Add the first product-improvement data loop for Arabesque operators.

### User-visible outcome

- [x] Results pages collect simple usefulness/trust/actionability feedback.
- [x] Admin users can open `/admin` and inspect users, runs, events, feedback, funnel, account-domain proxy metrics, and governance policy.

### Engineering outcome

- [x] SQLite tables added for analytics events, user feedback, follow-ups, and admin audit events.
- [x] FastAPI exposes feedback, analytics, masked admin reads, admin export, retention dry-run/execute, and confirmed user deletion APIs.

## 2. Scope

### In scope

- [x] `analytics_events`, `user_feedback`, `result_followups`, `admin_audit_events`.
- [x] `/api/analytics/events`.
- [x] `/api/runs/{run_id}/feedback`.
- [x] `/api/admin/overview`, `/api/admin/users`, `/api/admin/runs`, `/api/admin/feedback`.
- [x] `/api/admin/export`, `/api/admin/policy`, `/api/admin/retention/prune`, `/api/admin/users/{user_id}/delete`.
- [x] React `/admin` route.
- [x] Result feedback widget.
- [x] Default masking for admin tables and export.
- [x] Funnel visualization and account-domain proxy dashboard.
- [x] Retention policy dry-run and confirmed prune workflow.
- [x] Confirmed user data deletion workflow.

### Still out of scope

- [x] First-class organization/team schema.
- [x] Real billing provider integration.
- [x] Legal-approved external customer data export.
- [x] Large-volume materialized analytics warehouse.

## 3. Validation Log

- [x] 2026-06-03: `UV_PROJECT_ENVIRONMENT=.venv-313 uv run --extra dev --python /opt/homebrew/bin/python3.13 pytest tests/test_api_app.py` passed, 23 tests.
- [x] 2026-06-03: `uv run python scripts/verify.py` passed: ruff, deterministic evals, 172 pytest tests, frontend lint/typecheck/build.
- [x] 2026-06-03: `uv run python scripts/check_mac_studio_production.py --external --timeout-seconds 15` passed.
- [x] 2026-06-03: `https://arabesque.cc/admin` returned `303` to Google login when unauthenticated; `/api/admin/overview` returned `401` when unauthenticated.
- [x] 2026-06-03: `uv run pytest tests/test_api_app.py::test_analytics_feedback_and_admin_api tests/test_api_app.py::test_admin_api_requires_admin_email` passed, covering admin masking, export, retention dry-run confirmation, and user deletion confirmation.
