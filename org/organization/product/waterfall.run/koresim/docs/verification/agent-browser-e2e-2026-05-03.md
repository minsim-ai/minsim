---
title: Agent Browser E2E
type: verification-artifact
created: 2026-05-03
status: passed
related:
  - ../runbooks/agent-browser-e2e
  - ../../scripts/run_agent_browser_e2e.sh
---

# Agent Browser E2E

## Scope

This checkpoint installed and used `agent-browser` to reproduce and fix a result-page UX regression.

Reported issue:

- User was viewing a result page.
- Clicking `새 시뮬레이션` returned to the result page again.

Root cause:

- `App.tsx` restored `koresim:lastRunId` on `/app`.
- If the stored run was completed and had a result, the app immediately redirected to `/results?run_id=...`.
- This made the `새 시뮬레이션` button behave like a return-to-results action whenever a completed run remained in localStorage.

Fix:

- `/app` now only resumes queued/running runs from `koresim:lastRunId`.
- Completed results remain recoverable through `/results`, but no longer block starting a new simulation.

## E2E Environment

Installed:

```bash
npm install -g agent-browser
agent-browser install
```

Installed Chrome:

- Chrome `148.0.7778.97`
- Location: `/Users/byeongsu/.agent-browser/browsers/chrome-148.0.7778.97`

Current auth state:

- KoreaSim current demo route is public app/API access.
- App-level social login is not yet enabled.
- The E2E script therefore runs the post-login UX path in an isolated browser session.
- Future social-login E2E can provide `KORESIM_E2E_TEST_LOGIN_URL` for a test-only auth bypass endpoint instead of automating the real Google OAuth UI.

## Reproduction

Completed run used:

```text
ad18573a-153b-4a23-b740-ebd83ad16a22
```

Before rebuilding the frontend production bundle, the E2E reproduced the issue:

```text
Expected 새 시뮬레이션 to land on http://127.0.0.1:8000/app,
got http://127.0.0.1:8000/results?run_id=ad18573a-153b-4a23-b740-ebd83ad16a22
```

## Passing E2E

Command:

```bash
cd frontend && npm run build
scripts/run_agent_browser_e2e.sh
```

Result:

```text
agent-browser e2e passed
```

Key assertions:

```json
{
  "route": "/app",
  "hasInput": true,
  "badToken": false,
  "overflow": false
}
```

Mobile result visual smoke:

```json
{
  "route": "/results",
  "badToken": false,
  "overflow": false,
  "crowd": true
}
```

## Notes

- Vite emitted the existing large chunk warning during build; it did not fail the build.
- FastAPI serves `frontend/dist`, so E2E against `127.0.0.1:8000` must run after production build refresh.
- Final checkpoint also ran `uv run python scripts/verify.py` and then re-ran `scripts/run_agent_browser_e2e.sh`; both passed.
