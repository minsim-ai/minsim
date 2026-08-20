---
title: Focus Group (open_survey pilot)
type: design-doc
tags: [focus-group, open-survey, interactive]
created: 2026-08-04
updated: 2026-08-04
status: active
---

# Focus Group — open_survey pilot

## Decision

Add an **on-demand 9-person focus group** as a session resource under a completed `open_survey` run. Main 1:1 metrics stay immutable.

## Product

- Trigger: results page CTA only (not auto after main run).
- Panel: 9 respondents who chose the same `cohort_option`.
- Goal: D (deeper evidence) → A (stance change), with honest bias warnings.
- Protocol id: `focus_group_round_robin_v1`.

## Protocol (bias-aware)

1. **Opening (parallel)** — each of 9 speaks without seeing others (reduces first-speaker anchoring).
2. **Moderator bridge** — system text, no LLM.
3. **Reaction (sequential)** — round-robin with full prior transcript.
4. **Final stance (parallel)** — structured JSON `final_choice` / `reason`.
5. **Summary (rule-based)** — changed_count, quotes, first-speaker echo heuristic.

## API

- `POST /api/projects/{project_id}/runs/{run_id}/focus-groups`
- `GET  /api/projects/{project_id}/runs/{run_id}/focus-groups`
- `GET  /api/projects/{project_id}/runs/{run_id}/focus-groups/{focus_group_id}`

Schema version: `focus-group/v1`. Storage: dedicated `focus_groups` table. Export/MCP default: exclude full transcripts.

## Guards

- `simulation_type == open_survey`
- run completed + result ready
- `cohort_option` in survey options
- at least 9 parseable rows for that choice
- **atomic** at most one `running`/`queued` focus group per run (`create_focus_group_if_idle` + `BEGIN IMMEDIATE`)
- **stale reclaim**: active sessions with `updated_at` older than 35m → `failed` (`stale_or_worker_lost`)
- job **fail-closed**: client init + protocol errors always mark `failed` (never leave sticky `running`)
- all finals unparsed → `failed` (`all_final_stances_unparsed`)
- interactive rate limit: `focus_group` costs **10 units** (vs 1 for interview turn)
- schedule: prefer RQ when queue healthy; else process-local thread (`execution_mode` in progress)

## UI

Section below `OpenSurveyResult` on minsim results: launcher, progress poll, timeline, stance table, summary + methodology note on order/conformity bias.

## Verification (automated)

| Layer | Coverage | Command |
| --- | --- | --- |
| Unit | panel selection, stance parse, protocol order (opening before reaction), summary/echo | `uv run pytest tests/test_focus_group.py -q` |
| Service | inline complete, non-open_survey reject, n&lt;9 reject, persona not in API panel | `uv run pytest tests/test_focus_group_service.py -q` |
| API | happy path schema, metrics immutability, 400/409/422 guards, active-session block | `uv run pytest tests/test_focus_group_api.py -q` |
| Regression | open_survey + project API | `uv run pytest tests/test_open_survey.py tests/test_project_api.py -q` |

**Result invariants checked in tests**

1. Main `metrics.choice_counts` / `choice_pct` unchanged after focus group.
2. Timeline: all opening participant turns before any reaction participant turn.
3. 27 LLM calls (9+9+9) for full protocol with fake client.
4. API panel omits `persona` blobs.
5. Concurrent queued/running session → 409.
