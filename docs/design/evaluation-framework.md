---
title: Evaluation Framework
type: design-doc
tags: [evaluation, testing, quality, llm, harness, phase-1, phase-7]
created: 2026-05-02
updated: 2026-05-02
status: draft
related: [[harness-engineering-controls]], [[data-governance-and-io-boundary]], [[react-fastapi-migration]], [[llm-gateway-orchestration]], [[../functional/quality-and-trust]], [[../execution/gate-1A-contracts-scaffold]]
---

# Evaluation Framework

## 1. Purpose

This document defines the minimum evaluation framework for KoreaSim.

The evaluation framework is not the same as unit tests:

- Unit tests prove code behavior.
- Integration tests prove components connect.
- Evaluations prove simulation/result quality stays within acceptable bounds.

Initial goal:

- Keep Gate 1A lightweight with schema/import tests.
- Add deterministic eval fixtures before real worker integration.
- Add live local run evaluations before external demo validation.
- Add provider comparison evals before Phase 7 external GPT/Gemini runs.

## 2. Evaluation Layers

| Layer | Purpose | Deterministic? | First gate |
| --- | --- | --- | --- |
| Contract tests | Schema, enum, error shape, TypeScript type compatibility | Yes | Gate 1A |
| Import/layer tests | Package boundary and import smoke | Yes | Gate 1A |
| Fixture aggregation eval | Parser and aggregation invariants using fixed responses | Yes | Gate 1D |
| Sampling eval | Seed repeatability and target filter behavior | Yes | Gate 1D |
| Live local run eval | Ollama end-to-end quality smoke | No | Gate 1D/1F |
| API lifecycle eval | POST/status/events/result lifecycle | Mostly | Gate 1C/1E |
| UI trust eval | Result page shows quality, limitations, attribution | Mostly | Phase 4 |
| Provider comparison eval | Ollama vs GPT/Gemini parse/latency/cost/quality | No | Phase 7 |
| Report grounding eval | Narrative does not invent metrics or unsupported claims | Mostly | Phase 7 |

## 3. Gate 1A Minimum

Gate 1A remains contract/scaffold-only.

Required checks:

- [ ] `RunCreateRequest` accepts a valid Creative Testing request.
- [ ] `seed` defaults to `42`.
- [ ] `sample_size > 50` fails.
- [ ] invalid creative list fails.
- [ ] invalid age range fails.
- [ ] `RunStatus` includes `queued`, `running`, `completed`, `failed`, `canceled`, `interrupted`.
- [ ] `RunEventType` includes the initial event taxonomy.
- [ ] `ErrorResponse` accepts `code`, `message`, and safe structured `details`.
- [ ] `RawPersonaResult` accepts full synthetic persona dict.
- [ ] `RunResultEnvelope` keeps `quality`, `warnings`, `metrics`, `segments`, `insights`, and `raw_results` separate.
- [ ] LLM boundary imports.
- [ ] LangGraph scaffold imports and is disabled by default.

Pass command:

```bash
uv run pytest tests/test_api_schemas.py tests/test_imports.py
cd frontend && npm run typecheck
```

## 4. Deterministic Fixture Evals

Deterministic fixture evals should not call Ollama or external providers.

### 4.1 Creative Testing Parser Fixture

Fixture name:

- `creative_testing_parser_fixture_10`

Shape:

- [x] 10 synthetic persona dicts with required fields.
- [x] 10 fixed response strings.
- [x] at least 8 valid `선택: A/B/C...` responses.
- [x] at least 1 malformed response.
- [x] at least 1 response with extra Korean prose.

Checks:

- [x] `total_responses == len(raw_results)`.
- [x] `parse_failed` equals expected malformed count.
- [x] `sum(choice_counts.values()) + parse_failed == total_responses`.
- [x] `choice_pct` is computed over valid parsed responses.
- [x] `reasons_by_choice` entries are trimmed and bounded.
- [x] age/sex/province breakdown counts do not exceed parsed valid response count.

### 4.2 Sampling Fixture

Fixture name:

- `persona_sampling_seed_fixture`

Checks:

- [ ] same filter + same seed returns the same persona uuid sequence.
- [ ] same filter + different seed can return a different sequence.
- [ ] impossible filter raises a known error path.
- [ ] `exclude_unemployed=True` excludes `occupation == "무직"`.
- [ ] district and province filters combine as AND.

### 4.3 Error Fixture

Fixture name:

- `known_error_paths`

Checks:

- [ ] invalid request maps to `INVALID_REQUEST`.
- [ ] unsupported executable simulation maps to `UNSUPPORTED_SIMULATION_TYPE`.
- [ ] no persona match maps to `NO_PERSONAS_MATCH_FILTER`.
- [ ] result before completion maps to `RESULT_NOT_READY`.
- [ ] API errors do not include stack traces or secrets.

## 5. Live Local Evals

Live local evals use local Ollama and are allowed to be slower and non-deterministic.

### 5.1 10-person local run

Purpose:

- prove the engine, prompt, parser, and aggregation still work end-to-end.

Pass criteria:

- [ ] run completes.
- [ ] `total_responses == 10`.
- [ ] parse success rate >= 80%.
- [ ] result envelope persists and can be fetched.
- [ ] no API secrets, stack traces, or hidden prompts appear in result JSON.

