---
title: Unit Test Gate
type: verification-artifact
created: 2026-05-03
status: passed
related:
  - ../runbooks/autonomous-work-session
  - ../../scripts/verify.py
---

# Unit Test Gate

## Scope

This artifact records the required KoreaSim unit-test and verification gate run on 2026-05-03 after the Phase/functional-spec reconciliation checkpoint.

## Working Tree

- KoreaSim project subtree was clean before test execution.
- No implementation changes were required.

## Backend Unit Tests

Command:

```bash
uv run pytest --cov=src/api --cov=src/jobs --cov=src/runtime --cov=src/simulations --cov=src/agent --cov=src/llm --cov=src/orchestration --cov-report=term-missing --cov-fail-under=85 tests
```

Result:

- Tests collected: 127.
- Tests passed: 127.
- Failures: 0.
- Coverage: 87.60%.
- Coverage gate: passed, above the required 85%.

Covered suites:

- API app and schemas.
- RQ/job store/worker lifecycle.
- Queue health.
- Simulation registry and result envelope fixtures.
- LLM factory, tracing, Ollama/LiteLLM check scripts.
- Phase 7 orchestration graph/agents/memory.
- Cloudflare Access/public-route helper checks.
- Import boundaries and schema parity.

## Full Project Verify

Command:

```bash
uv run python scripts/verify.py
```

Result:

- Ruff: passed.
- Creative fixture eval: passed.
- Result envelope fixture eval: passed.
- Pytest with coverage gate: 127 passed, 87.60% coverage.
- Frontend ESLint: passed.
- Frontend TypeScript check: passed.
- Frontend production build: passed.

Note:

- Vite emitted the existing large chunk warning for `index-*.js`; this is advisory and did not fail the build.
