---
title: Persona Simulation Protocol Engine
type: design-doc
tags: [persona-simulation, protocol-engine, price-research, product-qa, calibration]
created: 2026-05-14
updated: 2026-05-14
status: draft
related: [[../execution/persona-simulation-performance-upgrade-v1]], [[llm-gateway-orchestration]], [[data-governance-and-io-boundary]], [[evaluation-framework]]
---

# Persona Simulation Protocol Engine

## Decision

KoreaSim will support versioned simulation protocols inside the existing simulation framework.

The first implementation is `price_research_v2`, exposed as a versioned protocol under the existing `price_optimization` simulation type instead of a new top-level simulation enum. This preserves the current 9-simulation product surface while allowing multi-step research behavior.

## Current Slices

`price_research_v2` adds four protocol steps:

1. `price_ladder`: ask each persona for purchase/watch/reject intent by price.
2. `rejection_conditions`: for non-purchase personas, ask what condition would change the answer.
3. `comparison_anchor`: ask for a comparable paid-service anchor and monthly spend.
4. `non_price_hesitation`: ask for the strongest blocker other than price.

The protocol result is stored in the common result envelope under `protocol`, and aggregate metrics remain under `metrics`.

`product_qa_v1` is exposed as a versioned protocol under `value_proposition`. It ranks concrete artifacts such as landing copy, onboarding copy, price-table copy, and report snippets by forced ranking and criteria scores.

Calibration V1 supports aggregate post-stratification by applying target distribution weights to parsed persona rows. It stores aggregate distributions, weights, and warnings only.

Interview Guide V1 is deterministic for Price Research V2. It turns aggregate signals such as conditional yes, comparison anchors, and non-price hesitation into follow-up interview question slots.

## Boundary

- Persona fanout remains in the existing async/RQ worker path.
- LangGraph remains run-level orchestration only, not per-persona branching.
- `LLMClient` remains the only provider boundary.
- Step-specific model routing uses task types such as `pricing_response`, `pricing_objection`, `pricing_anchor`, and `pricing_hesitation`.
- Product storage may keep protected raw step responses in `raw_results`.
- Langfuse and result-agent safe inputs must not receive raw persona rows or raw multi-turn transcripts by default.

## Result Shape

Completed result envelopes may include:

```json
{
  "simulation_type": "price_optimization",
  "metrics": {
    "protocol_id": "price_research_v2",
    "headline_intent_counts": {},
    "conditional_yes_count": 0,
    "condition_category_counts": {},
    "anchor_category_counts": {},
    "hesitation_reason_counts": {}
  },
  "protocol": {
    "schema_version": "simulation-protocol/v1",
    "protocol_id": "price_research_v2",
    "steps": [],
    "step_summaries": []
  }
}
```

## Interpretation Policy

Price Research V2 separates:

- headline purchase intent.
- conditional yes after objections.
- comparison anchors.
- non-price hesitation reasons.

Reports should avoid treating headline purchase intent as the final answer when conditional yes or blocker evidence points to a different product action.

## Deferred Scope

- External provider case-equivalent benchmark.
- UI workflow for selecting protocol mode before run creation.
