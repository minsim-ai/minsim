---
title: React + FastAPI Migration Design
type: design-doc
tags: [react, fastapi, migration, api, sse, sqlite, cloudflare]
created: 2026-05-02
updated: 2026-05-02
status: draft
related: [[../../README]], [[harness-engineering-controls]], [[data-governance-and-io-boundary]], [[../phases/phase-1-cloudflare-tunnel]], [[../phases/phase-2-stability]], [[../phases/phase-6-design-sync]]
---

# React + FastAPI Migration Design

## 1. Problem

KoreaSim currently has two disconnected product surfaces:

- `app.py`: working Streamlit MVP wired to the real Python simulation engine.
- `frontend/`: polished React/Vite mock UI that is not wired to the real engine.

The external demo must move to React + FastAPI while preserving the working simulation engine. Without a design boundary, the migration can easily create duplicate business logic, mock-only UI drift, long-running request timeouts, and result-state loss during refresh or SSE reconnects.

This is a complex migration because it changes multiple layers at once:

- frontend state and routing
- backend API contract
- long-running job lifecycle
- Redis/RQ worker lifecycle
- persistence
- realtime progress
- Cloudflare Tunnel exposure
- future simulation expansion

## 2. Goals

- [ ] Serve the React app and API from one FastAPI origin.
- [ ] Keep the public landing URL as `https://arabesque.cc/`.
- [ ] Serve the protected demo app at `https://arabesque.cc/app`.
- [ ] Connect React Creative Testing flow to the real `CreativeTesting` engine.
- [ ] Create a stable run lifecycle: `queued`, `running`, `completed`, `failed`, `canceled`.
- [ ] Execute long-running simulations through RQ workers backed by Redis.
- [ ] Stream progress through SSE and support polling fallback.
- [ ] Persist run state, events, partial results, and final results in SQLite.
- [ ] Define a common result envelope with trust context.
- [ ] Keep Streamlit as an internal fallback only.
- [ ] Make Phase 5 simulation expansion possible without redesigning the API.

## 3. Non-goals

- Do not build a full user account system.
- Do not introduce Supabase, Clerk, Stripe, PostHog, or Sentry in this migration.
- Do not implement all 9 simulation types in this migration.
- Do not expose Ollama directly over the network.
- Do not introduce Celery; RQ is the approved queue for this migration.
- Do not build PDF/Excel export.
- Do not make Streamlit feature parity with React.

## 4. Current State

### Backend

Relevant files:

- `app.py`
  - Streamlit entrypoint.
  - Builds UI controls, calls `CreativeTesting().run(...)`, renders Plotly results.
- `src/simulations/creative_testing.py`
  - Real Creative Testing simulation.
  - Samples personas, calls `BatchSimulator`, aggregates counts and breakdowns.
  - `CreativeTesting.run(...)` currently accepts `creatives`, `sample_size`, `target_filter`, and `on_progress`.
  - It does not accept `seed` even though `PersonaSampler.sample(...)` supports it.
- `src/agent/simulator.py`
  - Async batch runner with semaphore concurrency.
  - Calls Ollama per persona.
  - Emits count-only progress via callback.
  - Returns all results only after the whole batch completes.
- `src/llm/client.py`
  - OpenAI-compatible Ollama client.
  - No explicit timeout/retry yet.
- `src/data/sampler.py`
  - Supports `TargetFilter` and deterministic sampling via `seed`.
- `src/config.py`
  - Loads model, Ollama base URL, concurrency, and parquet path.

### Frontend

Relevant files:

- `frontend/src/main.tsx`
  - Current hash-based local page switch: landing, app, results.
  - Existing `LandingPage` can be used for the public root route.
- `frontend/src/App.tsx`
  - Chat-style simulation input flow.
  - Currently uses local state and mock timing.
- `frontend/src/ResultsPage.tsx`
  - Polished result report UI.
  - Currently hardcoded to mock result data.
- `frontend/src/data/mockData.ts`
  - Contains simulation list, chat steps, and mock output fixtures.

### Infrastructure

- `pyproject.toml` already includes `fastapi` and `uvicorn`.
- `frontend/package.json` supports `dev`, `build`, `typecheck`, and `preview`.
- Cloudflare Tunnel plan is now apex domain `arabesque.cc -> localhost:8000`.

## 5. Proposed Design

### 5.1 One-origin FastAPI app

FastAPI becomes the single local origin:

```text
https://arabesque.cc
  -> Cloudflare Named Tunnel
  -> http://127.0.0.1:8000
  -> FastAPI
     ├── GET  / public React landing
     ├── GET  /app protected React app
     ├── GET  /results protected React result view
     ├── GET  /health public minimal health
     ├── GET  /api/config
     ├── GET  /api/health protected detailed health
     ├── POST /api/runs
     ├── GET  /api/runs/{run_id}
     ├── GET  /api/runs/{run_id}/events
     ├── GET  /api/runs/{run_id}/result
     └── GET  /* React static fallback with path-aware frontend routing
```

Redis/RQ job flow:

```text
FastAPI
  -> create run row in SQLite
  -> enqueue job in Redis/RQ
  -> return run_id immediately

RQ worker
  -> read run input from SQLite
  -> execute simulation
  -> write progress, events, partial results, and final result to SQLite

FastAPI SSE endpoint
  -> read SQLite event log
  -> stream snapshot/progress/heartbeat to React
```

Rationale:

- Avoids CORS and cookie complexity.
- Keeps Cloudflare Access simple.
- Gives React and API the same auth boundary.
- Makes local and public behavior similar.

### 5.2 Backend boundaries

```text
src/api/
  main.py        FastAPI app factory, middleware, static mount
  routes.py      HTTP route handlers only
  schemas.py     Pydantic request/response contracts

src/jobs/
  models.py      RunStatus, RunSnapshot, RunEvent dataclasses/enums
  store.py       SQLite persistence
  queue.py       RQ enqueue and Redis connection helpers
  worker.py      RQ worker entrypoint and job functions
  events.py      SSE formatting and SQLite event replay helpers

src/quality.py   QualityIndicators and sample summary helpers
```

Rules:

- API routes do not contain simulation business logic.
- Simulation modules do not know about HTTP, SSE, or SQLite.
- RQ worker owns execution lifecycle after enqueue.
- Store owns persistence and event log.
- Frontend consumes only documented API shapes.

### 5.3 Run lifecycle

```text
queued -> running -> completed
queued -> running -> failed
queued -> running -> canceled
queued -> running -> interrupted
```

`interrupted` is used when an RQ worker exits while a run was active or when a queued job is abandoned. In Phase 2, interrupted runs are not resumed automatically; React shows the preserved partial results and a rerun action.

### 5.4 Request contract

```json
{
  "simulation_type": "creative_testing",
  "input": {
    "creatives": [
      "당신의 일상을 더 스마트하게, 갤럭시 S26",
      "한 번의 터치로 펼쳐지는 무한한 가능성",
      "이미 미래를 살고 있다, 갤럭시 S26"
    ]
  },
  "sample_size": 50,
  "target_filter": {
    "age_min": 30,
    "age_max": 49,
    "exclude_unemployed": true
  },
  "seed": 42
}
```

Validation:

- `simulation_type` must be one of the registry keys.
- `sample_size` must be bounded for demo safety.
- Initial public-demo `sample_size` maximum is 50.
- `creative_testing.input.creatives` must have 2-10 non-empty strings.
- `target_filter` must match `TargetFilter`.
- `seed` defaults to 42.

### 5.5 Run creation response

`POST /api/runs` returns immediately:

```json
{
  "run_id": "uuid",
  "status": "queued",
  "simulation_type": "creative_testing",
  "events_url": "/api/runs/uuid/events",
  "status_url": "/api/runs/uuid",
  "result_url": "/api/runs/uuid/result"
}
```

The request must not wait for the simulation to complete.

### 5.6 Run status response

```json
{
  "run_id": "uuid",
  "simulation_type": "creative_testing",
  "status": "running",
  "sample_size": 50,
  "done_count": 17,
  "total_count": 50,
  "progress_pct": 34.0,
  "started_at": "2026-05-02T10:00:00Z",
  "updated_at": "2026-05-02T10:01:20Z",
  "completed_at": null,
  "error": null,
  "result_available": false
}
```

### 5.7 SSE contract

Endpoint:

```text
GET /api/runs/{run_id}/events
```

Event types:

```text
snapshot
queued
running
progress
partial_result
completed
failed
canceled
heartbeat
```

Behavior:

