---
title: Harness Engineering Controls
type: design-doc
tags: [harness, dio, boundaries, evaluation, audit, ddd]
created: 2026-05-02
updated: 2026-05-02
status: draft
related: [[../research/harness-engineering-gap-review]], [[data-governance-and-io-boundary]], [[evaluation-framework]], [[react-fastapi-migration]], [[llm-gateway-orchestration]], [[../execution/gate-1A-contracts-scaffold]]
---

# Harness Engineering Controls

## 1. Purpose

This document defines the minimum engineering harness for KoreaSim. It adapts the DIO/Harness process to the React + FastAPI migration and future LLM gateway work.

The goal is not to create process overhead. The goal is to make agentic simulation work verifiable, bounded, and maintainable.

## 2. Principles

### 2.1 I/O Boundary

KoreaSim must treat every boundary as explicit:

| Class | Examples | Allowed output? | Notes |
| --- | --- | --- | --- |
| Public marketing content | landing copy, demo explanation, contact CTA | Yes | Public root only. |
| Protected app input | simulation type, creatives, target filter, sample size, seed | Yes, protected | Validate before enqueue. |
| Persona dataset row | synthetic demographic and behavior fields | Yes, protected in MVP | Full `raw_results` allowed locally; external transfer follows [[data-governance-and-io-boundary]]. |
| Provider prompt | system/user prompt, hidden instruction, routing metadata | No by default | May be traced only as redacted/hash metadata unless explicitly approved. |
| Provider response | persona response, parsed fields, report text | Yes, protected | Must be tied to run id, seed, provider, model alias. |
| Operational secret | API keys, Cloudflare token, provider credentials | Never | Must not appear in API responses, frontend bundles, or logs. |
| Stack trace | Python exception trace, provider raw error | No | API returns specific error code/message/details without trace. |
| Operation log | run lifecycle, worker status, retry info | Internal | Debugging and maintenance. |
| Audit log | protected action, export/share, provider call class | Internal/protected | Immutable append-only target later. |

Gate 1A impact:

- `ErrorResponse` must have explicit `code`, `message`, and optional safe `details`.
- `RunResultEnvelope` must retain `trace_id`, `model_alias`, `provider`, `provider_model`, and `llm_backend`.
- `RawPersonaResult` may contain full synthetic persona fields, but must not contain secrets, hidden prompts, stack traces, or provider credentials.

### 2.2 User Mental Model

KoreaSim users should understand:

- The product simulates likely reactions from synthetic Korean personas.
- Results are directional evidence, not a replacement for real market research.
- A run is reproducible when the same simulation type, input, target filter, sample size, seed, model alias, and dataset version are used.
- Raw persona responses explain why aggregated metrics look the way they do.
- Higher sample size improves stability but does not turn the output into ground truth.

KoreaSim must not imply:

- That synthetic personas are real people.
- That output proves future sales or election-like outcomes.
- That a model-generated insight is a verified market fact without evidence.

### 2.3 No Hallucination

Model-generated report text must be constrained by evidence in the run result.

Rules:

- [ ] Metrics must come from computed result fields, not generated prose.
- [ ] Report text must cite run metadata: sample size, seed, target filter, model alias where relevant.
- [ ] Modeled assumptions must be labeled as assumptions.
- [ ] External facts require a source path or citation mechanism in a later research-enabled phase.
- [ ] QA checks should flag unsupported causal claims, invented numbers, and missing caveats.

Gate 1A impact:

- Keep `quality`, `warnings`, `metrics`, `segments`, and `insights` separate in the result envelope.
- Do not collapse raw evidence and generated narrative into one untyped string.

### 2.4 Human-in-the-loop / Audit Trail

Autonomous by default:

- Create local demo run.
- Stream progress.
- Show computed metrics.
- Show raw synthetic persona responses.

Human review recommended before external sharing:

- Customer-facing narrative report.
- Any export that implies business recommendation.
- Any report using external facts or customer-provided confidential context.

Audit-worthy events:

- Run created.
- Run completed/failed/interrupted/canceled.
- Result viewed after completion.
- Result exported/shared, when export exists.
- External provider call class, when Phase 7 starts.
- Admin/operator action, when an admin surface exists.

Operation logs and audit logs must be separated:

- Operation logs help engineers debug execution.
- Audit logs explain who/what triggered protected actions.

## 3. Definitions

### 3.1 Domain Vocabulary

