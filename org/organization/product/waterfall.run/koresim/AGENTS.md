# KoreaSim Coding Agent Guide

## Scope

This guide applies to the KoreaSim project rooted at:

`/Users/byeongsu/obsidian-org-vault/org/organization/product/waterfall.run/koresim`

The git repository root is the parent vault:

`/Users/byeongsu/obsidian-org-vault`

Do not treat unrelated Obsidian vault changes as part of this project unless the user explicitly asks.

## Product Direction

- Product: KoreaSim, a Korean AI persona behavior simulation B2B SaaS.
- Target architecture: React + FastAPI external demo.
- Keep `app.py` Streamlit as internal fallback only.
- Public domain plan: `https://arabesque.cc`.
- Route policy: `/` and safe status/documentation endpoints are publicly reachable through Cloudflare Tunnel. Cloudflare Access allowlists are no longer part of the current demo target; `/app*`, `/results*`, and run/preset/export APIs use app-level Google auth when configured.
- Queue and persistence: Redis + RQ worker, SQLite job/result store.
- LLM direction: provider-agnostic `LLMClient`, LiteLLM Proxy, Gemini first external provider, Ollama local fallback, Langfuse metadata-only observability.

## Required Reading Before Complex Work

Read the relevant files before editing:

- `README.md` for roadmap and methodology.
- `CLAUDE.md` for current phase status.
- `docs/phases/<phase>.md` for phase tasks and done definitions.
- `docs/execution/<plan>.md` for detailed execution plans.
- `docs/design/harness-engineering-controls.md` for engineering controls.
- `docs/runbooks/autonomous-work-session.md` before long-running autonomous work.
- `docs/runbooks/next-autonomous-implementation.md` after a session reset or before multi-hour implementation.
- `docs/runbooks/cloudflare-tunnel-operations.md` before touching Cloudflare Tunnel or legacy Access helpers.
- `docs/runbooks/llm-gemini-langfuse-operations.md` before external LLM or observability work.

For complex implementation, create or update an execution plan using:

`docs/templates/execution-plan-template.md`

## Skill Routing

When the task matches one of these modes, use the matching installed skill together with this project guide:

- Planning a coding task: `create-plan`
- Understanding risk before editing unfamiliar areas: `codebase-recon`
- Large migration or multi-file refactor: `codebase-migrate`
- PR/code review: `brooks-review`
- Architecture audit or codebase tour: `brooks-audit`
- Technical debt prioritization: `brooks-debt`
- Test suite quality review: `brooks-test`
- Overall quality report before a release gate: `brooks-health`
- GitHub Actions failure diagnosis: `gh-fix-ci`
- Browser/webapp verification: `webapp-testing`

Avoid broad framework skills that impose a separate product operating system unless the user explicitly requests them.

## Engineering Rules

- Prefer existing project patterns over new abstractions.
- Keep changes scoped to the active phase or requested task.
- Do not add new Streamlit-first behavior for the external demo path.
- API/schema changes must be reflected in frontend TypeScript types and fixtures.
- LLM provider SDKs must not be imported directly from simulation modules; use the internal LLM client boundary.
- Product result storage may keep protected `raw_results`; external provider and observability payloads should default to metadata-only.
- Preserve user/unrelated vault changes. Never revert files outside the task scope.

## Phase Discipline

- Before implementation, identify the active phase and the relevant execution plan.
- Update phase checkboxes only when the corresponding validation has actually passed.
- Keep `CLAUDE.md` as the project tracker; keep this file as the coding-agent operating guide.
- If the requested work changes architecture, API schemas, queue behavior, auth boundaries, or deployment topology, update the relevant design or execution document in the same change.
- During autonomous sessions longer than 2 hours, checkpoint every 2 hours: stop scope expansion, verify, commit coherent passing work, push when committed, and report status.

## Secrets And Credentials

- Never commit `.env`, API keys, Cloudflare certs, tunnel JSON credentials, tunnel tokens, Langfuse keys, or provider credentials.
- Real Gemini, Cloudflare, LiteLLM, and Langfuse secrets belong only in local `.env`, shell environment, or a secret manager.
- `.env.example` may contain names and placeholders only.
- If a secret appears in chat, code, docs, logs, or git history, treat it as compromised and rotate it.

## Verification

Run the project verification command before reporting implementation complete:

```bash
uv run python scripts/verify.py
```

This currently covers:

- Ruff lint
- deterministic eval fixtures
- pytest with backend coverage threshold
- frontend lint
- frontend typecheck
- frontend production build

If only a faster local check is appropriate, explain what was skipped and why.

## CI And Git

- GitHub workflow lives at the vault repo root:
  `.github/workflows/koresim-ci.yml`
- Workflow filters target this project subtree.
- Repository is private.
- Use branch prefix `codex/` unless instructed otherwise.
- Stage only project files and required root CI files.
- Do not stage unrelated vault files.

## Current Quality Gates

- Backend coverage threshold: 85%.
- Deterministic eval fixtures must pass.
- API envelope fixture and frontend schema parity must pass.
- Queue health should distinguish Redis reachability from active RQ worker readiness.

## Active Phase

Current active phase is Phase 5/7 live validation.

Phase 1, Phase 2, Phase 5, Phase 6, and Phase 7 gates are validated for the public external demo. Current remaining work is post-demo productization:

- PR/main release operation after CI approval.
- app-level auth polish and login-backed E2E expansion.
- local large-model Ollama validation if `gemma3:27b` is available.
- V2 research/product features such as consistency scoring, report export policy, advanced crowd visualization, account/org/billing, and legal/data-retention policy.
