---
title: KoreaSim Simulation Addition Checklist
type: checklist
tags: [simulation, api, frontend, phase-5, phase-6]
created: 2026-05-03
updated: 2026-05-03
status: active
related: [[CLAUDE]], [[api-result-schema]], [[phases/phase-5-simulations]], [[phases/phase-6-design-sync]]
---

# KoreaSim Simulation Addition Checklist

Use this checklist before implementing any new simulation beyond Creative Testing.

## Contract First

- Add or confirm the `SimulationType` value in `src/api/schemas.py`.
- Define the request input schema before adding UI fields.
- Keep common result fields in `RunResultEnvelope`.
- Put simulation-specific output under `metrics`, `segments`, and `insights`.
- Keep `schema_version` compatible or intentionally document a version bump in `docs/api-result-schema.md`.
- Update `frontend/src/types/api.ts` and schema parity tests in the same change.

## Backend

- Add the simulation module under `src/simulations/`.
- Keep provider SDK imports out of simulation modules; use the internal LLM client boundary.
- Add parser behavior and parse failure accounting.
- Ensure the worker persists a complete result envelope and partial results when available.
- Add tests for input validation, worker success, worker failure, and result envelope shape.

## Frontend

- Add or update preset data through the backend preset endpoint, not a production-only mock.
- Add renderer logic that reads only API envelope fields.
- Cover loading/running/partial/completed/failed/interrupted states.
- Keep trust layer, quality warnings, and dataset attribution visible.
- Do not add hardcoded production result numbers.

## Evaluation

- Add deterministic fixture coverage when the simulation has a parser or derived metric.
- Add schema parity coverage for new input/result fields.
- Add a live smoke command only after deterministic tests pass.

## Documentation

- Update the active phase document and execution plan with validated evidence only.
- Update `docs/api-result-schema.md` if the envelope or metrics pattern changes.
- Update the 3-minute demo script only if the new simulation becomes part of the default external demo.

## Verification

Minimum local gate:

```bash
uv run pytest tests/test_api_schemas.py tests/test_schema_parity.py tests/test_jobs_worker.py
cd frontend && npm run typecheck && npm run build
```

Release gate:

```bash
uv run python scripts/verify.py
```
