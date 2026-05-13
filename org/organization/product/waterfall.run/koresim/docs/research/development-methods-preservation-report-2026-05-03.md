---
title: Development Methods Preservation Report
type: research-report
tags: [developer-workflow, skill-candidates, e2e, ci, production-handoff]
created: 2026-05-03
updated: 2026-05-03
status: active
related:
  - ../runbooks/agent-browser-e2e.md
  - ../runbooks/app-auth-operations.md
  - ../runbooks/autonomous-work-session.md
  - ../runbooks/next-autonomous-implementation.md
  - ../verification/checklist-resolution-2026-05-03.md
  - ../../AGENTS.md
  - ../../CLAUDE.md
---

# Development Methods Preservation Report

## Purpose

This report captures the useful development methods from the MacBook implementation phase before moving KoreaSim production operations to the Mac Studio server.

The goal is to decide what should become reusable Codex skills, project runbooks, or lightweight markdown checklists so the same high-leverage workflow can be repeated without relying on chat history.

## Evidence Reviewed

- PR #1: `Add KoreaSim FastAPI migration CI`
  - Merged as `c0d70e75f4a24f561ccd812c0631b07d34daee3a`.
  - Established KoreaSim CI, `scripts/verify.py`, deterministic eval gates, backend coverage threshold, frontend lint/typecheck/build, and private repo path filters.
- PR #2: `Enforce KoreaSim app-level auth`
  - Merged as `bf14fd5dde831e6a7afca71b0d096e98f07819e8`.
  - Added app-level auth enforcement, test-login-backed E2E support, and updated public-route docs after Cloudflare Access allowlists were removed.
- Current runbooks:
  - `docs/runbooks/agent-browser-e2e.md`
  - `docs/runbooks/app-auth-operations.md`
  - `docs/runbooks/autonomous-work-session.md`
  - `docs/runbooks/next-autonomous-implementation.md`
- Current verification artifacts:
  - `docs/verification/e2e/agent-browser-large-scale-20260503T122715Z/report.md`
  - `docs/verification/local-ollama-smollm2-creative-200-2026-05-03-fixed.json`
  - `docs/verification/checklist-resolution-2026-05-03.md`
- Chat-history-derived working patterns:
  - 2-hour checkpoint discipline.
  - Do not touch unrelated Obsidian vault changes.
  - Commit only coherent passing work.
  - Push and merge only after local verify plus CI pass.
  - Treat leaked OAuth/API secrets as compromised and rotate.

## Executive Summary

The highest-value methods to preserve are:

1. Agent-browser E2E matrix with test-login sessions.
2. Single-command local/CI verification through `scripts/verify.py`.
3. Production-safe auth testing pattern that avoids real OAuth browser automation.
4. Autonomous checkpoint protocol for long implementation runs.
5. External/live validation artifact discipline for Gemini, Ollama, SSE, and result pages.
6. Git hygiene for a dirty Obsidian vault repo.
7. Secret-handling and credential-rotation rules.

The best split is:

- Turn cross-project agent behaviors into SKILLs.
- Keep KoreaSim-specific commands and paths as project `.md` runbooks.
- Keep production server operational steps in a Mac Studio handoff runbook.

## Recommended SKILL Candidates

### 1. `agent-browser-e2e-matrix`

Recommendation: create a reusable SKILL.

Why:

- This was the most useful UI/UX verification method.
- It caught the `새 시뮬레이션` redirect regression and validated result renderers across 9 simulation types, desktop/mobile, auth-backed sessions, SSE replay, export API, and broken-token/overflow checks.
- It is not KoreaSim-only. The pattern applies to any local React/FastAPI or web app.

Trigger examples:

- "agent-browser로 E2E 돌려줘"
- "로그인 필요한 E2E 구성해줘"
- "UX 플로우 따라가면서 깨지는 부분 찾아줘"
- "desktop/mobile 결과 페이지 matrix 검증해줘"

What the skill should contain:

- Install/check commands:
  - `npm install -g agent-browser`
  - `agent-browser install`
