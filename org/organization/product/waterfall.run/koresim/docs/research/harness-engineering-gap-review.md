---
title: Harness Engineering Gap Review
type: research
tags: [harness, engineering-process, dio, phase-1, quality, evaluation]
created: 2026-05-02
updated: 2026-05-02
status: draft
related: [[../design/harness-engineering-controls]], [[../design/data-governance-and-io-boundary]], [[../design/evaluation-framework]], [[phase-1-implementation-readiness]], [[../execution/gate-1A-contracts-scaffold]], [[../execution/phase-1-react-fastapi-rq-sqlite]]
---

# Harness Engineering Gap Review

## 1. Purpose

This review compares the current KoreaSim planning documents against the DIO/Harness engineering process used in the `sw-development` knowledge base.

Source knowledge:

- `/Users/byeongsu/obsidian-org-vault/org/byeongsuko/wiki/sw-development/dio-harness-engineering-process.md`
- `/Users/byeongsu/obsidian-org-vault/org/byeongsuko/wiki/sw-development/하네스 엔지니어링 설계 문서 - 스페이스Y 개발팀 방식.md`

Current conclusion:

- KoreaSim has a strong feature roadmap and phase breakdown.
- KoreaSim is still missing part of the engineering harness that controls quality, boundaries, evaluation, and auditability.
- Do not delay all implementation until every future concern is solved. Instead, add the minimum harness controls before Gate 1A implementation and schedule the rest by gate.

## 2. Harness Criteria

The source documents define a design process built around six sections:

1. Principles
2. Definitions
3. Structure
4. Architecture
5. Scope
6. Research Questions

They also emphasize three operating tools:

- Design document: the blueprint.
- Linter/import rules: the execution guardrail.
- Evaluation framework: the validation system.

For agentic systems, the repeated principles are:

- I/O Boundary
- User Mental Model
- No Hallucination
- Human-in-the-loop / Audit Trail

## 3. Summary Gap Map

| Harness area | Current KoreaSim coverage | Gap | Priority |
| --- | --- | --- | --- |
| I/O Boundary | API/result schemas are planned in Gate 1A. | No system-wide input/output boundary across user input, persona data, LLM prompts, raw results, traces, logs, and frontend responses. | P0 |
| User Mental Model | Landing/app split and trust copy are planned. | No formal statement of what users should believe KoreaSim can and cannot do. | P1 |
| No Hallucination | Quality/trust docs exist. | No concrete grounding/confidence/overclaim policy for model-generated reports. | P0 |
| Human-in-the-loop | Access policy is planned. | No autonomous vs approval zones, escalation rules, or audit/operation log split. | P1 |
| Definitions | API schema names are planned. | No DDD entity/value object/aggregate vocabulary. | P0 |
| Structure | Proposed packages exist. | Import boundaries are not enforceable yet. | P0 |
| Architecture | React/FastAPI/RQ/SQLite flow is planned. | State transitions, event payloads, idempotency, recovery, and log storage classes need more detail. | P0/P1 |
| Scope | RQ, SQLite, LiteLLM, Langfuse decisions exist. | Build/buy/integrate risk matrix and vendor/data policy are incomplete. | P1 |
| Research Questions | Some decisions resolved through conversation. | Data license, external model data transfer, provider rate limits, eval dataset, and cost budgets remain open. | P0/P1 |
| Linter | `ruff` exists as dev dependency. | No configured lint/import-boundary rules linked to the design. | P1 |
| Evaluation | Unit/schema tests are planned. | No simulation/LLM quality evaluation framework. | P0 |

## 4. What Is Already Solid

- Phase plans are split from execution plans.
- Phase 1 is broken into gates 1A through 1F.
- React + FastAPI one-origin architecture is explicit.
- RQ/Redis is approved for long-running work.
- SQLite run/event/result persistence is planned.
- SSE with polling fallback is planned.
- LiteLLM-only gateway decision avoids gateway stacking complexity.
- LangGraph is scoped as a thin run-level scaffold and disabled by default.
- Full `raw_results` policy is explicit for local MVP.
- Streamlit fallback is preserved.

## 5. P0 Gaps Before Gate 1A Implementation

These are not optional because they directly shape schemas, API errors, event names, and LLM boundaries.

### 5.1 I/O Boundary

- [ ] Define inbound classes: user request, preset request, target filter, uploaded/fixture data, persona dataset row, provider response.
- [ ] Define outbound classes: run snapshot, SSE event, result envelope, raw persona result, error response, health response.
- [ ] Define non-output classes: API keys, provider raw credentials, stack traces, internal prompts, hidden routing config.
- [ ] Define trace/log classes: operation log, audit log, Langfuse metadata trace, local debug log.
- [ ] Define what synthetic persona fields may be sent to external LLM providers in Phase 7.

