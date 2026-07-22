---
title: Intake Evaluation Fixtures Plan
type: design-doc
tags: [agentic-intake, evaluation, fixtures, regression-testing]
created: 2026-05-05
updated: 2026-05-05
status: draft
related: [[README]], [[universal-agentic-intake-workflow]], [[simulation-intake-pack-standard]], [[intake-ux-policy]]
---

# Intake Evaluation Fixtures Plan

## 1. Purpose

Agentic intake workflows can feel correct in a manual demo while still failing common user starts.

This document defines the fixture strategy for testing:

- routing.
- slot extraction.
- next action planning.
- form generation.
- candidate generation.
- assumption visibility.
- payload validity.

The goal is to prevent the assistant from becoming a vague chat flow that cannot reliably create valid simulations.

## 2. Fixture Philosophy

Fixtures should represent incomplete human behavior, not perfect form submissions.

Users will:

- start with a goal but no product.
- provide product but no audience.
- provide one target when three are recommended.
- paste messy options.
- ask the system to decide.
- mix multiple goals.
- use non-technical Korean.

The fixture set must test those behaviors directly.

## 3. Fixture Shape

```ts
type IntakeEvaluationFixture = {
  id: string;
  simulationType: SimulationType;
  title: string;
  userGoal: string;
  messages: IntakeFixtureMessage[];
  expected: {
    route?: ExpectedRoute;
    slots?: ExpectedSlotAssertion[];
    nextAction: ExpectedActionAssertion;
    payload?: ExpectedPayloadAssertion;
    assumptions?: ExpectedAssumptionAssertion[];
  };
};
```

Message shape:

```ts
type IntakeFixtureMessage =
  | { role: "user"; content: string }
  | { role: "form_submit"; formId: string; values: Record<string, unknown> }
  | { role: "candidate_review"; accepted: string[] };
```

Expected action:

```ts
type ExpectedActionAssertion = {
  type:
    | "ask_question"
    | "show_form"
    | "candidate_review"
    | "confirm_assumptions"
    | "run_ready"
    | "repair_input";
  slotIds?: string[];
  formId?: string;
  minCandidates?: number;
  maxCandidates?: number;
};
```

## 4. Evaluation Layers

### Layer 1 — Router

Checks whether user goal maps to the correct simulation candidates.

Pass examples:

- "헤드라인 만들고 싶어요" -> `creative_testing`.
- "가격 얼마가 좋을까요" -> `price_optimization`.
- "고객군을 나누고 싶어요" -> `market_segmentation`.

### Layer 2 — Slot Extraction

Checks whether existing user-provided facts are captured.

Pass examples:

- "블로그 작성 윈도우 프로그램" -> `product_description`.
- "29,000원, 39,000원, 49,000원" -> `price_points`.
- "서울 30대 여성" -> `target_filter`.

### Layer 3 — Gap Planning

Checks whether the next action is correct.

Pass examples:

- missing critical product -> `ask_question`.
- product known + recommended fields missing -> `show_form`.
- candidates missing + generation allowed -> `candidate_review`.
- valid payload -> `run_ready`.

### Layer 4 — Payload Validity

Checks final conversion against existing API schema.

Pass examples:

- `creative_testing.input.creatives.length >= 2`.
- sample size clamped to 200.
- price points are numeric and sorted.

### Layer 5 — Assumption Visibility

Checks that generated/inferred values are not hidden.

Pass examples:

- generated target customers appear in assumptions.
- generated candidates appear in review.
- default sample size appears in run summary/report metadata.

## 5. Required Fixture Categories Per Simulation

Each simulation pack needs at least these categories:

| Category | Description | Expected behavior |
| --- | --- | --- |
| `goal_only` | User says only the desired outcome. | Ask critical question. |
| `object_only` | User gives product/category/service but no details. | Show form or ask next best question. |
| `partial_form` | User fills only one recommended field. | Generate missing recommended assumptions. |
| `complete_input` | User gives all critical inputs. | Build valid payload or run-ready. |
| `auto_generate` | User asks "알아서 해줘". | Generate candidates/options and show review. |
| `messy_input` | User pastes inconsistent or verbose text. | Extract what is safe; repair if needed. |
| `ambiguous_route` | Goal could map to multiple simulations. | Ask route clarification or choose with confidence. |
| `invalid_payload` | User provides too few/too many/invalid options. | Repair input, do not run. |

Minimum:

```text
8 categories * 9 simulations = 72 fixtures
```

Practical first milestone:

```text
creative_testing: 12 fixtures
all other simulations: 5 skeleton fixtures each
total first milestone: 52 fixtures
```

## 6. Creative Testing Initial Fixtures

