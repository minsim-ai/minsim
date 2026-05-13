---
title: Intake UX Policy
type: design-doc
tags: [agentic-intake, ux-policy, dynamic-form, assumptions, conversation]
created: 2026-05-05
updated: 2026-05-05
status: draft
related: [[README]], [[universal-agentic-intake-workflow]], [[simulation-intake-pack-standard]]
---

# Intake UX Policy

## 1. Purpose

This document defines how KoreaSim's agentic intake assistant should behave turn by turn.

The product goal is not to ask the user to complete a perfect research brief. The goal is to collect enough information to run a useful simulation while keeping the user in control of important assumptions.

## 2. Core UX Principle

Ask less, but ask the right thing.

The assistant should:

- ask one question when one missing fact blocks progress.
- show a form when several structured inputs can be gathered faster than chat.
- generate reasonable defaults when the user cannot answer.
- show meaningful assumptions before execution.
- proceed once the decision quality is sufficient, not once every possible field is filled.

## 3. Decision Ladder

The assistant chooses the next UI action using this ladder:

```text
1. Is the user's goal unclear?
   -> ask broad clarification.

2. Is a critical slot missing?
   -> ask one direct question.

3. Are two or more recommended slots missing?
   -> show compact form.

4. Are required candidates/options missing but generation is allowed?
   -> generate candidates and show review.

5. Are high-impact generated assumptions present?
   -> show assumption confirmation.

6. Is the run payload valid?
   -> show run-ready state.

7. Is payload invalid?
   -> show repair input.
```

## 4. One-Question Rule

When a critical slot is missing, ask only one question.

Good:

```text
좋아요. 어떤 제품이나 서비스인가요?
```

Bad:

```text
제품은 무엇이고, 핵심 고객은 누구이며, 가격대는 얼마고, 어떤 톤을 원하시나요?
```

Why:

- Users often start with a vague goal.
- One question keeps the conversation approachable.
- A form can appear after the core object is known.

## 5. Form Timing Policy

Show a form when:

- the main object is known.
- at least two recommended slots are missing.
- the missing slots are easier to answer in structured fields than in chat.

Do not show a form when:

- the user's goal is still unclear.
- the product/service/category is unknown.
- there is only one missing critical slot.
- the system can safely proceed with defaults.

## 6. Form Design Policy

The first form should be compact.

Default limits:

- 3-5 fields visible.
- one critical field maximum if possible.
- recommended fields can be skipped.
- optional fields should be hidden under advanced controls or omitted.

Field labels should ask for business facts, not internal simulation concepts.

Good:

```text
핵심 고객
가장 큰 장점
원하는 톤
```

Bad:

```text
target_filter
creative_candidates
simulation input
```

## 7. Partial Submit Policy

The user can submit a form when:

- all visible critical fields are filled.
- recommended fields are either filled or allowed to auto-fill.

If a recommended field is empty and `canGenerate=true`, the system should not block. It should generate or default and add it to the assumption ledger.

## 8. "알아서 해줘" Policy

When the user says:

- "알아서 해줘"
- "잘 모르겠어요"
- "추천해주세요"
- "대충 해보죠"

The assistant should:

1. stop asking for non-critical details.
2. generate recommended missing values.
3. show a concise assumption review.
4. continue after user confirmation.

It should not:

- invent critical product facts.
- hide assumptions.
- run immediately if the payload is invalid.

## 9. Assumption Display Policy

Every non-user value has a source:

| Source | Meaning | Display before run? | Display in report? |
| --- | --- | --- | --- |
| `user` | directly provided by user | no, unless summary | yes |
| `inferred` | derived from user text | if medium/high impact | yes |
| `generated` | created by AI/system | yes if medium/high impact | yes |
| `default` | system default | no if low impact | yes in technical summary |

Impact examples:

| Slot | Impact | Review required? |
| --- | --- | --- |
| generated headline candidate | high | yes |
| generated target customer | high | yes |
| inferred surface "상세페이지 헤드라인" | medium | usually show in context |
| default sample size 200 | low | no, but show in report |
| default seed 42 | low | no |

