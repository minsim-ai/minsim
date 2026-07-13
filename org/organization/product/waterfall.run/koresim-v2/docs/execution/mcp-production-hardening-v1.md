---
title: MCP Production Hardening V1
type: execution-plan
tags: [mcp, oauth, streamable-http, interoperability, security]
created: 2026-07-13
updated: 2026-07-13
status: session-only-deployed-oauth-pending
related: [[../design/mcp-server-integration]], [[minsim-v2-ux-and-mcp]], [[../design/data-governance-and-io-boundary]], [[../design/harness-engineering-controls]], [[../runbooks/app-auth-operations]]
---

# MCP Production Hardening V1

## 0. Metadata

- [x] Execution plan id: `mcp-production-hardening-v1`
- [x] Target phase: Phase 5/7 post-demo productization
- [x] Related design doc: [[../design/mcp-server-integration]]
- [x] Owner: Codex + product owner
- [x] Status: shared API-key retired; session-only deployed; full OAuth pending
- [x] Created: 2026-07-13
- [x] Updated: 2026-07-13

## 1. Summary

### Objective

- [ ] 현재 배포된 custom MCP foundation을 standards-compatible production remote
  MCP server로 harden한다.

### User-visible outcome

- [ ] 사용자가 지원 MCP host에서 `https://arabesque.cc/mcp`를 추가하고 OAuth login을
  완료한 뒤 자신의 KoreaSim 프로젝트를 조회하고 simulation을 실행한다.
- [ ] MCP에서 run 상태를 확인하고 완료된 redacted report를 읽는다.
- [ ] 다른 사용자의 프로젝트/run은 조회하거나 실행할 수 없다.

### Engineering outcome

- [ ] 공식 stable MCP Python SDK가 lifecycle, protocol negotiation, Streamable HTTP
  framing을 담당한다.
- [ ] remote MCP auth는 browser cookie와 분리된 audience-bound Bearer token을 검증한다.
- [ ] web API와 MCP가 동일한 service/quota/queue/persistence 경계를 유지한다.

### Complexity

- Overall: **High**
- Transport migration: Medium
- Tool contract completion: Medium
- OAuth authorization-server integration and security validation: High
- 예상 구현 단위: 6개의 coherent change cycle. OAuth provider 선정/설정 시간은 별도다.

## 2. Inputs

### Source documents

- [x] Design doc: [[../design/mcp-server-integration]]
- [x] Existing implementation note: [[minsim-v2-ux-and-mcp]]
- [x] Original V2 spec/plan: [[../superpowers/specs/2026-07-10-minsim-v2-full-ux-design]],
  [[../superpowers/plans/2026-07-10-minsim-v2-full-ux]]
- [x] Data policy: [[../design/data-governance-and-io-boundary]]
- [x] MCP 2025-11-25 transport/authorization/tool specifications

### Existing code to read first

- [x] Entry points: `src/api/main.py`, `src/mcp/http.py`
- [x] Registry/schema: `src/mcp/registry.py`, `src/mcp/schemas.py`
- [x] Auth: `src/api/auth.py`
- [x] Service boundary: `src/services/project_service.py`, `src/services/run_service.py`
- [x] Persistence/ownership: `src/jobs/store.py`, `src/jobs/models.py`
- [x] API schemas/routes: `src/api/schemas.py`, `src/api/routes.py`
- [x] Tests: `tests/test_mcp_http.py`, `tests/test_project_api.py`,
  `tests/test_project_store.py`, `tests/test_api_auth.py`

## 3. Scope

### In scope

- [ ] Official stable Python SDK Streamable HTTP integration at `/mcp`.
- [ ] OAuth protected-resource metadata, authorization-server discovery, Bearer token
  verification, audience/resource validation, PKCE-compatible authorization flow.
- [ ] Read/run/feedback scope enforcement and user mapping.
- [ ] Existing tool migration plus status/result, project update/archive, persisted
  interview-thread coverage.
