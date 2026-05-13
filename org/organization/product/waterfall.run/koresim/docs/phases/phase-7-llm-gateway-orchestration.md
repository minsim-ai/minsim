---
title: Phase 7 — LLM Gateway and Agentic Orchestration
type: phase-plan
tags: [phase-7, llm-gateway, litellm, langgraph, observability, multi-llm]
created: 2026-05-02
updated: 2026-05-03
status: implementation-complete-live-gated
related: [[CLAUDE]], [[README]], [[../design/llm-gateway-orchestration]], [[../design/data-governance-and-io-boundary]], [[../execution/phase-7-llm-gateway-orchestration]], [[../runbooks/llm-gemini-langfuse-operations]]
---

# Phase 7 — LLM Gateway and Agentic Orchestration

## Execution Plan

- [[../execution/phase-7-llm-gateway-orchestration]]

## Goal

1. Local Ollama-only architecture를 provider-agnostic multi-LLM architecture로 확장한다.
2. LiteLLM Proxy를 통해 GPT/Gemini/Ollama를 config로 전환 가능하게 한다.
3. Observability를 도입해 비용, latency, error, parse quality, model quality를 추적한다.
4. LangGraph는 Phase 1부터 run-level scaffold로 초기화하고, persona fanout은 기존 async batch/RQ 구조를 유지한다.
5. Memory/state는 base persona DB를 변경하지 않는 append-only 구조로 설계한다.

## Design Position

Phase 7은 Phase 1~2의 run lifecycle이 안정화된 뒤 본격 확장하는 phase다. 다만 Phase 1 구현 중에도 `LLMClient` interface와 LangGraph run-level scaffold는 먼저 만든다.

Recommended first stack:

```text
FastAPI/RQ
  -> internal LLMClient
  -> LiteLLM Proxy
  -> Gemini/Ollama aliases
  -> Langfuse metadata tracing
```

Cloudflare AI Gateway는 Phase 7 범위에서 제외한다. Cloudflare는 Tunnel/Access 네트워크 계층으로 유지하고, LLM provider gateway는 LiteLLM 하나로 고정한다.

## Tasks

- [x] **7.1** provider-agnostic `LLMClient` interface 정의
- [x] **7.2** 기존 Ollama client를 adapter로 감싸기
- [x] **7.3** model alias config 도입
  - `persona_default`
  - `persona_strong`
  - `analysis_default`
  - `report_default`
  - `schema_repair`
  - `local_fallback`
- [x] **7.4** LiteLLM Proxy local config 작성
- [x] **7.5** LiteLLM -> Ollama fallback alias smoke 검증
  - Current live evidence uses `smollm2:135m`; 50-person Creative Testing completed, and the 200-person local throughput limit is documented separately from adapter/gateway correctness.
- [x] **7.6** Gemini provider aliases 추가 전 [[../design/data-governance-and-io-boundary]] provider-transfer preflight 확인
- [x] **7.7** 10-person external provider smoke test
- [x] **7.8** 50-person external provider run
- [x] **7.9** model routing policy 추가
  - persona response
  - schema repair
  - aggregate analysis
  - report narrative
  - QA check
- [x] **7.10** Langfuse metadata-only tracing 적용
- [x] **7.11** Phase 1 LangGraph scaffold를 실제 run-level graph로 확장
- [x] **7.12** analysis agent, report agent, QA agent 분리
- [x] **7.13** project/session memory schema 설계
- [x] **7.14** scenario persona memory는 product workflow 확정 전까지 구현 보류
- [x] **7.15** analysis/report/QA agent를 LLMClient 기반 run-level LLM agent로 연결

## Contracts

### Model alias contract

Model aliases are stable application names. Provider model IDs can change without simulation code changes.

```yaml
persona_default: koresim/persona-fast
analysis_default: koresim/analysis-strong
report_default: koresim/report-balanced
schema_repair: koresim/repair-fast
local_fallback: koresim/local-ollama
```

### Trace contract

Every LLM call trace should include:

- `run_id`
- `simulation_type`
- `task_type`
- `model_alias`
- `provider`
- `latency_ms`
- `retry_count`
- `fallback_used`
- `parse_success`
- `error_code`

Default trace payload mode is `metadata_only`.

Provider prompt policy:

- Do not include raw persona `uuid` in external Gemini prompts.
- Use internal run state for result mapping.
- Keep `sampled_full` tracing disabled unless a specific run is approved.
- Treat completion rate, parse success, and data-governance violations as external-provider release blockers.

## Validation

