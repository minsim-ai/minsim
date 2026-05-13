---
title: KoreaSim Documentation Debt Audit
type: audit
tags: [documentation, debt, tracker]
created: 2026-05-03
updated: 2026-05-03
status: active
related: [[CLAUDE]], [[execution/README]], [[execution/protected-demo-completion-audit]]
---

# KoreaSim Documentation Debt Audit

## Purpose

This note records the 2026-05-03 documentation reconciliation pass. It separates real remaining work from stale unchecked boxes in historical execution plans.

## Resolved Debt

- Completed execution plans now use completed/protected status instead of draft/in-progress where applicable.
- Gate 1A contract inventory was reconciled so schema/config/LLM boundary items no longer look unfinished.
- Phase 1 execution was reconciled against the later external Gemini, Cloudflare Tunnel, Phase 2 stability, and Phase 3 protected-route evidence.
- Phase 2, Phase 4, and Phase 6 out-of-scope and rollback items were converted from task checkboxes to reference notes.
- Phase 6 status now reflects completion; concrete component/registry extraction remains deferred until Phase 5 creates repeated renderer pressure.
- Phase 7 execution now distinguishes completed protected-demo gateway scope from remaining agentic/memory work.
- `docs/execution/README.md` now marks completed execution artifacts and explicitly labels planned work.

## True Remaining Work Buckets

- Cloudflare Access authenticated browser validation:
  - allowlisted Google login.
  - React route after Access session.
  - `/api/config` after Access session.
  - SSE or polling run progress after Access session.
  - unlisted account deny and Access log review.
- Phase 5 simulation expansion:
  - common simulation framework.
  - Price Optimization reference implementation.
  - remaining simulation modules, forms, renderers, presets, and external validations.
- Phase 7 future orchestration:
  - full task-based model routing for analysis/report/schema-repair/QA tasks.
  - run-level LangGraph expansion if needed.
  - analysis/report/QA agent split if Phase 5 creates enough result diversity.
  - project/session memory schema.
  - full planned local `gemma3:27b` fallback validation and full Creative Testing through LiteLLM -> Ollama.

## Tracking Rule

Historical plans may keep design details, contracts, and rollback notes, but only real executable remaining work should use unchecked task boxes. Deferred notes should be plain bullets or moved to a clearly named Remaining Work section.