| Term | Type | Definition |
| --- | --- | --- |
| `Run` | Aggregate | One submitted simulation execution with status, input, events, and final result. |
| `Simulation` | Domain service | A simulation capability such as Creative Testing or Price Optimization. |
| `SimulationType` | Value object | Stable enum identifying the requested simulation. |
| `TargetFilter` | Value object | Constraints used to sample personas. |
| `Persona` | Entity | One synthetic persona row from the dataset. |
| `PersonaSample` | Value object | Deterministic set of selected personas for a run. |
| `PersonaResponse` | Entity/event data | A generated response from one persona for one run. |
| `ResultEnvelope` | Aggregate output | Final structured result returned to React. |
| `Metric` | Value object | Computed number derived from parsed responses. |
| `Insight` | Value object | Structured interpretation tied to metrics and evidence. |
| `Preset` | Value object | Saved demo input configuration served by the backend. |
| `ModelAlias` | Value object | Stable internal name for a model route. |
| `Trace` | Value object | Correlation id across API, worker, LLM, and observability. |
| `RunEvent` | Event | Append-only lifecycle/progress event for SSE and replay. |
| `AuditEvent` | Event | Protected action record for accountability. |

### 3.2 Agent Catalog

Phase 1:

| Agent/service | Input | Output | State |
| --- | --- | --- | --- |
| FastAPI route handler | HTTP request | validated command / HTTP response | stateless |
| RQ worker | `run_id` | persisted status/result | worker process |
| Creative Testing engine | creatives, sample, target filter | structured simulation result | local execution |
| LLM client adapter | messages, model alias metadata | model response | stateless |
| LangGraph scaffold | run-level state | same or enriched run state | disabled by default |

Phase 7:

| Agent/service | Input | Output | State |
| --- | --- | --- | --- |
| Model router | task type, simulation type, alias override | provider route | config |
| Analysis agent | metrics, segments, raw samples | structured insights | run state |
| Report agent | insights, metrics, caveats | user-facing narrative | run state |
| QA agent | result envelope and narrative | pass/warn/block | run state |

## 4. Structure

### 4.1 Package Boundaries

Required boundaries:

- `src/api` owns HTTP only.
- `src/api/schemas.py` owns Pydantic request/response contracts.
- `src/jobs` owns run state, queueing, worker lifecycle, and persistence.
- `src/simulations` owns simulation logic and must not import FastAPI, SQLite, Redis, or SSE helpers.
- `src/llm` owns provider-agnostic LLM interfaces and provider adapters.
- `src/orchestration` owns LangGraph run-level workflow only.
- `frontend/src/types/api.ts` mirrors backend public API types.

Forbidden dependencies:

- API route handlers must not instantiate `OllamaClient` directly.
- Simulation modules must not import FastAPI objects.
- Simulation modules must not write SQLite rows directly.
- Frontend components must not depend on production hardcoded result numbers.
- Provider SDK credentials must not cross into frontend code.

### 4.2 Linter/Guardrail Plan

Initial guardrails:

- [x] `ruff` config for basic Python hygiene.
- [x] full-repository `ruff` verification script.
- [x] frontend ESLint verification script.
- [x] backend active-scope coverage threshold at 85%.
- [x] import smoke tests for key modules.
- [x] import-boundary tests for forbidden Python layer edges.
- [x] review checklist for forbidden imports.

Later guardrails:

- [x] import-boundary linter or custom test that fails forbidden import edges.
- [x] deterministic parser/aggregation fixture eval.
- [x] deterministic API result-envelope fixture eval.
- [x] queue health distinguishes Redis reachability from active RQ worker readiness.
- [x] schema parity check between backend Pydantic schema and frontend TypeScript types.
- [x] frontend API result-envelope fixture is typechecked against `RunResultEnvelope`.

## 5. Architecture

### 5.1 Request Lifecycle

```text
Request
  -> validate API schema
  -> create Run
  -> append RunEvent(created)
  -> enqueue RQ job
  -> return RunCreateResponse
  -> worker starts
  -> append RunEvent(running)
  -> sample personas
  -> call simulation engine
  -> append progress events
  -> persist final ResultEnvelope
  -> append completed/failed/interrupted
  -> React consumes status/events/result
```

### 5.2 State Transitions

| From | To | Trigger | Owner |
| --- | --- | --- | --- |
| none | `queued` | valid `POST /api/runs` | FastAPI/store |
| `queued` | `running` | RQ worker starts job | worker |
| `running` | `completed` | final result persisted | worker/store |
| `running` | `failed` | unrecoverable execution error | worker/store |
| `queued`/`running` | `canceled` | future cancel action | API/worker |
| `running` | `interrupted` | worker/process lost before completion | recovery job / Phase 2 |

### 5.3 Initial Event Taxonomy

