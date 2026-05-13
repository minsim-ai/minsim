---
title: Phase 7 Execution — LLM Gateway and Agentic Orchestration
type: execution-plan
tags: [phase-7, execution, llm-gateway, litellm, langgraph, observability]
created: 2026-05-02
updated: 2026-05-03
status: implementation-complete-live-gated
related: [[../templates/execution-plan-template]], [[../phases/phase-7-llm-gateway-orchestration]], [[../design/llm-gateway-orchestration]], [[../design/data-governance-and-io-boundary]], [[../design/evaluation-framework]], [[../runbooks/llm-gemini-langfuse-operations]]
---

# Phase 7 Execution — LLM Gateway and Agentic Orchestration

## Reconciliation Note

This execution plan is implementation-complete for the current public external demo gate. The provider-agnostic boundary, Gemini primary path, LiteLLM alias scaffold, Ollama fallback boundary smoke, task routing, run-level graph, split agent boundaries, project/session memory schema, model metadata, Langfuse metadata-only trace, and small local fallback validation are complete.

## 0. Metadata

- [x] Execution plan id: `phase-7-llm-gateway-orchestration`
- [x] Target phase: Phase 7
- [x] Related design doc: [[../design/llm-gateway-orchestration]]
- [x] Owner: KoreaSim
- [x] Status: implementation-complete-live-gated
- [x] Created: 2026-05-02
- [x] Updated: 2026-05-03

## 1. Summary

### Objective

- [x] Move from local Ollama-only model access to a provider-agnostic LLM gateway.
- [x] Add model aliases and persona-response routing scaffold.
- [x] Add metadata observability.
- [x] Preserve and expand the Phase 1 LangGraph scaffold into a run-level prepare/execute/analyze/report/QA graph.

### User-visible outcome

- [x] Demo quality can be improved by selecting stronger external models when needed.
- [x] Runs expose model/provider metadata in the trust layer.
- [x] Result quality issues can be traced by model alias, task type, latency, and parse success.

### Engineering outcome

- [x] Simulation modules stop depending directly on Ollama.
- [x] Gateway/provider changes are config changes, not product-code rewrites.
- [x] Agentic workflows have a defined boundary.

## 2. Inputs

### Source documents

- [x] Design doc: [[../design/llm-gateway-orchestration]]
- [x] Data governance: [[../design/data-governance-and-io-boundary]]
- [x] Evaluation framework: [[../design/evaluation-framework]]
- [x] Phase plan: [[../phases/phase-7-llm-gateway-orchestration]]
- [x] React/FastAPI design: [[../design/react-fastapi-migration]]
- [x] Quality spec: [[../functional/quality-and-trust]]

### Existing code to read first

- [x] `src/llm/client.py`
- [x] `src/config.py`
- [x] `src/agent/simulator.py`
- [x] `src/simulations/creative_testing.py`
- [x] `src/jobs/worker.py`
- [x] `src/jobs/store.py`
- [x] `docs/design/react-fastapi-migration.md`

## 3. Scope

### In scope

- [x] internal LLM client interface.
- [x] Ollama adapter.
- [x] LiteLLM adapter/proxy support.
- [x] model aliases.
- [x] persona-response alias routing scaffold.
- [x] provider-transfer preflight from [[../design/data-governance-and-io-boundary]].
- [x] Langfuse metadata-only tracing.
- [x] external provider smoke tests.
- [x] Phase 1 LangGraph scaffold expanded into actual run-level steps.

### Out of scope

Retained as deferred notes, not protected-demo completion tasks:

- replacing RQ.
- per-persona LangGraph fanout.
- mutating base persona DB.
- customer billing or account-level quotas.
- full automated cost optimization.
- Cloudflare AI Gateway.

### Dependencies

- [x] Phase 1 API/RQ worker path.
- [x] Phase 2 recovery for long runs.
- [x] Gemini API key stored server-side.
- [x] LiteLLM local/proxy environment.
- [x] Cloudflare Tunnel/Access remains separate from LLM provider routing.
- [x] Phase 1 creates a thin LangGraph run-level scaffold behind config.

## 4. Contracts

### API contract

- [x] `GET /api/config` includes available model aliases, not provider secrets.
- [x] `GET /api/health` includes model gateway readiness.
- [x] run result includes:
  - [x] `model_alias`
  - [x] `provider`
  - [x] `provider_model`
  - [x] `llm_backend`
  - [x] `trace_id` if available.

