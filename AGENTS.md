# minsim — coding agent guide

Public product repository for **minsim** (AI persona behavior simulation).

## Scope

- Product code: `src/`, `frontend/`, `scripts/`, `tests/`, `evals/`
- Public product docs: `docs/design/`, `docs/functional/`, `README.md`
- Do **not** commit secrets, local runtime data, verification dumps, or machine-specific deploy configs

## Hard rules

1. Never commit `.env`, API keys, OAuth client secrets, Cloudflare tunnel credentials, certs, or Langfuse keys.
2. Prefer placeholders in `.env.example` only.
3. Do not add `docs/verification/`, `test-results/`, Playwright reports, or agent session dirs (`.gjc/`, `.claude/`).
4. Simulation modules must not import provider SDKs directly — use the internal `LLMClient` boundary.
5. Product storage may keep protected `raw_results`; external providers and observability default to metadata-only.
6. Export and MCP surfaces must not return `raw_results`.

## Useful entry points

| Area | Path |
| --- | --- |
| FastAPI app | `src/api/main.py` |
| Simulation registry | `src/simulations/` |
| LLM client | `src/llm/` |
| React app | `frontend/src/` |
| Verify gate | `uv run python scripts/verify.py` |

## Local development

See `README.md` for setup, env template, and verification commands.
