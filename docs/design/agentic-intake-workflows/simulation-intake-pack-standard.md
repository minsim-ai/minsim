---
title: Simulation Intake Pack Standard
type: design-doc
tags: [agentic-intake, simulation-pack, interface, extensibility]
created: 2026-05-05
updated: 2026-05-05
status: draft
related: [[README]], [[universal-agentic-intake-workflow]], [[creative-testing-intake-v1]], [[../../functional/overview]]
---

# Simulation Intake Pack Standard

## 1. Purpose

KoreaSim should use a hybrid architecture:

```text
Common Agentic Intake Engine
+
Simulation-specific Intake Packs
```

The common engine owns the workflow:

- route intent.
- manage slots.
- decide the next action.
- render question/form/candidate review.
- record assumptions.
- validate readiness.

Each simulation pack owns domain-specific knowledge:

- what user goals should route here.
- what information is critical, recommended, or optional.
- what candidates can be generated.
- how to convert slots into `/api/runs` payload.
- what edge cases should block execution.

This standard prevents the 9 simulation flows from becoming 9 unrelated mini-products.

## 2. Design Choice

### Rejected: Fully Generic

A fully generic planner would use one abstract schema for all simulations. It would be easy to start but would fail on quality.

Examples:

- `price_optimization` needs numeric price points and purchase context.
- `market_segmentation` needs category and segmentation questions.
- `churn_prediction` needs trigger events and competitor offers.
- `creative_testing` needs candidates or candidate generation.

One generic question policy cannot produce good enough inputs for all of these.

### Rejected: Fully Custom

Nine separate flows would produce good local UX, but they would duplicate:

- slot merge.
- form rendering.
- assumption display.
- payload validation.
- candidate review.
- test fixtures.

Every UX or trust policy change would require nine edits.

### Chosen: Hybrid Pack Standard

The engine should be generic. The pack should be specific.

```text
70% common engine
30% simulation-specific pack
```

## 3. Pack Interface

```ts
type SimulationIntakePack = {
  simulationType: SimulationType;
  version: string;
  label: string;
  description: string;

  routing: RoutingPolicy;
  slots: SlotRequirement[];
  extraction: ExtractionPolicy;
  form: FormPolicy;
  generation?: GenerationPolicy;
  assumptions: AssumptionPolicy;
  validation: ValidationPolicy;
  payload: PayloadPolicy;
  examples: IntakeExample[];
};
```

## 4. Routing Policy

```ts
type RoutingPolicy = {
  positiveHints: string[];
  negativeHints?: string[];
  exampleGoals: string[];
  ambiguousWith?: SimulationType[];
  minConfidenceToAutoSelect: number;
  clarificationQuestion?: string;
};
```

Example:

```ts
const creativeTestingRouting = {
  positiveHints: ["헤드라인", "카피", "광고 문구", "상세페이지 문구", "메시지 비교"],
  ambiguousWith: ["value_proposition", "campaign_strategy"],
  minConfidenceToAutoSelect: 0.72,
  clarificationQuestion: "문구 후보를 비교하고 싶은가요, 아니면 가치 제안 자체를 정리하고 싶은가요?",
};
```

## 5. Slot Requirements

Every slot must define its importance and automation policy.

```ts
type SlotRequirement = {
  id: string;
  label: string;
  family:
    | "goal"
    | "object"
    | "audience"
    | "options"
    | "context"
    | "criteria"
    | "constraints"
    | "run_config";
  importance: "critical" | "recommended" | "optional";
  dataType:
    | "text"
    | "textarea"
    | "number"
    | "currency"
    | "single_select"
    | "multi_select"
    | "multi_text"
    | "target_filter";
  minItems?: number;
  maxItems?: number;
  recommendedItems?: number;
  canInfer: boolean;
  canGenerate: boolean;
  needsReviewWhenGenerated: boolean;
  placeholder?: string;
  helperText?: string;
};
```

Rules:

- Critical slots must be present before a run.
- Recommended slots can be generated or skipped with a visible assumption.
- Optional slots should default quietly unless they materially affect interpretation.
- Generated high-impact slots require user review.

## 6. Extraction Policy

```ts
type ExtractionPolicy = {
  deterministicPatterns: ExtractionPattern[];
  llmExtractionAllowed: boolean;
  evidenceRequired: boolean;
};
```

Initial implementation should prefer deterministic extraction for safety:

- parse numbers and price lists.
- parse age ranges.
- split pasted candidates by newlines.
- detect common surface words such as "헤드라인", "가격", "브랜드".

LLM extraction can be added later behind the same output schema.

## 7. Form Policy

```ts
type FormPolicy = {
  formId: string;
  showWhen: "recommended_missing" | "after_first_critical_answer" | "always_after_route";
  maxFieldsVisible: number;
  allowPartialSubmit: boolean;
  fieldOrder: string[];
  primaryActionLabel: string;
};
```

