---
title: Gate 1A Execution — Contracts, Config, LLM Boundary, LangGraph Scaffold
type: execution-plan
tags: [gate-1A, phase-1, contracts, schemas, llmclient, langgraph, tests]
created: 2026-05-02
updated: 2026-05-02
status: complete
related: [[phase-1-react-fastapi-rq-sqlite]], [[../research/phase-1-implementation-readiness]], [[../research/harness-engineering-gap-review]], [[../design/react-fastapi-migration]], [[../design/llm-gateway-orchestration]], [[../design/harness-engineering-controls]], [[../design/data-governance-and-io-boundary]], [[../design/evaluation-framework]]
---

# Gate 1A Execution — Contracts, Config, LLM Boundary, LangGraph Scaffold

## 0. Metadata

- [x] Execution plan id: `gate-1A-contracts-scaffold`
- [x] Target phase: Phase 1
- [x] Parent execution plan: [[phase-1-react-fastapi-rq-sqlite]]
- [x] Readiness review: [[../research/phase-1-implementation-readiness]]
- [x] Status: complete
- [x] Created: 2026-05-02
- [x] Updated: 2026-05-02

## 1. Objective

- [x] Define backend and frontend contracts before API routes, SQLite store, RQ worker, or React API wiring are implemented.
- [x] Add config and dependency scaffolding needed by later gates.
- [x] Add an internal LLM client boundary so simulation code does not stay locked to direct `OllamaClient` construction.
- [x] Add a thin LangGraph run-level scaffold from Phase 1, disabled by default.
- [x] Add minimum schema/import tests.

## 2. User Decisions

- [x] Gate 1A gets a separate execution file.
- [x] Dependency update includes `pyproject.toml` and `uv.lock`.
- [x] Add `langgraph` in Gate 1A.
- [x] TypeScript API types are hand-written initially.
- [x] `raw_results` uses structured `RawPersonaResult[]`.
- [x] Error response is explicit: `{ code, message, details }`.
- [x] `interrupted` is included in `RunStatus` from Phase 1 schema.
- [x] `canceled` is included in schema, but cancel endpoint is not implemented in Gate 1A.
- [x] `seed` default is backend schema default `42`.
- [x] `ENABLE_LANGGRAPH=false` by default.
- [x] Gate 1A tests are schema validation + import smoke.
- [x] `src/api/schemas.py` and `src/jobs/models.py` are separated.

## 2.5 Harness Preflight

Gate 1A must apply only the P0 harness controls that affect contracts and package boundaries. Broader observability, audit retention, and LLM quality evaluation are scheduled for later gates.

