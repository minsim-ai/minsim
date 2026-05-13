---
title: Phase 1 Execution — React + FastAPI + RQ + SQLite
type: execution-plan
tags: [phase-1, execution, react, fastapi, rq, redis, sqlite, cloudflare]
created: 2026-05-02
updated: 2026-05-03
status: completed
related: [[../templates/execution-plan-template]], [[../phases/phase-1-cloudflare-tunnel]], [[../design/react-fastapi-migration]], [[../design/harness-engineering-controls]], [[../design/data-governance-and-io-boundary]], [[../design/evaluation-framework]], [[../research/phase-1-implementation-readiness]], [[../research/harness-engineering-gap-review]], [[gate-1A-contracts-scaffold]]
---

# Phase 1 Execution — React + FastAPI + RQ + SQLite

## Reconciliation Note

This execution plan is complete. Unchecked historical items were reconciled on 2026-05-03 against `CLAUDE.md`, the Phase 1/2/3 completion evidence, and the protected-demo audit. The external demo path uses Gemini as the validated primary provider; the full planned local `gemma3:27b` Ollama run remains a fallback-capacity validation gap outside Phase 1 completion.

## 0. Metadata

- [x] Execution plan id: `phase-1-react-fastapi-rq-sqlite`
- [x] Target phase: Phase 1
- [x] Related design doc: [[../design/react-fastapi-migration]]
- [x] Related readiness review: [[../research/phase-1-implementation-readiness]]
- [x] First gate execution plan: [[gate-1A-contracts-scaffold]]
- [x] Owner: KoreaSim
- [x] Status: completed
- [x] Created: 2026-05-02
- [x] Updated: 2026-05-03

## 1. Summary

### Objective

- [x] `arabesque.cc/`는 공개 랜딩으로, `/app`은 실제 시뮬레이션 앱으로 동작한다.
- [x] React app이 FastAPI API를 통해 실제 Creative Testing run을 만든다.
- [x] FastAPI는 run 생성만 담당하고, RQ worker가 실제 LLM 시뮬레이션을 실행한다.
- [x] run 상태, progress event, partial/final result는 SQLite에 저장된다.

### User-visible outcome

- [x] 사용자는 `/`에서 KoreaSim 랜딩을 본다.
- [x] 사용자는 `/app`에서 Creative Testing을 실행한다.
- [x] 사용자는 진행률과 완료 결과를 본다.

### Engineering outcome

- [x] React + FastAPI 단일 origin 구조가 생긴다.
- [x] Redis/RQ/SQLite 기반 run lifecycle 기반이 생긴다.
- [x] Phase 2 안정화와 Phase 5 기능 확장의 기반이 생긴다.

## 2. Inputs

### Source documents