| 검증 항목 | 시나리오 | 기대 결과 |
| --- | --- | --- |
| Ollama adapter | 기존 local model run | 기존 결과와 같은 contract |
| LiteLLM local | LiteLLM -> Ollama | 코드 변경 없이 gateway 경유 |
| External provider | Gemini alias | 10-person run 완료 |
| Data governance | external provider run | prompt/persona payload policy 준수 |
| Routing | task별 alias 적용 | persona/report/repair 모델이 분리됨 |
| Observability | metadata trace | cost/latency/error 추적 가능 |
| LangGraph | Phase 1 scaffold + run-level graph | RQ job 안에서 graph가 완료됨 |
| Memory | project/session schema | base persona DB를 변경하지 않음 |

## Done Definition

- [x] Simulation modules do not import provider SDKs directly.
- [x] Ollama adapter and Gemini/LiteLLM external provider paths use the same `LLMClient` boundary.
- [x] Model can be changed by alias config without code edits.
- [x] 50-person external provider run completes.
- [x] Langfuse captures metadata without full prompt/persona payload by default.
- [x] External provider transfer follows [[../design/data-governance-and-io-boundary]].
- [x] LangGraph scaffold exists from Phase 1 and does not break the non-graph path.
- [x] Base persona dataset remains immutable.

## Validation Evidence

- 2026-05-03: direct Gemini 10-person run completed, run `b62a3804-29d0-4096-ac00-00f9eb1e81de`, `parse_failed=0`.
- 2026-05-03: direct Gemini external 50-person run completed through `https://arabesque.cc/api/runs`, run `f7e4ba13-34e2-47ac-be77-b16c0f757276`, `parse_failed=0`.
- 2026-05-03: LiteLLM alias run completed, run `ec8c4b1f-6be7-4fff-9d40-45a14ee278d7`, provider `litellm`, provider model `koresim/gemini-persona-strong`.
- 2026-05-03: Langfuse trace `096f1e57d93fadedce77efd272ccddfe` had trace input/output `None`; metadata contained safe request/provider fields only.
- 2026-05-03: live Ollama fallback boundary smoke passed after installing Ollama 0.22.1 and pulling `smollm2:135m`; `uv run python scripts/check_ollama_adapter.py --model smollm2:135m` returned a live provider `ollama` chat completion.
- 2026-05-03: LiteLLM -> Ollama fallback alias smoke passed with `uv run python scripts/check_litellm_ollama_alias.py --model smollm2:135m --timeout-seconds 90`; response model was `koresim/local-ollama`.
- 2026-05-03: local Ollama fallback validation with `smollm2:135m` completed 50-person Creative Testing with 86% parse success; the 200-person attempt exposed a local small-model throughput limit and is recorded in `docs/verification/local-ollama-smollm2-creative-50-200-2026-05-03.json`.
- 2026-05-03: task-based model router implemented in `src/llm/router.py`, and `BatchSimulator` now passes task aliases through the shared LLM request path.
- 2026-05-03: LangGraph scaffold expanded to prepare/execute/analyze/report/QA run-level steps; worker result envelopes include graph/agent orchestration metadata.
- 2026-05-03: analysis/report/QA agent boundaries and project/session memory schemas implemented; persona memory remains explicitly deferred.
- 2026-05-12: analysis/report/QA boundaries now support LLM-backed agent execution through `LLMClient`; deterministic agent output remains the failure fallback.
- 2026-05-03: deterministic 50/200-person validation across all Phase 5 simulations passed and wrote `docs/verification/phase-5-phase-7-deterministic-validation.json`.

## Risks

| 리스크 | 가능성 | 완화 방안 |
| --- | --- | --- |
| gateway가 너무 많아져 장애 지점 증가 | 높음 | Phase 7에서는 LiteLLM 하나만 사용 |
| 200명 run 비용 급증 | 높음 | model alias, budget, sample cap, cost trace |
| provider별 응답 차이로 parser 실패 | 중 | schema repair task와 parse quality metric |
| LangGraph 도입으로 구조 과복잡 | 중 | run-level graph only, persona fanout은 기존 구조 유지 |
| observability에 persona/prompt가 과다 기록 | 중 | metadata-only default, sampled full은 승인 후 |

## Runbook

- Gemini/LiteLLM/Langfuse setup follows [[../runbooks/llm-gemini-langfuse-operations]].

## Out of Scope

- full customer account billing
- all simulation types에 agentic workflow 적용
- base persona DB mutation
- external benchmark retrieval agent
- automatic provider cost optimization without manual policy
