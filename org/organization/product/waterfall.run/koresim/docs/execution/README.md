---
title: Execution Plans
type: index
tags: [execution, phase-plan, implementation]
created: 2026-05-02
updated: 2026-05-12
status: active
related: [[../templates/execution-plan-template]], [[../design/react-fastapi-migration]], [[../design/harness-engineering-controls]], [[../design/data-governance-and-io-boundary]], [[../design/evaluation-framework]], [[../research/harness-engineering-gap-review]]
---

# Execution Plans

이 폴더는 phase plan을 실제 구현 가능한 체크박스 단위로 쪼갠 실행계획을 보관한다.

## Rule

- 구현 전에 관련 execution plan을 먼저 승인한다.
- 구현 중에는 체크박스를 실제 진행 상태에 맞게 갱신한다.
- 완료 시 테스트 결과와 known gaps를 Completion Log에 남긴다.
- phase plan은 방향과 범위를, execution plan은 구현 단위와 통과 조건을 담당한다.

## Reconciliation

2026-05-03 기준 current source of truth는 `CLAUDE.md`, 각 phase 문서, 그리고 completion audit 문서다. 아래 인덱스의 체크 표시는 문서 존재 여부와 현재 상태를 나타내며, 아직 구현 예정인 phase는 `Planned`로 명시한다.

## Index

- [x] [[../research/harness-engineering-gap-review]] — completed review
- [x] [[../design/harness-engineering-controls]] — active engineering harness
- [x] [[../design/data-governance-and-io-boundary]] — active data/observability policy
- [x] [[../design/evaluation-framework]] — active gate framework
- [x] [[phase-1-react-fastapi-rq-sqlite]] — completed React + FastAPI + RQ + SQLite transition
  - [x] [[gate-1A-contracts-scaffold]] — completed contracts, config, LLM boundary, LangGraph scaffold
- [x] [[phase-2-stability-recovery]] — completed stability/recovery work
- [x] [[phase-3-access-path-policy]] — protected route gate passed historically; current public app/API/SSE route validated
- [x] [[phase-4-demo-content-trust-layer]] — completed React demo presets and trust layer
- [x] [[phase-5-simulation-framework-price-optimization]] — all 9 simulations implemented and live external 200-person validation passed
- [x] [[phase-6-design-sync]] — completed frontend/backend schema and design sync
- [x] [[phase-7-llm-gateway-orchestration]] — model routing, graph expansion, memory schema, LiteLLM/Gemini/Ollama, and Langfuse metadata-only tracing complete for current demo gate
- [x] [[ai-agent-improvement-loop-v1]] — agent_runs storage, prompt versioning, deterministic agent evals, local E2E artifact, and run-level checkpoint storage
- [ ] [[agentic-intake-creative-testing-v1]] — planned goal-first intake workflow for Creative Testing, with reusable planner contracts for all 9 simulations
