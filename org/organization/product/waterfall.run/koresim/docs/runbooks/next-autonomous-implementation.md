---
title: Next Autonomous Implementation Handoff
type: runbook
tags: [handoff, autonomous-work, phase-2, cloudflare-access, gemini, langfuse]
created: 2026-05-03
updated: 2026-05-04
status: mac-studio-production-cutover
related: [[../../AGENTS]], [[../../CLAUDE]], [[autonomous-work-session]], [[cloudflare-tunnel-operations]], [[llm-gemini-langfuse-operations]], [[../execution/phase-2-stability-recovery]], [[../execution/phase-3-access-path-policy]], [[../execution/phase-7-llm-gateway-orchestration]]
---

# Next Autonomous Implementation Handoff

## 1. Current State

Branch:

```bash
main
```

Repository root:

```bash
/Users/qts/obsidian-org-knowledge
```

Project root:

```bash
/Users/qts/obsidian-org-knowledge/org/organization/product/waterfall.run/koresim
```

Current Mac Studio cutover objective:

- run production from Mac Studio only.
- serve `frontend/dist` from FastAPI on `localhost:8000`.
- route `https://arabesque.cc` through Cloudflare Tunnel to that FastAPI origin.
- keep Cloudflare Access allowlists disabled.
- enforce app-level Google OAuth through FastAPI for `/app*`, `/results*`, and run/export/preset APIs.
- keep Gemini as primary LLM and Ollama as local fallback.

Recent verified implementation checkpoints:

```text
c692762 Extend Access gate to SSE route
7fab580 Handle missing Access allowlist files
06412bc Redact Access allowlist dry-run output
17df722 Test Access API error redaction path
f03f8c0 Refresh Access gate path documentation
58409eb Refresh protected demo completion audit
2009e30 Add demo presets and trust summary
c5308a0 Render results from API envelope
1a115bf Finish Phase 4 demo readiness polish
13d1fa1 Document Phase 6 result schema gates
b8b667f Split result story fixtures from app mock data
fb248de Normalize Access challenge API errors
61246e9 Add result state story routes
9af4604 Document Google Access env placeholders
0de8e3c Harden protected demo readiness preflight
9180d8b Clarify Google Access redirect setup
d49a195 Add Google Access IdP apply helper
c52802a Report Google OAuth readiness in demo preflight
```

CI status at handoff:

- push CI passed: GitHub Actions run `25260902331` for `c692762`.
- PR CI passed: GitHub Actions run `25260903091` for `c692762`.
- push CI passed: GitHub Actions run `25261035696` for `7fab580`.
- PR CI passed: GitHub Actions run `25261036313` for `7fab580`.
- push CI passed: GitHub Actions run `25261204409` for `06412bc`.
- PR CI passed: GitHub Actions run `25261205120` for `06412bc`.
- push CI passed: GitHub Actions run `25261448145` for `17df722`.
- PR CI passed: GitHub Actions run `25261448992` for `17df722`.
- push CI passed: GitHub Actions run `25261570915` for `f03f8c0`.
- PR CI passed: GitHub Actions run `25261571792` for `f03f8c0`.
- local `uv run python scripts/verify.py` passed with 91 tests and backend coverage 85.20% after the readiness allowlist-file preflight, Access API error redaction-path tests, and Access gate path documentation refresh.
- 2026-05-03 local implementation checkpoint: direct Gemini 10/50/200-person runs passed; LiteLLM alias 1-person run passed; Cloudflare Access unauthenticated protected route gate now passes.
- 2026-05-03 follow-up implementation checkpoint: Phase 4 demo presets/trust layer are complete, ResultsPage renders API envelopes rather than static report values, and Phase 6 now has `result-envelope/v1`, `docs/api-result-schema.md`, `docs/design-qa-checklist.md`, and `docs/simulation-addition-checklist.md`.
- 2026-05-03 follow-up implementation checkpoint: legacy result-style mock values were removed from `frontend/src/data/mockData.ts`; typed API-envelope story states now live in `frontend/src/data/runStateFixtures.ts`.
- 2026-05-03 follow-up implementation checkpoint: frontend API client now normalizes non-JSON Cloudflare Access redirects/challenges; `/results/story/<fixture_id>` routes expose all typed result states for browser review.
- latest local gate: `uv run python scripts/verify.py` passed with 94 tests and backend coverage 85.50% after the result story route work.
- latest CI gate: push run `25262542674` and pull_request run `25262543507` passed for commit `61246e9`.
- latest follow-up gate: `uv run python scripts/verify.py` passed after `.env.example` documented Google OAuth placeholders, and GitHub Actions run `25264559947` passed for commit `9af4604`.
- latest follow-up gate: `uv run python scripts/verify.py` passed with 102 tests and backend coverage 85.50% after Google OAuth readiness reporting, and GitHub Actions push run `25264827187` plus pull_request run `25264828108` passed for commit `c52802a`.
- latest public route gate: the historical Cloudflare Access app was deleted with `scripts/configure_cloudflare_access.py --disable-access-app --apply`; `uv run python scripts/check_public_external_demo.py --timeout-seconds 15` passed with `/`, `/app`, `/results`, `/api/health`, and `/api/config` returning public origin responses.
- latest live external Gemini gate: `scripts/run_live_simulation_validation.py external-api --base-url https://arabesque.cc --sample-size 200` passed all 9 simulation presets, artifact `docs/verification/external-gemini-9-simulations-200-2026-05-03.json`, with 1,800 total responses and 3 parse failures.
- latest local Ollama gate: `smollm2:135m` completed Creative Testing 200-person validation with 82.5% parse success. Artifact: `docs/verification/local-ollama-smollm2-creative-200-2026-05-03-fixed.json`.
- latest productization checkpoint: app-level FastAPI Google OAuth/session scaffold, disabled-by-default test login for E2E, run cancellation, and human-review JSON export were implemented for the current React + FastAPI architecture. Better Auth remains a future option only if KoreaSim migrates to Next.js.

Local secret state:

- `.env` exists locally and is gitignored.
- `.env` contains Gemini, Langfuse JP host, and Ollama fallback settings.
- Cloudflare Access apply variables were supplied in local `.env` during the historical protected-route checkpoint. Do not print or commit them. Current policy does not require Access allowlists.
- A Google OAuth client secret was shared in chat during the session and was treated as compromised. A rotated Google OAuth secret was supplied in local `.env` and used for the Cloudflare Google IdP.
- never commit `.env`.
- local `.env` contains only the non-secret Google OAuth client id from the user-provided OAuth configuration plus a rotation-required marker for the exposed client secret; the exposed secret itself was not stored.

Cloudflare state:

- tunnel created: `koresim-arabesque`.
- tunnel id: `c63ae594-4469-4dda-8b29-651fb754ad7f`.
- credential JSON exists at `~/.cloudflared/c63ae594-4469-4dda-8b29-651fb754ad7f.json`.
- historical local config existed at `~/.cloudflared/config.yml`.
- Mac Studio should use `/Users/qts/.cloudflared/koresim-arabesque.yml` so unrelated default tunnel configs are not overwritten.
- DNS route for `arabesque.cc` was added to this tunnel.
- external smoke test succeeded while `uvicorn` and `cloudflared` were running.
- these processes were stopped after smoke test.
- Latest public route gate with tunnel/origin running passed: `/`, `/app`, `/results`, `/api/health`, and `/api/config` public 200 origin responses with no Cloudflare Access markers.

## 2. Start Here After Session Reset

Read these first:

- `AGENTS.md`
- `CLAUDE.md`
- `docs/runbooks/autonomous-work-session.md`
- this handoff file
- `docs/execution/phase-2-stability-recovery.md`

Then run:

