---
title: Phase 7 — LLM Gateway and Agentic Orchestration
type: phase-plan
tags: [phase-7, llm-gateway, litellm, langgraph, observability, multi-llm]
created: 2026-05-02
updated: 2026-07-13
status: hardening-deployed-solar-live-pending
related: [[CLAUDE]], [[README]], [[../design/llm-gateway-orchestration]], [[../design/data-governance-and-io-boundary]], [[../execution/phase-7-llm-gateway-orchestration]], [[../execution/ai-system-hardening-solar-v1]], [[../runbooks/llm-solar-langfuse-operations]]
---

# Phase 7 — LLM Gateway and Agentic Orchestration

## Execution Plan

- [[../execution/phase-7-llm-gateway-orchestration]]

## Goal

1. provider-agnostic `LLMClient`를 유지하면서 Upstage Solar Pro 2를 목표 provider로 전환한다.
2. direct Upstage 또는 의도적으로 운영하는 LiteLLM Solar alias를 config로 선택한다.
3. Observability를 도입해 비용, latency, error, parse quality, model quality를 추적한다.
4. LangGraph는 실제 Analysis → Report → QA result workflow를 실행하고, persona fanout은 기존 async batch/RQ 구조를 유지한다.
5. Memory/state는 base persona DB를 변경하지 않는 append-only 구조로 설계한다.

## Design Position

Phase 7의 기본 경계는 완료됐다. 2026-07-13 provider 정책은 Solar Pro 2 목표,
Gemini temporary live compatibility/rollback, Ollama 비지원이다. Solar credential과
격리 10명 검증은 완료됐으며 production 10 → 50 → 200 검증 전에는 전환 완료로 보지 않는다.

Recommended first stack:

```text
FastAPI/RQ
  -> internal LLMClient
  -> direct Upstage or LiteLLM Proxy
  -> Solar Pro 2 aliases
  -> Langfuse metadata tracing
```

Cloudflare AI Gateway는 Phase 7 범위에서 제외한다. Cloudflare는 Tunnel/Access 네트워크 계층으로 유지하고, LLM provider gateway는 LiteLLM 하나로 고정한다.

## Tasks

- [x] **7.1** provider-agnostic `LLMClient` interface 정의
- [x] **7.2** 과거 Ollama adapter 검증 완료(현재 운영 backend에서는 비지원)
- [x] **7.3** model alias config 도입
  - `persona_default`
  - `persona_strong`
  - `analysis_default`
  - `report_default`
  - `schema_repair`
- [x] **7.4** LiteLLM Proxy local config 작성
- [x] **7.5** 과거 LiteLLM -> Ollama smoke 검증 기록 보존(현재 활성 config에서는 alias 제거)
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
- [x] **7.16** Analysis → Report → QA를 실제 compiled LangGraph node로 실행하고 node별 checkpoint 저장
- [x] **7.17** strict backend/alias validation, public health redaction, QA quality gate 적용
- [x] **7.18** LiteLLM active alias를 `koresim/solar-*`로 전환하고 Ollama route 제거
- [ ] **7.19** `UPSTAGE_API_KEY` 주입 후 Solar 10 → 50 → 200 live gate

## Contracts

### Model alias contract

Model aliases are stable application names. Provider model IDs can change without simulation code changes.

```yaml
persona_default: koresim/persona-fast
analysis_default: koresim/analysis-strong
report_default: koresim/report-balanced
schema_repair: koresim/repair-fast
```

Direct Upstage mode resolves these logical routes to `solar-pro2`; LiteLLM mode
uses `koresim/solar-persona`, `koresim/solar-analysis`,
`koresim/solar-report`, and `koresim/solar-repair`.

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

- Do not include raw persona `uuid` in any external provider prompt.
- Use internal run state for result mapping.
- Keep `sampled_full` tracing disabled unless a specific run is approved.
- Treat completion rate, parse success, and data-governance violations as external-provider release blockers.

## Validation

| 검증 항목 | 시나리오 | 기대 결과 |
| --- | --- | --- |
| Solar direct | Upstage adapter | 10-person run 완료 |
| LiteLLM Solar | LiteLLM -> Upstage | 코드 변경 없이 gateway 경유 |
| Temporary provider | Gemini | Solar credential 전까지 명시적 live compatibility |
| Data governance | external provider run | prompt/persona payload policy 준수 |
| Routing | task별 alias 적용 | persona/report/repair 모델이 분리됨 |
| Observability | metadata trace | cost/latency/error 추적 가능 |
| LangGraph | Phase 1 scaffold + run-level graph | RQ job 안에서 graph가 완료됨 |
| Memory | project/session schema | base persona DB를 변경하지 않음 |

## Done Definition

- [x] Simulation modules do not import provider SDKs directly.
- [x] Upstage/Gemini/LiteLLM provider paths use the same `LLMClient` boundary.
- [x] Model can be changed by alias config without code edits.
- [x] 50-person external provider run completes.
- [x] Langfuse captures metadata without full prompt/persona payload by default.
- [x] External provider transfer follows [[../design/data-governance-and-io-boundary]].
- [x] Actual result-agent LangGraph exists and does not replace persona fanout.
- [x] Base persona dataset remains immutable.
- [x] Ollama is absent from the supported backend allowlist and active LiteLLM config.
- [ ] Live Solar validation passes after credential provisioning.

## Historical and Current Validation Evidence

2026-05 Gemini/Ollama entries below are historical validation evidence, not the
current provider policy.

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
- 2026-07-13: strict provider/alias validation, Solar LiteLLM aliases, actual
  Analysis → Report → QA graph, QA gate, and metadata telemetry were implemented.
- 2026-07-13: runtime inspection found no `UPSTAGE_API_KEY`; live Solar validation remains pending.
- 2026-07-13: hardening commit `6da43ef` was deployed to the Mac Studio origin;
  the external readiness check passed for `https://arabesque.cc`, Redis/RQ,
  SQLite, app-level auth boundaries, redacted public health/config, and the
  Cloudflare Tunnel. The live provider remained Gemini by design.
- 2026-07-13: rotated Upstage credential was installed only in ignored local
  configuration. Isolated run `901bbb2f-4f18-4f6b-b602-56b181025123` completed
  against `upstage` / `solar-pro2` with 10 responses, 0 parse failures, and LLM
  Analysis → Report → QA execution. The post-credential full gate passed with
  205 tests and 89.30% coverage; production 10 → 50 → 200 remains pending.

## Risks

| 리스크 | 가능성 | 완화 방안 |
| --- | --- | --- |
| gateway가 너무 많아져 장애 지점 증가 | 높음 | Phase 7에서는 LiteLLM 하나만 사용 |
| 200명 run 비용 급증 | 높음 | model alias, budget, sample cap, cost trace |
| provider별 응답 차이로 parser 실패 | 중 | schema repair task와 parse quality metric |
| LangGraph 도입으로 구조 과복잡 | 중 | run-level graph only, persona fanout은 기존 구조 유지 |
| observability에 persona/prompt가 과다 기록 | 중 | metadata-only default, sampled full은 승인 후 |

## Runbook

- Solar/LiteLLM/Langfuse setup follows [[../runbooks/llm-solar-langfuse-operations]].

## Out of Scope

- full customer account billing
- all simulation types에 agentic workflow 적용
- base persona DB mutation
- external benchmark retrieval agent
- automatic provider cost optimization without manual policy
