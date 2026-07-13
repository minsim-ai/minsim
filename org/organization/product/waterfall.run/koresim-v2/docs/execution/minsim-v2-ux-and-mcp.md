# Minsim V2 UX and MCP Integration

## What Changed

`koresim-v2` keeps the original KoreaSim backend, worker, storage, auth, quota, and result envelope, while making the default web experience minsim-style:

- `/app` and `/projects` open the new V2 project hub.
- `/projects/{project_id}` stores product context, features, prices, target notes, alternatives, and run history on the server.
- `/projects/{project_id}/type` selects one of the nine KoreaSim simulation types.
- `/projects/{project_id}/intake?type=...` uses the existing intake planner, prefilled with project context.
- `/loading?project_id=...&run_id=...` polls the project run until the result is ready.
- `/results?project_id=...&run_id=...` renders a minsim-style report from the live `RunResultEnvelope`.
- `/classic/app` and `/classic/results?run_id=...` preserve the original KoreaSim UI.

The result page uses `frontend/src/v2/resultAdapter.ts` as the boundary between backend data and minsim visualization. It converts the API envelope into verdict, metric cards, rank rows, segment matrices, evidence quotes, methodology, recommendations, and follow-up targets. `frontend/src/v2/ResearchWorkspace.tsx` combines evidence and respondent browsing with one target-aware composer: a cohort target runs fan-out follow-up, while an individual target uses a persisted cumulative interview thread.

## Server-Persisted Flow

The V2 frontend uses these project-scoped APIs:

- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/{project_id}`
- `PATCH /api/projects/{project_id}`
- `POST /api/projects/{project_id}/archive`
- `GET /api/projects/{project_id}/runs`
- `POST /api/projects/{project_id}/runs`
- `GET /api/projects/{project_id}/runs/{run_id}/result`
- `GET /api/projects/{project_id}/runs/{run_id}/export`
- `POST /api/projects/{project_id}/runs/{run_id}/feedback`
- `POST /api/projects/{project_id}/runs/{run_id}/followup`
- `POST /api/projects/{project_id}/runs/{run_id}/interview`
- `GET /api/projects/{project_id}/runs/{run_id}/interview-threads`
- `POST /api/projects/{project_id}/runs/{run_id}/interview-threads`
- `POST /api/projects/{project_id}/runs/{run_id}/interview-threads/{thread_id}/messages`

All project APIs use the authenticated user and reject cross-user access. The legacy one-shot `/interview` API remains available for MCP and existing clients; the V2 web result workspace uses the thread APIs so each respondent's history survives refreshes and later visits.

## MCP Endpoint

The MCP HTTP endpoint is mounted at:

```text
POST /mcp
GET /.well-known/oauth-protected-resource
```

Unauthenticated MCP calls receive `401` with a `WWW-Authenticate` header that points to protected-resource metadata. In production, users should authenticate through the existing Google OAuth login. In local development and tests, the existing local-dev/test-login session can be used.

Supported MCP methods:

- `initialize`
- `ping`
- `tools/list`
- `tools/call`
- `resources/list`
- `resources/read`
- `prompts/list`
- `prompts/get`

Available MCP tools:

- `koresim.list_projects`
- `koresim.create_project`
- `koresim.get_project`
- `koresim.list_project_runs`
- `koresim.create_project_run`
- `koresim.export_run`
- `koresim.submit_feedback`
- `koresim.ask_followup`
- `koresim.ask_interview`

Read-only MCP resources:

- `koresim://projects`
- `koresim://projects/{project_id}`
- `koresim://projects/{project_id}/runs`
- `koresim://projects/{project_id}/runs/{run_id}/export`

## Local Verification

Backend focused checks:

```bash
uv run python -m pytest tests/test_project_store.py tests/test_project_api.py tests/test_followup_service.py tests/test_mcp_http.py -q
uv run python -m pytest tests/test_api_auth.py tests/test_imports.py tests/test_schema_parity.py -q
```

Frontend focused checks:

```bash
cd frontend
npm run check:minsim
npm run lint
npm run typecheck
npm run build
```

Full gate:

```bash
uv run python scripts/verify.py
cd frontend && npm run verify
```