- First event is always `snapshot`.
- While running, server emits `heartbeat` every 15 seconds.
- `progress` includes `done_count`, `total_count`, `progress_pct`, `rate_per_min`, and `eta_seconds` when available.
- `partial_result` may include persona-level completion metadata, not the full raw result every time.
- On SSE failure, React falls back to `GET /api/runs/{run_id}` polling every 2 seconds.

Example:

```text
event: progress
data: {"run_id":"uuid","done_count":17,"total_count":50,"progress_pct":34.0}
```

### 5.8 Result envelope

All simulation results use the same outer shape:

```json
{
  "run_id": "uuid",
  "simulation_type": "creative_testing",
  "status": "completed",
  "seed": 42,
  "sample_size": 50,
  "total_responses": 50,
  "parse_failed": 1,
  "target_filter": {},
  "sample_summary": {},
  "quality": {},
  "warnings": [],
  "metrics": {},
  "segments": {},
  "insights": [],
  "raw_results": []
}
```

Creative Testing maps existing result fields as:

- `metrics.creatives`
- `metrics.choice_counts`
- `metrics.choice_pct`
- `metrics.reasons_by_choice`
- `segments.breakdown_by_age`
- `segments.breakdown_by_sex`
- `segments.breakdown_by_province`
- `raw_results`

The API returns full `raw_results` for MVP transparency. This includes sampled persona fields, raw model response, parsed result, and parse errors where present. Do not pre-redact persona columns just because the current UI does not use them; the persona explorer and future analysis may need them. Operational secrets, API keys, internal stack traces, and explicitly internal prompts are never included. If response size becomes a practical issue later, pagination can be added without changing the stored result format.

Data governance:

- Follow [[data-governance-and-io-boundary]] for field classification, attribution, provider transfer, and observability payloads.
- Full product result storage does not imply full third-party trace logging.
- External GPT/Gemini provider runs require the Phase 7 provider-transfer policy.

### 5.9 SQLite persistence

The store uses SQLite in `data/runtime/koresim.sqlite3`.

SQLite starts in Phase 1. A temporary memory store is not part of the approved migration path.

Initial tables:

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
  started_at text,
  completed_at text
);

create table run_events (
  id integer primary key autoincrement,
  run_id text not null,
  event_type text not null,
  payload_json text not null,
  created_at text not null
);

create table run_partial_results (
  id integer primary key autoincrement,
  run_id text not null,
  persona_uuid text not null,
  payload_json text not null,
  error text,
  created_at text not null,
  unique(run_id, persona_uuid)
);

create table run_results (
  run_id text primary key,
  result_json text not null,
  created_at text not null,
  updated_at text not null
);
```

`data/runtime/` should be gitignored.

### 5.10 Simulation execution

FastAPI accepts a validated request, creates a SQLite run row, enqueues an RQ job, and returns immediately.

Initial Redis URL:

```text
REDIS_URL=redis://localhost:6379/0
```

Upstash Redis can replace local Redis later, but Phase 1 should start with local Redis to keep local integration deterministic.

Creative Testing execution steps:

1. Create run row with `queued` in SQLite.
2. Enqueue RQ job with `run_id`.
3. RQ worker starts job and marks run `running`.
4. Sample personas with `seed`.
5. Run `BatchSimulator`.
6. On each persona completion:
   - save partial result
   - append progress event
   - make the event visible to SSE through the SQLite event log
7. Aggregate final result.
8. Build result envelope with sample summary and quality.
9. Save final result and mark `completed`.

Changes needed:

- `CreativeTesting.run(...)` should accept `seed`.
- `BatchSimulator.run(...)` should support a richer progress/partial callback, not only `(done, total)`.
- `OllamaClient.chat(...)` should get timeout/retry in Phase 2.

### 5.11 Frontend flow

React flow:

```text
User selects or enters scenario
  -> frontend builds RunCreateRequest
  -> POST /api/runs
  -> store run_id in localStorage
  -> connect EventSource(/api/runs/{run_id}/events)
  -> render queued/running/progress states
  -> on completed, fetch /api/runs/{run_id}/result
  -> render ResultsPage from real result envelope
```

Refresh recovery:

1. On app load, read latest `run_id` from localStorage.
2. Call `GET /api/runs/{run_id}`.
3. If `running`, reconnect SSE.
4. If `completed`, fetch result.
5. If `failed` or `interrupted`, show status and available partial context.

### 5.12 Frontend routing

The current React app uses hash routing:

- `#app`
- `#results`

For the public demo, routing should become path-aware:

- `/` renders `LandingPage`
- `/app` renders `App`
- `/results` renders `ResultsPage`

Hash routes may remain as backward-compatible aliases during migration, but production links should use paths. Result state must be keyed by `run_id`, not by hardcoded mock state.

### 5.13 Routing and Cloudflare

Domain terms:

- Apex/root domain: `arabesque.cc`
- Subdomain: `app.arabesque.cc`, `koresim.arabesque.cc`, etc.
- Path split: `arabesque.cc/` for landing and `arabesque.cc/app` for the app.

Decision: `arabesque.cc/` is the public landing page, and `arabesque.cc/app` is the simulation app.

Why:

- The landing page explains what KoreaSim is before the user hits an OTP/auth wall.
- The landing page can contain demo explanation, trust signals, validation links, and contact CTA.
- The simulation app and API can be protected without hiding the product explanation.
- The API remains same-origin at `/api/*`, so CORS stays simple.

Cloudflare Tunnel points apex domain to FastAPI:

```yaml
ingress:
  - hostname: arabesque.cc
    service: http://localhost:8000
```

Cloudflare Access is Phase 3 and should protect `arabesque.cc/app*`, `arabesque.cc/results*`, and `arabesque.cc/api*`. The root landing page `arabesque.cc/` stays public.

## 6. File-level Changes

### Backend

`src/api/__init__.py`

- Package marker.

`src/api/main.py`

- Create FastAPI app.
- Include API routes.
- Serve React build in production mode.
- Add fallback route for frontend paths.

`src/api/routes.py`

- Implement `/health`, `/api/config`, `/api/runs`, `/api/runs/{run_id}`, `/api/runs/{run_id}/events`, `/api/runs/{run_id}/result`.
- Keep route handlers thin.

`src/api/schemas.py`

- Define Pydantic request/response models.
- Define `SimulationType`, `RunStatus`, `TargetFilterModel`, and result envelope models.

`pyproject.toml`

- Add Redis/RQ dependencies during implementation:
  - `redis`
  - `rq`

`src/jobs/models.py`

- Define internal run/event/result models.

`src/jobs/store.py`

- Implement SQLite setup and CRUD.
- Append event log.
- Store partial and final results.

`src/jobs/queue.py`

- Connect to Redis.
- Enqueue RQ jobs.
- Expose queue health for `/api/config` or `/health`.

`src/jobs/worker.py`

- RQ worker entrypoint.
- Load run input from SQLite.
- Execute simulation registry.
- Persist progress, partial results, and final result.
- Enforce worker-side concurrency by running a controlled number of worker processes.

`src/jobs/events.py`

- Format SSE events.
- Replay events from SQLite event log.
- Provide heartbeat behavior while polling for new events.

`src/simulations/creative_testing.py`

- Add `seed` argument.
- Return enough metadata for result envelope.
- Preserve current aggregation behavior.

`src/agent/simulator.py`

- Add partial result callback support.
- Keep old progress callback compatibility if simple.

`src/llm/client.py`

- Phase 2: add timeout/retry.

`src/quality.py`

- Add `QualityIndicators`.
- Add sample summary helper.

`.gitignore`

- Add `data/runtime/` or `data/**/*.sqlite3`.

### Frontend

`frontend/src/api/client.ts`

- Shared fetch helper.
- JSON error handling.

`frontend/src/api/runs.ts`

- `createRun`, `getRun`, `getRunResult`.

`frontend/src/types/api.ts`

- TypeScript equivalents of backend API shapes.

`frontend/src/hooks/useRunEvents.ts`

- EventSource management.
- Polling fallback.
- Cleanup on unmount.

`frontend/src/App.tsx`

- Convert current chat completion into `RunCreateRequest`.
- Replace fake timer with API run creation.
- Navigate to result/progress state with real `run_id`.

`frontend/src/ResultsPage.tsx`

- Remove hardcoded `SIM` result as production source.
- Render from result envelope.
- Keep mock fixture only for isolated design preview if needed.

`frontend/src/data/mockData.ts`

- Keep simulation labels and form copy.
- Move result mock data to schema-matching fixtures or remove from production path.

## 7. API / Schema / State Impact

### API impact

New API surface:

- `GET /health`
- `GET /api/config`
- `POST /api/runs`
- `GET /api/runs/{run_id}`
- `GET /api/runs/{run_id}/events`
- `GET /api/runs/{run_id}/result`