| Event | Purpose | SSE-visible |
| --- | --- | --- |
| `created` | Run row created. | Yes |
| `queued` | Job enqueued. | Yes |
| `running` | Worker started. | Yes |
| `progress` | Progress count/percentage update. | Yes |
| `partial_result` | Optional partial result persisted. | Later |
| `completed` | Final result available. | Yes |
| `failed` | Run failed with safe error. | Yes |
| `interrupted` | Run was active but worker died or became unrecoverable. | Yes |
| `canceled` | Future cancellation event. | Yes |
| `heartbeat` | SSE connection keepalive. | Yes |

### 5.4 Initial Error Taxonomy

| Code | User-actionable | Meaning |
| --- | --- | --- |
| `INVALID_REQUEST` | Yes | Request shape or field validation failed. |
| `UNSUPPORTED_SIMULATION_TYPE` | Yes | Simulation enum exists but executable implementation is unavailable. |
| `NO_PERSONAS_MATCH_FILTER` | Yes | Target filter produced no sample candidates. |
| `SAMPLE_SIZE_EXCEEDED` | Yes | Requested sample size exceeds current limit. |
| `RUN_NOT_FOUND` | Yes | Unknown run id. |
| `RESULT_NOT_READY` | Yes | Result requested before completion. |
| `QUEUE_UNAVAILABLE` | No | Redis/RQ unavailable. |
| `WORKER_INTERRUPTED` | No | Active run lost worker execution. |
| `LLM_UNAVAILABLE` | Maybe | Local or external provider unavailable. |
| `LLM_TIMEOUT` | Maybe | Provider call timed out. |
| `PARSING_FAILED` | No | Model response could not be parsed for one or more personas. |
| `INTERNAL_ERROR` | No | Unclassified internal failure; details must remain safe. |

## 6. Scope

### 6.1 Build

- FastAPI API and static serving.
- SQLite run/event/result store.
- RQ worker integration.
- Pydantic schemas and TypeScript mirror types.
- Minimal LLM client boundary.
- LangGraph run-level scaffold.

### 6.2 Integrate

- Redis/RQ.
- Ollama local model.
- Cloudflare Tunnel and Access.
- LiteLLM Proxy in Phase 7.
- Langfuse metadata tracing in Phase 7.

### 6.3 Buy/Use External

- OpenAI/Gemini through LiteLLM in Phase 7.
- External observability through Langfuse.

### 6.4 Explicitly Exclude For Now

- Cloudflare AI Gateway in the LLM path.
- Per-persona LangGraph fanout in Phase 1.
- User accounts/billing.
- Mutating the base persona dataset as memory.

## 7. Research Questions

P0:

- [ ] Apply [[data-governance-and-io-boundary]] before external model providers.
- [ ] Can the persona dataset license support full raw result display in the protected demo?
- [ ] Can synthetic persona fields be sent to external model providers under the intended use case?
- [ ] What exact prompt/persona fields must be excluded from Langfuse traces?
- [ ] What minimum eval fixture proves parser/schema/seed stability?

P1:

- [ ] Which import-boundary enforcement tool is worth adding after Gate 1A?
- [ ] What is the retention policy for operation logs, audit logs, and raw results?
- [ ] What are acceptable external model rate limits and cost budgets?
- [ ] What is the fallback path when LiteLLM is available but one provider fails?

P2:

- [ ] What customer-facing confidence language is acceptable?
- [ ] Which report exports require human review?
- [ ] What external factual sources, if any, should a future research agent be allowed to use?

## 8. Evaluation Framework v0

The first evaluation framework should be small and executable locally. See [[evaluation-framework]] for the detailed policy.

Minimum checks:

- [ ] Schema validation: API requests/responses validate.
- [ ] Parser success: at least 95% parse success on a fixed 10-person local fixture once the real worker path exists.
- [ ] Seed repeatability: same seed and same fixture produce the same sampled persona ids.
- [ ] Result consistency: aggregate counts equal parsed raw result counts.
- [ ] Report grounding: generated insights do not invent metrics outside `metrics`, `segments`, `quality`, or `raw_results`.
- [ ] Error specificity: failed runs return a non-generic error code where the cause is known.

The evaluation framework should grow before external providers are enabled.

## 9. Gate Mapping

| Control | First gate |
| --- | --- |
| API schemas and error shape | Gate 1A |
| DDD vocabulary alignment | Gate 1A |
| LLM boundary | Gate 1A |
| LangGraph scaffold | Gate 1A |
| Event taxonomy | Gate 1A/1C |
| SQLite event persistence | Gate 1C |
| Worker lifecycle logs | Gate 1C/1D |
| Parser/schema/seed eval | Gate 1D |
| SSE replay/recovery | Gate 1E |
| Operation/audit split | Phase 2 |
| Provider routing/cost/trace eval | Phase 7 |
