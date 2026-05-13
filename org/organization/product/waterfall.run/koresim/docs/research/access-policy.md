---
title: KoreaSim Demo Access Policy
type: operations-note
tags: [cloudflare-access, phase-3, demo]
created: 2026-05-03
updated: 2026-05-03
status: protected
related:
  - [[../phases/phase-3-cloudflare-access]]
  - [[../execution/phase-3-access-path-policy]]
  - [[../runbooks/cloudflare-tunnel-operations]]
---

# KoreaSim Demo Access Policy

## Policy Contract

- Public route: `https://arabesque.cc/`
- Protected routes: `https://arabesque.cc/app*`, `https://arabesque.cc/results*`, `https://arabesque.cc/api*`
- Identity provider: Cloudflare Access Google IdP
- Session duration: 24h unless a shorter demo window is required
- Allow policy: include explicit demo participant email addresses only

## Current Status

Cloudflare Tunnel, origin routing, and Cloudflare Access protected-route enforcement have been validated.

Latest gate evidence: with FastAPI origin and `koresim-arabesque` tunnel running on 2026-05-03, `uv run python scripts/check_cloudflare_access.py --timeout-seconds 12` returned public 200 for `/` and Cloudflare Access login redirects for `/app`, `/results`, `/api/health`, `/api/config`, and `/api/runs/access-gate-probe/events`. The gate therefore covers landing, React app, results, API, and SSE-shaped API surfaces.

Cloudflare Access was applied with Google IdP `537f1f75-c649-4da6-b26c-5455c5d80aa0`, Access app `1f3c0008-fd22-41ca-8d78-f676a9814276`, and allow policy `f98828a3-798f-4243-a129-5db2c75a31e5`.

Do not commit real participant email lists if they are private. Keep operational allowlists in Cloudflare Zero Trust or a private secret manager.

## Allowlist Changes

Add a participant:

1. Open Cloudflare Zero Trust.
2. Go to Access > Applications > `KoreaSim Demo`.
3. Edit the allow policy.
4. Add the participant email to the Include email list.
5. Save and verify with an incognito browser session.

Remove a participant:

1. Open the same Access policy.
2. Remove the email from the Include list.
3. Save the policy.
4. Revoke active sessions if immediate removal is required.
5. Verify the removed email receives Access denied.

## Verification Checklist

- [x] `https://arabesque.cc/` loads without Access.
- [x] `https://arabesque.cc/app` shows Cloudflare Access login before authentication.
- [x] `https://arabesque.cc/results` shows Cloudflare Access login before authentication.
- [x] `https://arabesque.cc/api/health` shows Cloudflare Access login or deny before authentication.
- [x] `https://arabesque.cc/api/config` shows Cloudflare Access login or deny before authentication.
- [x] `https://arabesque.cc/api/runs/access-gate-probe/events` shows Cloudflare Access login or deny before authentication.
- [ ] unlisted email receives Access denied.
- [ ] allowlisted Google account can create an Access session.
- [ ] after Google login, React app loads.
- [ ] after Google login, `/api/config` returns data.
- [ ] after Google login, a run progresses over SSE or polling fallback.

Command gate:

```bash
uv run python scripts/check_cloudflare_access.py
```

This command should fail before Access is configured and pass after unauthenticated React, results, API, and SSE-shaped protected paths return Cloudflare Access challenge or deny responses.

The gate requires an explicit Cloudflare Access marker in the response header, redirect location, or body. Origin-only `401` or `403` responses are treated as failures because they do not prove that Cloudflare Access is protecting the route.

Pre-apply readiness gate:

```bash
uv run python scripts/check_protected_demo_readiness.py --require-google-idp
```

This command checks for required runbooks/audit artifacts, Cloudflare Access apply variable names, readable `KORESIM_ACCESS_ALLOWLIST_FILE` when configured, rotated Google OAuth credential readiness, and OAuth client JSON files inside the project tree without printing secret values or allowlist contents. It should return `ready_to_apply_access` when Cloudflare API scope, allowlist, and the Cloudflare Access Google IdP UUID are available.