When app-level authentication is enabled, every run-scoped status, event,
result, export, feedback, cancel, and partial-results route must verify
`runs.user_id` ownership before reading or mutating run data. Administrators may
use the explicit admin allowlist bypass. Ownership failures return the same 404
shape as an unknown run so run UUIDs cannot be used as an authorization token.

### Schema impact

Backend Pydantic and frontend TypeScript types must share these concepts:

- `SimulationType`
- `RunStatus`
- `TargetFilter`
- `RunCreateRequest`
- `RunCreateResponse`
- `RunSnapshot`
- `RunResultEnvelope`
- `QualityIndicators`
- `SampleSummary`

### DB impact

SQLite becomes local runtime state. It stores:

- submitted run input
- status and progress
- event log
- partial persona results
- final result envelope

### Frontend state impact

React state shifts from local mock-only state to `run_id` driven state:

- latest run id in localStorage
- run snapshot from API
- live events from SSE
- result envelope from API

## 8. Tradeoffs

### One FastAPI origin vs separate React and API servers

Chosen: one FastAPI origin.

Why:

- Simpler Cloudflare Tunnel config.
- No CORS for demo.
- Access auth applies consistently.
- Easier local reproduction of public behavior.

Cost:

- FastAPI must serve static files.
- React dev server and FastAPI server still differ during development.

### SQLite vs in-memory store

Chosen: SQLite for the migration target.

Decision: SQLite starts in Phase 1, not Phase 2.

Why:

- Refresh recovery and completed result restore require persistence.
- Low operational overhead.
- Good fit for single-machine local demo.

Cost:

- Need schema and write discipline.
- Not suitable for multi-instance deployment.

### SSE vs WebSocket

Chosen: SSE with polling fallback.

Why:

- One-way progress stream is enough.
- Easier to implement and debug.
- Works well with HTTP infrastructure.

Cost:

- Client-to-server actions such as cancel still use normal HTTP endpoints if added later.

### RQ vs Celery vs in-process tasks

Chosen: RQ with Redis.

Why:

- Long-running LLM simulations should not live inside the FastAPI request/server process.
- RQ is simpler than Celery and sufficient for a single-machine demo.
- Redis queue state makes worker execution explicit.
- SQLite remains the durable result/event source of truth.

Cost:

- Requires Redis locally in Phase 1.
- Requires running both FastAPI and an RQ worker.
- SSE cannot rely on in-process subscriber queues; it must read SQLite events.

## 9. Risks

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| React UI remains mock-driven | High | Phase 6 schema-first sync and remove hardcoded result source |
| Long-running HTTP request timeout | High | `POST /api/runs` returns immediately; SSE/polling handles progress |
| Redis unavailable | Medium | `/health` exposes queue status, local setup docs include Redis start command |
| RQ worker stopped during run | Medium | Mark run `interrupted`, preserve partial results, show rerun |
| SSE disconnect behind Cloudflare | Medium | Heartbeat + polling fallback |
| SQLite lock contention | Medium | Single-process MVP, short writes, no long write transactions |
| Ollama overload | High | Global concurrency limit |
| Partial results and final aggregation diverge | Medium | Final aggregation should be rebuildable from stored partial results |
| Apex domain conflict | Medium | Verify DNS records before tunnel route update |
| Process restart loses active job | Medium | Mark active runs `interrupted`, keep partial results, show rerun |

## 10. Test Strategy

### Backend unit/smoke

- Validate `RunCreateRequest` rejects invalid creative lists.
- Validate `TargetFilter` shape.
- Validate SQLite schema creates successfully.
- Validate run status transitions.
- Validate result envelope includes required trust fields.

### Integration

- Start Redis locally.
- Start RQ worker locally.
- Start FastAPI locally.
- `GET /health` returns ok.
- `POST /api/runs` returns `run_id` quickly.
- `GET /api/runs/{run_id}` shows `queued/running/completed`.
- `GET /api/runs/{run_id}/events` streams progress.
- `GET /api/runs/{run_id}/result` returns final Creative Testing envelope.

### Frontend

- `npm run typecheck`
- `npm run build`
- Manual browser flow:
  - create Creative Testing run
  - observe progress
  - refresh during run
  - reconnect to same run
  - view completed result

### Public demo validation

- FastAPI runs on `127.0.0.1:8000`.
- Tunnel maps `arabesque.cc` to port 8000.
- External browser can complete a 50-person run.
- After Phase 2, external browser can complete a 200-person run.

