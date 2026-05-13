---
title: AI Agent Improvement Loop V1
type: execution-plan
tags: [ai-agent, evals, langgraph, langfuse, artifact, improvement-loop]
created: 2026-05-12
updated: 2026-05-12
status: complete
related: [[phase-7-llm-gateway-orchestration]], [[../design/llm-gateway-orchestration]], [[../design/evaluation-framework]], [[../design/data-governance-and-io-boundary]]
---

# AI Agent Improvement Loop V1

## 0. Metadata

- [x] Execution plan id: `ai-agent-improvement-loop-v1`
- [x] Target phase: post-demo productization / Phase 7 extension
- [x] Related design docs: [[../design/llm-gateway-orchestration]], [[../design/evaluation-framework]], [[../design/data-governance-and-io-boundary]]
- [x] Owner: Codex
- [x] Status: complete
- [x] Created: 2026-05-12
- [x] Updated: 2026-05-12

## 1. Summary

### Objective

- [x] LLM agent 실행 결과를 저장하고, prompt/model/router 변경이 실제로 개선됐는지 비교할 수 있는 반복 루프를 만든다.

### User-visible outcome

- [x] AI agent E2E 실행 artifact가 `docs/verification/e2e/ai-agent-*` 아래 저장된다.
- [x] result envelope에는 기존 `orchestration.agents` 결과가 유지된다.

### Engineering outcome

- [x] `agent_runs` 저장 구조가 추가된다.
- [x] prompt version, safe input digest, output, score, trace metadata가 저장된다.
- [x] deterministic eval harness가 agent schema와 raw payload leak을 점검한다.
- [x] LangGraph run state checkpoint를 SQLite에 저장한다.

## 2. Scope

### In scope

- [x] 실제 로컬 worker E2E + artifact 저장 확인
- [x] `agent_runs` 저장 구조
- [x] eval dataset + scoring harness
- [x] prompt versioning
- [x] LangGraph run-level checkpoint 저장

### Out of scope

- [x] browser UI에서 agent report 별도 섹션 노출
- [x] LangGraph native SQLite checkpointer dependency 추가
- [x] persona fanout을 LangGraph branch로 전환

## 3. Contracts

### Agent run record

- [x] `run_id`
- [x] `agent_name`
- [x] `task_type`
- [x] `prompt_version`
- [x] `mode`
- [x] `safe_input_digest`
- [x] `safe_input_json`
- [x] `output_json`
- [x] `scores_json`
- [x] `provider`
- [x] `provider_model`
- [x] `trace_id`

### Scoring contract

- [x] `schema_valid`
- [x] `missing_fields`
- [x] `no_raw_leak`
- [x] `leaked_terms`

### Artifact contract

- [x] `artifact.json`
- [x] `report.md`
- [x] run status, total responses, parse failures
- [x] agent run count, prompt versions, scores
- [x] orchestration checkpoint count and step state

## 4. Implementation Checklist

### Backend persistence

- [x] Add `AgentRunRecord`.
- [x] Add `OrchestrationCheckpointRecord`.
- [x] Add `agent_runs` table.
- [x] Add `orchestration_checkpoints` table.
- [x] Add store methods for save/list.

### Agent execution

- [x] Add prompt version to analysis/report/QA agent specs.
- [x] Include prompt version in LLM metadata and output payload.
- [x] Save agent outputs after worker run completion.
- [x] Save graph checkpoint after run-level graph completion.

### Eval harness

- [x] Add `evals/fixtures/agent_runs_v1.json`.
- [x] Add `evals/run_agent_eval.py`.
- [x] Add deterministic scoring helper.
- [x] Include agent eval in `scripts/verify.py`.

### E2E artifact

- [x] Add `scripts/check_ai_agent_e2e.py`.
- [x] Create local worker E2E artifact with deterministic LLM and sampler.
- [x] Save artifact under `docs/verification/e2e/ai-agent-*`.

## 5. Completion Log

- [x] Focused tests added for store persistence, agent scoring, worker storage, and E2E artifact generation.
- [x] `uv run python evals/run_agent_eval.py` passes.
- [x] `uv run python scripts/check_ai_agent_e2e.py` creates artifact and report.
- [x] Final full verification result: `uv run python scripts/verify.py` passed with 143 tests and 87.69% coverage.
- [x] Live LiteLLM/Gemini/Langfuse smoke completed: `docs/verification/e2e/ai-agent-live-20260512T123258Z`.
- [x] 9-theme API report completed: `docs/verification/e2e/ai-agent-theme-api-20260512T133836Z`.

## 6. Known Gaps

- Native LangGraph checkpointer is not enabled because `langgraph.checkpoint.sqlite` is not currently installed. V1 stores the run-level graph state in KoreaSim SQLite instead.
- UI does not yet surface `agent_runs`; this is storage/eval infrastructure first.
