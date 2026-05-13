---
title: Autonomous Work Session Protocol
type: runbook
tags: [autonomous-work, checkpoint, verification, git]
created: 2026-05-03
updated: 2026-05-03
status: draft
related: [[../../AGENTS]], [[../design/harness-engineering-controls]]
---

# Autonomous Work Session Protocol

## 1. Goal

Support long-running coding sessions without losing control of scope, quality, or git history.

Default long-session cadence:

- checkpoint every 2 hours.
- verify before committing when feasible.
- commit coherent completed work.
- report status, evidence, and next step.

## 2. Start Checklist

- [ ] Confirm branch and repo root.
- [ ] Read `AGENTS.md`, `CLAUDE.md`, active phase, and execution plan.
- [ ] After a session reset, read `docs/runbooks/next-autonomous-implementation.md`.
- [ ] Confirm dirty files and ignore unrelated vault changes.
- [ ] Confirm exact target for the next 2-hour block.
- [ ] Confirm which validation command is required for the block.

Commands:

```bash
git status --short
git branch --show-current
uv run python scripts/verify.py --skip-build
```

## 3. Two-Hour Checkpoint

At each 2-hour checkpoint:

- [ ] Stop adding new scope.
- [ ] Run relevant tests.
- [ ] Run full `uv run python scripts/verify.py` if the block touches backend/frontend contract, CI, queue, API, or production UI.
- [ ] Inspect `git diff`.
- [ ] Stage only KoreaSim project files and required root CI files.
- [ ] Commit only coherent work with a clear message.
- [ ] Push the branch when a commit is created.
- [ ] Report:
  - completed work.
  - verification command and result.
  - commit hash, if created.
  - blockers.
  - next 2-hour target.

## 4. If Verification Fails

Do not hide failing verification.

Use this order:

1. Fix the failure if it is clearly caused by the current block.
2. Re-run the failing check.
3. If still failing, do not make a normal completion commit.
4. Report the failure, suspected cause, and whether a WIP checkpoint commit is needed.

Default policy:

- no broken completion commits.
- WIP commits are allowed only when they preserve recoverability and the failure is documented in the commit message and report.

## 5. Commit Rules

- Commit message should identify the phase or subsystem.
- Do not stage unrelated Obsidian vault files.
- Do not commit `.env`, Cloudflare credentials, API keys, provider tokens, local SQLite runtime data, or persona parquet files.
- Update docs/checklists only when validation actually supports the status.

## 6. End-of-Session Report

Final report must include:

- branch.
- commits created.
- verification commands and results.
- files changed by subsystem.
- remaining blockers.
- next recommended block.

## 7. Preferred Checkpoint Targets

For the next autonomous session, prefer this order unless the user redirects:

1. Phase 2 stability and recovery.
2. Cloudflare runbook and local tunnel readiness.
3. Gemini/LiteLLM implementation scaffold.
4. Langfuse metadata-only trace scaffold.
5. Phase 3 Access policy implementation and validation.
