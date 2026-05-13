---
title: KoreaSim Three-Minute Demo Script
type: runbook
tags: [demo, phase-4, react, trust-layer]
created: 2026-05-03
updated: 2026-05-03
status: draft
related: [[../phases/phase-4-demo-content]], [[../execution/phase-4-demo-content-trust-layer]]
---

# KoreaSim Three-Minute Demo Script

## Goal

Show that a protected visitor can start a KoreaSim run quickly, watch progress, and inspect the result with trust context.

## Script

### 0:00-0:30 — Public Landing

- Open `https://arabesque.cc/`.
- State that the public landing is intentionally unauthenticated.
- Point out the Korea-specific data source: `NVIDIA Nemotron-Personas-Korea, CC BY 4.0`.

### 0:30-1:00 — Protected App Entry

- Open `/app`.
- In the final protected setup, Cloudflare Access should require Google or OTP authentication before the app appears.
- Choose one of the quick-start presets:
  - Galaxy advertising creative comparison.
  - Coffee price-message fallback.
  - OTT value-proposition fallback.

### 1:00-1:45 — Run Lifecycle

- Start the preset run.
- Show queued/running progress.
- Mention that SSE is primary, polling fallback recovers when SSE drops, and browser refresh restores the latest run by `run_id`.

### 1:45-2:40 — Results and Trust Layer

- Open the result page.
- Show the API result connection banner and trust summary:
  - total responses.
  - parse success rate.
  - sample grade.
  - warnings.
  - sample summary.
  - seed, target filter, model/provider metadata, and timestamp.
- State the non-dismissible limitation: the result is a synthetic persona simulation, not a real survey or guaranteed market proof.

### 2:40-3:00 — Close

- Explain the current production path:
  - React + FastAPI.
  - Redis/RQ worker.
  - SQLite persisted run/result store.
  - Gemini primary LLM.
  - Ollama fallback boundary.
  - Langfuse metadata-only traces.
- If Cloudflare Access is not yet applied, close by naming it as the only external deployment blocker.
