---
title: Public External Demo Completion Audit
type: completion-audit
tags: [phase-2, phase-3, phase-7, verification, access]
created: 2026-05-03
updated: 2026-05-03
status: public-route-live-validation
related:
  - [[../runbooks/next-autonomous-implementation]]
  - [[phase-3-access-path-policy]]
---

# Public External Demo Completion Audit

## Objective

Complete KoreaSim to the current public external demo state: stable React/FastAPI run lifecycle, Gemini primary LLM path, Ollama fallback boundary, Langfuse metadata-only observability, LiteLLM alias scaffold, Cloudflare Tunnel on `arabesque.cc`, public app/API routes, verification, documentation, commit, and push. Cloudflare Access protection was implemented historically, then removed after the current product decision changed to public demo access.

## Prompt-to-Artifact Checklist

| Requirement | Evidence | Status |
| --- | --- | --- |
| Read project guidance: `AGENTS.md`, `CLAUDE.md`, autonomous runbooks, related phase/execution docs | Session read `AGENTS.md`, `CLAUDE.md`, `docs/runbooks/next-autonomous-implementation.md`, `docs/runbooks/autonomous-work-session.md`, Cloudflare/Gemini runbooks, and Phase 2/3/7 docs before editing | Done |
| Phase 2 Stability/Recovery complete | `docs/phases/phase-2-stability.md`, `CLAUDE.md`, backend/frontend lifecycle implementation, tests, and live Redis/Gemini runs | Done |
| Redis/RQ/FastAPI/React run lifecycle stable | `scripts/run_worker.py`, `src/jobs/*`, `src/api/routes.py`, `frontend/src/hooks/useRunEvents.ts`, local readiness check, live run ids documented in phase docs | Done |
| SSE replay, heartbeat, polling fallback, refresh recovery | `src/jobs/events.py`, `src/api/routes.py`, `frontend/src/hooks/useRunEvents.ts`, `frontend/src/App.tsx`, tests and SSE replay smoke | Done |
| failed/interrupted state implemented | `src/jobs/models.py`, `src/jobs/store.py`, `src/jobs/worker.py`, `scripts/run_worker.py`, job/store/worker tests | Done |
| Gemini primary LLM path verified | Direct Gemini 10-person run `b62a3804-29d0-4096-ac00-00f9eb1e81de`; external 50-person run `f7e4ba13-34e2-47ac-be77-b16c0f757276`; external 200-person run `ead192c8-5c47-43b1-9a04-e6dc9dc0bd67` | Done |
| Ollama fallback maintained | `src/llm/factory.py`, Ollama adapter/factory tests, model alias config, local Ollama 0.22.1 smoke with `smollm2:135m` through `scripts/check_ollama_adapter.py`, and LiteLLM -> Ollama alias smoke through `scripts/check_litellm_ollama_alias.py --model smollm2:135m` | Adapter/factory, small-model live boundary, and LiteLLM alias path done; full `gemma3:27b` not pulled |
| Langfuse metadata-only trace verified | Trace `096f1e57d93fadedce77efd272ccddfe` had `input=None`, `output=None`, safe metadata only | Done |
| Cloudflare Tunnel serves `arabesque.cc` | `scripts/check_cloudflare_tunnel.py`, `curl` checks for `/`, `/health`, `/app`, `/api/health`, `/api/config`, external run ids above | Done |
| Public external routes are reachable | `scripts/configure_cloudflare_access.py --disable-access-app --apply` deleted the `KoreaSim Demo` Access app, then `scripts/check_public_external_demo.py --timeout-seconds 15` passed with public origin responses for `/`, `/app`, `/results`, `/api/health`, and `/api/config` | Done |
| Cloudflare Access can be re-applied if a future private demo requires it | Historical gate: `scripts/check_cloudflare_access.py` passed on 2026-05-03 with FastAPI origin and `koresim-arabesque` tunnel running; helper code remains available but is not the current route policy | Done |
| Cloudflare Access can be applied without dashboard if credentials are available | `scripts/configure_cloudflare_access.py --create-google-idp --apply` created Google IdP `537f1f75-c649-4da6-b26c-5455c5d80aa0`; `scripts/configure_cloudflare_access.py --apply --auto-redirect-to-idp` created Access app `1f3c0008-fd22-41ca-8d78-f676a9814276` and allow policy `f98828a3-798f-4243-a129-5db2c75a31e5`; helper outputs did not print OAuth or Cloudflare secrets | Done |
| Protected demo readiness can be audited without printing secrets | `scripts/check_protected_demo_readiness.py --require-google-idp` checks required runbook/audit artifacts, Cloudflare Access apply prerequisites, readable `KORESIM_ACCESS_ALLOWLIST_FILE` when configured, rotated Google OAuth credential readiness for `--create-google-idp`, and OAuth client JSON files inside the project tree without printing secret values or allowlist contents; empty `.env` assignments such as `CLOUDFLARE_API_TOKEN=` are treated as missing values and covered by `tests/test_protected_demo_readiness.py` | Done |
| LiteLLM gateway scaffold and alias switching | `litellm.config.yaml`, `.env.example`, `src/config.py`, `src/llm/factory.py`, LiteLLM model list and alias run `ec8c4b1f-6be7-4fff-9d40-45a14ee278d7` | Done |
| React demo content and trust layer | `GET /api/presets`, `DemoPreset`, React quick-start preset flow, API-backed ResultsPage, trust layer, sample summary, warnings, fixed disclaimer, and 3-minute demo script documented in Phase 4 | Done |
| Frontend/backend schema and result-state review gates | `RunResultEnvelope.schema_version`, `frontend/src/types/api.ts`, `frontend/src/data/runStateFixtures.ts`, `/results/story/<fixture_id>` browser review routes, `docs/api-result-schema.md`, `docs/design-qa-checklist.md`, `docs/simulation-addition-checklist.md`, and Playwright checks for completed/partial/failed/price story routes | Done |
| local verify passes | Latest local `uv run python scripts/verify.py` passed on 2026-05-03: Ruff, deterministic fixtures, 94 pytest tests with 85.50% coverage, frontend lint/typecheck/build | Done |
| CI verify passes | GitHub Actions push run `25262542674` and pull_request run `25262543507` passed for latest checkpoint commit `61246e9` on branch `codex/koresim-ci-private`; latest prior push/PR runs also passed for commits `fb248de`, `b8b667f`, and `13d1fa1` | Done |
| Docs/checklists current | `CLAUDE.md`, Phase 1/2/3/4/6/7 docs, execution plans, runbooks, and this audit document | In progress |
| Commit and push coherent work | Implementation checkpoints through `61246e9` pushed to `origin/codex/koresim-ci-private`; latest push/PR CI passed | Done |