## 11. Rollback Plan

Rollback should preserve the working Streamlit MVP.

Steps:

1. Stop FastAPI server.
2. Stop RQ worker.
3. Stop Redis if only used for KoreaSim.
4. Stop or revert Cloudflare Tunnel route to previous origin if needed.
5. Run Streamlit fallback locally:

```text
.venv/bin/streamlit run app.py
```

6. If API code breaks imports, revert only `src/api/`, `src/jobs/`, and frontend API wiring.
7. Keep `src/simulations/creative_testing.py` changes backward-compatible where possible.

Rollback principle:

- Do not alter the simulation engine in a way that makes `app.py` unusable until the React+FastAPI path is verified.

## 12. Resolved Decisions and Open Questions

### Resolved

1. SQLite starts in Phase 1.
   - No temporary memory store for the approved path.
2. Initial public-demo `sample_size` maximum is 50.
   - 200-person external validation moves to Phase 2 after timeout/retry and recovery are in place.
3. API returns full `raw_results`.
   - Full raw results are useful for demo transparency and persona explorer behavior.
   - Do not remove synthetic persona fields prematurely.
   - Later pagination can be added if response size becomes an issue.
4. Use RQ + Redis for long-running simulation jobs.
   - Celery is more powerful but too heavy for the current local demo.
   - RQ is the approved queue for Phase 1.
5. Keep both preset-first and chat-style React entry flows.
   - Presets maximize demo success.
   - Chat-style input remains available for flexibility.
6. `arabesque.cc/` is the public landing page; `arabesque.cc/app*`, `arabesque.cc/results*`, and `arabesque.cc/api*` are protected surfaces.
7. `arabesque.cc` DNS/service conflict needs Cloudflare dashboard verification.
   - Local checks on 2026-05-02:
     - `curl -I -L --max-time 15 https://arabesque.cc` failed with DNS resolution error.
     - Python `socket.gethostbyname_ex("arabesque.cc")` failed with DNS resolution error.
   - This suggests no externally resolvable service was visible from this environment at check time, but Cloudflare DNS records must still be reviewed before route changes.

8. Presets are backend-driven through `/api/presets`.
   - Frontend fixtures may mirror them for story/demo states but are not the production source of truth.
9. Health endpoint split:
   - `/health` is public and minimal for tunnel/service checks.
   - detailed provider/queue/model health belongs under protected API surface.
10. Local MVP retention is indefinite.
   - Manual cleanup is acceptable until customer PoC requirements define a retention policy.

### Open

1. Should cancel support be included now?
   - Recommendation: not in Phase 1. Add `canceled` status to schema now, implement `POST /api/runs/{run_id}/cancel` later if needed.

## 13. Implementation Phases

### Phase A — API skeleton and static serving

- `src/api/main.py`
- `src/api/routes.py`
- `src/api/schemas.py`
- SQLite store bootstrap
- Redis/RQ connection bootstrap
- React build served by FastAPI
- `/health` and `/api/config`

### Phase B — Run lifecycle and Creative Testing

- `POST /api/runs`
- SQLite-backed run creation/status
- RQ enqueue
- RQ worker execution
- Creative Testing adapter
- run status endpoint

### Phase C — SSE and frontend wiring

- SSE endpoint
- frontend API client
- EventSource hook
- App flow creates real run
- path-aware frontend routing for `/`, `/app`, and `/results`

### Phase D — Recovery hardening

- partial results
- final result persistence
- refresh recovery
- polling fallback

### Phase E — Result page conversion

- result envelope renderer
- trust layer
- sample summary
- remove production dependency on mock result data

## 14. Inline Review Notes

Use this section for human review before implementation.

- [x] SQLite starts in Phase 1.
- [x] Initial public demo `sample_size` maximum is 50.
- [x] API returns full `raw_results`.
- [x] Use RQ + Redis for long-running simulation jobs.
- [x] Keep both preset-first and chat-style React entry flows.
- [x] Use `arabesque.cc/` as public landing and `/app*`, `/results*`, `/api*` as protected surfaces.
- [x] Use backend `/api/presets` as preset source of truth.
- [x] Split health into public minimal `/health` and protected detailed health under `/api`.
- [x] Keep completed run/result retention indefinite for local MVP.
- [ ] Verify `arabesque.cc` Cloudflare DNS records before tunnel route update.
