---
title: Phase 3 Execution — Cloudflare Access Path Policy
type: execution-plan
tags: [phase-3, execution, cloudflare, access, auth]
created: 2026-05-02
updated: 2026-05-03
status: superseded-by-public-route
related: [[../templates/execution-plan-template]], [[../phases/phase-3-cloudflare-access]]
---

# Phase 3 Execution — Cloudflare Access Path Policy

## 0. Metadata

- [x] Execution plan id: `phase-3-access-path-policy`
- [x] Target phase: Phase 3
- [x] Related design doc: [[../design/react-fastapi-migration]]
- [x] Owner: KoreaSim
- [x] Status: protected route gate passed historically; current product route is public Cloudflare Tunnel
- [x] Created: 2026-05-02
- [x] Updated: 2026-05-03

## 1. Summary

### Objective

- [x] Keep `arabesque.cc/` public.
- [x] Historical: protect `/app*`, `/results*`, and `/api*` with Cloudflare Access Google IdP and allowlisted emails.
- [x] Current: remove Cloudflare Access allowlist and serve `/app*`, `/results*`, and `/api*` publicly through the tunnel.

### User-visible outcome

- [x] unauthenticated visitors can read the landing page.
- [x] Historical protected-demo gate required Cloudflare Access login.
- [x] Current demo app and API do not require Cloudflare Access login.

### Engineering outcome

- [x] Access policy is documented.
- [x] API/SSE works through the current public external route; authenticated Access browser validation is superseded by the public-route product decision.

## 2. Inputs

### Source documents

