---
title: Phase 1 Implementation Readiness Review
type: research
tags: [phase-1, readiness, research, fastapi, rq, sqlite, react, langgraph]
created: 2026-05-02
updated: 2026-05-02
status: draft
related: [[../phases/phase-1-cloudflare-tunnel]], [[../execution/phase-1-react-fastapi-rq-sqlite]], [[../design/react-fastapi-migration]], [[../design/llm-gateway-orchestration]]
---

# Phase 1 Implementation Readiness Review

## 1. Purpose

Phase 1 is a complex multi-layer migration: React routing, FastAPI API, SQLite persistence, Redis/RQ workers, SSE, LLM client boundary, LangGraph scaffold, and Cloudflare Tunnel. The `sw-development` workflow says implementation should not begin until the codebase has been read, risks are documented, and phase boundaries are small enough to verify.

This review turns Phase 1 into small implementation gates.

## 2. Workflow Rules Applied

Source knowledge:

- `Read Codebase`: entry points, call flow, data structures, similar logic, risky files, reusable logic.
- `Backend API Change`: no business logic in handlers, validate auth/error contracts, no contract change without tests.
- `DB Migration`: compatibility, rollback, data impact, deployment order.
- `Frontend UI Fix`: keep design tokens, avoid inline style drift, check responsive states.
- `Reviewer`: layer violations, duplicated logic, missing tests, rollback possibility.

Applied rule:

- Do not start coding from the broad Phase 1 checklist.
- First implementation gate must be schema/types/config/scaffold.
- Each gate must have a pass condition before the next gate starts.

## 3. Current Codebase Snapshot

### Backend entry points

- `app.py`
  - Streamlit MVP.
  - Builds target filter and calls `CreativeTesting().run(...)`.
  - Must remain usable as fallback.
- `src/simulations/creative_testing.py`
  - Validates creative count.
  - Samples personas through `PersonaSampler`.
  - Calls `BatchSimulator`.
  - Aggregates results into `CreativeResult`.
  - Does not currently accept `seed`.
- `src/agent/simulator.py`
  - Runs per-persona calls concurrently.
  - Creates `OllamaClient()` directly.
  - Progress callback is count-only: `(done, total)`.
  - Returns all results after the whole batch.
- `src/llm/client.py`
  - OpenAI-compatible Ollama client.
  - No provider-agnostic interface yet.
  - No timeout/retry yet.
- `src/data/sampler.py`
  - Supports `TargetFilter`.
  - Supports deterministic `seed`.
  - Raises `ValueError` when no personas match.

### Frontend entry points

- `frontend/src/main.tsx`
  - Hash-based routing only: `#app`, `#results`.
  - Needs path-aware routing for `/`, `/app`, `/results`.
- `frontend/src/App.tsx`
  - Chat-style mocked flow.
  - Starts local loading overlay, then navigates to `#results`.
  - Does not create API runs.
- `frontend/src/ResultsPage.tsx`
  - Hardcoded report data.
  - Not yet contract-compatible with backend result envelope.
- `frontend/src/data/mockData.ts`
  - Simulation/chat fixture data.
  - Needs separation between story/demo fixtures and production API data.

### Dependency state

- `pyproject.toml` already has `fastapi`, `uvicorn`, `httpx`, `openai`, `pydantic`.
- Missing for Phase 1:
  - `redis`
  - `rq`
  - `langgraph` if Phase 1 creates an actual LangGraph scaffold.
- Missing for Phase 7 later:
  - `litellm`
  - `langfuse`
- `frontend/package.json` has build/typecheck scripts.
- No clear Python test suite is present yet.

## 4. Current Call Flow

```text
Streamlit app.py
  -> build target_filter
  -> CreativeTesting.run(creatives, sample_size, target_filter, on_progress)
  -> PersonaSampler.sample(n, filter_)
  -> BatchSimulator.run(personas, user_prompt, on_progress)
  -> OllamaClient.chat(system, user)
  -> CreativeTesting._aggregate(...)
  -> Streamlit renders result
```

Target Phase 1 flow:

```text
React /app
  -> POST /api/runs
  -> FastAPI validates RunCreateRequest
  -> SQLite creates queued run
  -> RQ enqueues run_id
  -> RQ worker loads run from SQLite
  -> optional LangGraph run-level scaffold
  -> CreativeTesting adapter executes batch
  -> SQLite stores events, partials, final result
  -> React receives SSE/polling events
  -> React /results fetches final result envelope
```

## 5. Readiness Gaps

### Contract gaps

- `RunCreateRequest`, `RunStatus`, `RunResultEnvelope`, and error response shapes do not exist.
- Frontend TypeScript types do not exist.
- Result envelope is not aligned with `CreativeResult`.
- `seed` exists in sampler but not in `CreativeTesting.run(...)`.

### Layering gaps

- `BatchSimulator` directly instantiates `OllamaClient`.
- There is no `LLMClient` protocol or adapter boundary.
- There is no run-level orchestrator boundary.
- API package does not exist.
- Job/store package does not exist.

### Persistence gaps

- SQLite schema does not exist.
- No migration/bootstrap pattern exists.
- No event log exists.
- No partial result write path exists.