- [x] Review [[../research/harness-engineering-gap-review]] before implementation.
- [x] Apply [[../design/data-governance-and-io-boundary]] for raw result, error, provider metadata, and trace field decisions.
- [x] Keep Gate 1A evaluation limited to schema/import checks from [[../design/evaluation-framework#3 Gate 1A Minimum]].
- [x] Keep API errors specific but safe: no secrets, credentials, stack traces, hidden prompts, or provider raw auth details.
- [x] Keep full synthetic persona fields in `RawPersonaResult.persona`, but do not add hidden prompt/provider credential fields.
- [x] Preserve result evidence separation: `quality`, `warnings`, `metrics`, `segments`, `insights`, and `raw_results` stay separate fields.
- [x] Include provider/trace metadata fields needed by future LiteLLM/Langfuse work without adding LiteLLM/Langfuse dependencies.
- [x] Keep package boundaries aligned with [[../design/harness-engineering-controls#4 Structure]].
- [x] Define initial error and event taxonomies in schema/job models without implementing routes/store/queue yet.

## 3. Scope

### In scope

- [x] `pyproject.toml` dependency additions.
- [x] `uv.lock` update.
- [x] backend Pydantic API schemas.
- [x] internal job models/enums.
- [x] config additions.
- [x] provider-agnostic LLM client protocol.
- [x] Ollama adapter.
- [x] LangGraph run-level scaffold.
- [x] frontend TypeScript API types.
- [x] minimum Python tests.

### Out of scope

These were intentionally deferred from Gate 1A and completed by later gates or phases where applicable:

- FastAPI route implementation.
- SQLite table creation.
- Redis/RQ queue implementation.
- SSE endpoint.
- React API calls.
- Creative Testing worker execution.
- LiteLLM dependency.
- Langfuse dependency.
- Cloudflare Tunnel work.
- cancel endpoint.

## 4. File Plan

### New files

- [x] `src/api/__init__.py`
- [x] `src/api/schemas.py`
- [x] `src/jobs/__init__.py`
- [x] `src/jobs/models.py`
- [x] `src/llm/base.py`
- [x] `src/llm/ollama_adapter.py`
- [x] `src/orchestration/__init__.py`
- [x] `src/orchestration/graph.py`
- [x] `frontend/src/types/api.ts`
- [x] `tests/test_api_schemas.py`
- [x] `tests/test_imports.py`

### Modified files

- [x] `pyproject.toml`
- [x] `uv.lock`
- [x] `src/config.py`
- [x] `docs/execution/phase-1-react-fastapi-rq-sqlite.md`
- [x] `docs/phases/phase-1-cloudflare-tunnel.md`

### Do not touch in Gate 1A

- [x] `frontend/src/App.tsx`
- [x] `frontend/src/ResultsPage.tsx`
- [x] `frontend/src/main.tsx`
- [x] `src/jobs/store.py`
- [x] `src/jobs/queue.py`
- [x] `src/jobs/worker.py`
- [x] `src/api/routes.py`
- [x] `src/api/main.py`
- [x] `src/simulations/creative_testing.py`
- [x] `src/agent/simulator.py`

## 5. Backend Contract

### `SimulationType`

- [x] `creative_testing`
- [x] `price_optimization`
- [x] `product_launch`
- [x] `value_proposition`
- [x] `market_segmentation`
- [x] `competitive_positioning`
- [x] `brand_perception`
- [x] `churn_prediction`
- [x] `campaign_strategy`

Only `creative_testing` is executable in Phase 1. Other values exist so contracts do not churn during Phase 5.

### `RunStatus`

- [x] `queued`
- [x] `running`
- [x] `completed`
- [x] `failed`
- [x] `canceled`
- [x] `interrupted`

`canceled` is schema-only in Gate 1A. `interrupted` is schema-ready for Phase 2.

### `TargetFilterModel`

- [x] `province: list[str] | None`
- [x] `district: list[str] | None`
- [x] `age_min: int | None`
- [x] `age_max: int | None`
- [x] `sex: str | None`
- [x] `education_level: list[str] | None`
- [x] `occupation_keywords: list[str] | None`
- [x] `exclude_unemployed: bool = False`

Validation:

- [x] `age_min` and `age_max` are reasonable integers.
- [x] `age_min <= age_max` when both are present.

### `CreativeTestingInput`

- [x] `creatives: list[str]`

Validation:

- [x] 2~10 creatives.
- [x] no empty creative after trim.

### `RunCreateRequest`

- [x] `simulation_type: SimulationType`
- [x] `input: dict | CreativeTestingInput`
- [x] `sample_size: int = 50`
- [x] `target_filter: TargetFilterModel = TargetFilterModel()`
- [x] `seed: int = 42`
- [x] `model_alias: str | None = None`

Validation:

- [x] `sample_size >= 1`
- [x] `sample_size <= 50`
- [x] `creative_testing` input validates as `CreativeTestingInput`.
- [x] unsupported executable simulation types return explicit error later; schema still accepts enum values.

### `RunCreateResponse`

- [x] `run_id: str`
- [x] `status: RunStatus`
- [x] `simulation_type: SimulationType`
- [x] `events_url: str`
- [x] `status_url: str`
- [x] `result_url: str`

### `RunSnapshot`

- [x] `run_id: str`
- [x] `simulation_type: SimulationType`
- [x] `status: RunStatus`
- [x] `sample_size: int`
- [x] `done_count: int = 0`
- [x] `total_count: int`
- [x] `progress_pct: float = 0`
- [x] `created_at: str`
- [x] `started_at: str | None`
- [x] `updated_at: str`
- [x] `completed_at: str | None`
- [x] `error: ErrorResponse | None`
- [x] `result_available: bool = False`

### `RawPersonaResult`

- [x] `uuid: str`
- [x] `persona: dict[str, object]`
- [x] `response: str`
- [x] `parsed: dict[str, object] | None = None`
- [x] `error: str | None = None`

Keep full synthetic persona fields in `persona`.

### `RunResultEnvelope`

- [x] `run_id: str`
- [x] `simulation_type: SimulationType`
- [x] `status: RunStatus`
- [x] `seed: int`
- [x] `sample_size: int`
- [x] `total_responses: int`
- [x] `parse_failed: int`
- [x] `target_filter: dict[str, object]`
- [x] `sample_summary: dict[str, object]`
- [x] `quality: dict[str, object]`
- [x] `warnings: list[str]`
- [x] `metrics: dict[str, object]`
- [x] `segments: dict[str, object]`
- [x] `insights: list[dict[str, object]]`
- [x] `raw_results: list[RawPersonaResult]`
- [x] `model_alias: str | None`
- [x] `provider: str | None`
- [x] `provider_model: str | None`
- [x] `llm_backend: str | None`
- [x] `trace_id: str | None`

### `ErrorResponse`

- [x] `code: str`
- [x] `message: str`
- [x] `details: dict[str, object] | None = None`

Principle:

- [x] errors should be specific enough for React UI and debugging.
- [x] no secrets, API keys, provider raw credentials, or stack traces in API errors.

## 6. Internal Job Model

`src/jobs/models.py` owns internal worker/store types.

- [x] API schema uses Pydantic.
- [x] job models can use dataclasses/internal enums.
- [x] status strings must stay aligned with API `RunStatus`.
- [x] no HTTP/FastAPI imports in job models.

Expected internal models:

- [x] `RunRecord`
- [x] `RunEventRecord`
- [x] `RunResultRecord`
- [x] `RunStatusValue`
- [x] `RunEventType`

Initial `RunEventType` values:

- [x] `created`
- [x] `queued`
- [x] `running`
- [x] `progress`
- [x] `partial_result`
- [x] `completed`
- [x] `failed`
- [x] `interrupted`
- [x] `canceled`
- [x] `heartbeat`

Initial error code values:

- [x] `INVALID_REQUEST`
- [x] `UNSUPPORTED_SIMULATION_TYPE`
- [x] `NO_PERSONAS_MATCH_FILTER`
- [x] `SAMPLE_SIZE_EXCEEDED`
- [x] `RUN_NOT_FOUND`
- [x] `RESULT_NOT_READY`
- [x] `QUEUE_UNAVAILABLE`
- [x] `WORKER_INTERRUPTED`
- [x] `LLM_UNAVAILABLE`
- [x] `LLM_TIMEOUT`
- [x] `PARSING_FAILED`
- [x] `INTERNAL_ERROR`

## 7. Config Contract

Add to `src/config.py`:

- [x] `REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")`
- [x] `RUNTIME_DATA_DIR = Path(os.getenv("RUNTIME_DATA_DIR", str(PROJECT_ROOT / "data" / "runtime")))`
- [x] `SQLITE_PATH = Path(os.getenv("SQLITE_PATH", str(RUNTIME_DATA_DIR / "koresim.sqlite3")))`
- [x] `ENABLE_LANGGRAPH = os.getenv("ENABLE_LANGGRAPH", "false").lower() == "true"`
- [x] `LLM_BACKEND = os.getenv("LLM_BACKEND", "ollama")`
- [x] `MODEL_PERSONA_DEFAULT = os.getenv("MODEL_PERSONA_DEFAULT", MODEL)`
- [x] `MODEL_LOCAL_FALLBACK = os.getenv("MODEL_LOCAL_FALLBACK", MODEL)`

Do not add LiteLLM/Langfuse config in Gate 1A except as future-compatible comments if needed.

## 8. LLM Boundary

### `src/llm/base.py`

- [x] define `LLMMessage`.
- [x] define `LLMRequest`.
- [x] define `LLMResponse`.
- [x] define `LLMClientProtocol`.

Minimum fields:

- [x] `task_type`
- [x] `model_alias`
- [x] `messages`
- [x] `temperature`
- [x] `metadata`
- [x] `content`
- [x] `provider`
- [x] `provider_model`
- [x] `trace_id`

### `src/llm/ollama_adapter.py`

- [x] wraps current `OllamaClient`.
- [x] implements protocol method.
- [x] returns `provider="ollama"`.
- [x] returns `provider_model=MODEL`.
- [x] preserves current local behavior.

Do not modify `src/agent/simulator.py` in Gate 1A. Injection happens in Gate 1D.

## 9. LangGraph Scaffold

### `src/orchestration/graph.py`

- [x] importable when `langgraph` is installed.
- [x] no persona fanout.
- [x] no SQLite/RQ dependency.
- [x] no provider SDK dependency.
- [x] contains a small run state type.
- [x] exposes a function that can return input unchanged or execute a minimal run-level graph.
- [x] default use is off through `ENABLE_LANGGRAPH=false`.

Purpose:

- prepare the boundary now.
- avoid a second orchestration migration later.
- keep Phase 1 stable by not forcing all execution through graph yet.

## 10. Frontend Type Contract

### `frontend/src/types/api.ts`

Hand-write types:

- [x] `SimulationType`
- [x] `RunStatus`
- [x] `TargetFilter`
- [x] `CreativeTestingInput`
- [x] `RunCreateRequest`
- [x] `RunCreateResponse`
- [x] `RunSnapshot`
- [x] `RawPersonaResult`
- [x] `RunResultEnvelope`
- [x] `ErrorResponse`

Rules:

- [x] align names and shapes with backend schemas.
- [x] use `Record<string, unknown>` where backend uses arbitrary dict.
- [x] no API client or React component changes in Gate 1A.

## 11. Tests

### `tests/test_api_schemas.py`

- [x] valid creative testing request defaults seed to `42`.
- [x] `sample_size > 50` fails.
- [x] one creative fails.
- [x] empty creative fails.
- [x] invalid age range fails.
- [x] `RunStatus` includes `interrupted` and `canceled`.
- [x] `RawPersonaResult` accepts full persona dict.
- [x] `ErrorResponse` accepts code/message/details.

### `tests/test_imports.py`

- [x] import `CreativeTesting`.
- [x] import `PersonaSampler`.
- [x] import `OllamaClient`.
- [x] import `OllamaAdapter`.
- [x] import `RunCreateRequest`.
- [x] import LangGraph scaffold module.

## 12. Commands

Dependency update:

```bash
uv add redis rq langgraph
```

Validation:

```bash
uv run pytest tests/test_api_schemas.py tests/test_imports.py
cd frontend && npm run typecheck
```

Optional:

```bash
uv run python - <<'PY'
from src.simulations.creative_testing import CreativeTesting
from src.api.schemas import RunCreateRequest
print(CreativeTesting)
print(RunCreateRequest)
PY
```

## 13. Acceptance Criteria

- [x] `pyproject.toml` and `uv.lock` include `redis`, `rq`, `langgraph`.
- [x] backend schemas import and validate as expected.
- [x] frontend API types compile.
- [x] LLM boundary imports.
- [x] Ollama adapter imports.
- [x] LangGraph scaffold imports with default disabled behavior.
- [x] existing `CreativeTesting` import still works.
- [x] no FastAPI route implementation is added.
- [x] no SQLite/RQ implementation is added.
- [x] no React API wiring is added.

## 14. Rollback Plan

Rollback notes retained for historical reference; no rollback was required:

- revert new schema/scaffold files if tests fail and cannot be fixed locally.
- revert dependency additions if `uv lock` cannot resolve cleanly.
- leave existing Streamlit and simulation files untouched.
- no runtime data migration is involved in Gate 1A.

## 15. Review Checklist

- [x] API schemas contain no business logic.
- [x] job models do not import FastAPI.
- [x] LLM adapter does not force LiteLLM.
- [x] LangGraph scaffold is not used for persona fanout.
- [x] frontend types do not invent fields not present in backend schema.
- [x] tests cover the contract decisions.

## 16. Completion Log

- [x] Implementation completed: 2026-05-02
- [x] Tests run:
  - `uv run pytest tests/test_api_schemas.py tests/test_imports.py` — 12 passed
  - `cd frontend && npm run typecheck` — passed
  - `uv run python - <<'PY' ...` import/callable smoke — passed
- [x] Known gaps: FastAPI routes, SQLite/RQ implementation, SSE, React API wiring remain for later gates.
- [x] Parent Phase 1 execution plan updated.
- [x] Next gate: Gate 1B
