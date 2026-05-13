---
title: Cloudflare Tunnel Operations Runbook
type: runbook
tags: [cloudflare, tunnel, access, arabesque, operations]
created: 2026-05-03
updated: 2026-05-04
status: draft
related: [[../phases/phase-1-cloudflare-tunnel]], [[../phases/phase-3-cloudflare-access]]
---

# Cloudflare Tunnel Operations Runbook

## 1. Goal

Expose the local FastAPI origin at `http://localhost:8000` through `https://arabesque.cc` using Cloudflare Tunnel.

Current production route policy:

- `/` public landing.
- `/api/health` and `/api/config` public operator readiness/config probes.
- `/app*`, `/results*`, and run/export/preset APIs are protected by FastAPI app-level Google OAuth when `KORESIM_AUTH_REQUIRED=true`.
- Cloudflare Access allowlists are not used for the active product path. Keep the Access helper commands below only for future private-demo reactivation or emergency disable.

## 2. Required Before Autonomous Work

- [ ] Cloudflare account owns or manages `arabesque.cc`.
- [ ] Current apex DNS records are known and can be replaced or rolled back.
- [ ] `cloudflared` is installed.
- [ ] FastAPI origin can run at `http://localhost:8000`.
- [ ] User can complete browser login for `cloudflared tunnel login`.
- [ ] If re-enabling a private demo, Access allowlist emails are known. This is not required for the current public demo.

Check local state:

```bash
uv run python scripts/check_cloudflare_tunnel.py
```

## 3. Credential Issuance

Use a locally-managed tunnel for this project because it produces explicit local files that the project readiness check can verify.

### Step 1: Login

```bash
cloudflared tunnel login
```

This opens a browser authorization flow. After the user selects the Cloudflare account and zone, `cloudflared` writes an account certificate to:

```text
~/.cloudflared/cert.pem
```

The certificate is used by `cloudflared` to create and route locally-managed tunnels. Do not commit it.

### Step 2: Create Tunnel

```bash
cloudflared tunnel create koresim-arabesque
```

This creates a tunnel and writes a credential JSON file similar to:

```text
~/.cloudflared/<TUNNEL_UUID>.json
```

Do not commit the JSON file. Record only the tunnel name and UUID in private operational notes if needed.

### Step 3: Create Local Config

Create a dedicated KoreaSim config. On Mac Studio, prefer a project-specific file so any existing default Cloudflare tunnel config is left untouched:

```yaml
tunnel: <TUNNEL_UUID>
credentials-file: /Users/qts/.cloudflared/<TUNNEL_UUID>.json

ingress:
  - hostname: arabesque.cc
    service: http://localhost:8000
  - service: http_status:404
```

Recommended path:

```text
~/.cloudflared/koresim-arabesque.yml
```

### Step 4: Route DNS

```bash
cloudflared tunnel route dns koresim-arabesque arabesque.cc
```

Before running this, confirm that replacing the current apex route is intended.

### Step 5: Run Tunnel

```bash
cloudflared tunnel --config ~/.cloudflared/koresim-arabesque.yml run koresim-arabesque
```

Expected local origin:

```bash
uv run uvicorn src.api.main:app --host 127.0.0.1 --port 8000
```

## 4. Remotely-Managed Token Alternative

Cloudflare Zero Trust can also create a remotely-managed tunnel and provide a connector token. That mode runs with:

```bash
cloudflared tunnel run --token <TOKEN>
```

Do not use this mode for the first KoreaSim run unless the runbook and `scripts/check_cloudflare_tunnel.py` are updated, because the current check expects `~/.cloudflared/config.yml` and local credential JSON.

## 5. Cloudflare Access Status

Current external route gate:

```bash
uv run python scripts/check_mac_studio_production.py --external --timeout-seconds 15
```

Expected: `/`, `/api/config`, `/api/health`, and `/api/auth/session` reach the FastAPI origin, and unauthenticated `/api/runs` returns `401` from app-level auth. Use `scripts/check_public_external_demo.py` only when intentionally validating that Cloudflare Access markers are absent.

To disable an existing named Access app:

```bash
uv run python scripts/configure_cloudflare_access.py --disable-access-app
uv run python scripts/configure_cloudflare_access.py --disable-access-app --apply
uv run python scripts/check_public_external_demo.py --timeout-seconds 15
```

The first command is a dry run. The apply command requires local Cloudflare credentials in `.env` or the shell and does not print API tokens or secrets.

Legacy private-demo setup, only if this requirement returns:

- [ ] Create Cloudflare Access application for `arabesque.cc/app*`.
- [ ] Create Cloudflare Access application for `arabesque.cc/results*`.
- [ ] Create Cloudflare Access application for `arabesque.cc/api*`.
- [ ] Keep `arabesque.cc/` public.
- [ ] Policy: Email OTP allowlist.
- [ ] Validate SSE and API requests after login.