- [ ] Output schemas, tool annotations, pagination, idempotency, structured tool errors.
- [ ] Rate/quota/audit controls for mutating and LLM-costing tools.
- [ ] Official client/Inspector and production external E2E verification.

### Out of scope

- [ ] Simulation engine or RQ worker rewrite.
- [ ] Per-persona LangGraph/MCP branching.
- [ ] Raw persona/result resource exposure.
- [ ] MCP Apps UI and public marketplace publication.
- [ ] Official Python SDK v2 pre-release adoption.

### Dependencies

- [ ] Decision: required client matrix. Minimum recommendation is MCP Inspector plus
  one desktop/CLI host; add ChatGPT/Claude.ai only when explicitly selected.
- [ ] Decision: managed OAuth authorization server/broker or separately reviewed
  first-party authorization server.
- [ ] Dependency: stable `mcp` Python SDK exact version with `<2` bound until the
  post-2026-07-28 compatibility checkpoint.
- [ ] Environment names only: `MCP_ENABLED`, `MCP_AUTH_ISSUER`,
  `MCP_RESOURCE_URL`, `MCP_AUDIENCE`, `MCP_ALLOWED_ORIGINS`; secrets stay outside git.

## 4. Contracts

### HTTP / protocol contract

- [ ] Canonical endpoint: `https://arabesque.cc/mcp`.
- [ ] Baseline protocol: `2025-11-25` with SDK-managed negotiation.
- [ ] Transport: Streamable HTTP; JSON response/stateless V1 is acceptable.
- [ ] Unauthenticated request: HTTP `401` with valid `WWW-Authenticate` resource
  metadata pointer.
- [ ] Invalid Origin: HTTP `403` when an untrusted `Origin` header is present.
- [ ] Invalid/expired token: `401`; insufficient scope: `403`.
- [ ] Authenticated `GET /mcp`: SSE or spec-compliant `405`.

### Authorization contract

- [ ] Protected Resource Metadata works at the advertised URL and path-aware fallback.
- [ ] Authorization Server Metadata or OIDC discovery publishes authorization/token
  endpoints and `S256` PKCE support.
- [ ] Token verifier checks issuer, signature, expiry, audience/resource, and scope.
- [ ] Google remains an upstream identity source only; Google API access tokens are not
  accepted directly as KoreaSim MCP tokens.
- [ ] Token/cookie contents never enter tool output, telemetry, or logs.

### Tool contract

- [ ] Read: list/get project, list runs, get run status, get redacted result/export.
- [ ] Mutating: create/update/archive project, create run, submit feedback, follow-up,
  persisted interview thread.
- [ ] `create_project_run` returns immediately with run id/status reference.
- [ ] Mutating/costly tools accept a deduplication key and honor quota.
- [ ] Validation/business failures are tool execution errors (`isError`) when the
  protocol request itself is valid.
- [ ] Tools publish input schema, output schema, and accurate annotations.
- [ ] List methods use cursor pagination; ownership filtering happens before paging.

### Data contract

- [ ] MCP output uses the protected aggregate/redacted export view.
- [ ] `raw_results`, raw persona rows/UUID collections, raw transcript, hidden prompts,
  and raw provider responses are excluded by default.
- [ ] Audit records contain actor, action, project/run id, timestamp, outcome, and safe
  metadata only.

### Frontend contract

- [ ] No required React route or UI change for the first MCP hardening release.
- [ ] Existing web Google login/session behavior must not regress.
- [ ] If OAuth consent/account-link UI is required by the selected provider, create a
  separate reviewed frontend slice before implementation.

## 5. Implementation Checklist

### 5.0 Approval and decision gate

- [x] Product owner approved external MCP deployment and README usage documentation.
- [ ] Record required client hosts and their E2E ownership.
- [ ] Select authorization-server approach and document issuer, token audience,
  client registration model, consent, revocation, and account mapping.
- [x] Product owner replaced the private Bearer pilot with a logged-in-session-only boundary.
- [ ] Confirm scope names and which tools require each scope.

### 5.1 Characterization and protocol tests

- [x] Expand `tests/test_mcp_http.py` for cookie auth, legacy Bearer rejection,
  Origin rejection, tools/resources, and redacted export behavior.