### Data contract

- [x] `runs.input` may include requested model alias.
- [x] `run_results.result_json` includes model metadata.
- [x] trace payload mode is stored with run metadata.
- [x] raw results remain full in product storage.
- [x] provider prompts exclude raw persona `uuid`; internal run state handles result mapping.
- [x] full raw persona export is deferred in MVP.

### Frontend contract

- [x] trust layer displays model alias/provider in compact form.
- [x] frontend never receives provider API keys.
- [x] model selection UI is admin/operator-only until product policy is defined.

## 5. Implementation Checklist

### 5.1 Backend

- [x] `src/llm/base.py`
  - [x] define `LLMClient` protocol/interface.
  - [x] define request/response types.
- [x] `src/llm/ollama_adapter.py`
  - [x] wrap existing Ollama client.
  - [x] preserve local behavior.
- [x] `src/llm/openai_compatible_adapter.py`
  - [x] call OpenAI-compatible Gemini/LiteLLM endpoints.
  - [x] pass metadata and model alias.
- [x] `src/llm/factory.py`
  - [x] resolve backend and persona model alias.
  - [x] support operator override through `model_alias` on run requests.
  - [x] fallback boundary remains configurable.
- [x] `src/config.py`
  - [x] add gateway/env config.
  - [x] add alias config.
  - [x] add trace mode config.

### 5.2 Worker / Queue

- [x] `src/jobs/worker.py`
  - [x] pass run metadata to the LLM client/factory path.
  - [x] record provider/model metadata.
  - [x] record trace id if available.
- [x] Queue behavior:
  - [x] RQ remains the execution boundary.
  - [x] gateway failure records clean failed status.
  - [x] fallback-capable path records provider/model metadata; explicit `fallback_used` is part of Remaining Work.

### 5.3 Database / Persistence

- [x] add model metadata fields to result envelope.
- [x] store trace id and trace mode in run metadata.
- [x] keep full raw results in SQLite result JSON.
- [x] do not store API keys.

### 5.4 Frontend

- [x] trust layer displays model alias/provider.
- [x] admin/operator model override is hidden or disabled by default.
- fallback-model user warning remains part of the full routing/fallback Remaining Work.
- [x] no provider secrets in bundle.

### 5.5 Documentation

- [x] LiteLLM local runbook.
- [x] Gemini setup follows [[../runbooks/llm-gemini-langfuse-operations]].
- [x] provider key setup notes.
- [x] observability payload policy.
- [x] prompt/persona provider-transfer policy.
- [x] note that Cloudflare AI Gateway is excluded from Phase 7.
- [x] LangGraph scaffold and expansion boundary.
- [x] project/session memory policy and schema documented in code.

## 6. Mock Data and Fixtures

### Required mock data

- [x] `llm_provider_ollama_success`
- [x] `llm_provider_litellm_ollama_success`
- [x] `llm_provider_gemini_success`
- [x] `llm_provider_fallback_used`
- [x] `llm_provider_gateway_failed`
- [x] `trace_metadata_only`

### Mock data details

- [x] include `model_alias`.
- [x] include `provider`.
- [x] include `provider_model`.
- [x] include `llm_backend`.
- [x] include `trace_id`.
- [x] include `fallback_used`.
- [x] include parse success/failure.

### Fixture rules

- [x] no API keys.
- [x] no real provider secrets.
- [x] full raw result fixture can include synthetic persona fields.
- [x] observability fixture defaults to metadata-only payload.

## 7. Edge Cases and Exceptions

### Input validation

- [x] unknown model alias.
- [x] unauthorized model override.
- [x] unsupported provider.
- [x] trace mode not allowed.

### Runtime failures

- [x] LiteLLM proxy down.
- [x] external provider API key missing.
- [x] external provider rate-limited.
- [x] external provider transfer not approved by data governance policy.
- [x] provider timeout.
- [x] fallback also fails.
- [x] provider returns schema-incompatible output.
- [x] observability provider unavailable.
- [x] provider comparison eval fails release-blocking criteria.

### Access/security

- [x] provider keys server-side only.
- [x] public `/health` does not expose provider details.
- [x] protected `/api/health` can expose readiness, not secrets.
- [x] trace payload policy prevents accidental full third-party logging.

