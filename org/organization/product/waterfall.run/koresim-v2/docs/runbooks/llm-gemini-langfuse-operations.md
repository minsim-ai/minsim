---
title: Gemini and Langfuse Operations Runbook (Historical)
type: runbook
tags: [llm, gemini, litellm, langfuse, observability]
created: 2026-05-03
updated: 2026-07-13
status: historical-superseded
related: [[../design/llm-gateway-orchestration]], [[../execution/phase-7-llm-gateway-orchestration]], [[../design/data-governance-and-io-boundary]]
---

# Gemini and Langfuse Operations Runbook

> [!IMPORTANT]
> 이 문서는 2026-05 Gemini/Ollama 검증 기록 보존용이다. 현재 운영 목표와
> 절차는 [[llm-solar-langfuse-operations]]를 따른다. Ollama는 더 이상 지원
> backend/fallback이 아니며, 현재 live Gemini는 Solar credential 준비 전의
> 명시적 임시 상태다.

## 1. Decisions

- First external LLM provider: Gemini API.
- First implementation path: direct Gemini OpenAI-compatible adapter behind KoreaSim `LLMClient`.
- LLM gateway target: LiteLLM Proxy.
- Observability: Langfuse.
- Trace payload default: `metadata_only`.
- Local fallback: Ollama.

## 2. Why Langfuse First

Langfuse is the best current fit for KoreaSim because:

- it integrates with LiteLLM callback flows.
- it is focused on LLM traces, datasets, evals, and prompt quality.
- it can support self-hosting later if data-governance requirements tighten.
- it lets KoreaSim keep product storage and observability payload policy separate.

Deferred alternatives:

- Helicone: useful as a lightweight LLM gateway/proxy observability layer, but overlaps with LiteLLM responsibilities.
- LangSmith: strong for LangGraph/LangChain debugging, but less provider-neutral as the first observability default.

## 3. Required Secrets

Real values belong only in local `.env`, shell environment, or a secret manager.

```bash
GEMINI_API_KEY=...
LANGFUSE_PUBLIC_KEY=...
LANGFUSE_SECRET_KEY=...
LANGFUSE_HOST=https://cloud.langfuse.com
```

Never commit real values.

## 4. KoreaSim Environment

Suggested local `.env` values:

```bash
LLM_BACKEND=gemini
GEMINI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/
GEMINI_MODEL=gemini-3-flash-preview
LLM_GATEWAY_BASE_URL=http://127.0.0.1:4000/v1
LLM_GATEWAY_API_KEY=
MODEL_PERSONA_DEFAULT=koresim/gemini-persona-strong
MODEL_PERSONA_STRONG=koresim/gemini-persona-strong
MODEL_ANALYSIS_DEFAULT=koresim/gemini-analysis
MODEL_REPORT_DEFAULT=koresim/gemini-report
MODEL_REPAIR_DEFAULT=koresim/gemini-repair
MODEL_LOCAL_FALLBACK=koresim/local-ollama
LLM_TRACE_MODE=metadata_only
OBSERVABILITY_PROVIDER=langfuse
```

Use `LLM_BACKEND=gemini` for the first external-provider smoke test. Switch to `LLM_BACKEND=litellm` after LiteLLM Proxy config is in place.

## 5. LiteLLM Config Sketch

Do not commit real keys in this config. Use environment interpolation. The project-local scaffold is:

```bash
set -a; source .env; set +a
uvx --from 'litellm[proxy]' --with 'langfuse<3' litellm --config litellm.config.yaml --port 4000
```

`langfuse<3` is required for the current LiteLLM callback integration; KoreaSim's own direct tracing uses the project dependency and can remain on Langfuse v3.

```yaml
model_list:
  - model_name: koresim/gemini-persona-strong
    litellm_params:
      model: gemini/gemini-2.5-flash
      api_key: os.environ/GEMINI_API_KEY
  - model_name: koresim/gemini-analysis
    litellm_params:
      model: gemini/gemini-2.5-pro
      api_key: os.environ/GEMINI_API_KEY
  - model_name: koresim/gemini-report
    litellm_params:
      model: gemini/gemini-2.5-pro
      api_key: os.environ/GEMINI_API_KEY
  - model_name: koresim/gemini-repair
    litellm_params:
      model: gemini/gemini-2.5-flash
      api_key: os.environ/GEMINI_API_KEY
  - model_name: koresim/local-ollama
    litellm_params:
      model: ollama/gemma3:27b
      api_base: http://localhost:11434

litellm_settings:
  success_callback: ["langfuse"]
  failure_callback: ["langfuse"]
  turn_off_message_logging: true
```