- [ ] Add official SDK client integration test for initialize/list/call/read.
- [ ] Add protocol negotiation, notification, invalid JSON-RPC, Accept/content-type,
  GET `405`, Origin rejection, and body-size tests.
- [ ] Add ownership-isolation tests across two users.
- [ ] Add redaction fixtures proving `raw_results`, persona UUID, raw prompt/response,
  secrets, and stack traces are absent.

### 5.2 Official SDK transport migration

- [ ] Add exact stable MCP Python SDK dependency and lockfile update.
- [ ] Create an SDK server/registry adapter independent of FastAPI route handlers.
- [ ] Mount the SDK Streamable HTTP ASGI app at the existing `/mcp` path.
- [ ] Preserve `ProjectService` handlers; do not duplicate API business logic.
- [ ] Replace hard-coded protocol response handling with SDK lifecycle negotiation.
- [ ] Keep a feature-flag rollback to the custom route during canary only.

### 5.3 OAuth resource-server integration

- [ ] Implement/attach the chosen authorization server and discovery documents.
- [ ] Implement SDK token verifier and KoreaSim user mapping.
- [ ] Validate issuer, signature, expiry, audience/resource, and scopes on every request.
- [ ] Separate cookie auth and Bearer auth code paths with shared final `UserRecord`.
- [ ] Add revocation/disabled-user behavior and safe auth audit events.
- [ ] Update `docs/runbooks/app-auth-operations.md` with setup, rotation, revoke, and
  incident rollback procedures.

Retired private-pilot slice and session-only replacement:

- [x] Accept a dedicated `KORESIM_MCP_API_KEY` Bearer credential without using or
  exposing `UPSTAGE_API_KEY`.
- [x] Map the credential to a configured KoreaSim user identity and normal quota.
- [x] Compare the key in constant time and reject keys shorter than 32 characters.
- [x] Reject untrusted browser `Origin` headers.
- [x] Generate/store the production pilot key outside git and restart the API.
- [x] Complete authenticated external initialize/tools/list smoke tests.
- [x] Remove the shared Bearer authentication branch and reject the retired key even
  when legacy environment variables are still present.
- [x] Require a signed Google-login session for every MCP tool/resource/prompt request.
- [x] Remove shared MCP key placeholders and client setup instructions.

### 5.4 Tool/resource/prompt contract completion

- [ ] Migrate the existing 9 tools with behavior parity.
- [ ] Add run status and redacted result retrieval so the full async lifecycle is usable
  without falling back to undocumented web APIs.
- [ ] Add project update/archive and persisted interview-thread tools only through
  existing services.
- [ ] Add output schemas, annotations, cursor pagination, and `isError` results.
- [ ] Add idempotency persistence for mutating/costly calls.
- [ ] Make resource URIs/versioning consistent and preserve documented aliases during
  a deprecation window if URI names change.
- [ ] Keep prompts safe and parameterized; prompts must reference redacted resources.

### 5.5 Quota, observability, and abuse controls

- [ ] Verify `create_project_run` uses the same free-run/paid quota ledger as web API.
- [ ] Define separate limits for follow-up/interview LLM calls.
- [ ] Add per-user/IP rate limiting at app or edge layer.
- [ ] Record safe audit metadata for write/cost/export actions.
- [ ] Add MCP health/readiness details only to authenticated internal health.
- [ ] Add log-scrubbing tests for Authorization, cookie, prompt, persona, and result data.

### 5.6 Documentation and release

- [ ] Update [[minsim-v2-ux-and-mcp]] from foundation wording to the validated protocol
  and client setup.
- [ ] Update [[../design/mcp-server-integration]] decisions and actual auth provider.
- [x] Replace README and `.env.example` private-pilot guidance with session-only login
  requirements and an explicit general-client OAuth limitation.
- [ ] Add MCP operator runbook and client connection examples without real secrets.
- [ ] Record validation evidence only after each command/client flow passes.

## 6. Fixtures

