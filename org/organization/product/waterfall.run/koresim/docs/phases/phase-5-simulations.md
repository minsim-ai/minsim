---
title: Phase 5 — Simulation Expansion Design and Rollout
type: phase-plan
tags: [phase-5, simulations, api, result-schema, rollout]
created: 2026-04-30
updated: 2026-05-03
status: implementation-complete-deterministic-gated
related: [[CLAUDE]], [[README]], [[functional/overview]], [[../execution/phase-5-simulation-framework-price-optimization]]
---

# Phase 5 — Simulation Expansion Design and Rollout

## Execution Plan

- [[../execution/phase-5-simulation-framework-price-optimization]]

## Goal

1. Creative Testing 외 8개 시뮬레이션을 React+FastAPI 구조에 맞게 확장한다.
2. 8개를 한 번에 구현하지 않고, Price Optimization을 reference implementation으로 먼저 완성한다.
3. 공통 API contract, result schema, persistence, visualization pattern을 고정한 뒤 나머지 기능으로 복제한다.

## Principle

Phase 5는 단순 기능 추가가 아니라 product surface 확장이다. 따라서 각 시뮬레이션은 아래 5가지를 모두 갖춰야 출시로 본다.

- backend simulation module
- API input/output schema
- SQLite persistence compatibility
- React input form or preset flow
- result visualization and trust layer

## Simulation Rollout Order

### 5.0 Common Simulation Framework

먼저 모든 시뮬레이션이 공유할 계약을 고정한다.

- [x] `simulation_type` enum 정의
- [x] 공통 request schema 정의
- [x] 공통 result envelope 정의
- [x] simulation registry 도입
- [x] result renderer registry 도입
- [x] preset schema 도입
- [x] shared quality/sample summary builder 도입

### 5.1 Price Optimization — Reference Implementation

우선순위: ★★★★★

Business question:

> 이 제품의 최적 가격대는 어디인가?

Input:

- product name
- product description
- 4~6 price options by default
- 3 price options allowed for simple demo presets such as Coffee Price
- optional competitor/context note
- target filter
- sample size
- seed

Persona question:

```text
다음 제품을 아래 가격에 구매할 의향이 있습니까?

제품: {product}
가격: {price}

답변 형식:
의향: 구매/관망/거부
이유: 한 문장
지불의향가격: 숫자 또는 모름
```

Output:

- demand by price
- purchase/watch/reject distribution
- recommended price
- estimated elasticity
- segment breakdown
- top rejection reasons
- raw persona responses

React visualization:

- price-demand curve
- conversion table
- segment bars
- selected persona quotes
- trust layer

Done:

- [x] 50명 deterministic worker/API contract run completes locally
- [x] 200명 deterministic worker/API contract run completes locally
- [x] result can be restored after refresh through the common result envelope
- [x] Coffee preset uses real Price Optimization, not fallback Creative Testing

### 5.2 Product Launch

우선순위: ★★★★

Business question:

> 이 신제품은 어느 고객군에서 출시 반응이 좋은가?

Input:

- product concept
- key features
- target use case
- expected price range
- alternatives or competitors

Output:

- purchase intent score distribution
- average score
- high-intent segments
- rejection reason clusters
- suggested positioning angle

### 5.3 Value Proposition

우선순위: ★★★★

Business question:

> 어떤 가치 제안 문장이 가장 설득력 있는가?

Input:

- 2~5 value proposition statements
- product/category context
- target filter

Output:

- preference ranking
- persuasiveness score
- clarity score
- emotional resonance notes
- segment breakdown

### 5.4 Market Segmentation

우선순위: ★★★

Business question:

> 이 시장 안에는 어떤 니즈 기반 세그먼트가 있는가?

Input:

- category
- product family
- core question list
- target filter

Output:

- 5~8 segment candidates
- segment size estimate
- needs/pains/jobs
- representative persona quotes
- recommended first target

Implementation path:

1. Start with LLM-coded labels from structured responses.
2. Add embeddings/KMeans only after labels are unstable or too repetitive.

### 5.5 Competitive Positioning

우선순위: ★★★

Business question:

> 우리 제품은 경쟁사 대비 어떤 인식 위치에 있는가?

Input:

- our product
- 2~4 competitors
- attributes to evaluate
- category context

Output:

- preference share
- attribute score matrix
- positioning map data
- strengths and weaknesses
- segment-specific competitor preference

### 5.6 Brand Perception

우선순위: ★★

Business question:

> 현재 브랜드 이미지는 어떻게 인식되는가?

Input:

- brand name
- category
- optional campaign/context
- attributes to test

Output:

- awareness/familiarity proxy
- association keywords
- attribute scores
- positive/negative perception themes

Limit:

- Without time-series or external survey data, this is current perception simulation, not true tracking.

### 5.7 Churn Prediction

우선순위: ★★

Business question:

> 어떤 고객군이 이탈할 가능성이 높고 이유는 무엇인가?

Input:

- service description
- customer situation
- pain points or recent changes
- retention offers

Output:

- churn intent distribution
- high-risk segments
- churn reason clusters
- retention message recommendations

### 5.8 Campaign Strategy

우선순위: ★★

Business question:

> 어떤 채널과 메시지 조합이 가장 효과적인가?

Input:

- channels
- messages
- budget/context assumptions
- target filter

Output:

- best channel-message combinations
- response matrix
- segment fit
- qualitative rationale

Limit:

- ROI and viral score must be labeled as modeled assumptions unless external benchmark data is supplied.

## Common API Design

```ts
type SimulationType =
  | "creative_testing"
  | "price_optimization"
  | "product_launch"
  | "value_proposition"
  | "market_segmentation"
  | "competitive_positioning"
  | "brand_perception"
  | "churn_prediction"
  | "campaign_strategy";
```

```json
{
  "simulation_type": "price_optimization",
  "input": {},
  "sample_size": 200,
  "target_filter": {},
  "seed": 42
}
```

## Common Result Envelope

```json
{
  "run_id": "uuid",
  "simulation_type": "price_optimization",
  "status": "completed",
  "seed": 42,
  "sample_size": 200,
  "total_responses": 198,
  "parse_failed": 2,
  "target_filter": {},
  "sample_summary": {},
  "quality": {},
  "warnings": [],
  "metrics": {},
  "segments": {},
  "insights": [],
  "raw_results": []
}
```

Raw result policy:

- MVP returns full `raw_results` for transparency and future persona explorer behavior.
- Do not remove persona columns prematurely just because current UI does not use them.
- Exclude only operational secrets, API keys, internal stack traces, and explicitly internal prompts.

## Design Questions To Resolve Before 5.1

{ 질문: result schema에서 시뮬레이션별 데이터는 어디에 둘까요?
선택지3: A. 모든 필드를 top-level에 둔다 / B. 공통 필드는 top-level, 고유 데이터는 `metrics`에 둔다 / C. 시뮬레이션마다 완전히 다른 schema를 둔다
추천안: B. React renderer와 persistence가 단순해지고, 각 시뮬레이션의 자유도도 유지됩니다. }

{ 질문: Phase 5 React 입력 UI는 어떻게 만들까요?
선택지3: A. 시뮬레이션마다 별도 페이지 / B. 공통 shell + simulation-specific form component / C. 채팅형 입력만 사용
추천안: B. 현재 React mock의 대화형 흐름은 유지하되, 실제 운영에는 명시적 form component가 필요합니다. }

{ 질문: Market Segmentation은 언제 embeddings를 넣을까요?
선택지3: A. 처음부터 embeddings/KMeans / B. LLM label 기반으로 먼저 구현 / C. 외부 설문 데이터 확보 후 구현
추천안: B. MVP 속도가 빠르고, 품질 문제가 드러났을 때 embeddings를 넣는 편이 낫습니다. }

{ 질문: ROI/바이럴 같은 추정 수치는 제공할까요?
선택지3: A. 제공하지 않음 / B. 제공하되 가정 기반으로 라벨링 / C. 외부 벤치마크 데이터 없으면 숨김
추천안: B. 데모 임팩트는 있지만, 결과 화면에서 “modeled assumption”으로 분명히 표시해야 합니다. }

## Validation

각 시뮬레이션 출시 전:

- [x] unit/smoke test with 10 personas
- [x] deterministic worker/API contract run with 50 personas
- [x] deterministic worker/API contract run with 200 personas
- [x] live external run through `arabesque.cc` with 200 personas
- [x] persisted result restore after refresh
- [x] result trust layer visible
- [x] preset exists
- [x] CLAUDE.md 해당 task 갱신

## Done Definition

Phase 5 전체 완료:

- [x] 9개 simulation type이 registry에 등록되어 있다.
- [x] 9개 모두 API/RQ worker path로 실행 가능하다.
- [x] 9개 모두 React에서 실행 및 결과 확인 가능하다.
- [x] 각 시뮬레이션마다 preset이 1개 이상 있다.
- [x] 공통 result envelope와 trust layer가 모든 결과에 적용되어 있다.
- [x] 통합 demo flow에서 최소 5개 simulation을 연속으로 보여줄 수 있다.

## Risks

| 리스크 | 가능성 | 완화 방안 |
| --- | --- | --- |
| 8개를 동시에 설계하다 구현 지연 | 높음 | 5.1 Price Optimization만 먼저 reference implementation |
| simulation별 결과 구조가 갈라짐 | 높음 | 공통 envelope + renderer registry |
| LLM parsing 실패 증가 | 중 | schema-specific parser와 parse warning 표시 |
| 결과 수치가 과학적으로 보이는 위험 | 중 | quality/disclaimer/modeling assumptions 표시 |
| React UI가 mock 중심으로 다시 drift | 높음 | Phase 6 design sync 절차 적용 |

## Out of Scope

- 멀티테넌트 고객 계정
- 자동 PDF/Excel 리포트
- 외부 설문 데이터 자동 수집
- 완전한 causal inference

## Completion Evidence

- 2026-05-03: common simulation framework implemented with `src/simulations/common.py` and `src/simulations/registry.py`.
- 2026-05-03: all 9 simulation types have input schemas, presets, worker execution, common envelopes, quality/sample summary fields, and React result renderer registry support.
- 2026-05-03: deterministic 50/200-person validation passed for every preset and wrote `docs/verification/phase-5-phase-7-deterministic-validation.json`.
- 2026-05-03: live 200-person external validation passed for all 9 simulations through `https://arabesque.cc/api/runs`, producing 1,800 persona responses with no failed runs. Artifact: `docs/verification/external-gemini-9-simulations-200-2026-05-03.json`.
