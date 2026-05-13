---
title: Data Governance and I/O Boundary
type: design-doc
tags: [data-governance, io-boundary, raw-results, persona, llm, observability]
created: 2026-05-02
updated: 2026-05-03
status: active
related: [[harness-engineering-controls]], [[react-fastapi-migration]], [[llm-gateway-orchestration]], [[../data-spec]], [[../execution/gate-1A-contracts-scaffold]], [[../phases/phase-4-demo-content]]
---

# Data Governance and I/O Boundary

## 1. Purpose

This document defines how KoreaSim classifies, stores, returns, logs, traces, and sends data across boundaries.

Core rule:

> Product result storage and third-party observability/provider payloads are separate policies.

KoreaSim may store full synthetic `raw_results` in its own protected result store for MVP transparency. That does not mean full persona rows, prompts, responses, or hidden instructions can be sent to third-party observability tools or external model providers by default.

## 2. Source Dataset

Dataset:

- `nvidia/Nemotron-Personas-Korea`
- Project data spec: [[../data-spec]]
- Official source: https://huggingface.co/datasets/nvidia/Nemotron-Personas-Korea
- License shown by project docs and Hugging Face as of 2026-05-02: CC BY 4.0

Required implication:

- [x] KoreaSim surfaces should provide attribution to `NVIDIA Nemotron-Personas-Korea`.
- [x] Public/enterprise demo copy should not imply that synthetic personas are real people.
- [x] Any redistribution/export of dataset-derived persona rows must preserve attribution and comply with CC BY 4.0.

Resolved MVP product checks:

- [x] Exact attribution text for the demo: `Persona dataset: NVIDIA Nemotron-Personas-Korea, CC BY 4.0.`
- [x] Full raw persona rows remain in protected product results and UI inspection, not in customer export.
- [x] External provider transfer policy is purpose-specific prompt views with no persona `uuid`; Langfuse remains metadata-only by default.

Open legal/product checks:

- [ ] Legal review of dataset-derived exports before a paid customer export/share feature.
- [ ] Production retention period for customer account data.

## 3. Data Classes

| Class | Examples | Default exposure | Storage | Third-party trace default |
| --- | --- | --- | --- | --- |
| Public marketing content | landing copy, demo explanation, contact CTA | Public | git/frontend | Allowed |
| Public attribution | dataset name, license, source link | Public | git/frontend | Allowed |
| Protected app input | simulation type, creatives, target filter, sample size, seed | Protected | SQLite run input | Metadata only |
| Preset input | demo preset id, title, input, target filter | Protected app; some summary can be public | backend preset source | Metadata only |
| Persona identifier | `uuid` | Protected result only | SQLite result/raw | Do not trace by default |
| Persona demographic fields | age, sex, province, district, occupation, education | Protected result; may be used in prompts | SQLite result/raw | Summary only |
| Persona narrative fields | `persona`, `professional_persona`, `family_persona`, etc. | Protected result; may be used in prompts | SQLite result/raw | Do not trace by default |
| User-provided business context | creative text, product description, customer context | Protected | SQLite run input/result | Do not trace content by default |
| Prompt content | system prompt, user prompt, hidden instruction | Internal | not returned by API | Do not trace by default |
| Provider response | raw LLM output, parsed persona response | Protected result | SQLite result/raw | Metadata only |
| Aggregated metrics | preference counts, segment tables, quality scores | Protected result; selected marketing examples can be public | SQLite result | Metadata or public if anonymized |
| Error detail | safe code/message/details | Protected API response | operation log | Safe code only |
| Stack trace | exception traceback | Internal only | local operation log if needed | Never |
| Secret | API key, Cloudflare token, LiteLLM key, Langfuse secret | Never output | env/secret manager | Never |
| Operation log | worker lifecycle, retries, local errors | Internal | local file/SQLite later | Metadata only |
| Audit log | actor, protected action, export/share | Internal/protected | audit store later | Metadata only |

## 4. Boundary Rules

### 4.1 Public Root

Allowed at `arabesque.cc/`:

- [ ] KoreaSim description.
- [ ] Demo explanation.
- [ ] Contact CTA.
- [ ] Dataset attribution and license/source link.
- [ ] High-level claims about synthetic personas.

Forbidden at public root:

- [ ] run ids.
- [ ] protected API result data.
- [ ] raw persona rows.
- [ ] raw LLM responses.
- [ ] internal prompts.
- [ ] provider/model credentials.

### 4.2 Protected App and API

Allowed under `/app*`, `/results*`, `/api*` after Cloudflare Access:

- [ ] run creation request.
- [ ] run status/events.
- [ ] full result envelope.
- [ ] full `raw_results` for local MVP transparency.
- [ ] sample summary and quality details.

