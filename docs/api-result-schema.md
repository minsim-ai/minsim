---
title: KoreaSim API Result Schema
type: contract
tags: [api, result-schema, frontend, fastapi]
created: 2026-05-03
updated: 2026-05-03
status: active
related: [[CLAUDE]], [[phases/phase-6-design-sync]], [[execution/phase-6-design-sync]], [[design/react-fastapi-migration]]
---

# KoreaSim API Result Schema

This document is the shared contract between FastAPI, SQLite persisted results, RQ workers, and the React result renderer. Any result-field change must update `src/api/schemas.py`, `frontend/src/types/api.ts`, deterministic fixtures, and schema parity tests in the same coherent change.

## Auth Boundary

- `/` is public.
- `/app*`, `/results*`, and `/api*` are public through Cloudflare Tunnel for the current external demo.
- App-level auth is available through FastAPI Google OAuth and signed HTTP-only sessions. It is not currently a hard gate for run creation.
- Test/staging E2E may use `/api/auth/test-login` only when explicitly enabled.
- Local development may call `/api*` directly through `127.0.0.1`, but result envelopes remain protected product data.

## Run Lifecycle

`RunStatus` values:

- `queued`: run was accepted and is waiting for RQ worker execution.
- `running`: worker started and may emit progress or partial result events.
- `completed`: final result envelope is persisted and available at `/api/runs/{run_id}/result`.
- `failed`: worker or API failed with an `ErrorResponse`.
- `canceled`: run was canceled by API/operator action before completion.
- `interrupted`: run did not complete cleanly and may have partial results.

SSE emits `RunEventType` values: `created`, `snapshot`, `queued`, `running`, `progress`, `partial_result`, `completed`, `failed`, `interrupted`, `canceled`, and `heartbeat`. Clients must tolerate replayed events and recover through polling.

## Common Result Envelope

Current schema version:

```text
result-envelope/v1
```

Required top-level fields:

| Field | Owner | Notes |
| --- | --- | --- |
| `schema_version` | API schema | Must be present on every persisted final envelope. |
| `run_id` | store/API | Stable run identifier. |
| `simulation_type` | API schema | One of `SimulationType`. |
| `status` | worker/store | Final envelopes currently use `completed`; partial and failed states use status/result endpoints. |
| `seed` | API/store | Reproducibility metadata. |
| `sample_size` | API/store | Requested sample size. |
| `total_responses` | worker | Count of raw result rows in completed envelope. |
| `parse_failed` | worker/parser | Count of failed or unparseable persona outputs. |
| `target_filter` | API/store | JSON-serializable filter used to sample personas. |
| `sample_summary` | worker | Aggregate sample evidence for result trust layer. |
| `quality` | worker/eval | Parse/sample quality fields used by UI trust cards. |
| `warnings` | worker/eval | Non-dismissible limitations and quality warnings. |
| `metrics` | simulation | Simulation-specific result payload. |
| `segments` | simulation | Segment breakdowns derived from the result. |
| `insights` | simulation | Human-readable insights derived from metrics. |
| `raw_results` | product store | Protected full evidence rows. Do not send to external observability. |
| `model_alias` | API/store | Requested model alias, if supplied. |
| `provider` | LLM adapter | Provider name, if available. |
| `provider_model` | LLM adapter | Provider model name, if available. |
| `llm_backend` | runtime config | `gemini`, `ollama`, or `litellm`. |
| `trace_id` | observability | Metadata-only trace identifier. |

## Human-Review Export

`GET /api/runs/{run_id}/export` returns `koresim-export/v1` for review workflows. It copies aggregate metrics, quality, warnings, segments, insights, and run metadata, but intentionally excludes `raw_results`.

Export responses must include:

- `human_review_required=true`
- `raw_results_included=false`
- a disclaimer that the output is synthetic simulation evidence, not survey proof

Full persona rows remain available only in the protected product result view/API envelope.

## Simulation Metrics Pattern

Simulation-specific fields belong under `metrics`, `segments`, and `insights`, not as new top-level fields. The top-level envelope should change only when a field is useful across simulations and can be rendered consistently by React.

Creative Testing `metrics` currently contains:

- `creatives`
- `choice_counts`
- `choice_pct`
- `reasons_by_choice`

New simulations should define their native metrics in their execution plan before code changes.

## Error Shape

API errors use:

```json
{
  "code": "RUN_NOT_FOUND",
  "message": "Run not found",
  "details": {
    "run_id": "..."
  }
}
```

`code` must be one of `ErrorCode`. `details` is optional but should include stable identifiers such as `run_id`, `field`, or `simulation_type` when useful.

## Verification

Run these before accepting schema changes:

```bash
uv run pytest tests/test_api_schemas.py tests/test_schema_parity.py tests/test_result_envelope_fixtures.py
uv run python evals/run_result_envelope_fixture_eval.py
cd frontend && npm run typecheck
```

The full release gate remains:

```bash
uv run python scripts/verify.py
```

## Frontend Story Fixtures

Result/story mocks belong in `frontend/src/data/runStateFixtures.ts`, not `frontend/src/data/mockData.ts`. `mockData.ts` is reserved for app-input helper copy such as simulation labels, placeholders, and chat-step prompts.

`runStateFixtures.ts` must satisfy the exported TypeScript API types and cover:

- `no_run_selected`
- `run_queued`
- `run_running`
- `run_partial_results`
- `run_completed_creative_testing`
- `run_completed_price_optimization`
- `run_failed`
- `run_interrupted`
- `run_restored`

Browser review routes:

```text
/results/story/no_run_selected
/results/story/run_queued
/results/story/run_running
/results/story/run_partial_results
/results/story/run_completed_creative_testing
/results/story/run_completed_price_optimization
/results/story/run_failed
/results/story/run_interrupted
/results/story/run_restored
```