- [x] Design doc: [[../design/react-fastapi-migration]]
- [x] Harness controls: [[../design/harness-engineering-controls]]
- [x] Data governance: [[../design/data-governance-and-io-boundary]]
- [x] Evaluation framework: [[../design/evaluation-framework]]
- [x] Phase plan: [[../phases/phase-1-cloudflare-tunnel]]
- [x] Readiness review: [[../research/phase-1-implementation-readiness]]
- [x] Harness gap review: [[../research/harness-engineering-gap-review]]
- [x] Functional spec: [[../functional/overview]], [[../functional/01-creative-testing]]
- [x] API/schema reference: [[../design/react-fastapi-migration#5.4 Request contract]]

### Existing code to read first

- [x] `app.py`
- [x] `src/simulations/creative_testing.py`
- [x] `src/agent/simulator.py`
- [x] `src/llm/client.py`
- [x] `src/config.py`
- [x] `src/data/sampler.py`
- [x] `src/data/loader.py`
- [x] `frontend/src/main.tsx`
- [x] `frontend/src/App.tsx`
- [x] `frontend/src/ResultsPage.tsx`
- [x] `frontend/src/data/mockData.ts`

## 3. Scope

### In scope

- [x] FastAPI app skeleton.
- [x] Static serving of `frontend/dist`.
- [x] Path routing: `/`, `/app`, `/results`.
- [x] Pydantic API schemas.
- [x] SQLite bootstrap and CRUD.
- [x] Redis/RQ queue and worker entrypoint.
- [x] Creative Testing worker execution.
- [x] SSE endpoint reading SQLite event log.
- [x] React API client and run creation flow.
- [x] Local integration commands.
- [x] Cloudflare Tunnel route to `arabesque.cc`.
- [x] LLMClient interface and Ollama adapter scaffold.
- [x] LangGraph run-level scaffold behind config flag.

### Out of scope

Deferred from Phase 1 and handled by later phases or future roadmap items:

- Cloudflare Access policy enforcement.
- 200-person external stability target.
- timeout/retry hardening beyond minimal error capture.
- Price Optimization and other simulation types.
- customer accounts, billing, analytics.

### Dependencies

- [x] Python deps: `fastapi`, `uvicorn`, `redis`, `rq`.
- [x] Python deps for approved scaffold: `langgraph`.
- [x] Node deps already installed in `frontend/`.
- [x] Redis local server.
- [x] Parquet dataset at configured `PARQUET_PATH`.
- [x] Cloudflare dashboard access for DNS/tunnel.
- Ollama `gemma3:27b` was planned for local fallback capacity; adapter/factory and LiteLLM->Ollama alias smokes passed with a small model, while the full large-model pull remains outside Phase 1 completion.

## 4. Contracts

### API contract

- [x] `GET /health`
  - Public minimal response includes API process readiness only.
- [x] `GET /api/health`
  - Protected detailed response includes SQLite, Redis/RQ, and model provider readiness where feasible.
- [x] `GET /api/config`
  - Response includes model, max sample size, enabled simulation types.
- [x] `POST /api/runs`
  - Creates SQLite run row.
  - Enqueues RQ job.
  - Returns `run_id` immediately.
- [x] `GET /api/runs/{run_id}`
  - Returns status snapshot.
- [x] `GET /api/runs/{run_id}/events`
  - Streams `snapshot`, `progress`, `completed`, `failed`, `heartbeat`.
- [x] `GET /api/runs/{run_id}/result`
  - Returns full result envelope including full `raw_results`.

### Data contract

- [x] `runs`
- [x] `run_events`
- [x] `run_partial_results`
- [x] `run_results`
- [x] statuses: `queued`, `running`, `completed`, `failed`, `canceled`, `interrupted`.
- [x] `sample_size <= 50` for Phase 1 public demo.
- [x] `seed` is accepted by API schema and passed to persona sampling.
- [x] LLM calls go through an internal client boundary, not provider SDKs inside simulation modules.
- [x] LangGraph scaffold is run-level only; persona fanout stays in the existing async batch simulator.

### Frontend contract

- [x] `/` renders `LandingPage`.
- [x] `/app` renders `App`.
- [x] `/results` renders `ResultsPage`.
- [x] hash routes `#app`, `#results` may remain as aliases.
- [x] app stores latest `run_id` in localStorage.
- [x] UI has queued/running/completed/failed states.

## 4.5 Implementation Gates

Phase 1 is implemented in gates. Do not start the next gate until the previous gate passes.

### Harness Preflight

- [x] Harness gap review exists: [[../research/harness-engineering-gap-review]]
- [x] Minimum controls exist: [[../design/harness-engineering-controls]]
- [x] Data governance exists: [[../design/data-governance-and-io-boundary]]
- [x] Evaluation framework exists: [[../design/evaluation-framework]]
- [x] Gate 1A applies P0 controls that affect schemas, errors, events, and package boundaries.
- [x] P1/P2 controls are scheduled without expanding Gate 1A beyond contract/scaffold work.

### Gate 1A — Contracts, Config, LLM Boundary, LangGraph Scaffold

- [x] Detailed gate plan approved: [[gate-1A-contracts-scaffold]]
- [x] Pydantic API schemas.
- [x] TypeScript API/result types.
- [x] config additions.
- [x] `LLMClient` protocol/interface.
- [x] Ollama adapter wrapping existing client.
- [x] LangGraph run-level scaffold behind config flag.
- [x] minimal Python schema/import tests.
- [x] frontend typecheck still passes.

Pass condition:

- [x] schema/import tests pass.
- [x] `CreativeTesting().run(...)` remains callable outside FastAPI.
- [x] no FastAPI route or React production API wiring depends on unfinished store/queue behavior.

### Gate 1B — FastAPI Skeleton and Static Serving

- [x] FastAPI app factory.
- [x] `/health`, `/api/health`, `/api/config`.
- [x] React static serving from `frontend/dist`.
- [x] path-aware React routing for `/`, `/app`, `/results`.

Pass condition:

- [x] local FastAPI serves `/`, `/app`, `/results`, `/health`.
- [x] frontend build passes.

### Gate 1C — SQLite Store and RQ Queue Skeleton

- [x] SQLite bootstrap.
- [x] run/event/result tables.
- [x] Redis/RQ queue module.
- [x] fake/no-op worker job.
- [x] status/result fetch from SQLite.

Pass condition:

- [x] `POST /api/runs` returns immediately.
- [x] RQ worker updates SQLite.
- [x] run status/result survives API restart.

### Gate 1D — Creative Testing Worker Adapter

- [x] `CreativeTesting.run(..., seed=...)`.
- [x] worker adapter invokes real simulation.
- [x] progress events written to SQLite.
- [x] final result envelope includes full `raw_results`.

Pass condition:

- [x] 10-person deterministic RQ path completes with fake LLM/fake sampler.
- [x] 50-person deterministic worker path completes with fake LLM/fake sampler.
- [x] 10-person live local run completes through Redis/RQ/Ollama.
- [x] 50-person live local run completes through Redis/RQ/Ollama.
- [x] [[../design/evaluation-framework]] Gate 1D live local eval thresholds are recorded as blocking warnings until Redis, Ollama, and the persona parquet are available locally.
- [x] Streamlit fallback still imports/runs.

### Gate 1E — SSE and React API Wiring

- [x] SSE endpoint reads SQLite event log.
- [x] React API client.
- [x] EventSource hook.
- [x] result polling fallback stub on ResultsPage.
- [x] `run_id` localStorage recovery.
- [x] ResultsPage reads API result envelope.

Pass condition:

- [x] refresh-safe result recovery reads `run_id` from query/localStorage.
- [x] failed state renders.
- [x] frontend typecheck/build passes.
- [x] live happy path through Redis/RQ/Ollama.

### Gate 1F — Local Integration and Cloudflare Tunnel Validation

- [x] local run commands documented.
- [x] local readiness script checks SQLite, Redis/RQ, persona parquet, React build, and Ollama.
- [x] worker run script added.
- [x] Cloudflare local pre-check script added.
- [x] Cloudflare DNS records checked in dashboard.
- [x] named tunnel route to FastAPI origin.
- [x] external 50-person run validation.

Pass condition:

- [x] `https://arabesque.cc/` shows landing.
- [x] `https://arabesque.cc/app` shows app.
- [x] external 50-person Creative Testing run completes.

## 5. Implementation Checklist

### 5.1 Gate 1A — Contracts and Scaffolds

- [x] `pyproject.toml`
  - [x] add `redis`, `rq`, `langgraph`.
- [x] `src/api/schemas.py`
  - [x] define `SimulationType`.
  - [x] define `RunStatus`.
  - [x] define `TargetFilterModel`.
  - [x] define `RunCreateRequest`.
  - [x] define `RunCreateResponse`.
  - [x] define `RunSnapshot`.
  - [x] define `RunResultEnvelope`.
  - [x] define structured error response.
  - [x] validate `sample_size <= 50`.
  - [x] validate creative count 2-10.
- [x] `src/jobs/models.py`
  - [x] define run/event/result dataclasses or Pydantic models.
  - [x] keep status values aligned with API schema.
- [x] `src/config.py`
  - [x] add `REDIS_URL`.
  - [x] add `RUNTIME_DATA_DIR`.
  - [x] add `SQLITE_PATH`.
  - [x] add `ENABLE_LANGGRAPH`.
  - [x] add LLM backend/model alias placeholders.
- [x] `src/llm/base.py`
  - [x] define provider-agnostic client protocol.
  - [x] define request/response object shape.
- [x] `src/llm/ollama_adapter.py`
  - [x] wrap existing `OllamaClient`.
  - [x] preserve existing local behavior.
- [x] `src/orchestration/__init__.py`
  - [x] create package.
- [x] `src/orchestration/graph.py`
  - [x] create thin run-level scaffold.
  - [x] keep persona fanout outside graph.
  - [x] allow config flag bypass.
- [x] `frontend/src/types/api.ts`
  - [x] mirror Phase 1 API request/response/result types.
- [x] `tests/`
  - [x] add schema/import smoke tests.

### 5.2 Gate 1B — Backend Skeleton and Static Serving

- [x] `src/api/__init__.py`
  - [x] Create package.
- [x] `src/api/main.py`
  - [x] FastAPI app.
  - [x] CORS unnecessary for one-origin path.
  - [x] Static file fallback for React build.
- [x] `src/api/routes.py`
  - [x] Thin handlers only.
  - [x] No simulation business logic in routes.
- [x] `src/api/static.py`
  - [x] serve `frontend/dist`.
  - [x] React fallback for `/`, `/app`, `/results`.
- [x] `frontend/src/main.tsx`
  - [x] switch from hash-only to path-aware routing.
  - [x] preserve hash aliases temporarily.

### 5.3 Gate 1C — SQLite Store and RQ Queue Skeleton

- [x] `src/jobs/store.py`
  - [x] `init_db()`.
  - [x] create/update run.
  - [x] append event.
  - [x] upsert partial result.
  - [x] save final result.
  - [x] read result.
- [x] `.gitignore`
  - [x] ignore `data/runtime/`.

- [x] `src/jobs/queue.py`
  - [x] Redis connection from `REDIS_URL`.
  - [x] RQ queue creation.
  - [x] enqueue job by `run_id`.
- [x] `src/jobs/worker.py`
  - [x] fake/no-op RQ callable reads run from SQLite.
  - [x] marks `running`.
  - [x] marks `completed`.
- [x] `src/api/routes.py`
  - [x] `POST /api/runs` creates SQLite row and enqueues no-op job.
  - [x] `GET /api/runs/{run_id}` reads SQLite snapshot.
  - [x] `GET /api/runs/{run_id}/result` handles placeholder/no-op result.
- [x] Queue behavior:
  - [x] enqueue returns quickly.
  - [x] worker failure records failed/interrupted.
  - [x] worker does not depend on FastAPI process memory.

### 5.4 Gate 1D — Creative Testing Worker Adapter

- [x] `src/simulations/creative_testing.py`
  - [x] add `seed` argument.
  - [x] pass seed to `PersonaSampler.sample(...)`.
  - [x] keep current Streamlit call backward-compatible.
- [x] `src/agent/simulator.py`
  - [x] accept injected LLM client or adapter factory.
  - [x] keep current Ollama behavior through adapter.
  - [x] preserve count progress callback compatibility.
- [x] `src/jobs/worker.py`
  - [x] replace no-op job with Creative Testing job.
  - [x] executes Creative Testing.
  - [x] writes progress/partial/final result.
  - [x] marks `completed` or `failed`.
- [x] result envelope builder
  - [x] include sample summary.
  - [x] include quality placeholders or final values.
  - [x] include full `raw_results`.

### 5.5 Gate 1E — SSE and React API Wiring

- [x] `src/jobs/events.py`
  - [x] format SSE events.
  - [x] read event log from SQLite.
- [x] `src/api/routes.py`
  - [x] `GET /api/runs/{run_id}/events`.
- [x] `frontend/src/api/client.ts`
  - [x] fetch wrapper and JSON error handling.
- [x] `frontend/src/api/runs.ts`
  - [x] createRun/getRun/getRunResult.
- [x] `frontend/src/hooks/useRunEvents.ts`
  - [x] EventSource connection.
  - [x] cleanup on unmount.
- [x] `frontend/src/App.tsx`
  - [x] build `RunCreateRequest` from preset/chat inputs.
  - [x] POST run.
  - [x] navigate to results/progress state.
- [x] `frontend/src/ResultsPage.tsx`
  - [x] render from API result when available.

### 5.6 Gate 1F — Local Integration and Cloudflare Tunnel

- [x] README local commands.
- [x] `scripts/check_local_services.py`.
- [x] `scripts/check_cloudflare_tunnel.py`.
- [x] `scripts/run_worker.py`.
- [x] Phase 1 checkboxes.
- [x] Cloudflare DNS pre-check note.
- [x] Streamlit fallback command.

## 6. Mock Data and Fixtures

### Implemented deterministic fixtures

- [x] `creative_testing_10` deterministic eval fixture
- [x] `creative_testing_success_10_envelope` deterministic API envelope fixture eval

Additional early fixture ideas were superseded by typed run-state fixtures and live Gemini validations:

- `creative_testing_success_50`
- `creative_testing_running_17_of_50`
- `creative_testing_failed_ollama_unavailable`
- `creative_testing_empty_result`

### Mock data details

- [x] `run_id`: stable UUID strings in envelope fixture eval.
- [x] timestamps: ISO strings in envelope fixture eval.
- [x] persona fields: all sampled synthetic persona fields included in deterministic fixture rows.
- [x] model payloads: raw model response, parsed result, and parse errors included where present.
- [x] metrics: `choice_counts`, `choice_pct`, `reasons_by_choice`.
- [x] segments: age, sex, province breakdowns.
- [x] quality: parse rate, sample grade, warnings.

### Fixture rules

- [x] Deterministic fixture validates parser/aggregation invariants.
- [x] API envelope fixture shape must match real API envelope.
- [x] Production route must not depend on hardcoded result values.

## 7. Edge Cases and Exceptions

### Input validation

- [x] no creatives.
- [x] one creative only.
- [x] more than 10 creatives.
- [x] `sample_size > 50`.
- [x] empty target filter.
- [x] unsupported simulation type.

### Runtime failures

- [x] Redis unavailable.
- [x] RQ worker unavailable.
- [x] SQLite cannot open DB.
- [x] Ollama unavailable.
- [x] Persona sampler returns no rows.
- [x] SSE disconnect.
- [x] browser refresh during run.

### Access/security

- [x] `/` remains public.
- [x] `/api/*` will be protected in Phase 3.
- [x] no secrets in frontend bundle.

## 8. Tests

### Automated tests

- [x] Python schema tests.
- [x] SQLite store tests.
- [x] API route smoke tests.
- [x] import-boundary tests.
- [x] full-repository Python lint.
- [x] backend active-scope coverage threshold at 85%.
- [x] frontend ESLint.
- [x] frontend API result-envelope typed fixture.
- [x] frontend typecheck.
- [x] frontend build.

### Manual checks

- [x] `http://127.0.0.1:8000/` shows landing.
- [x] `http://127.0.0.1:8000/app` shows app.
- [x] `POST /api/runs` returns `run_id`.
- [x] RQ worker completes 10-person local smoke.
- [x] 50-person run completes locally.

### Commands

```bash
cd frontend && npm run build
redis-server
rq worker koresim
uvicorn src.api.main:app --host 127.0.0.1 --port 8000
curl http://127.0.0.1:8000/health
```

## 9. Acceptance Criteria

### Pass conditions

- [x] `/` landing, `/app` app, `/results` result routes work locally.
- [x] Creative Testing run creates SQLite rows.
- [x] RQ worker completes a 50-person run.
- [x] SSE emits progress and completion.
- [x] result API returns full `raw_results`.

### Must not regress

- [x] `app.py` Streamlit fallback still imports/runs.
- [x] `CreativeTesting().run(...)` remains usable outside FastAPI.
- [x] existing landing design still renders.

### Demo-ready criteria

- [x] user can run 50-person Creative Testing locally.
- [x] result includes trust context placeholders or final values.
- [x] failure state is readable.

## 10. Observability and Debugging

- [x] `/health` includes minimal public readiness.
- [x] `/api/health` includes Redis, SQLite, queue, and model provider status.
- [x] log run lifecycle transitions.
- [x] log RQ job id and run id.
- [x] DB inspection query documented:

```sql
select id, status, done_count, total_count, updated_at from runs order by created_at desc limit 10;
```

## 11. Rollback Plan

Rollback notes retained for operational reference; no Phase 1 rollback was required:

- stop FastAPI.
- stop RQ worker.
- stop Redis if only used for KoreaSim.
- revert Cloudflare tunnel route if changed.
- run Streamlit fallback: `.venv/bin/streamlit run app.py`.

## 12. Review Checklist

- [x] no business logic in route handlers.
- [x] RQ worker owns long-running execution.
- [x] SQLite is source of truth for events/results.
- [x] React mock data shape matches API shape.
- [x] no unrelated visual redesign.

## 13. Completion Log

- [x] Gate 1A completed: 2026-05-02
- [x] Gate 1B completed: 2026-05-02
- [x] Gate 1C completed: 2026-05-02
- [x] Gate 1D implementation completed: 2026-05-02
- [x] Gate 1E implementation completed: 2026-05-02
- [x] P1 deterministic eval and worker-health guardrails completed: 2026-05-02
- [x] P1 full-repo lint and frontend lint guardrails completed: 2026-05-02
- [x] P1 backend coverage threshold guardrail completed: 2026-05-03
- [x] Tests run:
  - `uv run pytest tests/test_api_schemas.py tests/test_imports.py tests/test_api_app.py tests/test_jobs_store.py tests/test_jobs_worker.py` — 28 passed
  - `uv run python scripts/verify.py` — full-repo ruff, deterministic Creative Testing fixture eval, deterministic API envelope fixture eval, 37 pytest tests with 85% backend coverage threshold, frontend ESLint, frontend typecheck, and frontend build passed
  - `uv run pytest --cov=src/api --cov=src/jobs --cov=src/runtime --cov=src/simulations --cov=src/agent --cov=src/llm --cov=src/orchestration --cov-report=term-missing --cov-fail-under=85 tests` — passed with 86.12% coverage
  - `uv run python evals/run_creative_fixture_eval.py` — `creative_testing_10` fixture passed with 10 responses, 2 parse failures, and expected choice metrics
  - `uv run python evals/run_result_envelope_fixture_eval.py` — `creative_testing_success_10_envelope` fixture passed with full `RunResultEnvelope` shape
  - `cd frontend && npm run lint` — passed with no warnings
  - `cd frontend && npm run typecheck` — typed API envelope fixture in `frontend/src/data/apiFixtures.ts` passed against `RunResultEnvelope`
  - `cd frontend && npm run typecheck && npm run build` — passed for Gate 1B
  - `cd frontend && npm run typecheck` — passed after Gates 1C, 1D, and 1E
  - `cd frontend && npm run build` — passed after Gate 1E with existing large chunk warning
  - local curl checks for `/health`, `/api/config`, `/`, `/app`, `/results`, `/api/unknown`, and static assets — passed for Gate 1B
  - local curl check for `/api/health` — SQLite ok, Redis/queue refused because no local Redis server is running
  - local curl check for `POST /api/runs` with Redis down — explicit `QUEUE_UNAVAILABLE` 503 and failed run persisted
  - RQ worker path verified with `fakeredis` + `SimpleWorker` — SQLite status/result updated
  - queue health tests verify Redis reachable is separate from active RQ worker registration
  - Creative Testing worker path verified with fake LLM/fake sampler for 10 and 50 samples
  - SSE event replay test passed for terminal run event stream
  - `uv run python scripts/check_local_services.py` — correctly reports SQLite/React build ready and Redis/Ollama/persona parquet missing
  - `uv run python scripts/check_cloudflare_tunnel.py` — correctly reports cloudflared installed and missing `~/.cloudflared/config.yml`/credentials
  - Streamlit bare import smoke — blocked by missing `data/nemotron_korea_personas.parquet`
- [x] Historical known gaps reconciled on 2026-05-03: Gemini/parquet/Redis external run path, Cloudflare tunnel/DNS, ResultsPage API envelope rendering, and external 50-person validation are complete. Full large-model Ollama fallback validation remains tracked separately from Phase 1 completion.
- [x] Phase docs updated for Gate 1A, Gate 1B, Gate 1C, Gate 1D implementation, Gate 1E implementation, Gate 1F local runbook setup, P1 eval/worker health guardrails, and later completion evidence.
- [x] Next gate: Phase 2 stability/recovery, now completed.