- [ ] `mcp_protocol_v1`: initialize/list/call/read/prompt requests and responses.
- [ ] `mcp_two_users_v1`: owner and non-owner project/run data.
- [ ] `mcp_async_run_v1`: queued → running → completed/failed/cancelled snapshots.
- [ ] `mcp_redaction_v1`: protected raw result with expected safe export.
- [ ] `mcp_idempotency_v1`: duplicate `client_request_id` creates one side effect.
- [ ] Fixtures use the real Pydantic/service schemas and clearly marked fake identities.

## 7. Edge Cases and Exceptions

### Protocol/input

- [ ] Unsupported protocol version and mismatched `MCP-Protocol-Version`.
- [ ] Missing/invalid `Accept` or content type.
- [ ] Invalid JSON-RPC, notification without id, batch/oversized payload.
- [ ] Unknown tool/resource/prompt and malformed cursor.

### Runtime

- [ ] Redis reachable but no ready RQ worker.
- [ ] Queue enqueue failure after quota reservation.
- [ ] Run pending/running/failed/cancelled/expired.
- [ ] SQLite contention or unavailable result.
- [ ] LLM timeout/parse failure/fallback/review-required result.
- [ ] Client retries after timeout or network disconnect.

### Security

- [ ] Missing, expired, wrong-issuer, wrong-audience, or wrong-scope token.
- [ ] Cross-user project/run identifiers.
- [ ] Untrusted Origin and host-header/base-URL spoofing.
- [ ] Token replay, duplicate costly request, prompt/tool injection attempt.
- [ ] OAuth metadata/client registration SSRF and unsafe redirect URI.

## 8. Verification

### Focused automated checks

```bash
uv run python -m pytest tests/test_mcp_http.py tests/test_project_api.py tests/test_project_store.py tests/test_api_auth.py -q
uv run python scripts/verify.py
```

### Protocol/client checks

- [ ] Official Python SDK client connects locally and exercises initialize/list/call/read.
- [ ] MCP Inspector completes OAuth and exercises read + async run + result flow.
- [ ] Every selected target host completes the same owned-project happy path.
- [ ] A second account cannot read or mutate the first account's data.
- [ ] Retry with the same idempotency key does not create a second run/cost action.

### Production release gate

```bash
npm --prefix frontend run build
launchctl kickstart -k gui/$(id -u)/com.koresim.api
launchctl kickstart -k gui/$(id -u)/com.koresim.worker
uv run python scripts/check_mac_studio_production.py --external --timeout-seconds 15
```

- [ ] External `/.well-known/oauth-protected-resource` and authorization-server
  discovery pass.
- [ ] External unauthenticated request returns safe `401` metadata.
- [ ] Authenticated canary account completes create → poll → redacted result.
- [ ] Existing landing, web login, project UI, queue, and result pages pass regression.

## 9. Acceptance Criteria

- [ ] `/mcp` interoperates with the official SDK client, Inspector, and every approved
  target host.
- [ ] OAuth login/token flow is standards-compatible and validates audience/scopes.
- [ ] A complete asynchronous simulation can be driven only through documented MCP
  tools/resources.
- [ ] All write/cost operations are quota-controlled, auditable, and retry-safe.
- [ ] Cross-user access and raw data leakage tests pass.
- [ ] `uv run python scripts/verify.py` passes at the existing 85% coverage gate.
- [ ] Production external check and MCP canary pass after scoped commit/deploy.

### Must not regress

- [ ] React/FastAPI web flow and signed web session remain operational.
- [ ] Existing service ownership checks and quota ledger remain source of truth.
- [ ] Redis/RQ worker and result-agent workflow remain unchanged in responsibility.
- [ ] Export remains human-review-required and excludes `raw_results`.
- [ ] Langfuse remains metadata-only.

## 10. Observability and Debugging

- [ ] Metrics: request count/latency/status by MCP method and safe tool name.
- [ ] Metrics: auth failure category, rate-limit/quota rejection, tool error, run outcome.
- [ ] Correlation: safe MCP request id → user id → project/run id → RQ job id.
- [ ] No prompt, token, cookie, persona row, raw response, or raw result in logs/traces.
- [ ] Internal readiness distinguishes MCP route, auth verifier, Redis, RQ worker, SQLite.