| Fixture | User start | Expected action |
| --- | --- | --- |
| `creative_goal_only_headline` | "제 상품 상세페이지 헤드라인을 만들고 싶어요." | ask product question |
| `creative_product_no_audience` | "블로그 작성 윈도우 프로그램 헤드라인 만들고 싶어요." | show compact form |
| `creative_one_audience` | product + one target customer | generate assumptions + candidates |
| `creative_existing_three_headlines` | user gives 3 headline candidates | run_ready or ask target filter |
| `creative_one_headline_only` | user gives 1 headline | repair or generate more |
| `creative_twelve_headlines` | user gives 12 candidates | repair: reduce to 10 |
| `creative_auto_generate` | "제품은 X인데 카피는 알아서 만들어줘" | candidate_review |
| `creative_ambiguous_vp` | "우리 제품 장점을 어떻게 말해야 할지 모르겠어요" | route clarification or value_proposition first |
| `creative_unsupported_image` | "이미지 광고를 테스트하고 싶어요" | explain text-only adaptation |
| `creative_target_filter_parse` | "서울 30대 여성 대상으로" | target_filter extracted |
| `creative_form_skip_recommended` | user skips benefit/tone | generated assumptions shown |
| `creative_final_payload` | accepted 4 candidates | valid `/api/runs` payload |

## 7. Skeleton Fixtures for Other Simulations

### Price Optimization

- goal only: "가격을 얼마로 해야 할까요?"
- product + no prices.
- product + price range.
- invalid non-numeric price.
- complete product + 4 prices.

### Product Launch

- goal only: "신제품 반응을 보고 싶어요."
- product concept only.
- product + target use case.
- missing features.
- complete launch concept.

### Value Proposition

- goal only: "우리 제품 장점을 어떻게 말해야 할까요?"
- product only.
- user provides one VP.
- auto-generate VP statements.
- complete statements.

### Market Segmentation

- goal only: "고객군을 나누고 싶어요."
- category only.
- category + segmentation question.
- vague category.
- complete segmentation request.

### Competitive Positioning

- goal only: "경쟁사 대비 포지션을 알고 싶어요."
- category only.
- one competitor only.
- competitors but no attributes.
- complete competitor set.

### Brand Perception

- goal only: "브랜드 이미지가 어떤지 보고 싶어요."
- brand only.
- brand + category.
- attributes missing.
- complete perception request.

### Churn Prediction

- goal only: "고객이 떠날지 보고 싶어요."
- service only.
- service + trigger.
- missing competitor offer.
- complete churn situation.

### Campaign Strategy

- goal only: "캠페인 전략을 짜고 싶어요."
- product/campaign context only.
- channels only.
- messages only.
- complete channel/message/budget.

## 8. Pass/Fail Criteria

### Router accuracy

Pass:

- primary simulation matches expected.
- ambiguous goals produce clarification instead of wrong confident route.

Fail:

- "헤드라인" routes to `market_segmentation`.
- "가격" routes to `creative_testing` unless clearly about price message copy.

### Slot extraction

Pass:

- extracts user-stated facts with correct source `user`.
- inferred values have confidence below direct user facts.

Fail:

- generated values are marked as user.
- unsupported facts are invented during extraction.

### Planner action

Pass:

- critical missing blocks execution.
- recommended missing can produce form/generation.
- run_ready only appears with valid payload.

Fail:

- runs with 0 or 1 creative candidate.
- asks for optional seed before product is known.
- repeats the same question after user answered.

### Assumptions

Pass:

- high-impact generated assumptions are visible.
- assumptions can be edited or confirmed before run.

Fail:

- generated audience silently affects target filter.
- generated candidates are sent directly to `/api/runs`.

## 9. Test Harness Plan

Initial lightweight command:

```bash
cd frontend
npm run typecheck
node scripts/check-intake-fixtures.mjs
```

If no frontend test runner is available, add a plain Node script that:

1. imports fixture JSON/TS.
2. runs planner over each message sequence.
3. compares expected route/action/payload.
4. exits non-zero on failure.

Future:

- add Vitest for planner unit tests.
- add Playwright/agent-browser E2E for visual form/candidate flow.
- add backend pytest when intake moves to FastAPI.

## 10. Fixture Storage

Recommended location:

```text
frontend/src/intake/fixtures/
  creativeTestingFixtures.ts
  priceOptimizationFixtures.ts
  productLaunchFixtures.ts
  valuePropositionFixtures.ts
  marketSegmentationFixtures.ts
  competitivePositioningFixtures.ts
  brandPerceptionFixtures.ts
  churnPredictionFixtures.ts
  campaignStrategyFixtures.ts
```

Shared types:

```text
frontend/src/intake/fixtures/types.ts
```

Optional docs artifact:

```text
docs/verification/intake-fixtures/
  intake-fixture-summary-YYYY-MM-DD.md
```

## 11. Golden Dataset Rule

Once a fixture is used to prevent a bug, it becomes golden.

Rules:

- Do not rewrite expected behavior casually.
- If product policy changes, update the fixture with a note.
- Each fixture should have a short reason.
- Keep fixtures realistic and Korean-first.

## 12. First Milestone Checklist

- [ ] Define fixture type.
- [ ] Add 12 creative testing fixtures.
- [ ] Add 5 skeleton fixtures for each remaining simulation.
- [ ] Add fixture checker script.
- [ ] Verify route/action/payload for creative testing.
- [ ] Add fixture summary to completion log.
