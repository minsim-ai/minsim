---
title: Intake Layer V2 Contract
type: design-doc
tags: [agentic-intake, schema, safe-summary, langgraph, langfuse]
created: 2026-05-13
updated: 2026-07-13
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

## Planner Ownership

| 영역 | AS-IS | TO-BE / 현재 계약 |
| --- | --- | --- |
| next-action policy | React와 Python planner가 모두 기준처럼 보임 | React `intake-planner:v3-20260713`가 V2 단일 정책 |
| backend role | `/api/intake/advance`가 새 정책 진입점처럼 보임 | session 저장·run 연결·schema/review 검증 담당 |
| legacy endpoint | active contract | deprecated compatibility only |

The canonical V2 policy lives in `frontend/src/intake/planner.ts`. FastAPI persists
the snapshot through `/api/intake/sessions`, links it to a run, validates the
envelope, and rejects `unreviewed_assumption_count > 0`. New intake behavior must
be implemented in the React planner and covered by the shared intake fixtures.

## Project-Backed Initialization Contract

The project-scoped V2 route initializes the canonical planner before rendering its
first assistant action. `frontend/src/v2/projectIntake.ts` may seed slots from the
saved project only under these rules:

- the simulation type comes from the user's explicit type selection and remains
  visible throughout intake.
- project name, description, product context, features, prices, target notes, and
  alternatives are treated as `user` provenance with `saved project context`
  evidence.
- a critical slot already satisfied by saved project context must not be asked
  again. The planner starts at the first genuinely missing field instead of the
  generic goal question.
- initialization must not infer new facts from the project or copy a raw chat
  transcript. Generated and inferred values still require the existing review
  gates.

When the planner returns `show_form`, fields render as a single question/answer
column with field-specific examples. The free-text composer is present only for
`ask_question`; it is removed while a structured form, candidate review,
assumption review, or run-ready action is active.

Multi-value critical questions must use plain user language, state the minimum
number of answers, and include recognizable examples. If the user supplies fewer
than the required number after that question, the planner preserves the partial
answer and continues in the prefilled structured form. It must not repeat the
same question verbatim.

## Request Contract

`RunCreateRequest` may include:

```json
{
  "intake_context": {
    "schema_version": "intake-context/v1",
    "intake_session_id": "intake-...",
    "router_version": "goal-router:v1",
    "planner_version": "intake-planner:v3-20260713",
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
- high-impact generated/inferred assumptions must be reviewed before being treated as safe.
- automatic run defaults must appear in `defaults` with provenance and be shown in the run-ready review.
- the API rejects a run when `unreviewed_assumption_count` is greater than zero.
- raw chat transcript, provider prompts, persona rows, and raw persona responses must not be copied into this summary.

## Session Persistence Contract

The active V2 UI saves snapshots with `POST /api/intake/sessions`, updates them
through the session endpoints, and links the durable run with
`POST /api/intake/sessions/{session_id}/run`.

## Deprecated Backend Advance Contract

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

This endpoint and `src/intake/engine.py` are retained for older clients and are
marked deprecated in OpenAPI. Their v2 planner version intentionally differs
from the canonical React v3 version. Do not add new planning policy here.

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
