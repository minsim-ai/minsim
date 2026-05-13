---
title: Remaining Checklist Resolution
type: verification-artifact
created: 2026-05-03
updated: 2026-05-03
status: implementation-gates-passed
---

# Remaining Checklist Resolution

This records how the previously open “unfinished/deferred/V2” checklist was resolved or reclassified.

## Resolved In Implementation

- [x] App-level social login for the current React + FastAPI architecture.
  - `GET /api/auth/session`
  - `GET /api/auth/google/login`
  - `GET /api/auth/google/callback`
  - `GET|POST /api/auth/logout`
  - signed HTTP-only `koresim_session` cookie
  - when auth is configured, `/app*`, `/results*`, and run/preset/export APIs require login unless `KORESIM_AUTH_REQUIRED=false`.
- [x] Test/staging auth bypass for stable E2E.
  - `GET /api/auth/test-login` is disabled by default.
  - Enable only with `KORESIM_AUTH_TEST_LOGIN_ENABLED=true`.
- [x] Frontend auth status controls.
  - Landing, app, and results headers can show public/login/session status.
- [x] Run cancel action.
  - `POST /api/runs/{run_id}/cancel`
  - worker respects pre-canceled runs and emits `canceled` terminal state.
- [x] Human-review report export.
  - `GET /api/runs/{run_id}/export`
  - excludes `raw_results`
  - sets `human_review_required=true`
- [x] Data-governance export policy updated.
- [x] Agent-browser E2E runbook updated for test-login auth.
- [x] `AGENTS.md`, `CLAUDE.md`, and `README.md` source-of-truth drift reduced.
- [x] Local `smollm2:135m` Creative Testing 200-person live run completed.
  - Artifact: `docs/verification/local-ollama-smollm2-creative-200-2026-05-03-fixed.json`
  - Result: 200 responses, 82.5% parse success, provider `ollama`, `llm_backend=ollama`.
- [x] Result envelopes now record the effective provider-backed `llm_backend`, so local Ollama runs no longer display the ambient Gemini backend.

## Resolved By Product Decision

- [x] Cloudflare Access allowlists remain disabled for the current public demo.
- [x] Future private-demo Access reactivation remains documented, not active work.
- [x] Better Auth is not applied directly because KoreaSim is not a Next.js app. The current implementation uses FastAPI OAuth; Better Auth can be reconsidered only if the frontend migrates to Next.js.

## Still External Or Environment-Dependent

- [ ] PR #1 merge to `main`.
  - Requires final GitHub PR operation after this implementation commit and CI pass.
- [ ] `gemma3:27b` LiteLLM -> Ollama full fallback live run.
  - Requires the large Ollama model available locally and enough runtime.
- [ ] Local Ollama 9-simulation 200-person matrix.
  - Creative Testing 200-person is complete with `smollm2:135m`.
  - The 9-simulation 200-person matrix remains open because the planned full fallback target is the large `gemma3:27b` model, which is not currently pulled locally.
- [ ] Legal review of dataset-derived exports and production retention policy.
  - Required before paid customer exports/account workflows.

## V2 Product Backlog

- [ ] Account, organization, role-based permissions, and billing.
- [ ] Public benchmark survey comparison.
- [ ] Two-run consistency score.
- [ ] External factual source/citation research agent.
- [ ] Advanced node graph/drilldown visualization.
- [ ] LOD Canvas crowd visualization and real-time crowd animation.