- [x] Phase plan: [[../phases/phase-3-cloudflare-access]]
- [x] Design doc: [[../design/react-fastapi-migration#5.13 Routing and Cloudflare]]

### Existing code to read first

- [x] FastAPI route list.
- [x] React routes.
- [x] Cloudflare tunnel config.

## 3. Scope

### In scope

- [x] Zero Trust application.
- [x] Email OTP provider, or Google IdP through Cloudflare Access if social login is selected.
- [x] allowlist policy.
- [x] path policy for `/app*`, `/results*`, `/api*`.
- [x] public landing validation.
- [x] access-policy documentation.
- [x] pre-configuration command gate for public/protected route classification.
- [x] dry-run-first Cloudflare API helper for Access app/policy creation.
- [x] optional Cloudflare Access `allowed_idps` support for Google social login.

### Out of scope

Retained as deferred notes, not Phase 3 completion tasks:

- custom auth.
- SSO.
- organization roles.
- audit log automation.

### Dependencies

- [x] Phase 1 tunnel works.
- [x] Cloudflare dashboard/API access.
- [x] Authenticated Access inbox/browser dependency removed from current route policy.

## 4. Contracts

### Access contract

- [x] `/` public.
- [x] Historical: `/app*` protected.
- [x] Historical: `/results*` protected.
- [x] Historical: `/api*` protected.
- [x] Current: `/app*`, `/results*`, and `/api*` return public origin responses.
- [x] session duration: 24h.

### Error contract

- [x] Unlisted email denial is not applicable to the current public route policy.
- [x] Expired Access session redirect is not applicable to the current public route policy.

### Frontend contract

- [x] landing links point to `/app`.
- [x] app can call `/api/*` through the current public route.
- [x] SSE connection works through the current public route.

## 5. Implementation Checklist

### 5.1 Cloudflare

- [x] enable Zero Trust.
- [x] configure team domain.
- [x] create self-hosted app.
- [x] configure paths.
- [x] enable Google IdP.
- [x] configure Google IdP in Cloudflare Access and pass its IdP UUID.
- [x] create allow policy.
- [x] test unauthenticated protected paths redirect to Access login.
- [x] prepare API helper: `scripts/configure_cloudflare_access.py`.

### 5.2 Backend

- [x] `/health` remains public and minimal.
- [x] detailed health is exposed only under protected `/api/health` or `/api/config`.
- [x] ensure API calls use same-origin relative URLs.
- [x] no backend custom auth added.

### 5.3 Frontend

- [x] landing CTA points to `/app`.
- [x] app handles Access redirects naturally.
- [x] SSE reconnect copy handles auth/session issues.

### 5.4 Documentation

- [x] `docs/research/access-policy.md`.
- [x] allowlist add/remove steps.
- [x] test checklist.
- [x] completion audit: [[protected-demo-completion-audit]]

## 6. Mock Data and Fixtures

### Required mock data

Private operational examples are kept outside committed docs:

- allowlisted email examples.
- denied email examples.
- sample invitation copy.

### Mock data details

- use placeholder emails except actual admin/test email.
- record session duration.

### Fixture rules

- [x] do not commit OTP codes or Google OAuth secrets.
- [x] do not commit private Cloudflare tokens.

## 7. Edge Cases and Exceptions

### Access/security

Risk cases considered for manual browser validation and future Access log review:

- `/api/config` accidentally public.
- `/results` protected but `/results/abc` public.
- SSE blocked by session expiry.
- Google Access login fails or selected account is not allowlisted.
- allowlist removal while session is active.

## 8. Tests

### Manual checks

- [x] Incognito `arabesque.cc/` shows landing without Access login.
- [x] Incognito `arabesque.cc/app` shows Access login.
- [x] unlisted email denied check superseded by public-route decision.
- [x] listed Google account authentication check superseded by public-route decision.
- [x] public app loads.
- [x] public `/api/config` returns data.
- [x] public SSE run replay/progress works.

### Commands

```bash
curl -I https://arabesque.cc/
curl -I https://arabesque.cc/app
curl -I https://arabesque.cc/api/config
curl -I https://arabesque.cc/api/runs/access-gate-probe/events
uv run python scripts/configure_cloudflare_access.py --allowlist-email demo@example.com
uv run python scripts/configure_cloudflare_access.py --allowlist-email demo@example.com --allowed-idp "$CLOUDFLARE_GOOGLE_IDP_ID" --auto-redirect-to-idp
uv run python scripts/check_cloudflare_access.py
```

`scripts/check_cloudflare_access.py` is expected to fail until Access is configured. Passing means `/` is public and unauthenticated `/app`, `/results`, `/api/health`, `/api/config`, and `/api/runs/access-gate-probe/events` are classified as Cloudflare Access challenge or deny responses.

## 9. Acceptance Criteria

### Pass conditions

- [x] landing is public.
- [x] app/api/results are protected.
- [x] any public user can run the current demo.
- [x] Cloudflare Access unregistered-user block is intentionally disabled for the current demo.

### Must not regress

- [x] Phase 1 local path routing still works.
- [x] SSE still works through the current public route.

## 10. Observability and Debugging

- [x] Cloudflare Access logs are not part of the current public-route gate.
- [x] denied attempts are not applicable while Access is disabled.
- [x] app/API status is visible through public health/config gates.

## 11. Rollback Plan

Rollback notes retained for operational reference; no Access rollback was required:

- disable Access application.
- revert paths to previous policy.
- keep landing public.

## 12. Review Checklist

- [x] no accidental full-domain lockout.
- [x] `/api*` included in policy.
- invitation instructions are tracked as operational copy outside public docs.

## 13. Completion Log

- [x] Implementation completed: Cloudflare Google IdP `537f1f75-c649-4da6-b26c-5455c5d80aa0`, Access app `1f3c0008-fd22-41ca-8d78-f676a9814276`, and allow policy `f98828a3-798f-4243-a129-5db2c75a31e5` created; `uv run python scripts/check_cloudflare_access.py --timeout-seconds 12` passed.
- [x] Tests run: `uv run pytest tests/test_cloudflare_access_check.py`; `uv run pytest tests/test_configure_cloudflare_access.py`; `uv run ruff check scripts/check_cloudflare_access.py scripts/configure_cloudflare_access.py tests/test_cloudflare_access_check.py tests/test_configure_cloudflare_access.py`
- [x] Known gaps reconciled: authenticated Google browser session, unlisted-user deny, API-after-login, and SSE-after-login were superseded when the product decision changed to public app/API access.
- [x] Current public route gate: `uv run python scripts/check_public_external_demo.py --timeout-seconds 15` passed with no Cloudflare Access markers, and external SSE replay returned snapshot/progress events.
- [x] Phase docs updated:
- [x] Previous checkpoint: commit `f03f8c0` passed local verify and push/PR CI; readiness was blocked on missing Cloudflare credentials, allowlist, and Google IdP UUID at that time.
- [x] Next execution plan: [[phase-4-demo-content-trust-layer]]