Model IDs are allowed to change during implementation after the LiteLLM installed version and Gemini availability are verified. Product code should depend on KoreaSim aliases, not provider model IDs.

## 6. Data-Governance Rules

- Do not send raw persona `uuid` to Gemini.
- Do not send API keys, stack traces, internal prompts, or hidden system instructions to any provider.
- Full raw persona/result data may stay in local product SQLite, but Langfuse should receive metadata only by default.
- Keep LiteLLM message logging disabled or mask inputs/outputs while `LLM_TRACE_MODE=metadata_only`.
- `sampled_full` traces require explicit approval for the run.

## 7. Validation Sequence

1. Local Ollama path still passes deterministic tests.
   - Optional local smoke without downloading the full planned model:
     `ollama pull smollm2:135m`, then `uv run python scripts/check_ollama_adapter.py --model smollm2:135m`.
2. LiteLLM-to-Ollama fallback alias smoke passes when Ollama and a local model are available:
   `uv run python scripts/check_litellm_ollama_alias.py --model smollm2:135m`.
   For the full local fallback matrix after the large model is available:
   `uv run python scripts/run_live_simulation_validation.py local-ollama --model gemma3:27b --all-presets --local-sample-size 200 --output docs/verification/local-ollama-gemma3-9-simulations-200-$(date +%F).json`.
3. Gemini 1-person smoke call succeeds through the OpenAI-compatible adapter.
4. KoreaSim 10-person Creative Testing run completes with `LLM_BACKEND=gemini`.
5. Langfuse receives metadata trace without full prompt/persona payload.
6. LiteLLM starts and lists configured models.
7. KoreaSim 10-person run completes with `LLM_BACKEND=litellm`.
8. 50-person external run completes only after 10-person run passes.

## 8. Validation Log

- 2026-05-03: `LLM_BACKEND=gemini` 10-person Creative Testing completed, run `b62a3804-29d0-4096-ac00-00f9eb1e81de`, `parse_failed=0`.
- 2026-05-03: `LLM_BACKEND=gemini` external 50-person run completed through `https://arabesque.cc/api/runs`, run `f7e4ba13-34e2-47ac-be77-b16c0f757276`, `parse_failed=0`.
- 2026-05-03: `LLM_BACKEND=gemini` external 200-person run completed, run `ead192c8-5c47-43b1-9a04-e6dc9dc0bd67`, `parse_failed=0`.
- 2026-05-03: `LLM_BACKEND=gemini` external 9-simulation 200-person validation completed through `https://arabesque.cc/api/runs`, artifact `docs/verification/external-gemini-9-simulations-200-2026-05-03.json`. All 9 runs completed, totaling 1,800 responses with 3 parse failures, and no observed provider quota/rate-limit failure.
- 2026-05-03: Langfuse trace `096f1e57d93fadedce77efd272ccddfe` showed `input=None`, `output=None`, and metadata-only request/provider fields.
- 2026-05-03: `LLM_BACKEND=litellm` alias run completed, run `ec8c4b1f-6be7-4fff-9d40-45a14ee278d7`, provider `litellm`, provider model `koresim/gemini-persona-strong`.
- 2026-05-03: Ollama 0.22.1 was installed locally, `smollm2:135m` was pulled, `check_ollama(model="smollm2:135m")` returned ready, and `uv run python scripts/check_ollama_adapter.py --model smollm2:135m` returned a live chat completion with provider `ollama`. Full `gemma3:27b` and LiteLLM -> Ollama validation remain separate because the planned fallback model was not pulled.
- 2026-05-03: LiteLLM -> Ollama fallback alias smoke passed with `uv run python scripts/check_litellm_ollama_alias.py --model smollm2:135m --timeout-seconds 90`; response used `model_alias="koresim/local-ollama"`, provider `litellm`, response model `koresim/local-ollama`. Full `gemma3:27b` remains unpulled.
- 2026-05-03: Local `smollm2:135m` Creative Testing validation completed for 200 personas with 82.5% parse success, artifact `docs/verification/local-ollama-smollm2-creative-200-2026-05-03-fixed.json`. This validates the direct Ollama adapter fallback path with a small local model; the full 9-simulation 200-person local matrix remains reserved for the planned `gemma3:27b` fallback target.

## 9. Release Blockers

- provider key exposed in code, docs, frontend bundle, logs, or committed files.
- Gemini prompt includes raw persona UUID.
- Langfuse stores full prompts/personas while `LLM_TRACE_MODE=metadata_only`.
- parse success or completion rate is below the threshold defined in the evaluation framework.
- fallback path hides the fact that fallback was used.