## API Automation

Cloudflare's API supports creating self-hosted Access applications at:

- `POST /{accounts_or_zones}/{account_or_zone_id}/access/apps`
- Required permission: `Access: Apps and Policies Write`
- Application-scoped policy endpoint: `POST /{accounts_or_zones}/{account_or_zone_id}/access/apps/{app_id}/policies`

KoreaSim provides a dry-run-first helper:

```bash
uv run python scripts/configure_cloudflare_access.py \
  --account-id "$CLOUDFLARE_ACCOUNT_ID" \
  --allowlist-email "demo@example.com"
```

For Google social login through Cloudflare Access, first create/update Google as an Access identity provider, then pass its Access IdP UUID:

```bash
uv run python scripts/configure_cloudflare_access.py --create-google-idp --apply
```

The command returns an IdP UUID; store it in local `.env` as `CLOUDFLARE_GOOGLE_IDP_ID`.

To list configured IdPs:

```bash
uv run python scripts/configure_cloudflare_access.py \
  --account-id "$CLOUDFLARE_ACCOUNT_ID" \
  --api-token "$CLOUDFLARE_API_TOKEN" \
  --list-idps
```

The list command prints only IdP `id`, `name`, and `type`; it intentionally does not print provider config or OAuth secrets.

After identifying the Google IdP UUID:

```bash
uv run python scripts/configure_cloudflare_access.py \
  --account-id "$CLOUDFLARE_ACCOUNT_ID" \
  --allowlist-email "demo@example.com" \
  --allowed-idp "$CLOUDFLARE_GOOGLE_IDP_ID" \
  --auto-redirect-to-idp
```

Apply only after reviewing the payload:

```bash
uv run python scripts/configure_cloudflare_access.py \
  --apply \
  --account-id "$CLOUDFLARE_ACCOUNT_ID" \
  --api-token "$CLOUDFLARE_API_TOKEN" \
  --allowlist-email "demo@example.com" \
  --allowed-idp "$CLOUDFLARE_GOOGLE_IDP_ID" \
  --auto-redirect-to-idp
```

The script creates or updates:

- self-hosted app: `KoreaSim Demo`
- destinations: `arabesque.cc/app*`, `arabesque.cc/results*`, `arabesque.cc/api*`
- allow policy: `Allow KoreaSim Demo Emails`
- session duration: `24h`

The helper loads the project-local `.env` file automatically without overriding already exported shell variables. It does not print token, secret, or allowlist contents. Dry-run output redacts allowlist emails and reports only the count. Cloudflare API error output also redacts email addresses and secret/token-like fields before printing. For allowlists, use either `KORESIM_ACCESS_ALLOWLIST` or `KORESIM_ACCESS_ALLOWLIST_FILE`; unreadable allowlist files fail locally with a JSON error before any Cloudflare write attempt. For a single Google IdP UUID, use either `CLOUDFLARE_GOOGLE_IDP_ID` or `CLOUDFLARE_ACCESS_ALLOWED_IDPS`.

After `--apply`, run:

```bash
uv run python scripts/check_cloudflare_access.py
```

Do not write API tokens or private participant email lists into committed files. Use environment variables, `KORESIM_ACCESS_ALLOWLIST_FILE`, or a private `--allowlist-file`.

## Google OAuth Secret Handling

If a Google OAuth client secret is shared in chat, logs, docs, or git history, treat it as compromised and rotate it in Google Cloud Console before use.

Do not commit Google OAuth client JSON files. The project `.gitignore` excludes common `client_secret*.json` and OAuth client JSON names, but secret files should still stay outside the repository.

For KoreaSim's current React + FastAPI architecture, do not add Better Auth directly unless the app is migrated to Next.js. Use Cloudflare Access Google IdP for the protected external demo path.