## 8. Tests

### Automated tests

- [x] LLM router alias resolution test.
- [x] Ollama adapter contract test.
- [x] LiteLLM adapter contract test with mocked response.
- [x] fallback policy test.
- [x] result envelope model metadata test.
- [x] frontend typecheck/build.

### Manual checks

- [x] existing Ollama run still completes.
- [x] LiteLLM -> Ollama alias smoke completes.
- [x] LiteLLM -> Ollama Creative Testing run completes.
- [x] external provider 10-person run completes.
- [x] external provider 50-person run completes.
- [x] `PromptPersonaView` excludes `uuid` and unused persona fields.
- [x] gateway failure shows clean failed state.
- [x] metadata trace appears in Langfuse.
- [x] provider comparison eval records completion rate, parse success, latency, and cost estimate.

### Commands

```bash
curl http://127.0.0.1:8000/api/config
curl http://127.0.0.1:8000/api/health
curl http://127.0.0.1:4000/v1/models
```

## 9. Acceptance Criteria

### Pass conditions

- [x] `CreativeTesting` can run through Ollama adapter.
- [x] same code path can run through LiteLLM adapter.
- [x] model aliases are configurable.
- [x] one external provider run completes.
- [x] Langfuse metadata tracing works without prompt/persona payload by default.
- [x] persona-derived prompt transfer follows [[../design/data-governance-and-io-boundary]].
- [x] provider comparison meets release blockers: completion rate, parse success, and no data-governance violation.

### Must not regress

- [x] local Ollama path still works.
- [x] RQ worker lifecycle still works.
- [x] result `raw_results` remains full in product storage.
- [x] Streamlit fallback is not broken by adapter changes.

### Demo-ready criteria

- [x] model/provider metadata is visible in result trust layer.
- [x] operator can switch model aliases without code edits.
- [x] cost/latency/parse quality can be reviewed after a run.

## 10. Observability and Debugging

- [x] log `run_id`, `task_type`, `model_alias`, provider, latency.
- [x] trace parse failures and retries.
- [x] show provider readiness in protected health.
- [x] document how to compare two model aliases on the same preset.

## 11. Rollback Plan

Rollback notes retained for operational reference; no Phase 7 gateway rollback was required:

- set `LLM_BACKEND=ollama`.
- disable LiteLLM adapter in config.
- disable external provider aliases.
- keep model metadata fields optional.
- keep LangGraph prototype behind config flag.

## 12. Review Checklist

- [x] no provider SDK imported from simulation modules.
- [x] no API key in frontend or docs.
- [x] no full prompt/persona payload in third-party traces by default.
- [x] model alias, not provider model id, is used by product code.
- [x] observability default is metadata-only.
- [x] LangGraph does not replace stable RQ job boundary.

## 13. Completion Log

- [x] Implementation completed: `LLMClient` boundary, Ollama adapter, Gemini/OpenAI-compatible adapter, LiteLLM alias path, model alias config, metadata-only tracing.
- [x] Tests run: `tests/test_llm_factory_tracing.py`, schema/API tests, direct Gemini 10/50/200-person runs, LiteLLM alias 1-person run.
- [x] Known gaps reconciled: Ollama provider boundary live smoke, LiteLLM -> Ollama alias smoke, and local Creative Testing fallback validation were completed with `smollm2:135m`; the larger `gemma3:27b` model is no longer required for the current demo gate.
- [x] Phase docs updated: [[../phases/phase-7-llm-gateway-orchestration]]
- [x] Next execution plan: [[phase-3-access-path-policy]]

## 14. Remaining Work

- [x] Full task-based model routing policy for analysis/report/schema-repair/QA tasks.
- [x] Expand the Phase 1 LangGraph scaffold into an actual run-level graph when orchestration complexity justifies it.
- [x] Split analysis/report/QA agents after Phase 5 adds non-Creative Testing result types.
- [x] Connect analysis/report/QA to LLM-backed run-level agents with deterministic fallback.
- [x] Design project/session memory schema without mutating the base persona dataset.
- [x] Validate local fallback with the current small development model `smollm2:135m`.
- [x] Complete Creative Testing through the Ollama fallback boundary with `smollm2:135m`; 50-person run completed, while 200-person local throughput limit is documented separately from provider/API correctness.