```bash
git status --short
git branch --show-current
uv run python scripts/check_mac_studio_production.py
uv run python scripts/verify.py --skip-build
uv run python scripts/check_mac_studio_production.py --external --timeout-seconds 15
uv run python scripts/check_cloudflare_tunnel.py
```

Do not touch unrelated Obsidian vault changes.

## 3. Main Objective

Implement KoreaSim to the point where an external public demo can run reliably through:

```text
arabesque.cc
  -> Cloudflare Tunnel
  -> FastAPI + React
  -> Redis/RQ worker
  -> Gemini primary LLM
  -> Ollama fallback path retained
  -> SQLite persisted results
  -> SSE/polling recovery
  -> Langfuse metadata-only observability
```

## 4. Work Order

### Block 1 — Phase 2 Stability and Recovery

Target: make the run lifecycle resilient before adding more external surface area.

Status: completed on 2026-05-03.

Implemented:

- SSE event replay with cursor or `Last-Event-ID`.
- heartbeat events every 15 seconds.
- polling fallback every 2 seconds when SSE fails.
- frontend localStorage recovery of the latest `run_id`.
- failed/interrupted states in API and UI.
- result fetch after API restart for completed runs.
- idempotent partial result writes and partial recovery path.
- LLM timeout 60 seconds and one retry.

Validated:

- store replay test.
- event endpoint replay test.
- heartbeat/polling fallback test where practical.
- timeout/retry test with fake LLM client.
- frontend typecheck/build.

Acceptance:

- `uv run python scripts/verify.py` passes.
- Phase 2 docs/checklists updated only for validated items.

### Block 2 — Local Runtime and External Smoke

Status: completed for Gemini primary on 2026-05-03; Ollama adapter/factory fallback is retained and live-smoked with a small local model.

Target: prove the app can run through the actual queue/origin path.

Prepare or verify:

```bash
redis-server
uv run python scripts/download_dataset.py
uv run python scripts/run_worker.py
uv run uvicorn src.api.main:app --host 127.0.0.1 --port 8000
cloudflared tunnel --config ~/.cloudflared/config.yml run koresim-arabesque
```

Run:

- health check through `https://arabesque.cc/api/health`.
- 1-person Gemini smoke test if a script exists or add one.
- 10-person Creative Testing through UI/API.
- 50-person Creative Testing only after 10-person passes.

Acceptance:

- run completes.
- result persists after API restart.
- Langfuse shows metadata trace without full prompt/persona payload.
- no secrets in logs, frontend bundle, or committed files.

### Block 3 — Public Cloudflare Route + App-Level Auth

Status: public route gate completed. Historical Access helpers remain for future private demos, but the current product decision removes Cloudflare Access allowlists from the demo path.