## 11. Rollback Plan

- [ ] Disable production MCP with `MCP_ENABLED=false` without affecting web APIs.
- [ ] During canary only, switch back to the existing custom route implementation.
- [ ] Revoke MCP tokens/clients at the authorization server.
- [ ] No simulation/persistence schema is removed by the transport migration.
- [ ] Idempotency/audit tables, if added, are additive and safe to retain on rollback.

## 12. Risks

| Risk | Level | Mitigation |
| --- | --- | --- |
| Existing Google cookie auth is mistaken for MCP OAuth | High | Label session-only access as interim; block general client setup until per-user OAuth |
| Self-built authorization server introduces security flaws | High | Prefer managed AS; require separate review if first-party |
| Client retries duplicate paid runs/follow-ups | High | idempotency key + persistent dedupe |
| Raw personas/results leak through resources | High | redacted DTO + leak fixtures + output allowlist |
| SDK/spec changes around 2026-07-28 | Medium | stable v1 exact pin; post-release compatibility checkpoint |
| Custom-to-SDK migration regresses existing tools | Medium | characterization tests + feature-flag canary |
| Long run exceeds HTTP/tool timeout | Medium | async create/status/result contract |
| Tool list grows beyond model usability | Medium | focused tool taxonomy, descriptions, scopes, annotations |

## 13. Review and Completion Log

### Approval required before implementation

- [ ] Plan approved by product owner.
- [ ] Required target clients selected.
- [ ] Authorization-server approach selected.
- [ ] Scope/idempotency policy selected.

### Current validation evidence

- [x] 2026-07-13: `uv run python -m pytest tests/test_mcp_http.py -q` — 3 passed.
- [x] 2026-07-13: `uv run python scripts/verify.py` — Ruff, deterministic evals,
  202 backend tests, 89.33% coverage, frontend lint/typecheck/build passed.
- [x] 2026-07-13: private-pilot change gate — 205 backend tests, 89.33% coverage,
  Ruff, deterministic evals, frontend lint/typecheck/build passed.
- [x] 2026-07-13: live protected-resource metadata returned HTTP 200 with
  `resource=https://arabesque.cc/mcp`.
- [x] 2026-07-13: unauthenticated live initialize returned HTTP 401 and
  `WWW-Authenticate` metadata pointer.
- [x] 2026-07-13: external Bearer pilot initialize, tools/list, and list_projects
  returned HTTP 200; 9 tools were advertised; invalid key returned 401 and untrusted
  Origin returned 403.
- [x] 2026-07-13: product owner retired the shared Bearer pilot. Focused TDD first
  proved the configured legacy key still returned 200, then the implementation removed
  that branch; `tests/test_mcp_http.py` now passes 6 tests with session auth accepted,
  legacy Bearer rejected at 401, and authenticated untrusted Origin rejected at 403.
- [x] 2026-07-13: focused auth/project regression passed 23 tests, then the full gate
  passed 206 tests with 89.32% coverage and frontend lint/typecheck/build.
- [x] 2026-07-13: commit `db4e610` deployed; production readiness passed. External
  anonymous and Bearer-only initialize both returned 401, metadata advertised only
  `google_session_cookie`, and Google login start returned a safe 303 redirect to
  accounts.google.com. Evidence: `docs/verification/mcp-session-only-auth-boundary-2026-07-13.json`.
- [ ] Official client authenticated interoperability has not yet been demonstrated.
- [ ] Production OAuth token flow has not yet been implemented or validated.

### Completion log

- [x] Session-only security slice implementation completed: shared Bearer removed.
- [x] Session-only security slice full verification passed: 206 tests, 89.32% coverage.
- [x] Session-only external negative canary passed: anonymous/Bearer-only 401.
- [x] Session-only docs/status updated.
- [ ] Overall hardening known gaps: official SDK and per-user remote OAuth remain.