### 5.2 Domain Definitions

- [ ] Define `Run`.
- [ ] Define `Simulation`.
- [ ] Define `Persona`.
- [ ] Define `PersonaSample`.
- [ ] Define `PersonaResponse`.
- [ ] Define `ResultEnvelope`.
- [ ] Define `Metric`.
- [ ] Define `Preset`.
- [ ] Define `ModelAlias`.
- [ ] Define `Trace`.
- [ ] Define `AuditEvent`.
- [ ] Mark each as Entity, Value Object, Aggregate, Event, or Service.

### 5.3 Error and Event Taxonomy

- [ ] Define stable API error codes.
- [ ] Define run event names.
- [ ] Define SSE event payload shape.
- [ ] Define retry/reconnect semantics.
- [ ] Define which errors are user-actionable vs operator-actionable.

### 5.4 Data Governance

- [ ] Classify fields as public, protected demo, internal operational, or secret.
- [ ] Decide logging rules for full `raw_results`.
- [ ] Decide tracing rules for prompts and persona fields.
- [ ] Check dataset license and redistribution constraints.
- [ ] Define external provider transfer rules before any non-local LLM call.

### 5.5 Evaluation Framework v0

- [ ] Define the first small eval fixture.
- [ ] Define parser success metric.
- [ ] Define schema adherence metric.
- [ ] Define deterministic seed repeatability check.
- [ ] Define overclaim/hallucination check for report text.
- [ ] Define minimum pass criteria for 10-person and 50-person local runs.

## 6. P1 Gaps Before Gate 1D/1E

These can be designed after Gate 1A, but before real worker execution and React live wiring.

- [ ] Operation log vs audit log storage.
- [ ] Run state transition table with triggering component.
- [ ] Interrupted run recovery behavior.
- [ ] Partial result persistence and replay behavior.
- [ ] SSE cursor/last-event-id behavior.
- [ ] E2E test log `.md` template.
- [ ] RQ worker failure classification.
- [ ] Redis unavailable behavior.
- [ ] SQLite backup/recovery behavior.

## 7. P2 Gaps Before External Demo

These should be completed before a public or customer-facing demo.

- [ ] Human review rule for externally shared reports.
- [ ] Cost budget and rate-limit policy for external models.
- [ ] Provider fallback policy through LiteLLM.
- [ ] Cloudflare Access runbook.
- [ ] Local operator runbook.
- [ ] Result disclaimer and confidence language UX.
- [ ] Negative prompt: what KoreaSim must not claim or do.

## 8. Recommended Document Updates

Create or update:

- [ ] [[../design/harness-engineering-controls]] — minimum controls mapped to the six-section Harness design structure.
- [ ] [[../design/data-governance-and-io-boundary]] — field classification, raw result policy, provider transfer, observability payloads.
- [ ] [[../design/evaluation-framework]] — contract, fixture, live-run, provider comparison, and grounding evals.
- [ ] [[../execution/gate-1A-contracts-scaffold]] — add Gate 1A harness preflight and error/event taxonomy.
- [ ] [[../execution/phase-1-react-fastapi-rq-sqlite]] — add a harness preflight before implementation gates.
- [ ] [[../design/react-fastapi-migration]] — link harness controls as a governing design doc.
- [ ] [[../design/llm-gateway-orchestration]] — link data governance and no-hallucination constraints before external providers.

## 9. Decision Status

Resolved:

- [x] Use React + FastAPI for the external demo.
- [x] Use RQ/Redis for long-running jobs.
- [x] Use SQLite for local run/event/result persistence.
- [x] Use LiteLLM Proxy only as the LLM provider gateway in Phase 7.
- [x] Add LangGraph as a disabled run-level scaffold from Phase 1.
- [x] Keep full synthetic `raw_results` in the local MVP result envelope.

Still open:

- [ ] Exact dataset redistribution and external-provider transfer policy.
- [ ] Exact error code taxonomy.
- [ ] Exact run event taxonomy.
- [ ] Minimum evaluation fixture and pass thresholds.
- [ ] Import-boundary enforcement mechanism.
- [ ] Audit log retention and storage location.

## 10. Recommendation

Before implementing Gate 1A, apply the P0 harness controls to the Gate 1A contract. Do not expand Gate 1A into a full observability/evaluation project. Gate 1A should only add the controls that affect schema shape, boundaries, and import safety.

Recommended next order:

1. Approve [[../design/harness-engineering-controls]] as the minimum control design.
2. Update Gate 1A with P0 checks.
3. Implement Gate 1A.
4. Create a separate evaluation execution gate before real 50-person external validation.