Still forbidden:

- [ ] API keys.
- [ ] provider raw auth details.
- [ ] internal stack traces.
- [ ] hidden system prompts.
- [ ] unrelated local file paths beyond safe diagnostics.

### 4.3 SQLite Product Store

Allowed:

- [ ] run input.
- [ ] run status.
- [ ] run events.
- [ ] partial results.
- [ ] final result envelope.
- [ ] full synthetic persona fields in `raw_results`.
- [ ] raw provider response text for result inspection.
- [ ] provider metadata: `llm_backend`, `model_alias`, `provider`, `provider_model`, `trace_id`.

Not allowed:

- [ ] provider API keys.
- [ ] Cloudflare credentials.
- [ ] Langfuse secret keys.
- [ ] stack traces as user-facing result fields.
- [ ] hidden prompts inside result envelope.

Retention:

- Local MVP retention is indefinite by current product decision.
- Demo JSON export excludes `raw_results` and sets `human_review_required=true`.
- A production retention policy must be defined before customer account, organization, billing, or externally shared report workflows.

### 4.4 Operation Logs

Allowed:

- [ ] timestamp.
- [ ] run id.
- [ ] status transition.
- [ ] error code.
- [ ] safe error message.
- [ ] worker id/process id if useful.
- [ ] retry/fallback metadata.
- [ ] provider/model alias.
- [ ] latency/token/cost estimate.

Avoid by default:

- [ ] full persona row.
- [ ] full prompt.
- [ ] full LLM response.
- [ ] user-provided confidential context.

Forbidden:

- [ ] secrets.
- [ ] provider raw auth headers.

### 4.5 Audit Logs

Audit logs are not required in the public demo, but the schema should leave room for them.

Audit-worthy events:

- [ ] protected app access when actor identity is available.
- [ ] run created.
- [ ] result viewed.
- [x] export action returns a human-review report without raw persona rows.
- [ ] share action, when implemented.
- [ ] external provider run, when Phase 7 starts.
- [ ] admin/operator action, when implemented.

Fields:

- [ ] audit event id.
- [ ] timestamp.
- [ ] actor id/email if available from Cloudflare Access.
- [ ] action.
- [ ] run id if relevant.
- [ ] simulation type if relevant.
- [ ] trace id if relevant.
- [ ] safe metadata.

## 5. Prompt and Provider Transfer Policy

### 5.1 Local Ollama

For Phase 1 local path:

- [x] Ollama runs locally.
- [x] Persona prompt content may be sent to local Ollama.
- [x] No third-party provider receives persona prompt content.

### 5.2 External Providers Through LiteLLM

Before any GPT/Gemini provider run:

- [x] dataset/source license check completed for MVP demo purposes.
- [x] attribution requirement reflected in product UI/docs.
- [x] user-facing demo context avoids confidential customer data unless approved.
- [x] `LLM_TRACE_MODE=metadata_only` by default.
- [x] no prompt/persona payload is sent to Langfuse by default.
- [ ] provider terms/legal review for paid customer data.

Allowed prompt content after approval:

- [ ] purpose-specific persona view needed for response generation.
- [ ] simulation user prompt.
- [ ] minimal demographic fields required for the persona role.
- [ ] purpose-specific narrative fields selected by prompt builder.

Avoid in provider prompt where not necessary:

- [ ] `uuid`.
- [ ] full 26-column persona row.
- [ ] fields unused by the simulation purpose.
- [ ] internal run/store paths.
- [ ] hidden routing config.

Current prompt builder sends:

- age
- sex
- province and district
- occupation
- education level
- marital status
- family type
- housing type
- purpose-specific narrative fields

Policy recommendation:

- [x] Build prompts from purpose-specific persona fields, not arbitrary full persona dicts.
- [x] Keep `uuid` out of provider prompts unless a debugging mode explicitly requires it.
- [ ] Formalize the current prompt field subset as a named `PromptPersonaView` type before paid customer workflows.

## 6. Observability Policy

Trace payload modes:

| Mode | Meaning | Default? | Allowed before policy approval? |
| --- | --- | --- | --- |
| `metadata_only` | IDs, task type, model alias, provider, latency, token/cost, parse status, error code | Yes | Yes |
| `sampled_full` | Small sample of full prompt/response payloads | No | No |
| `full_local` | Full payloads in a local/self-hosted observability stack | No | Only local/dev with explicit config |

`metadata_only` may include:

- [ ] trace id.
- [ ] run id or hashed run id.
- [ ] simulation type.
- [ ] task type.
- [ ] model alias.
- [ ] provider and provider model.
- [ ] latency.
- [ ] token estimate.
- [ ] cost estimate.
- [ ] parse success/failure.
- [ ] safe error code.
- [ ] sample size.
- [ ] seed.