- Pattern for isolated sessions:
  - one session per case.
  - deterministic refs/snapshots for interaction.
  - artifacts under `docs/verification/e2e/<run-id>/`.
- Auth strategy:
  - never automate real Google OAuth in routine E2E.
  - use disabled-by-default test-login endpoint.
  - save/reuse session only for local/staging.
- Stability rules:
  - agent-browser commands need timeout and retry around daemon flakes.
  - lower parallelism when Chrome daemon becomes busy.
  - distinguish app failure from browser-tool failure in logs.
- Standard checks:
  - no `undefined`, `NaN`, `[object Object]`.
  - no horizontal overflow.
  - desktop and mobile viewport coverage.
  - result/state pages, auth session, health/config, SSE replay.

Current KoreaSim source:

- `scripts/run_agent_browser_e2e_matrix.sh`
- `docs/runbooks/agent-browser-e2e.md`
- `docs/verification/e2e/agent-browser-large-scale-20260503T122715Z/report.md`

### 2. `local-ci-verify-gate`

Recommendation: create a reusable SKILL.

Why:

- `scripts/verify.py` converted a broad quality surface into one repeatable gate.
- It made local and CI verification equivalent.
- It reduced subjective "looks done" decisions.

Trigger examples:

- "전체 검증 게이트 만들어줘"
- "CI랑 로컬 verify를 맞춰줘"
- "PR 전에 통과해야 할 테스트 묶어줘"

What the skill should contain:

- Build a single script that runs:
  - lint.
  - deterministic fixture/eval checks.
  - pytest with coverage threshold.
  - frontend lint.
  - frontend typecheck.
  - production build.
- Mirror it exactly in GitHub Actions.
- Add path filters in monorepos.
- Make coverage target explicit and visible.
- Treat build warnings separately from failures.

Current KoreaSim source:

- `scripts/verify.py`
- `.github/workflows/koresim-ci.yml`
- PR #1 body and CI history.

### 3. `auth-bypass-for-e2e`

Recommendation: create a reusable SKILL.

Why:

- Social OAuth is flaky and expensive to automate directly.
- The project now has a safer pattern: real app sessions, but a test-only login endpoint enabled only in local/staging.
- This pattern will be useful on Mac Studio and future services.

Trigger examples:

- "소셜 로그인 앱 E2E 안정화해줘"
- "Google OAuth 앱에서 테스트 로그인 우회 만들자"
- "CI에서 로그인 후 플로우 테스트하고 싶어"

What the skill should contain:

- Add a disabled-by-default endpoint such as `/api/auth/test-login`.
- Guard with environment variable, for example `KORESIM_AUTH_TEST_LOGIN_ENABLED=true`.
- Never enable in production.
- Use HTTP-only signed cookies or the app's real session mechanism.
- E2E should call test-login before opening protected pages.
- Verify unauthenticated behavior and authenticated behavior separately.

Current KoreaSim source:

- `src/api/auth.py`
- `src/api/main.py`
- `tests/test_api_auth.py`
- `docs/runbooks/app-auth-operations.md`
- PR #2.

### 4. `autonomous-checkpoint-git-hygiene`

Recommendation: create a reusable SKILL.

Why:

- The KoreaSim work ran across many phases, tools, and external dependencies.
- The checkpoint discipline prevented scope drift and protected unrelated Obsidian vault changes.
- This is useful for any long-running agent implementation.

Trigger examples:

- "2시간마다 체크포인트하면서 계속 구현해줘"
- "장시간 autonomous session으로 진행해줘"
- "검증/커밋/푸시까지 반복해줘"

What the skill should contain:

- Start checklist:
  - read project guidance.
  - inspect branch/status.
  - identify dirty unrelated files.
- Every checkpoint:
  - stop scope expansion.
  - run relevant tests or full verify.
  - stage only task files.
  - commit coherent passing work.
  - push branch.
  - report completed work, verification, commit hash, blockers, next target.
- Safety:
  - never revert unrelated user files.
  - never commit secrets/runtime DB/datasets.
  - do not mark docs checkboxes unless validated.

