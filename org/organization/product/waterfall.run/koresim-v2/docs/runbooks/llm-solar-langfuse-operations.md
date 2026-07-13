---
title: Solar Pro and Langfuse Operations Runbook
type: runbook
tags: [llm, solar, upstage, litellm, langfuse, observability]
created: 2026-07-13
updated: 2026-07-13
status: live-validated
related: [[../design/llm-gateway-orchestration]], [[../execution/ai-system-hardening-solar-v1]], [[../design/data-governance-and-io-boundary]]
---

# Solar Pro and Langfuse Operations Runbook

## 1. Current Operating State

| 항목 | AS-IS | TO-BE |
| --- | --- | --- |
| live backend | Upstage direct (`LLM_BACKEND=upstage`) | 유지 및 canary monitoring |
| target model | `solar-pro2`; live 10/50/200 통과 | 품질·비용 benchmark 지속 |
| Solar credential | ignored local `.env`에 설치 | secret manager 또는 local `.env`에만 유지 |
| local fallback | 과거 Ollama 검증 기록 존재 | 운영 fallback 없음; Ollama backend 비지원 |
| tracing | Langfuse metadata-only | 동일 정책 + latency/usage/retry metadata |

Solar 코드, 설정, 자격증명, 격리 10명 및 production external MCP 10/50/200
검증이 통과했다. Gemini는 명시적 rollback 경로이며 자동 fallback은 없다.

## 2. Required Secrets

실제 값은 local `.env`, shell environment, 또는 secret manager에만 둔다.

```bash
UPSTAGE_API_KEY=...
LANGFUSE_PUBLIC_KEY=...
LANGFUSE_SECRET_KEY=...
LANGFUSE_HOST=https://cloud.langfuse.com
```

키 값, authorization header, `.env`, Cloudflare credential을 코드·문서·로그·
frontend bundle·git에 남기지 않는다.

## 3. Direct Upstage Target Configuration

```bash
LLM_BACKEND=upstage
UPSTAGE_BASE_URL=https://api.upstage.ai/v1
UPSTAGE_MODEL=solar-pro2
MODEL_PERSONA_DEFAULT=solar-pro2
MODEL_PERSONA_STRONG=solar-pro2
MODEL_ANALYSIS_DEFAULT=solar-pro2
MODEL_REPORT_DEFAULT=solar-pro2
MODEL_REPAIR_DEFAULT=solar-pro2
ENABLE_LLM_AGENTS=true
ENABLE_LANGGRAPH=true
LLM_TRACE_MODE=metadata_only
OBSERVABILITY_PROVIDER=langfuse
```

Direct mode is the simplest production target. Product code still uses the
internal `LLMClient`; simulation modules never import the Upstage SDK.

## 4. Optional LiteLLM Mode

Use this only when the proxy is intentionally operated:

```bash
LLM_BACKEND=litellm
LLM_GATEWAY_BASE_URL=http://127.0.0.1:4000/v1
LLM_GATEWAY_API_KEY=...
MODEL_PERSONA_DEFAULT=koresim/solar-persona
MODEL_PERSONA_STRONG=koresim/solar-persona
MODEL_ANALYSIS_DEFAULT=koresim/solar-analysis
MODEL_REPORT_DEFAULT=koresim/solar-report
MODEL_REPAIR_DEFAULT=koresim/solar-repair
```

`litellm.config.yaml` must contain only the `koresim/solar-*` aliases for the
current provider policy. Message logging remains disabled. Ollama aliases must
not be reintroduced as an implicit fallback.

## 5. Validation Sequence

### Credential preflight

```bash
test -n "$UPSTAGE_API_KEY"
```

이 명령은 값 자체를 출력하지 않는다. 실패하면 여기서 중단한다.

### Isolated smoke

Production Redis/SQLite와 분리된 서버로 먼저 확인한다:

```bash
UPSTAGE_API_KEY="$UPSTAGE_API_KEY" uv run python scripts/run_local_upstage_e2e.py
```

`http://127.0.0.1:8099/app`에서 1–10 persona 실행을 확인한다. 평가 항목:

- run completion and parse success;
- resolved provider/model;
- latency and retry metadata;
- Analysis → Report → QA node completion;
- QA severity, fallback mode, `review_required`;
- Langfuse에 prompt/persona 본문이 없는지.

### Repository gate

```bash
uv run python scripts/verify.py
```

### Live activation

`.env`에 secret과 Upstage 설정을 넣은 후:

```bash
npm --prefix frontend run build
launchctl kickstart -k gui/$(id -u)/com.koresim.api
launchctl kickstart -k gui/$(id -u)/com.koresim.worker
uv run python scripts/check_mac_studio_production.py --external --timeout-seconds 15
```

이후 실제 실행은 10 → 50 → 200 persona 순서로 올린다. 각 단계에서 completion,
parse failure, latency, token usage/cost, agent QA를 기록한다.

## 6. Rollback

Solar activation 뒤 provider 장애가 발생하면 이미 검증된 Gemini 자격증명이
유효한 경우에만 명시적으로 다음 설정으로 되돌린다:

```bash
LLM_BACKEND=gemini
GEMINI_MODEL=gemini-3-flash-preview
```

API와 worker를 재시작하고 readiness를 다시 실행한다. 미지원 backend나 Ollama로
자동 fallback하지 않는다. 실패 이유와 실제 provider는 결과/운영 로그에 남긴다.

## 7. Data-Governance Rules

- raw persona UUID/full row는 외부 provider나 Langfuse로 보내지 않는다.
- protected product storage의 `raw_results`와 외부 trace 정책을 분리한다.
- `safe_intake_summary`만 result agents의 intake context로 허용한다.
- `LLM_TRACE_MODE=metadata_only`에서는 prompt와 response content를 기록하지 않는다.
- sampled/full trace는 데이터 정책 승인과 특정 run 승인이 모두 있을 때만 사용한다.

## 8. Interactive LLM Controls

후보 생성, 프로젝트 follow-up, 인터뷰 메시지는 사용자별 시간당 action quota를
공유 정책으로 소비한다. follow-up/interview가 다시 읽는 persona 표본에도 별도
상한을 둔다. HTTP 429 `INTERACTIVE_RATE_LIMITED`는 정상적인 보호 응답이며 UI가
재시도 폭주를 만들면 안 된다.

## 9. Release Blockers

- Upstage key가 없거나 secret이 로그/파일에 노출됨.
- 10-person smoke가 완료되지 않음.
- parse success/completion이 evaluation threshold 미만.
- agent fallback/QA fail이 정상 성공처럼 숨겨짐.
- public health가 provider URL, filesystem path, model detail을 노출함.
- Langfuse metadata-only trace에 prompt/persona/raw result가 포함됨.
- `uv run python scripts/verify.py` 실패.

## 10. Validation Log

- 2026-07-13: Solar direct adapter, strict backend/alias routing, Solar LiteLLM
  aliases, metadata-only telemetry, and provider-aware production check are
  implemented and covered by deterministic tests.
- 2026-07-13: `UPSTAGE_API_KEY` is not present in the current runtime; live Solar
  activation remains intentionally pending.
- 2026-07-13: rotated credential was installed only in the ignored local `.env`;
  no provider-key pattern was found in the repository scan outside secret/generated
  paths.
- 2026-07-13: isolated run `901bbb2f-4f18-4f6b-b602-56b181025123` completed with
  `upstage` / `solar-pro2`, 10 responses, 0 parse failures, and LLM-backed
  Analysis/Report/QA nodes. Quality grade B and directional-only review warnings
  remained visible.
- 2026-07-13: `uv run python scripts/verify.py` passed with 205 tests, 89.30%
  backend coverage, and frontend lint/typecheck/production build.
- 2026-07-13: production readiness reported `upstage` / `solar-pro2`. External
  MCP run `1bff6a38-b126-42ad-becd-fb5935712201` passed 10/10 with 0 parse
  failures; run `bef71b41-fb64-4c55-9181-bb359c35de3a` passed 50/50 with 0.
- 2026-07-13: run `68a6d391-fcad-4c67-ba5e-f2738c562550` completed 200 responses
  but 43 were provider rate-limit errors. All 157 provider successes contained the
  required choice label. Immediate retry was replaced with provider-header-aware,
  bounded exponential backoff; final 200-person rerun remains required.
- 2026-07-13: backoff build deployed and readiness passed. External MCP rerun
  `fb6a4ced-4d9f-4658-82b8-fb9c70432643` completed 200/200 with 0 parse failures,
  quality A, 8 recovered retries, no warnings, and Upstage LLM Analysis/Report/QA.
  The ordered 10 → 50 → 200 live gate is complete. Artifact:
  `docs/verification/solar-pro2-external-mcp-live-gate-2026-07-13.json`.

실제 Solar 명령/API/browser 검증이 통과하기 전에는 live 항목을 완료 처리하지 않는다.
