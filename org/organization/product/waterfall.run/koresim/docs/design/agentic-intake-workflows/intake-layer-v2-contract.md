---
title: Intake Layer V2 Contract
type: design-doc
tags: [agentic-intake, schema, safe-summary, langgraph, langfuse]
created: 2026-05-13
updated: 2026-05-13
status: approved
related: [[universal-agentic-intake-workflow]], [[simulation-intake-pack-standard]], [[intake-evaluation-fixtures-plan]], [[../llm-gateway-orchestration]]
---

# Intake Layer V2 Contract

## Decision

KoreaSim will treat user input as a first-class agent layer before simulation execution.

The intake layer is responsible for converting a natural-language goal into:

- a task frame.
- structured slots with provenance.
- a deterministic next action.
- a run payload.
- a safe summary that downstream analysis/report/QA agents may use.

Result-level agents must not consume the full raw chat transcript by default. They may only consume `safe_intake_summary`, which excludes raw conversation text except for user-provided facts already captured as slots.

## Request Contract

`RunCreateRequest` may include:

```json
{
  "intake_context": {
    "schema_version": "intake-context/v1",
    "intake_session_id": "intake-...",
    "router_version": "goal-router:v1",
    "planner_version": "intake-planner:v2-20260513",
    "task_frame": {},
    "provenance": {},
    "safe_intake_summary": {}
  }
}
```

`intake_context` is optional so legacy preset/manual runs remain valid.

## Safe Summary Contract

```json
{
  "schema_version": "safe-intake-summary/v1",
  "user_goal": "사용자가 달성하려는 결정",
  "decision_question": "시뮬레이션이 답해야 하는 질문",
  "simulation_type": "creative_testing",
  "user_provided": {},
  "inferred": {},
  "generated": {},
  "defaults": {},
  "reviewed_assumptions": {},
  "generated_candidates": [],
  "constraints": {},
  "source_counts": {},
  "unreviewed_assumption_count": 0
}
```

Rules:

- `user_provided` contains only structured facts captured from user input or form fields.
- `inferred`, `generated`, and `defaults` are separated from user facts.
- high-impact generated assumptions must be reviewed before being treated as safe.
- raw chat transcript, provider prompts, persona rows, and raw persona responses must not be copied into this summary.

## Backend Advance Contract

`POST /api/intake/advance` accepts:

```json
{
  "session_id": "intake-...",
  "snapshot": {},
  "event": {
    "type": "user_message",
    "content": "가격을 얼마로 해야 할까요?"
  }
}
```

It returns:

```json
{
  "session_id": "intake-...",
  "status": "collecting",
  "snapshot": {},
  "action": {},
  "safe_intake_summary": {},
  "checkpoint": {
    "graph_name": "intake_v2",
    "checkpoint_name": "plan_next_action",
    "planner_version": "intake-planner:v2-20260513",
    "router_version": "goal-router:v1",
    "awaiting_human_input": true
  }
}
```

The endpoint is deterministic in V2. It is shaped so the same `route -> extract -> plan -> human input -> resume` boundary can later be replaced with native LangGraph interrupts/checkpointing without changing the API.

## Result Agent Contract

Completed result envelopes include `safe_intake_summary` when the run started from intake.

The agent safe input allowlist includes `safe_intake_summary` but still excludes:

- `raw_results`.
- persona UUIDs.
- full persona rows.
- raw model responses.
- raw chat transcript.

Analysis/report/QA agents may use the summary to align recommendations with the user's stated decision, but aggregate result metrics remain the evidence source.

## Evaluation Contract

Intake V2 regression fixtures cover all 9 simulations across:

- `goal_only`
- `partial`
- `complete`
- `ambiguous`
- `messy`
- `invalid`
- `auto_generate`
- `assumption_review`

Scoring dimensions:

- route accuracy.
- critical slot coverage.
- next action correctness.
- payload validity.
- assumption visibility.
- safe summary availability.

## Langfuse Regression Policy

Intake prompt/router changes must be tagged with:

- `router_version`.
- `planner_version`.
- fixture id/category.
- simulation type.
- final action type.
- route confidence.

The same fixture set should be reusable as a Langfuse dataset so prompt/router versions can be compared before release.
