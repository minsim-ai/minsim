# Minsim V2 Full UX Design

Date: 2026-07-10
Project: koresim-v2
Status: Approved design draft

## Goal

Build `koresim-v2` as the production continuation of KoreaSim with the existing backend, infrastructure, simulation engine, authentication, run lifecycle, and classic UI preserved, while making the default application experience use the minsim-style project, intake, loading, and result UX.

## Non-Goals

- Do not delete the original `koresim` directory.
- Do not remove the existing koresim UI from `koresim-v2`; preserve it behind classic routes.
- Do not replace the FastAPI, SQLite, Redis/RQ, worker, result envelope, Google OAuth, quota, or SSE foundations.
- Do not keep minsim's `window.*` classic-script data model as the production frontend architecture.
- Do not duplicate the simulation engine for MCP; MCP must call the same service layer as the web UI.

## Architecture

`koresim-v2` remains a single FastAPI origin serving the React application and API. The V2 web application, project APIs, and MCP endpoint share the same authentication, authorization, persistence, and run lifecycle services.

Routes:

- `/app`: default minsim-style V2 app shell.
- `/projects`: minsim-style project home.
- `/results?run_id=...`: minsim-style V2 result report.
- `/classic/app`: existing koresim app UI.
- `/classic/results?run_id=...`: existing koresim result UI.
- `/mcp`: authenticated MCP Streamable HTTP endpoint.
- `/api/projects/*`: V2 project APIs.
- Existing `/api/runs/*`, `/api/intake/*`, `/api/auth/*`, `/api/me/*`, `/api/admin/*`: preserved unless a V2 endpoint explicitly wraps them.

The backend execution flow stays unchanged:

```text
V2 project run request
  -> existing RunCreateRequest
  -> SQLite run store
  -> Redis/RQ worker
  -> simulation engine
  -> RunResultEnvelope
  -> V2 result adapter
  -> minsim-style UI
```

## Data Model

Add server-persisted projects. Projects belong to authenticated users and contain reusable product context for all runs created inside that project.

`projects`:

- `project_id`
- `user_id`
- `name`
- `description`
- `product_context`
- `features`
- `prices`
- `target_notes`
- `alternatives`
- `created_at`
- `updated_at`
- `archived_at`

`project_runs`:

- `project_id`
- `run_id`
- `derived_from_run_id`
- `run_label`
- `created_at`

Project data can be represented as JSON-backed columns if that matches the existing SQLite store style, but the service interface must expose typed Python dictionaries and predictable response shapes.

Authorization rules:

- A user can list, read, modify, archive, and create runs only for their own projects.
- A run can be attached to a project only if the current user owns the project and the run.
- Follow-up, feedback, export, result, and interview operations must verify run ownership through the project/run association or existing run ownership.
- Local development may use the existing koresim dev-auth behavior; production uses Google OAuth sessions.

## Project API

Add V2 project APIs:

- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/{project_id}`
- `PATCH /api/projects/{project_id}`
- `POST /api/projects/{project_id}/archive`
- `GET /api/projects/{project_id}/runs`
- `POST /api/projects/{project_id}/runs`
- `POST /api/projects/{project_id}/runs/{run_id}/followup`
- `POST /api/projects/{project_id}/runs/{run_id}/interview`

`POST /api/projects/{project_id}/runs` combines:

- saved project product context,
- current intake output,
- selected simulation type,
- target filter,
- sample size,
- candidate options,
- optional derived-from run context,

then builds the existing `RunCreateRequest`. The existing worker remains the only component that executes simulations.

## Frontend UX

Implement minsim-style UX as TypeScript React components inside `frontend/src`, not by copying minsim's classic-script globals directly.

V2 screens:

- `V2AppShell`: top navigation, account area, model/status controls, flow rail, classic UI link.
- `ProjectsPage`: project list, new project creation, project summaries, recent runs.
- `ProjectDetailPage`: editable product context, simulation history, new simulation entry.
- `SimulationTypePage`: minsim-style selection for all 9 supported simulation types.
- `MinsimIntakeFlow`: minsim-style chat/panel UX backed by existing `/api/intake/advance` and project context.
- `MinsimLoadingPage`: minsim-style progress screen backed by existing `useRunEvents` SSE/polling.
- `MinsimResultsPage`: minsim-style report backed by `RunResultEnvelope`.

Classic screens:

- Existing `App` and `ResultsPage` remain importable.
- Route them under `/classic/app` and `/classic/results`.
- Keep existing story/demo result routes available if useful for regression.

## Result Adapter

Create a frontend adapter:

```ts
function resultToMinsimView(result: RunResultEnvelope, snapshot?: RunSnapshot | null): MinsimReportView
```

Responsibilities:

- Convert `RunResultEnvelope.metrics` into minsim-style option cards and ranking.
- Convert `RunResultEnvelope.segments` into age, sex, province, and generic segment matrices.
- Convert `raw_results` into persona cards, crowd grid data, evidence quotes, and interview subjects.
- Convert orchestration agent output into findings, actions, risks, QA/trust indicators.
- Preserve trust-layer information: sample size, total responses, parse failures, quality, warnings, seed, model/provider metadata, timestamp, and disclaimer.
- Support all 9 simulation types, not only `creative_testing`.

The Python adapter in `../misim/backend/adapters/envelope_to_wf.py` is a reference, not the production frontend dependency. The TypeScript adapter should be fixture-tested against representative envelopes.

## MCP Server

Integrate MCP into the same FastAPI origin at `/mcp`. MCP shares the same V2 service layer used by the web UI.

Transport:

- First implementation: Streamable HTTP endpoint at `/mcp`.
- Future option: stdio wrapper around the same core registry.
- Keep tool/resource/prompt registration independent from HTTP transport.

Authentication:

- MCP is available only to Google-authenticated users.
- HTTP MCP authorization follows OAuth 2.1 compatible protected-resource expectations.
- Unauthenticated MCP requests return an MCP-compatible authorization error.
- Each tool checks project/run ownership using the current authenticated user.

Tools:

- `list_projects`
- `create_project`
- `update_project`
- `archive_project`
- `get_project`
- `list_project_runs`
- `create_project_run`
- `get_run_status`
- `get_run_result`
- `submit_run_feedback`
- `export_run`
- `ask_followup`
- `start_interview`
- `ask_interview_question`

Resources:

- `koresim-v2://projects/{project_id}`
- `koresim-v2://projects/{project_id}/runs`
- `koresim-v2://runs/{run_id}/result`
- `koresim-v2://runs/{run_id}/export`

Prompts:

- `new-product-simulation`
- `compare-creative-candidates`
- `summarize-run-result`
- `plan-followup-simulation`

## Service Layer

Add V2 service functions so web routes and MCP tools do not duplicate logic.

Service responsibilities:

- Project CRUD and archive.
- Project ownership checks.
- Project-run association.
- Run creation from project context.
- Result retrieval with ownership checks.
- Export retrieval with ownership checks.
- Feedback submission with ownership checks.
- Follow-up and interview calls with ownership checks.

The service layer should call existing koresim run store, intake, queue, feedback, export, and result paths where possible.

## Error Handling

Web APIs return existing koresim-style structured errors. MCP returns tool-readable structured error content while avoiding raw stack traces.

Expected cases:

- Not authenticated.
- Project not found.
- Run not found.
- Project/run ownership mismatch.
- Result not ready.
- Queue unavailable.
- Unsupported simulation type.
- Invalid project context.
- Follow-up or interview requested before result availability.

## Verification

Backend tests:

- Project CRUD and archive.
- Project ownership and run ownership.
- Project-run creation wraps existing run creation correctly.
- Result/export/feedback/follow-up/interview reject unauthorized users.
- MCP endpoint rejects unauthenticated requests.
- MCP tools validate input and call V2 services.

Frontend tests:

- `resultToMinsimView` fixture tests for `creative_testing`.
- `resultToMinsimView` fixture tests for at least one generic simulation.
- Route smoke tests for `/app`, `/projects`, `/results`, `/classic/app`, `/classic/results`.
- Typecheck and production build.

Integration checks:

- Fake worker or deterministic fixture run through project creation, intake, run creation, loading, and result render.
- Existing `scripts/verify.py` remains the final verification gate.
- Browser QA confirms the minsim-style result page renders real data, not mock globals.

## Migration Strategy

Implement in five increments:

1. Foundation: project persistence, project APIs, service layer, classic routes, V2 route skeleton.
2. Project and intake UX: project home/detail, minsim intake, project-backed run creation.
3. Loading and results UX: SSE progress, result adapter, minsim report, feedback/export/follow-up/interview.
4. MCP: authenticated Streamable HTTP endpoint, tools, resources, prompts.
5. Default switch: `/app`, `/projects`, and `/results` become V2 default while `/classic/*` preserves the original koresim UI.

## Open Decisions Resolved

- Default implementation approach: integrated FastAPI + V2 app + MCP HTTP.
- Existing koresim UI preservation: yes, inside `koresim-v2` classic routes.
- Project persistence: server-side, user-owned.
- MCP scope: broad, including feedback, export, follow-up, and interview.
- MCP auth: Google-authenticated users only.

