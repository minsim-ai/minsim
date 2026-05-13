---
title: Mac Studio Production Deploy Runbook
type: runbook
tags: [mac-studio, production, deploy, fastapi, rq, cloudflare, auth]
created: 2026-05-04
updated: 2026-05-04
status: active
related: [[cloudflare-tunnel-operations]], [[app-auth-operations]], [[llm-gemini-langfuse-operations]]
---

# Mac Studio Production Deploy Runbook

## Goal

Run KoreaSim production from one Mac Studio origin:

```text
https://arabesque.cc
  -> Cloudflare DNS/Tunnel
  -> localhost:8000 FastAPI
  -> FastAPI-served frontend/dist
  -> Redis/RQ worker
  -> SQLite runtime DB
  -> Gemini primary LLM
```

Cloudflare Access allowlists are not part of the active product policy. The public tunnel reaches the origin, and app/API protection is handled by FastAPI Google OAuth with the signed `koresim_session` cookie.

## Repo

```bash
cd /Users/qts/obsidian-org-knowledge/org/organization/product/waterfall.run/koresim
git fetch --prune origin
git status --short --branch
git merge --ff-only origin/main
```

Expected current baseline:

- repo `main` includes `c0d70e7` for the protected demo implementation.
- repo `main` includes `bf14fd5` for app-level auth enforcement.
- latest observed `origin/main` on 2026-05-04 was `fcbf4dd`.

## Local Secrets

Create `.env` in this project root. It is gitignored and must not be committed.

Required production shape:

```env
PARQUET_PATH=/Users/qts/koresim-runtime/data/nemotron_korea_personas.parquet
RUNTIME_DATA_DIR=/Users/qts/koresim-runtime/runtime
SQLITE_PATH=/Users/qts/koresim-runtime/runtime/koresim.sqlite3
REDIS_URL=redis://localhost:6379/0

LLM_BACKEND=gemini
GEMINI_API_KEY=<rotated-key>
GEMINI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/
GEMINI_MODEL=gemini-3-flash-preview

OBSERVABILITY_PROVIDER=langfuse
LLM_TRACE_MODE=metadata_only
LANGFUSE_PUBLIC_KEY=<langfuse-public-key>
LANGFUSE_SECRET_KEY=<langfuse-secret-key>
LANGFUSE_BASE_URL=https://jp.cloud.langfuse.com

KORESIM_AUTH_BASE_URL=https://arabesque.cc
KORESIM_AUTH_SECRET=<long-random-secret>
KORESIM_AUTH_REQUIRED=true
KORESIM_AUTH_COOKIE_SECURE=true
KORESIM_AUTH_TEST_LOGIN_ENABLED=false
GOOGLE_CLIENT_ID=<google-client-id>
GOOGLE_CLIENT_SECRET=<rotated-google-client-secret>

OLLAMA_BASE_URL=http://localhost:11434/v1
MODEL=gemma3:27b
MODEL_LOCAL_FALLBACK=gemma3:27b
```

If any Google, Gemini, Langfuse, or Cloudflare secret appeared in chat, logs, screenshots, or shell history, treat it as compromised and rotate it after the bootstrap is stable.

Google Console must include this authorized redirect URI:

```text
https://arabesque.cc/api/auth/google/callback
```

## Runtime Data

Keep production runtime data outside the repo:

```bash
mkdir -p /Users/qts/koresim-runtime/data /Users/qts/koresim-runtime/runtime
cp -n data/nemotron_korea_personas.parquet /Users/qts/koresim-runtime/data/nemotron_korea_personas.parquet
```

## Install Tools

```bash
brew install git gh uv node redis cloudflared jq sqlite ollama
npm install -g agent-browser
agent-browser install
gh auth login
gh auth status
```

Redis should be a login service:

```bash
brew services start redis
```

Prepare fallback models:

```bash
ollama pull smollm2:135m
ollama pull gemma3:27b
```

## Build

```bash
cd /Users/qts/obsidian-org-knowledge/org/organization/product/waterfall.run/koresim/frontend
npm ci
npm run build
```

FastAPI serves `frontend/dist` from the same origin. There is no separate Vercel or Netlify deployment.

## Processes

Run these from the project root unless noted:

```bash
uv run python scripts/run_worker.py
uv run uvicorn src.api.main:app --host 127.0.0.1 --port 8000
cloudflared tunnel --config /Users/qts/.cloudflared/koresim-arabesque.yml run koresim-arabesque
```

Keep MacBook origin/tunnel stopped after Mac Studio cutover. Production should have one active origin to avoid ambiguity.

## Tunnel

Preferred Mac Studio config path:

```text
/Users/qts/.cloudflared/koresim-arabesque.yml
```

Current Mac Studio-only production tunnel created on 2026-05-04:

```text
koresim-arabesque-macstudio -> 37123500-171d-4111-b229-26de0a346099
```

Expected ingress:

```yaml
tunnel: 37123500-171d-4111-b229-26de0a346099
credentials-file: /Users/qts/.cloudflared/37123500-171d-4111-b229-26de0a346099.json

ingress:
  - hostname: arabesque.cc
    service: http://localhost:8000
  - service: http_status:404
```

If the current Cloudflare account cannot modify `arabesque.cc` DNS, move the matching account certificate from the old machine or run `cloudflared tunnel login` and select the account/zone that owns `arabesque.cc`; then reroute DNS:

```bash
cloudflared tunnel login
cloudflared tunnel create koresim-arabesque
cloudflared tunnel route dns koresim-arabesque arabesque.cc
```

If `cloudflared tunnel route dns` creates a record under another zone, the active `cert.pem` belongs to the wrong Cloudflare account/zone. Restore or replace the certificate before retrying.

## Preflight

Local production readiness:

```bash
uv run python scripts/check_mac_studio_production.py
```

External auth/origin readiness:

```bash
uv run python scripts/check_mac_studio_production.py --external --timeout-seconds 15
```

Expected external auth gate after the latest FastAPI process is running:

- `/api/auth/session` returns `200`.
- unauthenticated `/api/runs` returns `401`.
- unauthenticated `/app` redirects into the Google login flow.
- Google login returns to `/app`.

## Completion Gate

- [x] `uv run python scripts/verify.py` passes.
- [x] `https://arabesque.cc/api/health` returns `ok=true`.
- [x] local `queue.worker_count >= 1`.
- [x] external `queue.worker_count >= 1`.
- [x] `https://arabesque.cc/api/auth/session` returns `200`.
- [x] Google login endpoint redirects to Google with `https://arabesque.cc/api/auth/google/callback`.
- [x] 9 simulation presets appear.
- [x] local Gemini 1-person smoke run succeeds.
- [x] local Gemini 50-person run succeeds.
- [x] local Gemini 200-person run succeeds.
- [x] external Gemini 1-person smoke run succeeds.
- [x] external Gemini 50-person run succeeds.
- [x] external Gemini 200-person run succeeds.
- [x] result refresh, SSE, and polling fallback endpoints work.
- [x] `arabesque.cc` is routed to the Mac Studio-only tunnel.

## 2026-05-04 Mac Studio Validation

Completed locally on Mac Studio:

- `brew services start redis` succeeded.
- `npm ci` and `npm run build` succeeded in `frontend`.
- `.env` was configured for `/Users/qts/koresim-runtime`, Gemini, Langfuse, and app-level Google OAuth.
- persona parquet was copied to `/Users/qts/koresim-runtime/data/nemotron_korea_personas.parquet`.
- `uv run python scripts/check_mac_studio_production.py` returned `status=ready`.
- local `/api/auth/session` returned `200`.
- local unauthenticated `/api/runs` returned `401`.
- local unauthenticated `/app` returned `303` to `/api/auth/google/login`.
- local `/api/config` reported 9 enabled simulations and `llm_backend=gemini`.
- local `/api/health` reported `ok=true` and `queue.worker_count=1`.
- `uv run python scripts/verify.py` passed: 141 tests, coverage 85.88%, frontend lint/typecheck/build.
- local Gemini run `3f105de7-b165-45ac-bad1-ecf81e979582`: 1 response, 0 parse failures.
- local Gemini run `8434c8ec-d4d1-496d-a1c2-893821b3d672`: 50 responses, 0 parse failures.
- local Gemini run `44d4375f-5ba3-486d-bb18-bcac772958b3`: 200 responses, 0 parse failures.
- launchd agents loaded and running: `com.koresim.api`, `com.koresim.worker`, `com.koresim.tunnel`.

External cutover:

- Browser-approved `cloudflared tunnel login` wrote `/Users/qts/.cloudflared/cert.pem` for the Cloudflare account that owns `arabesque.cc`.
- The original tunnel `c63ae594-4469-4dda-8b29-651fb754ad7f` still had an older connector, so requests briefly split between origins.
- Created Mac Studio-only tunnel `koresim-arabesque-macstudio` with id `37123500-171d-4111-b229-26de0a346099`.
- Routed `arabesque.cc` to that tunnel with `cloudflared tunnel route dns --overwrite-dns 37123500-171d-4111-b229-26de0a346099 arabesque.cc`.
- Restarted `com.koresim.tunnel`; `cloudflared tunnel info 37123500-171d-4111-b229-26de0a346099` showed one Mac Studio connector.
- `uv run python scripts/check_mac_studio_production.py --external --timeout-seconds 15` returned `status=ready`.
- External `/api/auth/session` returned `200`.
- External unauthenticated `/api/runs` returned `401`.
- External `/api/health` returned `ok=true`, Mac Studio SQLite path, and `queue.worker_count=1`.
- External Google login endpoint returned `303` to Google with redirect URI `https://arabesque.cc/api/auth/google/callback`.
- external Gemini run `0511820e-38c5-4277-9e83-f796214a9c11`: 1 response, 0 parse failures.
- external Gemini run `ff70f944-631a-4cd5-bfcf-4051ed1e631f`: 50 responses, 0 parse failures.
- external Gemini run `221b4418-7383-43d9-94f6-de9347029fc4`: 200 responses, 0 parse failures.
- External `/results?run_id=221b4418-7383-43d9-94f6-de9347029fc4` returned the React shell with `200`.
- External SSE replay for `221b4418-7383-43d9-94f6-de9347029fc4` returned snapshot, created, queued, running, partial_result, and progress events.

## launchd

Templates live in `deploy/launchd/`. Review paths before loading them:

```bash
launchctl load ~/Library/LaunchAgents/com.koresim.api.plist
launchctl load ~/Library/LaunchAgents/com.koresim.worker.plist
launchctl load ~/Library/LaunchAgents/com.koresim.tunnel.plist
```

Prefer `brew services start redis` for Redis.