### Queue gaps

- Redis/RQ dependencies are missing.
- No queue module or worker entrypoint exists.
- No worker failure status handling exists.

### Frontend gaps

- Route model is hash-only.
- Loading/running/failed/interrupted/restored states are not backed by API.
- Results page is hardcoded and visually rich, but not schema-driven.

### Testing gaps

- No `tests/` directory is present.
- No schema/unit tests.
- No store tests.
- No API route smoke tests.
- Frontend typecheck/build exists but has not been used as a gate in the plan.

## 6. Risk Map

| Risk | Severity | Why it matters | Gate mitigation |
| --- | --- | --- | --- |
| API schema drifts from React mock | High | ResultsPage can keep showing fake data | 1A defines backend and frontend contract first |
| Handler business logic grows | High | FastAPI route becomes untestable | 1B thin route rule, 1C/1D owns business logic |
| SQLite store shape changes mid-implementation | High | RQ/SSE/result restore become fragile | 1A schema + 1C store before worker |
| Long-running request timeout | High | Browser or Cloudflare times out | 1C/1D queue path, POST returns immediately |
| LLM provider lock-in | Medium | LiteLLM migration becomes invasive later | 1A LLMClient interface + Ollama adapter |
| LangGraph overreach | Medium | Phase 1 becomes too large | 1A scaffold only, no per-persona graph fanout |
| Streamlit fallback breaks | Medium | Current working MVP is lost | every gate checks import/backward compatibility |
| Missing test harness | Medium | Contract changes become blind | 1A adds minimum schema/import tests |

## 7. Recommended Implementation Gates

### Gate 1A — Contracts, Config, LLM Boundary, LangGraph Scaffold

Purpose:

- Define the shared contracts before any API or UI implementation depends on them.

Includes:

- Pydantic schemas.
- TypeScript API/result types.
- config additions.
- `LLMClient` protocol/interface.
- Ollama adapter wrapping existing client.
- thin LangGraph run-level scaffold behind config flag.
- baseline tests/import smoke.

Pass condition:

- schema/import tests pass.
- `CreativeTesting().run(...)` remains callable.
- no FastAPI route or React production API wiring yet.

### Gate 1B — FastAPI Skeleton and Static Serving

Purpose:

- Create the one-origin app shell without long-running execution.

Includes:

- `src/api/main.py`, `routes.py`, `static.py`.
- `/health`, `/api/health`, `/api/config`.
- React static fallback.
- path-aware frontend routing.

Pass condition:

- local FastAPI serves `/`, `/app`, `/results`, `/health`.
- frontend build passes.

### Gate 1C — SQLite Store and RQ Queue Skeleton

Purpose:

- Create durable run lifecycle without real simulation execution.

Includes:

- SQLite bootstrap.
- run/event/result tables.
- Redis/RQ connection.
- fake/no-op worker job that moves `queued -> running -> completed`.

Pass condition:

- POST run returns immediately.
- RQ worker updates SQLite.
- result/status can be fetched after API restart.

### Gate 1D — Creative Testing Worker Adapter

Purpose:

- Connect real simulation engine while preserving Streamlit fallback.

Includes:

- `CreativeTesting.run(..., seed=...)`.
- worker adapter.
- event writes during progress.
- final result envelope with full `raw_results`.

Pass condition:

- 10-person local run completes through RQ.
- 50-person local run completes.
- Streamlit fallback still imports/runs.

### Gate 1E — SSE and React API Wiring

Purpose:

- Replace React mock run flow with real API state flow.

Includes:

- SSE endpoint.
- EventSource hook.
- polling fallback stub.
- React API client.
- run id localStorage.
- ResultsPage reads live result envelope.

Pass condition:

- refresh-safe local happy path.
- failed state can be shown.
- frontend typecheck/build passes.

### Gate 1F — Local Integration and Cloudflare Tunnel Validation

Purpose:

- Make `arabesque.cc` external 50-person demo credible.

Includes:

- run commands.
- tunnel config.
- DNS dashboard check.
- external route validation.

Pass condition:

- `https://arabesque.cc/` public landing.
- `https://arabesque.cc/app` app.
- external 50-person run completes.

## 8. Pre-Implementation Baseline Checks

Run before Gate 1A implementation:

```bash
cd frontend && npm run typecheck && npm run build
python - <<'PY'
from src.simulations.creative_testing import CreativeTesting
from src.data.sampler import PersonaSampler
print(CreativeTesting)
print(PersonaSampler)
PY
```

Optional environment checks:

```bash
test -f data/nemotron_korea_personas.parquet
curl http://localhost:11434/v1/models
```

## 9. Resolved Before Coding

- Add `langgraph` in Gate 1A because Phase 1 LangGraph scaffold was approved.
- Create minimal `tests/` in Gate 1A because contract changes without tests are disallowed by the workflow.
- Hand-write frontend TypeScript API/result types initially; consider Pydantic/OpenAPI generation only after the API stabilizes.

Implementation note:

- Gate 1A is the next implementation gate, but implementation should still begin only after the user explicitly approves coding.