`metadata_only` must not include:

- [ ] full prompt.
- [ ] persona narrative.
- [ ] full raw result.
- [ ] creative text if customer-confidential.
- [ ] API keys.
- [ ] stack traces.

## 7. API Field Policy

### `RunCreateRequest`

Allowed:

- `simulation_type`
- `input`
- `sample_size`
- `target_filter`
- `seed`
- `model_alias`

Rules:

- [ ] Validate shape before enqueue.
- [ ] Store protected input in SQLite.
- [ ] Do not log full `input` to third-party observability by default.

### `RunSnapshot`

Allowed:

- [ ] status/progress fields.
- [ ] safe `ErrorResponse`.
- [ ] result availability.

Rules:

- [ ] No raw persona data.
- [ ] No prompt content.

### `RunResultEnvelope`

Allowed:

- [ ] full result metadata.
- [ ] quality.
- [ ] warnings.
- [ ] metrics.
- [ ] segments.
- [ ] insights.
- [ ] full `raw_results`.
- [ ] provider/trace metadata.

Rules:

- [ ] Keep evidence and narrative separate.
- [ ] Keep provider metadata but not provider secrets.
- [ ] Preserve `seed` and target filter for reproducibility.

### `RawPersonaResult`

Allowed:

- [ ] `uuid`
- [ ] `persona`
- [ ] `response`
- [ ] `parsed`
- [ ] `error`

Rules:

- [ ] `persona` can include full synthetic persona fields in product storage/result response.
- [ ] `response` is protected result data.
- [ ] `error` must be safe; do not include stack traces or credentials.
- [ ] Do not add `system_prompt`, `hidden_prompt`, or provider auth metadata.

### `ErrorResponse`

Allowed:

- [ ] `code`
- [ ] `message`
- [ ] `details`

Rules:

- [ ] `code` should be stable and specific.
- [ ] `message` should be useful to React and operator debugging.
- [ ] `details` must be safe and structured.
- [ ] No stack traces or secrets.

## 8. Attribution and Trust UI

Required attribution surfaces:

- [ ] public landing footer or trust section.
- [ ] result trust layer or data source detail.
- [ ] documentation/README.

Recommended attribution text:

```text
Persona dataset: NVIDIA Nemotron-Personas-Korea, CC BY 4.0.
```

Trust copy must say:

- [ ] personas are synthetic.
- [ ] results are directional simulation outputs.
- [ ] results are not actual survey responses.
- [ ] seed/sample/model metadata are available for reproducibility.

Trust copy must not say:

- [ ] "real customers said".
- [ ] "market proof".
- [ ] "guaranteed demand".
- [ ] "statistically representative" unless the sampling and methodology support that exact claim.

## 9. Gate Mapping

### Gate 1A

- [ ] Keep `RawPersonaResult` full but safe.
- [ ] Add provider/trace metadata fields.
- [ ] Add safe `ErrorResponse`.
- [ ] Define error/event taxonomy.
- [ ] Add tests that raw persona dict is accepted and errors do not require stack traces.

### Gate 1C/1D

- [ ] Store full raw result in SQLite.
- [ ] Store safe operation events.
- [ ] Do not persist prompts as result fields.
- [ ] Add deterministic seed/sample verification.

### Gate 1E

- [ ] React result view treats raw results as protected data.
- [ ] Avoid rendering huge raw result lists by default if it hurts UX.
- [ ] Do not expose raw data through public root.

### Phase 4

- [ ] Add dataset attribution to trust layer.
- [ ] Add synthetic-persona disclaimer.
- [ ] Remove or qualify claims that imply real survey/statistical certainty.

### Phase 7

- [ ] Add `PromptPersonaView`.
- [ ] Keep external provider transfer minimal and purpose-specific.
- [ ] Keep Langfuse `metadata_only` default.
- [ ] Approve any `sampled_full` tracing separately.

## 10. Resolved Decisions

{ 결정: 외부 GPT/Gemini 호출 시 provider prompt에 persona `uuid`를 포함하지 않는다.
이유: provider prompt에는 `uuid`가 필요 없습니다. 결과 매핑은 내부 run state에서 처리하는 편이 안전합니다. }

{ 결정: MVP에서는 full raw persona export를 보류하고 protected product UI에서 inspect만 허용한다.
이유: local MVP에는 full raw 결과를 저장/표시하되, 재배포/attribution/민감 사용 정책이 정리되기 전까지 export는 보류하는 편이 안전합니다. }

{ 결정: Langfuse `sampled_full` trace는 기본 금지하며, 별도 승인 후 특정 run에서만 허용한다.
이유: 외부 관측성에 prompt/persona payload가 흘러가는 것을 기본 차단해야 합니다. }