Guidelines:

- Do not show a full form before the user has supplied or confirmed the object being evaluated.
- Show a form when two or more recommended slots are missing.
- Keep first form to 3-5 fields.
- Make non-critical fields skippable.

## 8. Generation Policy

```ts
type GenerationPolicy = {
  supportsCandidateGeneration: boolean;
  candidateSlotId: string;
  minCandidates: number;
  maxCandidates: number;
  defaultCandidateCount: number;
  generationAngles: GenerationAngle[];
  blockedClaims: string[];
  reviewRequired: boolean;
};
```

Examples by simulation:

| Simulation | Generated thing |
| --- | --- |
| `creative_testing` | headline/ad copy candidates |
| `price_optimization` | price point candidates if user gives range |
| `value_proposition` | value proposition statements |
| `campaign_strategy` | channel/message combinations |
| `competitive_positioning` | attributes to compare |

Not every simulation needs generation in v1. Generation should only happen when it helps the user move forward.

## 9. Assumption Policy

```ts
type AssumptionPolicy = {
  requireReviewForImpact: "medium" | "high";
  maxUnreviewedMediumAssumptions: number;
  showDefaultValuesInReport: boolean;
};
```

Default:

- High-impact generated assumptions always need review.
- Medium-impact assumptions can proceed if shown once and the user chooses continue.
- Low-impact defaults can proceed but must be logged.

## 10. Validation Policy

```ts
type ValidationPolicy = {
  validateSlots: (session: IntakeSession) => FieldError[];
  validatePayload: (payload: RunCreateRequest) => FieldError[];
};
```

Validation must be deterministic. Do not rely on LLM "looks good" judgment for execution readiness.

Common validation:

- no empty critical text.
- list min/max.
- sample size 1-200.
- valid simulation type.
- generated assumptions reviewed when required.

## 11. Payload Policy

```ts
type PayloadPolicy = {
  buildPayload: (session: IntakeSession) => RunCreateRequest;
  payloadPreview: (session: IntakeSession) => PayloadPreview;
};
```

The pack is the only place that should know how slots map into simulation-specific `input`.

Example:

```ts
creative_testing:
  slots.creative_candidates -> input.creatives

price_optimization:
  slots.product_name -> input.product_name
  slots.price_points -> input.price_points
```

## 12. Pack Registry

```ts
type IntakePackRegistry = Record<SimulationType, SimulationIntakePack>;
```

The router should return simulation candidates, then the registry supplies the pack.

```ts
const pack = intakePackRegistry[taskFrame.primarySimulationType];
const action = planNextAction(session, pack);
```

## 13. Minimum Pack Requirements

A pack is implementation-ready only when it has:

- [ ] routing hints.
- [ ] at least one example goal.
- [ ] critical slots.
- [ ] recommended slots.
- [ ] form policy.
- [ ] payload builder.
- [ ] validation policy.
- [ ] at least five evaluation fixtures.

## 14. Pack Priority

Recommended implementation order:

1. `creative_testing`
2. `value_proposition`
3. `price_optimization`
4. `product_launch`
5. `campaign_strategy`
6. `competitive_positioning`
7. `market_segmentation`
8. `brand_perception`
9. `churn_prediction`

Rationale:

- The first five map most naturally to goal-first product/marketing requests.
- Creative/value/campaign share candidate generation patterns.
- Price/product launch add numeric and forecast-like input patterns.
- Segmentation/perception/churn need more careful interpretation and report framing.

## 15. Initial Pack Matrix

| Simulation | Candidate generation | Primary critical slots | Main risk |
| --- | --- | --- | --- |
| `creative_testing` | Yes | surface, product/context, candidates or permission | generic generated copy |
| `value_proposition` | Yes | product context, statements or permission | confusing VP with ad copy |
| `price_optimization` | Partial | product, price points/range | invalid or unrealistic prices |
| `product_launch` | Partial | product concept, use case | overclaiming demand forecast |
| `campaign_strategy` | Yes | context, channels/messages or permission | too many combinations |
| `competitive_positioning` | Partial | category, competitors/products | wrong competitor set |
| `market_segmentation` | No/partial | category, segmentation question | vague segment labels |
| `brand_perception` | Partial | brand, category, attributes | brand context ambiguity |
| `churn_prediction` | Partial | service, current situation, trigger | sensitive churn assumptions |

## 16. Review Rule

Any new simulation pack must answer:

1. What does the user actually want to decide?
2. Which slots are truly critical?
3. What can be safely inferred?
4. What can be generated?
5. What must be shown before execution?
6. How does the final payload map to existing API schema?
7. What would make the report misleading if omitted?