### 5.2 50-person local run

Purpose:

- prove the Phase 1 demo-size run is usable.

Pass criteria:

- [ ] run completes through RQ.
- [ ] `total_responses == 50`.
- [ ] parse success rate >= 85%.
- [ ] progress events are monotonic.
- [ ] final event is `completed` or a specific safe failure code.
- [ ] result shows sample summary, quality, warnings, and full raw results.

Warning threshold:

- parse success rate 80~84% can be accepted for local debugging but is not demo-ready.
- parse success rate below 80% blocks external validation.

## 6. API Lifecycle Evals

### 6.1 No-op worker lifecycle

First gate:

- Gate 1C

Checks:

- [ ] `POST /api/runs` returns immediately.
- [ ] initial status is `queued`.
- [ ] worker moves run to `running`.
- [ ] worker writes `completed`.
- [ ] status/result survives API restart.
- [ ] event log is replayable.

### 6.2 Real worker lifecycle

First gate:

- Gate 1D/1E

Checks:

- [ ] progress event `done_count` is monotonic.
- [ ] `progress_pct` never decreases.
- [ ] exactly one terminal event is written.
- [ ] failed run has safe `ErrorResponse`.
- [ ] interrupted run can be displayed without losing partial data.

## 7. Data Governance Evals

These checks enforce [[data-governance-and-io-boundary]].

### Product result storage

- [ ] full `RawPersonaResult.persona` is preserved in protected product result.
- [ ] `RawPersonaResult` does not contain `system_prompt`.
- [ ] `RawPersonaResult` does not contain provider credentials.
- [ ] error fields do not contain stack traces.

### Observability metadata-only mode

- [ ] trace metadata includes run/task/model/error fields.
- [ ] trace metadata does not include full prompt.
- [ ] trace metadata does not include persona narrative.
- [ ] trace metadata does not include full raw result.
- [ ] sampled/full trace modes require explicit config.

## 8. Report Grounding Evals

Phase 1 does not need a report agent, but Phase 7 does.

When report/analysis agents exist:

- [ ] every numeric claim in narrative appears in `metrics`, `segments`, `quality`, or `sample_summary`.
- [ ] causal claims are flagged unless backed by an explicit modeled assumption.
- [ ] result text includes sample size and limitation language.
- [ ] generated recommendations do not imply real survey proof.
- [ ] QA agent can return `pass`, `warn`, or `block`.

Suggested block conditions:

- invented numeric metric.
- "real customers said" style language.
- missing disclaimer in externally shared report.
- unsupported guarantee or demand forecast.

## 9. Provider Comparison Evals

First gate:

- Phase 7

Compare at least:

- local Ollama path.
- LiteLLM -> Ollama path.
- one external GPT or Gemini alias.

Metrics:

- [ ] completion rate.
- [ ] parse success rate.
- [ ] median latency per persona.
- [ ] total run latency.
- [ ] estimated cost.
- [ ] safe failure rate.
- [ ] report grounding pass/warn/block count.

Recommended comparison:

| Eval | Ollama local | LiteLLM -> Ollama | External provider |
| --- | --- | --- | --- |
| 10-person Creative Testing | required | required | required |
| 50-person Creative Testing | required | required | required before demo use |
| parser fixture | required | not needed | not needed |
| report grounding | later | later | required when report agent exists |

## 10. Eval Artifacts

Recommended files:

```text
tests/
  test_api_schemas.py
  test_imports.py
  test_creative_testing_aggregation.py
  test_sampling_seed.py
  test_data_governance.py
  fixtures/
    creative_testing_parser_fixture_10.json
    persona_sampling_fixture.json
```

Later:

```text
evals/
  run_creative_fixture_eval.py
  run_result_envelope_fixture_eval.py
  run_local_creative_eval.py
  compare_provider_aliases.py
  fixtures/
    creative_testing_10.json
    creative_testing_50.json
```

Do not block Gate 1A on creating the full `evals/` runner. Gate 1A only needs schema/import tests.

## 11. Completion Log Template

Every implementation gate that executes a live run should append a short completion log to the relevant execution plan:

```text
Date:
Gate:
Command:
Run id:
Sample size:
Model alias:
Provider:
Parse success:
Terminal status:
Known warnings:
Follow-up:
```

## 12. Resolved Decisions

{ 결정: live local eval 최소 parse success 기준은 10명 run >=80%, 50명 run >=85%로 둔다.
이유: Phase 1 로컬 모델은 변동성이 있으므로 너무 높게 잡으면 구현 gate가 불필요하게 막힙니다. 대신 외부 데모 전에는 50명 >=85%를 요구합니다. }

{ 결정: 기본 CI에서는 live Ollama eval을 돌리지 않고 deterministic fixture만 실행한다.
이유: 현재 로컬 모델과 데이터 파일 의존성이 강해서 기본 CI에 넣으면 불안정합니다. live eval은 수동/로컬 gate로 둡니다. }

{ 결정: Phase 7 provider 비교의 release blocker는 completion rate, parse success, data-governance violation 여부로 둔다.
이유: 초기에는 품질/안전 실패를 막고, latency/cost는 기준 수집 후 별도 budget gate로 올리는 편이 현실적입니다. }
