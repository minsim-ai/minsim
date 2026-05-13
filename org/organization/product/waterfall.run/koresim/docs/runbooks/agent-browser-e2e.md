---
title: Agent Browser E2E Runbook
type: runbook
tags: [e2e, agent-browser, ux, auth]
created: 2026-05-03
updated: 2026-05-03
status: active
related: [[../verification/agent-browser-e2e-2026-05-03]]
---

# Agent Browser E2E Runbook

## Purpose

Use `agent-browser` for compact, ref-based browser E2E checks against the React + FastAPI external demo path.

This is the preferred local agent E2E harness for:

- result-to-new-simulation UX flow
- result visualization smoke checks
- mobile overflow checks
- login-after-state checks once app-level social auth is enabled

## Install

```bash
npm install -g agent-browser
agent-browser install
```

## Current Auth State

KoreaSim uses FastAPI Google OAuth for app-level login. When `KORESIM_AUTH_REQUIRED=true`, or when auth is configured and `KORESIM_AUTH_REQUIRED` is unset, `/app*`, `/results*`, and run/preset/export APIs require a valid `koresim_session`.

Routine E2E still does not click through Google OAuth. Use the test-login endpoint in local/staging instead.

Enable:

```bash
KORESIM_AUTH_TEST_LOGIN_ENABLED=true
KORESIM_AUTH_REQUIRED=true
KORESIM_AUTH_COOKIE_SECURE=false
```

Then run the login bypass before browser scenarios:

```bash
agent-browser open http://127.0.0.1:8000/api/auth/test-login?next=/app
KORESIM_E2E_USE_TEST_LOGIN=1 scripts/run_agent_browser_e2e_matrix.sh
```

The test login endpoint is disabled by default and must not be enabled in production.

## Run

Prerequisites:

- FastAPI origin is running, usually `uv run uvicorn src.api.main:app --host 127.0.0.1 --port 8000`.
- `frontend/dist` is current, or run `cd frontend && npm run build`.
- A completed run exists in `data/runtime/koresim.sqlite3`, or set `KORESIM_E2E_RUN_ID`.

Command:

```bash
scripts/run_agent_browser_e2e.sh
```

For the full service matrix, run:

```bash
KORESIM_E2E_MAX_PARALLEL=4 scripts/run_agent_browser_e2e_matrix.sh
```

Optional environment:

```bash
KORESIM_E2E_BASE_URL=http://127.0.0.1:8000
KORESIM_E2E_SESSION=koresim-e2e
KORESIM_E2E_RUN_ID=<completed-run-id>
KORESIM_E2E_TEST_LOGIN_URL=<test-only-login-url>
KORESIM_E2E_USE_TEST_LOGIN=1
KORESIM_E2E_MAX_PARALLEL=4
KORESIM_E2E_REPORT_DIR=docs/verification/e2e/<run-id>
```

## Checks

The smoke script validates:

- A completed result page renders in the browser.
- `koresim:lastRunId` exists, matching the real-world state after a completed simulation.
- Clicking `새 시뮬레이션` lands on `/app`, not back on `/results`.
- The fresh simulation page exposes an input control.
- Desktop app view has no obvious broken data tokens or horizontal overflow.
- Mobile result view renders the `군중감` section.
- Mobile result view has no obvious broken data tokens or horizontal overflow.

The matrix script validates the broader service surface:

- 9 latest completed simulation result pages on desktop and mobile.
- Result title, trust layer labels, persona crowd buttons, and persona detail modals.
- Landing, app, and validation pages on desktop and mobile.
- App simulation picker expansion exposes all 9 simulation buttons and preset cards.
- Empty, failed, and interrupted run state renderers.
- `/api/config` and `/api/health` JSON responses.
- SSE replay for a completed run.
- The `새 시뮬레이션` regression path from `/results?run_id=...` to `/app`.
- Broken data tokens and horizontal overflow across all browser-rendered pages.

## Parallel Strategy

`scripts/run_agent_browser_e2e_matrix.sh` runs read-only browser checks in isolated `agent-browser` sessions. Result pages use completed run IDs discovered from SQLite, so parallel cases do not create or mutate runs.

The default concurrency is `KORESIM_E2E_MAX_PARALLEL=4`. This keeps Chrome sessions parallel enough to expose viewport and rendering issues while avoiding unnecessary pressure on the FastAPI origin. Increase it only when the origin server and local Chrome daemon are stable.

Each case writes its own log under `docs/verification/e2e/agent-browser-large-scale-*/logs/`; the aggregate `summary.tsv` and `report.md` are the durable verification artifacts.

Broken data tokens currently include:

- `undefined`
- `NaN`
- `[object Object]`

## Troubleshooting

- If the test still shows old behavior after a code change, rebuild `frontend/dist`; FastAPI serves the production build, not Vite dev output.
- If no completed run is available, run a small preset locally or pass a known completed `KORESIM_E2E_RUN_ID`.
- If app-level auth is later enabled, prefer `KORESIM_E2E_TEST_LOGIN_URL` over real Google OAuth UI automation.
