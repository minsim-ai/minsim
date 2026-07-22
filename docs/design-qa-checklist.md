---
title: KoreaSim Design QA Checklist
type: checklist
tags: [frontend, design-qa, phase-6]
created: 2026-05-03
updated: 2026-05-03
status: active
related: [[CLAUDE]], [[phases/phase-6-design-sync]], [[functional/visualization-spec]], [[functional/quality-and-trust]]
---

# KoreaSim Design QA Checklist

Use this checklist before marking a React demo change ready for external review.

## Routes

- `/` renders the public landing without protected run data.
- `/app` can start a preset run and keeps custom Creative Testing input usable.
- `/results` shows no-run, loading, running, partial/not-ready, failed, interrupted, and completed states in product language.
- Refreshing `/results?run_id=<id>` restores the selected run without losing state.

## Trust Layer

- Completed results show `schema_version`, sample size, total responses, parse failure count, seed, model alias/backend/provider metadata when available, target filter, quality, warnings, and dataset attribution.
- Disclaimer and limitations are visible and cannot be dismissed.
- Raw persona evidence is not presented as real survey respondent data.
- Warnings are visible near result interpretation, not hidden in developer-only panels.

## Layout

- Long Korean text wraps without overlap on desktop and mobile.
- Buttons have loading or disabled states during async operations.
- Cards use the project CSS tokens in `frontend/src/styles.css`.
- Result cards do not depend on hardcoded fixture-only values in production routes.
- Empty/error states use user-facing copy and keep the next action clear.

## Recovery

- SSE disconnect shows a recovery or fallback state.
- Polling fallback does not corrupt completed result rendering.
- API errors do not erase the last known run id unless the run is explicitly unavailable.
- Cloudflare Access redirects or challenges should not be rendered as JSON errors in the UI.

## Verification

Automated:

```bash
uv run python scripts/verify.py
```

Manual when UI changed:

```bash
cd frontend && npm run build
```

Then inspect desktop and mobile viewports for `/`, `/app`, and `/results`.
