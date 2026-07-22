---
title: Admin Analytics Data Layer
type: design
tags: [admin, analytics, feedback, persistence, product-ops]
created: 2026-06-03
updated: 2026-06-03
status: implemented-v1
---

# Admin Analytics Data Layer

## Purpose

Arabesque needs an operator-facing data loop for product improvement, not only run recovery. The MVP admin layer keeps the existing run/intake/result persistence as the source of truth and adds structured product analytics and feedback tables around it.

## Current Flow

```text
Authenticated user
-> users / usage_ledger
-> intake_sessions / intake_messages / intake_events
-> runs / run_events / run_partial_results
-> run_results / agent_runs
-> analytics_events / user_feedback / result_followups
-> /api/admin/* masked operator console
-> admin export / retention prune / user deletion actions
```

## New Tables

- `analytics_events`: product journey events such as page views, intake advances, run creation, result views, exports, and feedback submission.
- `user_feedback`: result-level usefulness, trust, actionability, expectation, and free-text feedback.
- `result_followups`: intended action and optional decision-confidence/share/export follow-up signals.
- `admin_audit_events`: records admin read actions against admin endpoints.

## Access Policy

- `/admin` is a React route protected by the existing app-level auth middleware.
- `/api/admin/*` requires a logged-in user whose normalized email is present in `KORESIM_ADMIN_EMAILS`.
- `KORESIM_QUOTA_BYPASS_EMAILS` does not grant admin access by itself.

## Data Governance

- Existing product storage may contain customer-entered product, price, and strategy data.
- Admin API responses mask email, name, free-text, input payload, target filter, intake context, and event payload fields by default.
- Admin users can explicitly request sensitive data with `include_sensitive=true`; this is audited.
- Admin export defaults to the same masked payload and does not include raw persona rows as a customer-facing export.
- Retention pruning defaults to dry-run. Actual pruning requires `confirm=true`.
- User-level deletion requires `confirm_user_id` to match the route target and blocks deleting the currently logged-in admin account.
- Admin read, export, retention, and deletion actions are written to `admin_audit_events`.

## Operator Views

- `/api/admin/overview`: core counts, simulation breakdown, recent events, funnel, account-domain proxy metrics, and policy.
- `/api/admin/users`: user list with run/intake/feedback counts.
- `/api/admin/runs`: recent run metadata and masked run inputs.
- `/api/admin/feedback`: result feedback and follow-up signals.
- `/api/admin/export`: masked JSON admin export for internal product analysis.
- `/api/admin/retention/prune`: dry-run or confirmed retention cleanup.
- `/api/admin/users/{user_id}/delete`: confirmed user data deletion.

## Deferred

- First-class organization/team schema.
- Real billing integration, invoices, seats, and paid plan entitlements.
- Materialized reporting tables for larger production volume.
- Legal-approved external customer data export policy.