Current KoreaSim source:

- `docs/runbooks/autonomous-work-session.md`
- `AGENTS.md`
- `CLAUDE.md`
- Chat working rules.

### 5. `live-validation-artifact-discipline`

Recommendation: create a reusable SKILL.

Why:

- Live external/model checks are expensive and can be hard to reproduce.
- The project benefited from saving JSON and markdown artifacts for E2E, Gemini, Ollama, public route, and checklist closure.
- This gives production operations evidence beyond "it ran once."

Trigger examples:

- "라이브 검증 결과를 artifact로 남겨줘"
- "외부 API 200명/전체 preset 검증해줘"
- "production readiness evidence 만들어줘"

What the skill should contain:

- Always write verification outputs under `docs/verification/...`.
- Include:
  - command/mode.
  - base URL/model/provider.
  - sample size.
  - run IDs.
  - pass/fail summary.
  - parse success or quality metric.
  - known limitations.
- For model runs:
  - record provider and effective backend.
  - do not store secrets or raw credential output.
- For E2E:
  - write per-case logs and aggregate `summary.tsv`.

Current KoreaSim source:

- `scripts/run_live_simulation_validation.py`
- `docs/verification/local-ollama-smollm2-creative-200-2026-05-03-fixed.json`
- `docs/verification/e2e/agent-browser-large-scale-20260503T122715Z/report.md`
- `docs/verification/checklist-resolution-2026-05-03.md`

### 6. `secret-safe-production-handoff`

Recommendation: create a reusable SKILL.

Why:

- OAuth credentials appeared in chat during development.
- The correct response was to treat them as compromised, rotate, and document only placeholders.
- Production migration will involve `.env`, Cloudflare, Gemini, Langfuse, OAuth, Ollama, and tunnel credentials.

Trigger examples:

- "production 서버로 옮기기 전에 secret 점검해줘"
- ".env.example 정리하고 실제 secret은 커밋하지 않게 해줘"
- "노출된 OAuth secret 처리 기준 알려줘"

What the skill should contain:

- Run staged-file secret checks before commit.
- Never commit:
  - `.env`
  - OAuth client JSON
  - Cloudflare tunnel credentials
  - provider API keys
  - Langfuse keys
  - runtime SQLite
  - persona parquet
- Treat secrets pasted into chat as compromised.
- Keep `.env.example` placeholders only.
- Production server handoff should list variable names and where to obtain them, not values.

Current KoreaSim source:

- `.env.example`
- `docs/runbooks/app-auth-operations.md`
- `AGENTS.md`
- `docs/runbooks/llm-gemini-langfuse-operations.md`

## Recommended Project Markdown Runbooks

These should stay as project `.md` files rather than general SKILLs because they encode KoreaSim-specific paths, env vars, and operational assumptions.

### 1. `docs/runbooks/mac-studio-production-handoff.md`

Recommendation: create next.

Suggested contents:

- Mac Studio directory layout.
- required system dependencies:
  - `uv`
  - Node 24/npm
  - Redis
  - Ollama
  - cloudflared
  - agent-browser only if browser E2E is run on the server.
- environment variables:
  - Gemini.
  - Langfuse.
  - Google OAuth.
  - auth/session.
  - Redis/RQ/SQLite paths.
  - Cloudflare tunnel.
- deployment sequence:
  - fetch `main`.
  - install dependencies.
  - build frontend.
  - run database/dataset checks.
  - start Redis, worker, FastAPI, tunnel.
  - run health/public/auth/E2E gates.
- rollback steps.
- files that must never be copied into git.

### 2. `docs/runbooks/production-verification-ladder.md`

Recommendation: create next.

Suggested contents:

1. deterministic local gate: `uv run python scripts/verify.py`.
2. runtime health gate: `/api/health`.
3. auth gate:
   - unauthenticated `/app` redirects.
   - test-login only in staging/local.
   - real Google login manually in production if needed.
4. queue gate:
   - Redis reachable.
   - worker count nonzero.
   - small 1-person run.