Required user input:

- allowlist email addresses.
- desired session duration.
- whether `/api/health` should be public minimal health or protected readiness.

Optional API path:

```bash
uv run python scripts/configure_cloudflare_access.py \
  --account-id "$CLOUDFLARE_ACCOUNT_ID" \
  --allowlist-email "demo@example.com"

uv run python scripts/configure_cloudflare_access.py \
  --apply \
  --account-id "$CLOUDFLARE_ACCOUNT_ID" \
  --api-token "$CLOUDFLARE_API_TOKEN" \
  --allowlist-email "demo@example.com"
```

The API token needs `Access: Apps and Policies Write`. The first command is a dry-run payload review; the second writes the Access application and allow policy. The helper loads the project-local `.env` file automatically without overriding exported shell variables, and it does not print token, secret, or allowlist contents. Dry-run output redacts allowlist emails and reports only the count. Cloudflare API error output also redacts email addresses and secret/token-like fields before printing. Private allowlists can be supplied with `KORESIM_ACCESS_ALLOWLIST`, `KORESIM_ACCESS_ALLOWLIST_FILE`, or `--allowlist-file`; unreadable allowlist files fail locally with a JSON error before any Cloudflare write attempt.

For Google social login, configure Google as a Cloudflare Access identity provider first. In the Google OAuth client, the authorized redirect URI must be the Cloudflare Access callback URL:

```text
https://<your-team-name>.cloudflareaccess.com/cdn-cgi/access/callback
```

Do not use the app origin such as `https://arabesque.cc` as the Google OAuth redirect URI for the Cloudflare Access IdP. Cloudflare documents this callback format in its Google identity provider setup guide.

The Google IdP can be created or updated with the same helper after the exposed Google OAuth secret has been rotated. This path requires a Cloudflare API token with `Access: Organizations, Identity Providers, and Groups Write`; dry-run output redacts the OAuth client secret:

```bash
uv run python scripts/configure_cloudflare_access.py \
  --create-google-idp \
  --account-id "$CLOUDFLARE_ACCOUNT_ID"

uv run python scripts/configure_cloudflare_access.py \
  --create-google-idp \
  --apply \
  --account-id "$CLOUDFLARE_ACCOUNT_ID" \
  --api-token "$CLOUDFLARE_API_TOKEN"
```

Set `GOOGLE_OAUTH_CLIENT_ID`, the rotated `GOOGLE_OAUTH_CLIENT_SECRET`, and optionally `CLOUDFLARE_GOOGLE_IDP_NAME` in local `.env` or the shell before applying. The apply output returns the IdP UUID; save that as `CLOUDFLARE_GOOGLE_IDP_ID`.

Alternatively, list configured Access IdPs to find the Google IdP UUID:

```bash
uv run python scripts/configure_cloudflare_access.py \
  --account-id "$CLOUDFLARE_ACCOUNT_ID" \
  --api-token "$CLOUDFLARE_API_TOKEN" \
  --list-idps
```

The list command prints only IdP `id`, `name`, and `type`; it does not print provider config or OAuth secrets. A single Google IdP UUID can be supplied with `CLOUDFLARE_GOOGLE_IDP_ID` or with the general `CLOUDFLARE_ACCESS_ALLOWED_IDPS` list.

Then add:

```bash
  --allowed-idp "$CLOUDFLARE_GOOGLE_IDP_ID" \
  --auto-redirect-to-idp
```

Do not use a Google OAuth client secret after it has appeared in chat or logs; rotate it before configuring the Cloudflare IdP.

### Public Demo Copy

Use this short operator-approved copy for the current app-login demo:

```text
KoreaSim demo is available at https://arabesque.cc/app.

The public landing page is at https://arabesque.cc. The app uses Google login; completed runs can be reopened with the result URL after login.
```

Operational notes:

- Tell users to start from `/app`; completed runs are under `/results?run_id=...`.
- If a run appears stuck, refresh `/results?run_id=...`; the React app will poll the API if SSE reconnect is unavailable.
- For demo support, ask for the run id and timestamp, not screenshots containing credentials or personal data.

## 6. Verification

```bash
curl -I https://arabesque.cc/
curl -I https://arabesque.cc/app
curl -I https://arabesque.cc/api/health
curl -I https://arabesque.cc/api/runs/access-gate-probe/events
uv run python scripts/check_mac_studio_production.py --external --timeout-seconds 15
uv run python scripts/check_public_external_demo.py --timeout-seconds 15
```

Current expected:

- `/` returns landing page without Access login.
- `/app` redirects to app-level Google login when unauthenticated and `KORESIM_AUTH_REQUIRED=true`.
- `/api/health` and `/api/config` return JSON without Access login.
- `/api/auth/session` returns JSON and is not `404`.
- unauthenticated `/api/runs` returns app-origin `401`.
- FastAPI logs show requests reaching `localhost:8000`.
- `scripts/check_public_external_demo.py` fails if a Cloudflare Access challenge/deny marker appears.
- `scripts/check_cloudflare_access.py` is now a legacy private-demo gate. It should fail for the current public route policy because `/app`, `/results`, and `/api*` are intentionally public.

## 7. 2026-05-04 Mac Studio Notes

- Mac Studio repo path: `/Users/qts/obsidian-org-knowledge/org/organization/product/waterfall.run/koresim`.
- Mac Studio runtime data path: `/Users/qts/koresim-runtime`.
- Dedicated tunnel config path: `/Users/qts/.cloudflared/koresim-arabesque.yml`.
- Mac Studio-only production tunnel id: `37123500-171d-4111-b229-26de0a346099`.
- Existing default `~/.cloudflared/config.yml` may belong to another tunnel and should not be overwritten blindly.
- If `cloudflared tunnel list` does not show `koresim-arabesque`, move the old account certificate/credential pair or create a new tunnel and reroute `arabesque.cc`.
- If `cloudflared tunnel route dns` writes to another zone, the active `~/.cloudflared/cert.pem` is for the wrong Cloudflare account/zone. Run `cloudflared tunnel login` and choose the account that owns `arabesque.cc`, then route DNS again.
- On 2026-05-04, `arabesque.cc` was moved from the older shared `koresim-arabesque` tunnel to Mac Studio-only `koresim-arabesque-macstudio` to avoid traffic splitting between old and new connectors.
- Run the production preflight before cutover: `uv run python scripts/check_mac_studio_production.py`.

## 8. 2026-05-03 Validation Log

- Tunnel `koresim-arabesque` with id `c63ae594-4469-4dda-8b29-651fb754ad7f` connected successfully from local `cloudflared`.
- `https://arabesque.cc/`, `/health`, `/app`, `/api/health`, and `/api/config` reached the FastAPI origin through the tunnel with `curl`.
- External 50-person Gemini run completed through `https://arabesque.cc/api/runs`, run `f7e4ba13-34e2-47ac-be77-b16c0f757276`.
- External 200-person Gemini run completed through `https://arabesque.cc/api/runs`, run `ead192c8-5c47-43b1-9a04-e6dc9dc0bd67`.
- Blocker: Cloudflare Access path policy is not applied yet. `/app` and `/api/*` currently return origin responses to `curl` instead of an Access login/deny page. This requires Cloudflare Zero Trust dashboard or Cloudflare API credentials and allowlist emails.
- Added `scripts/check_cloudflare_access.py` as the repeatable Phase 3 gate. It currently fails because Access is not applied, or because the tunnel is stopped and Cloudflare returns `530`.
- Added `scripts/configure_cloudflare_access.py` as a dry-run-first API helper. `--apply` is blocked until `CLOUDFLARE_API_TOKEN`, an account or zone id, and allowlist emails are supplied.
- Hardened `scripts/check_cloudflare_access.py` so protected routes must include Cloudflare Access markers; origin-only `401`/`403` responses are not accepted.
- Re-ran the Access gate with FastAPI origin and `koresim-arabesque` tunnel running. `/` returned public 200, but `/app`, `/results`, `/api/health`, and `/api/config` also returned public 200. The current gate additionally probes `/api/runs/access-gate-probe/events` for the SSE-shaped API surface. This confirms Access is not applied, independent of stopped-tunnel `530` behavior.
- Later on 2026-05-03, the Access app was created for protected-demo validation, then removed after the product decision changed to public demo access. `scripts/configure_cloudflare_access.py --disable-access-app --apply` deleted the `KoreaSim Demo` Access app, and `scripts/check_public_external_demo.py --timeout-seconds 15` passed with public origin responses for landing, app, results, health, and config.
- Public external live validation then completed 9 simulation presets at 200 personas each through `https://arabesque.cc/api/runs`, with artifact `docs/verification/external-gemini-9-simulations-200-2026-05-03.json`. SSE replay on the completed Creative run returned snapshot/progress events without Access.

## 9. Rollback

- [ ] Stop `cloudflared`.
- [ ] Restore previous apex DNS record or disable the tunnel DNS route.
- [ ] Disable or pause Access applications if they block existing traffic.
- [ ] Re-run `curl -I https://arabesque.cc/` to verify expected previous behavior.

## 10. Never Commit

- `~/.cloudflared/cert.pem`
- `~/.cloudflared/*.json`
- tunnel tokens
- Cloudflare API tokens
- Access policy export containing private emails unless explicitly approved
