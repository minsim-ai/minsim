---
title: App Auth Operations
type: runbook
tags: [auth, google-oauth, quota, e2e]
created: 2026-05-03
updated: 2026-05-13
status: active
---

# App Auth Operations

KoreaSim is a React/Vite + FastAPI app. Better Auth is a good fit for a future Next.js migration, but the current app-level login uses FastAPI Google OAuth and a signed HTTP-only session cookie.

## Environment

Use real values only in local `.env`, shell environment, or a secret manager:

```bash
KORESIM_AUTH_BASE_URL=https://arabesque.cc
KORESIM_AUTH_SECRET=<long-random-secret>
KORESIM_AUTH_REQUIRED=true
GOOGLE_CLIENT_ID=<google-oauth-client-id>
GOOGLE_CLIENT_SECRET=<rotated-google-oauth-client-secret>
KORESIM_AUTH_COOKIE_SECURE=true
KORESIM_FREE_RUN_LIMIT=5
KORESIM_ADMIN_EMAILS=<comma-separated-admin-emails>
KORESIM_QUOTA_BYPASS_EMAILS=<comma-separated-bypass-emails>
```

Local development can use:

```bash
KORESIM_AUTH_BASE_URL=http://localhost:8000
KORESIM_AUTH_COOKIE_SECURE=false
KORESIM_AUTH_LOCAL_DEV_AUTO_LOGIN=true
```

Google OAuth redirect URI:

```text
https://arabesque.cc/api/auth/google/callback
http://localhost:8000/api/auth/google/callback
```

When `KORESIM_AUTH_REQUIRED` is unset, KoreaSim requires login automatically if Google OAuth and `KORESIM_AUTH_SECRET` are configured. Set `KORESIM_AUTH_REQUIRED=false` only for a fully public local demo.

## Routes

- `GET /api/auth/session`: returns auth status and safe user metadata.
- `GET /api/auth/google/login?next=/app`: starts Google OAuth.
- `GET /api/auth/google/callback`: exchanges the code and sets `koresim_session`.
- `GET|POST /api/auth/logout?next=/`: clears the session.
- `GET /api/auth/test-login?next=/app`: test/staging-only login bypass.
- `GET /api/me/usage`: returns the signed-in user's free-run usage and remaining quota.
- Protected when auth is required: `/app*`, `/results*`, `/api/presets`, `/api/runs*`, and report export routes.
- Public even when auth is required: `/`, `/validation`, `/api/auth/*`, `/api/health`, `/api/config`, and static assets.

## Free Trial Quota

For the SNS prototype launch, newly authenticated users receive 5 free simulation runs by default. The limit is enforced by `POST /api/runs`, not by the frontend.

- A run consumes 1 credit only after the request is accepted for queueing.
- If queueing fails before worker execution, the credit is refunded automatically.
- Later worker/provider failures and user cancellation do not auto-refund in the MVP.
- Admin or bypass emails configured by `KORESIM_ADMIN_EMAILS` or `KORESIM_QUOTA_BYPASS_EMAILS` can create runs without consuming free credits.

Support commands:

```bash
uv run python scripts/manage_user_quota.py --email user@example.com show
uv run python scripts/manage_user_quota.py --email user@example.com add --credits 1 --reason worker_failed_no_result
uv run python scripts/manage_user_quota.py --email user@example.com reset --reason launch_support_reset
```

Manual refund policy:

- Refund when queueing failed before worker execution, or when support confirms the worker/provider failed before a useful result was produced.
- Do not refund normal user cancellation or completed low-confidence results by default.
- Record the reason with `--reason`; do not put private customer content in the reason string.

## Local Dev Auto Login

When the request host is `localhost`, `127.0.0.1`, or `::1`, local development auto-login is enabled by default. This lets the developer use `/app`, `/results`, and protected APIs without clicking through Google OAuth.

Disable it explicitly when testing the unauthenticated path:

```bash
KORESIM_AUTH_LOCAL_DEV_AUTO_LOGIN=false
```

This path never applies to external hosts such as `arabesque.cc`; production should keep `KORESIM_AUTH_TEST_LOGIN_ENABLED=false`.

## E2E Test Login

Do not automate the real Google OAuth UI in routine E2E. Enable the test login only in local/staging:

```bash
KORESIM_AUTH_TEST_LOGIN_ENABLED=true
KORESIM_AUTH_REQUIRED=true
KORESIM_AUTH_TEST_EMAIL=test@example.com
KORESIM_AUTH_TEST_NAME="KoreaSim Test User"
```

Then use:

```bash
agent-browser open http://127.0.0.1:8000/api/auth/test-login?next=/app
agent-browser open http://127.0.0.1:8000/app
```

The test-login endpoint returns `404` unless explicitly enabled.

## Secret Handling

- Never commit `.env`, OAuth client JSON, client secret, or session secret.
- If a Google OAuth secret appears in chat, docs, logs, or git history, rotate it before use.
- `GET /api/config` exposes route names only, not provider secrets.