App-level auth status: implemented as FastAPI Google OAuth and signed HTTP-only session cookies. Configure with `KORESIM_AUTH_BASE_URL`, `KORESIM_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, and `GOOGLE_CLIENT_SECRET`. Routine E2E should use `/api/auth/test-login` only when `KORESIM_AUTH_TEST_LOGIN_ENABLED=true`.

2026-05-03 update: `scripts/check_cloudflare_access.py` and [[../execution/protected-demo-completion-audit]] were added for the historical protected-demo path. The current gate is `scripts/check_public_external_demo.py`, which passes only when `/`, `/app`, `/results`, `/api/health`, and `/api/config` return public origin responses without Access markers.

2026-05-03 follow-up: `scripts/configure_cloudflare_access.py` was added as the dry-run-first API path. It can apply the Access app/policy only after `CLOUDFLARE_API_TOKEN`, account or zone id, and allowlist emails are available.

2026-05-03 follow-up: `scripts/configure_cloudflare_access.py` now loads project-local `.env` automatically without overriding exported shell variables, so private Cloudflare credentials can stay in `.env` or the shell and do not need to be repeated in commands.

2026-05-03 follow-up: Access helpers now accept `KORESIM_ACCESS_ALLOWLIST_FILE` for private allowlists and `CLOUDFLARE_GOOGLE_IDP_ID` as a convenience alias for one Cloudflare Access Google IdP UUID.

2026-05-03 follow-up: `scripts/configure_cloudflare_access.py --create-google-idp` can dry-run or apply the Cloudflare Access Google IdP after the exposed Google OAuth secret is rotated. Apply requires `GOOGLE_OAUTH_CLIENT_ID`, rotated `GOOGLE_OAUTH_CLIENT_SECRET`, Cloudflare account/zone scope, and a token with `Access: Organizations, Identity Providers, and Groups Write`; dry-run output redacts the OAuth client secret.

2026-05-03 historical validation before Access apply: with local FastAPI origin and `koresim-arabesque` tunnel running, `scripts/check_cloudflare_access.py` failed because `/app`, `/results`, `/api/health`, and `/api/config` returned unauthenticated 200 origin responses. This confirmed the blocker was missing Access policy, not only a stopped tunnel.

2026-05-03 follow-up validation after Google IdP helper work: local FastAPI origin and `koresim-arabesque` tunnel were started again; `/` returned public 200 and `/app`, `/results`, `/api/health`, and `/api/config` again returned unauthenticated 200 origin responses. With the tunnel stopped, the same gate reports Cloudflare 530. This keeps the blocker classified as Access policy/credential setup, not application routing.

2026-05-03 readiness helper: `scripts/check_protected_demo_readiness.py --require-google-idp` was added to summarize required artifacts, Cloudflare Access apply prerequisites, readable `KORESIM_ACCESS_ALLOWLIST_FILE` when configured, and OAuth client JSON file presence without printing secret values or allowlist contents. It should report `blocked` until Access credentials, allowlist, and the Google IdP UUID are available.

2026-05-03 follow-up readiness hardening: `scripts/check_protected_demo_readiness.py` now treats empty `.env` assignments as missing Access prerequisite values, so placeholder-only files cannot produce a false `ready_to_apply_access` result.

2026-05-03 follow-up readiness detail: the same helper now reports `google_oauth_client` booleans/sources for client id, rotated client secret, and rotation-required marker. It does not print OAuth values, and it identifies whether `scripts/configure_cloudflare_access.py --create-google-idp --apply ...` can run once Cloudflare credentials are available.

2026-05-03 gate hardening: `scripts/check_cloudflare_access.py` now requires a Cloudflare Access marker in the response header/body/location. Bare origin `401` or `403` responses are no longer accepted as protected-route success, which avoids false positives from backend-origin authorization failures.

2026-05-03 follow-up gate coverage: `scripts/check_cloudflare_access.py` default protected probes now include `/api/runs/access-gate-probe/events`, so the unauthenticated Access gate covers React, results, API, and SSE-shaped route surfaces before Phase 3 is marked complete.

2026-05-03 dry-run/API-error redaction: `scripts/configure_cloudflare_access.py` dry-run output redacts allowlist emails to a count, while `--apply` still sends the full policy payload to Cloudflare. Cloudflare HTTP/API error output redacts email addresses and secret/token-like fields before printing, with tests covering both request error paths. This keeps command output safe for checkpoints and docs.

2026-05-03 previous audit: commit `f03f8c0` refreshed Access gate path documentation and passed local `uv run python scripts/verify.py` plus push/PR CI. This remains historical evidence for re-enabling Access, not the active route policy.

2026-05-03 public-route update: `scripts/configure_cloudflare_access.py --disable-access-app --apply` deleted the `KoreaSim Demo` Access app, then `uv run python scripts/check_public_external_demo.py --timeout-seconds 15` passed with public origin responses for landing, app, results, health, and config.

2026-05-03 fallback smoke: `scripts/check_litellm_ollama_alias.py --model smollm2:135m --timeout-seconds 90` passed through a temporary LiteLLM proxy to local Ollama, using `koresim/local-ollama`. Creative Testing 200-person also completed directly through the local Ollama adapter with `smollm2:135m`; full 9-simulation fallback validation with the large `gemma3:27b` model remains open until that model is pulled locally.

Target: keep the Cloudflare Tunnel public at the network layer, then protect the app/API with FastAPI Google OAuth.

Implement/document:

- public `/` landing remains accessible.
- `/api/health`, `/api/config`, and `/api/auth/session` remain accessible without Cloudflare Access allowlist.
- `/app*`, `/results*`, and run/export/preset APIs require app-level login when `KORESIM_AUTH_REQUIRED=true`.
- validate API, React app route, and SSE/polling behavior through the public external path.

Acceptance:

- [x] `/` public.
- [ ] unauthenticated `/app` redirects to Google login.
- [x] `/api/health` public detailed health for operator demo readiness.
- [ ] `/api/auth/session` returns `200`, not `404`.
- [ ] unauthenticated `/api/runs` returns `401`.
- [x] access policy documented in `docs/runbooks/cloudflare-tunnel-operations.md` or Phase 3 docs.
- [ ] `uv run python scripts/check_mac_studio_production.py --external --timeout-seconds 15` passes after the latest Mac Studio origin is running.
- [x] If an old Access app exists, `uv run python scripts/configure_cloudflare_access.py --disable-access-app --apply` succeeds before running the public route gate.
- [x] Public external React route, API request, and SSE replay validation during live 200-person runs.

### Block 4 — LiteLLM Gateway Scaffold

Status: scaffold and alias run completed on 2026-05-03. Use `uvx --from 'litellm[proxy]' --with 'langfuse<3' litellm --config litellm.config.yaml --port 4000`.

Target: move from direct Gemini smoke to the planned gateway without breaking the app.

Implement:

- local LiteLLM config with Gemini aliases and Ollama fallback alias.
- `LLM_BACKEND=litellm` path verified.
- `GET /api/config` exposes aliases, not provider secrets.
- `GET /api/health` reports gateway readiness without secrets.

Acceptance:

- `LLM_BACKEND=gemini` direct path still works.
- `LLM_BACKEND=ollama` local path still works.
- `LLM_BACKEND=litellm` path works through alias.
- `uv run python scripts/verify.py` passes.

### Block 5 — Phase Documentation and Completion

Target: leave the project in a state where the next phase is unambiguous.

Update:

- `CLAUDE.md`
- relevant `docs/phases/*.md`
- relevant `docs/execution/*.md`
- runbooks with actual validation evidence.

Acceptance:

- all completed checkboxes correspond to passing automated or manual validation.
- final report lists run ids, commands, results, commits, and blockers.

## 5. Stop Conditions

Stop and report instead of guessing if:

- Cloudflare Access requires dashboard-only action unavailable from CLI.
- Langfuse shows full prompts/personas while `LLM_TRACE_MODE=metadata_only`.
- Gemini key is rejected, quota-limited, or blocked.
- persona parquet download fails or disk space is insufficient.
- Redis/RQ worker cannot run locally.
- a verification failure remains after one focused fix attempt.

## 6. Checkpoint Rule

Every 2 hours:

- stop scope expansion.
- run relevant tests.
- run `uv run python scripts/verify.py` for backend/frontend/API/queue/UI changes.
- commit coherent passing work.
- push branch.
- report completed work, verification, commit hash, blockers, and next 2-hour target.

Do not make a completion commit if verification is failing.

## 7. Final Definition of Done

The autonomous implementation can be considered complete when:

- Phase 2 stability/recovery pass conditions are met.
- Gemini primary path works for at least a 10-person run.
- Ollama fallback remains configurable and tested at the adapter/factory level.
- Langfuse metadata-only traces appear for LLM calls.
- Cloudflare tunnel serves `arabesque.cc`.
- Cloudflare Tunnel serves `/`, `/app*`, `/results*`, and `/api*` publicly without Access allowlist markers.
- local and CI `scripts/verify.py` pass.
- final docs and runbooks match the actual system.

If full external 50/200-person validation is blocked by cost, quota, or environment, document the blocker and complete all deterministic implementation gates first.