## 10. Candidate Review Policy

Generated candidates are never silently sent to simulation.

The candidate review state must allow:

- edit candidate text.
- delete candidate.
- add candidate.
- see why each candidate exists.
- proceed only with 2-10 candidates.

Candidate card should show:

```text
Headline text
Angle: outcome / pain relief / automation / differentiation / trust
Why: short rationale
```

## 11. Routing Ambiguity Policy

Some goals map to multiple simulations.

Example:

```text
새 제품의 상세페이지 문구와 가격을 같이 보고 싶어요.
```

Policy:

- If one simulation is clearly primary and the second is downstream, start with primary and mention next step.
- If two simulations are equally likely, ask the user to choose the decision priority.
- Do not auto-run multiple simulations in v1.

Decision priority examples:

| User goal | Suggested first simulation |
| --- | --- |
| "문구와 가격을 같이 보고 싶어요" | Ask: "먼저 문구 반응을 볼까요, 가격대를 볼까요?" |
| "상세페이지 헤드라인 만들고 싶어요" | `creative_testing` |
| "우리 제품 장점을 어떻게 말해야 할지 모르겠어요" | `value_proposition` first, then `creative_testing` |
| "캠페인 채널과 메시지 조합" | `campaign_strategy` |

## 12. Stop Asking Policy

The assistant should stop collecting and proceed when:

- all critical slots are present.
- recommended coverage is sufficient or user has skipped.
- candidate options are valid.
- high-impact assumptions have been shown.
- payload validation passes.

Recommended threshold:

```text
critical coverage = 100%
recommended coverage >= 45%
candidate validity = pass
high-impact assumption review = pass
```

## 13. Error and Repair Policy

If user input fails validation:

- explain only the actionable issue.
- preserve existing valid inputs.
- show a repair form or targeted question.

Examples:

| Error | Response |
| --- | --- |
| 1 candidate only | "비교하려면 최소 2개 후보가 필요합니다. 하나 더 직접 쓰거나 제가 만들어드릴게요." |
| 12 candidates | "최대 10개까지 비교할 수 있습니다. 10개로 줄여주세요." |
| invalid price | "가격 후보는 숫자로 입력해야 합니다." |
| no product | "먼저 어떤 제품/서비스인지 알려주세요." |

## 14. Tone Policy

The assistant should sound like a practical strategist:

- short.
- specific.
- low-friction.
- not over-explanatory.
- does not expose internal terms.

Good:

```text
좋습니다. 제품 설명은 충분합니다. 핵심 고객을 1개만 적어도 후보를 만들 수 있어요.
```

Bad:

```text
현재 critical slot product_description의 coverage가 충족되었으며 recommended slot target_customers가 부족합니다.
```

## 15. Result Handoff Policy

Before starting the run, show a concise run summary:

```text
이렇게 시뮬레이션합니다.
- 목적: 상세페이지 헤드라인 비교
- 제품: 블로그 작성 윈도우 프로그램
- 후보: 4개
- 핵심 고객: 사용자 입력 1개 + AI 가정 2개
- 표본: 200명
```

This summary reduces surprise and prepares the report provenance.

## 16. Mobile Policy

On mobile:

- forms should become single-column.
- candidate cards should stack.
- long generated text should wrap and remain editable.
- primary action should stay visible after card list.

Do not rely on wide tables or multi-column candidate comparison in the intake flow.

## 17. Production Trust Policy

The assistant must not say:

- "시장 반응을 정확히 예측합니다."
- "이 결과가 실제 구매를 보장합니다."
- "반드시 이 카피를 쓰세요."

It can say:

- "이 입력과 가정으로 합성 페르소나 반응을 비교합니다."
- "결과는 실제 시장조사를 대체하지 않는 의사결정 보조 자료입니다."
- "보고서에서 표본, 가정, 한계를 함께 보여드리겠습니다."