## Current Blockers

1. Local `smollm2:135m` fallback validation exposed a throughput limitation: 50-person Creative Testing completed with 86% parse success, but 200-person did not finish within 64 minutes due repeated 180-second Ollama request timeouts.

## Public Route Gate

For the current public demo policy, run:

```bash
uv run python scripts/check_public_external_demo.py --timeout-seconds 15
```

Expected result:

- `/`, `/app`, `/results`, `/api/health`, and `/api/config` return public origin responses.
- No response contains Cloudflare Access markers such as `cloudflare access`, `cloudflareaccess.com`, `/cdn-cgi/access`, or `cf-access`.

For future private demos only, the legacy Access helpers still exist. Before attempting private-demo Access `--apply`, run:

```bash
uv run python scripts/check_protected_demo_readiness.py --require-google-idp
```

Expected result before credentials are available: `status=blocked` with missing Cloudflare Access apply prerequisites, without printing secret values or allowlist contents. Expected result after credentials and a readable allowlist file are present: `status=ready_to_apply_access`, then apply the policy and run the Access gate above.

## Completion Decision

The current public route gate and live external 9-simulation Gemini validation are complete. The remaining local-model gap is documented as a `smollm2:135m` throughput limitation, while the Ollama adapter/fallback boundary remains live.

Checkpoint evidence on 2026-05-03:

- `uv run python scripts/check_protected_demo_readiness.py --require-google-idp` reports `status=blocked` because Cloudflare Access credentials, account or zone id, allowlist, and Google IdP UUID are not available.
- `uv run python scripts/check_cloudflare_access.py --timeout-seconds 8` reports Cloudflare `530` for `/`, `/app`, `/results`, `/api/health`, `/api/config`, and `/api/runs/access-gate-probe/events` while the local tunnel/origin are stopped. This is not a passing Access gate.
- `uv run python scripts/verify.py` passed locally with 94 tests and 85.50% backend coverage.
- Playwright browser checks rendered `/results/story/run_completed_creative_testing`, `/results/story/run_partial_results`, `/results/story/run_failed` at mobile width, and `/results/story/run_completed_price_optimization`.
- GitHub Actions push run `25262542674` and pull_request run `25262543507` passed for latest checkpoint commit `61246e9`.

Follow-up evidence on 2026-05-03:

- Local `.env` was updated with the non-secret Google OAuth client id only. The exposed Google OAuth client secret was not stored; the file records that the secret must be rotated before use.
- `.env.example` documents `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` placeholders without real values.
- `scripts/check_protected_demo_readiness.py` now rejects empty `.env` assignments for Access prerequisites, preventing placeholder-only local files from satisfying the preflight.
- `uv run pytest tests/test_protected_demo_readiness.py` passed with 10 tests.
- `uv run python scripts/check_protected_demo_readiness.py --require-google-idp` still reports `status=blocked`, with no secret JSON files in the project tree.
- `uv run python scripts/verify.py` passed locally after the `.env.example` placeholder documentation commit `9af4604`, and GitHub Actions run `25264559947` passed for that commit.
- `uv run python scripts/verify.py` passed locally after readiness hardening commit `0de8e3c`, and GitHub Actions push run `25264633753` plus pull_request run `25264634352` passed for that commit.
- `scripts/check_protected_demo_readiness.py --require-google-idp` now reports a `google_oauth_client` section with only booleans/sources for OAuth readiness, so the next checkpoint can distinguish "IdP UUID already configured" from "rotated Google OAuth credentials are ready to create the IdP" without printing credentials.
- `uv run python scripts/verify.py` passed locally with 102 tests and 85.50% backend coverage after commit `c52802a`, and GitHub Actions push run `25264827187` plus pull_request run `25264828108` passed for that commit.
- `uv run python scripts/check_protected_demo_readiness.py --require-google-idp` reports `status=blocked`: Cloudflare Access apply prerequisites are missing, Google IdP UUID is missing, `GOOGLE_OAUTH_CLIENT_ID` is present from `.env`, rotated `GOOGLE_OAUTH_CLIENT_SECRET` is absent, and the secret rotation marker is present.
- `uv run python scripts/check_cloudflare_access.py --timeout-seconds 8` reports Cloudflare `530` for public and protected probes while tunnel/origin are stopped. This remains a failing gate and is not evidence of Cloudflare Access protection.

Protected Access evidence on 2026-05-03:

- `uv run python scripts/check_protected_demo_readiness.py --require-google-idp` returned `status=ready_to_apply_access` after `.env` received Cloudflare token/account/allowlist, rotated Google OAuth credentials, and the created Google IdP UUID.
- `uv run python scripts/configure_cloudflare_access.py --create-google-idp --apply` created Cloudflare Access Google IdP `537f1f75-c649-4da6-b26c-5455c5d80aa0`.
- `uv run python scripts/configure_cloudflare_access.py --apply --auto-redirect-to-idp` created Access app `1f3c0008-fd22-41ca-8d78-f676a9814276` and allow policy `f98828a3-798f-4243-a129-5db2c75a31e5`.
- With FastAPI origin and `koresim-arabesque` tunnel running, `uv run python scripts/check_cloudflare_access.py --timeout-seconds 12` passed: `/` returned public 200, while `/app`, `/results`, `/api/health`, `/api/config`, and `/api/runs/access-gate-probe/events` returned Cloudflare Access login redirects.

Public-route evidence on 2026-05-03:

- `uv run python scripts/configure_cloudflare_access.py --disable-access-app --apply` deleted the `KoreaSim Demo` Access app.
- `uv run python scripts/check_public_external_demo.py --timeout-seconds 15` passed: `/`, `/app`, `/results`, `/api/health`, and `/api/config` returned public origin responses and no Cloudflare Access markers were detected.
- `https://arabesque.cc/api/health` reported Gemini backend, Redis reachable, and one active RQ worker.

Live validation evidence on 2026-05-03:

- `uv run python scripts/run_live_simulation_validation.py external-api --base-url https://arabesque.cc --sample-size 200 ...` completed all 9 presets through the public external API. Artifact: `docs/verification/external-gemini-9-simulations-200-2026-05-03.json`.
- Gemini external totals: 9 completed runs, 1,800 total responses, 3 parse failures, no failed/interrupted runs, and no observed provider quota/rate-limit failure.
- External SSE replay check on `https://arabesque.cc/api/runs/8a75b18a-39d0-4eca-b50b-5e07e85f3b17/events` returned `snapshot`, `created`, `queued`, `running`, and `progress` events without Cloudflare Access.
- Playwright browser check loaded `https://arabesque.cc/results?run_id=5ae261f3-4a17-479d-8457-49618c7a4927` on desktop and mobile widths, rendering the Campaign Strategy result from the live API envelope.
- Local `smollm2:135m` Creative Testing validation completed 50 personas with 86% parse success; 200-person local fallback was stopped after 64 minutes and recorded as `LOCAL_MODEL_THROUGHPUT_LIMIT` in `docs/verification/local-ollama-smollm2-creative-50-200-2026-05-03.json`.