5. model gate:
   - Gemini 1-person.
   - Gemini 50-person.
   - local Ollama smoke.
6. browser gate:
   - agent-browser matrix.
7. external route gate:
   - Cloudflare tunnel/domain.
   - SSE replay.

### 3. `docs/runbooks/pr-release-gate.md`

Recommendation: create if this repo keeps PR-based production changes.

Suggested contents:

- PR must include:
  - summary.
  - local verification command/results.
  - artifact paths.
  - known blockers.
- Before merge:
  - local `scripts/verify.py`.
  - CI success.
  - no secrets in staged files.
  - unrelated Obsidian changes not staged.
- After merge:
  - fetch `origin/main`.
  - record merge commit.
  - update handoff/CLAUDE only if status changed.

### 4. `docs/runbooks/llm-provider-fallback-validation.md`

Recommendation: extract from existing LLM runbook if fallback testing grows.

Suggested contents:

- Gemini primary path checks.
- LiteLLM alias checks.
- direct Ollama adapter checks.
- local model availability checks.
- `smollm2:135m` as smoke model only.
- `gemma3:27b` as planned production fallback target.
- expected runtime/cost notes for 50/200-person runs.
- artifact schema.

## Recommended Updates To Existing Files

### `AGENTS.md`

Add a short "production handoff" rule:

- before server migration, run `scripts/verify.py`, auth-backed agent-browser matrix, and secret/staged-file checks.
- production changes should start from `origin/main`, not an old Codex branch.

### `CLAUDE.md`

Add a "Known Good Development Patterns" section:

- single verify gate.
- test-login E2E.
- artifact-first live validation.
- dirty vault safety.

### `docs/runbooks/agent-browser-e2e.md`

Keep it as the KoreaSim-specific implementation. If a general SKILL is created, this runbook becomes the project example/reference.

### `docs/runbooks/autonomous-work-session.md`

Promote from `status: draft` to `status: active` after one cleanup pass. It accurately describes the pattern that worked.

## Production Migration Checklist To Preserve

Before moving work from MacBook to Mac Studio:

- [ ] Confirm `origin/main` includes PR #1 and PR #2 merge commits:
  - `c0d70e75f4a24f561ccd812c0631b07d34daee3a`
  - `bf14fd5dde831e6a7afca71b0d096e98f07819e8`
- [ ] On Mac Studio, clone/fetch repo and checkout `main`.
- [ ] Copy or recreate `.env` through a secure channel, not via git.
- [ ] Verify OAuth redirect URI uses the production URL:
  - `https://arabesque.cc/api/auth/google/callback`
- [ ] Ensure `KORESIM_AUTH_REQUIRED=true`.
- [ ] Keep `KORESIM_AUTH_TEST_LOGIN_ENABLED=false` in production.
- [ ] Install/pull intended Ollama fallback model.
- [ ] Run `uv run python scripts/verify.py`.
- [ ] Start Redis/RQ/FastAPI/Cloudflare tunnel.
- [ ] Run `/api/health`.
- [ ] Run a 1-person simulation.
- [ ] Run auth-backed E2E in staging/local only.
- [ ] Run real Google login manually once in production.
- [ ] Save verification artifacts.

## Priority Order

1. Create `docs/runbooks/mac-studio-production-handoff.md`.
2. Create reusable SKILL `agent-browser-e2e-matrix`.
3. Create reusable SKILL `local-ci-verify-gate`.
4. Create reusable SKILL `auth-bypass-for-e2e`.
5. Promote `docs/runbooks/autonomous-work-session.md` to active.
6. Add the "Known Good Development Patterns" summary to `CLAUDE.md`.

## Final Recommendation

Do not put every detail into SKILLs. SKILLs should capture reusable agent behavior. KoreaSim-specific commands, env var names, run IDs, Cloudflare tunnel names, and Mac Studio server steps should remain in project runbooks.

The most valuable immediate artifact before production migration is `docs/runbooks/mac-studio-production-handoff.md`, backed by the reusable `agent-browser-e2e-matrix` and `local-ci-verify-gate` SKILLs.
