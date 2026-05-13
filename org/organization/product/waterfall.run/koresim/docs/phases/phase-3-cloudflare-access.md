---
title: Phase 3 — Cloudflare Access on arabesque.cc
type: phase-plan
tags: [phase-3, security, cloudflare-access, auth]
created: 2026-04-30
updated: 2026-05-03
status: superseded-public-route
related: [[CLAUDE]], [[phase-1-cloudflare-tunnel]], [[../execution/phase-3-access-path-policy]]
---

# Phase 3 — Cloudflare Access / Public Route Decision on arabesque.cc

## Execution Plan

- [[../execution/phase-3-access-path-policy]]

## Goal

1. `https://arabesque.cc/` landing page는 공개로 유지한다.
2. `https://arabesque.cc/app*`, `https://arabesque.cc/results*`, and run/preset/export APIs use app-level Google OAuth when configured.
3. Cloudflare Access allowlist는 현재 요구사항에서 제거한다.
4. React app, API, SSE가 Cloudflare Tunnel 경로에서 앱 세션 기준으로 정상 작동하는지 검증한다.

## Scope

Cloudflare Access configuration is now historical/optional. Current work is public Cloudflare Tunnel validation for landing/status routes plus app-level-authenticated app/API/SSE runs. `scripts/configure_cloudflare_access.py` remains as an operator helper for future re-enabling or disabling the legacy Access application.

## Tasks

- [x] **3.1** Zero Trust 활성화
- [x] **3.2** Team domain 설정
- [x] **3.3** Self-hosted Application 추가
  - Application name: `KoreaSim Demo`
  - Domain: `arabesque.cc`
  - Path: `/app*`, `/results*`, `/api*`
  - Session duration: 24h
- [x] **3.4** Identity Provider: Google IdP 활성화
- [x] **3.5** Access Policy 작성
  - Action: Allow
  - Include: allowlisted emails
- [x] **3.6** 미인증/미등록 요청 Access challenge 테스트
- [x] **3.7** Cloudflare Access app 삭제
- [x] **3.8** 공개 React route/API gate 테스트
- [x] **3.9** `docs/research/access-policy.md` 작성
  - 등록 이메일 목록
  - 추가/삭제 절차
  - 테스트 체크리스트

## Current Status

Historical 2026-05-03 tunnel/origin validation passed before Access was applied, then the Google IdP, Access app, and allow policy were applied through `scripts/configure_cloudflare_access.py`. The current product decision supersedes that protected-demo requirement: the Access app was deleted, landing/status routes remain public, and app/result/run APIs use app-level auth when configured.

2026-05-03 completion audit and command gate added:

- [[../execution/protected-demo-completion-audit]]
- `uv run python scripts/check_cloudflare_access.py`

The legacy Access command is retained for future private demos. The current public gate is:

- `uv run python scripts/check_public_external_demo.py`

It probes `/`, `/validation`, `/api/auth/session`, `/api/health`, and `/api/config` and fails if Cloudflare Access markers are present.

2026-05-03 Google IdP follow-up:

- `scripts/configure_cloudflare_access.py` can pin a Cloudflare Access Google IdP with `--allowed-idp "$CLOUDFLARE_GOOGLE_IDP_ID"` and `--auto-redirect-to-idp`, or by setting `CLOUDFLARE_GOOGLE_IDP_ID` / `CLOUDFLARE_ACCESS_ALLOWED_IDPS` in local env.
- A rotated Google OAuth secret was supplied in local `.env`; the exposed chat secret was not reused.
- Cloudflare Google IdP `537f1f75-c649-4da6-b26c-5455c5d80aa0` was created by `scripts/configure_cloudflare_access.py --create-google-idp --apply`.
- Cloudflare Access app `1f3c0008-fd22-41ca-8d78-f676a9814276` and allow policy `f98828a3-798f-4243-a129-5db2c75a31e5` were created by `scripts/configure_cloudflare_access.py --apply --auto-redirect-to-idp`.
- `uv run python scripts/check_cloudflare_access.py --timeout-seconds 12` passed with `/` public 200 and `/app`, `/results`, `/api/health`, `/api/config`, and `/api/runs/access-gate-probe/events` redirected to Cloudflare Access login.

2026-05-03 app-level auth follow-up:

- Current public-demo policy keeps Cloudflare Access disabled.
- App login is implemented at the FastAPI layer with Google OAuth, signed HTTP-only session cookies, `/api/auth/session`, and login enforcement for `/app*`, `/results*`, and run/preset/export APIs when auth is configured.
- Routine E2E uses the disabled-by-default `/api/auth/test-login` endpoint instead of automating the Google OAuth browser flow.
- Better Auth is not installed because the current app is React/Vite + FastAPI, not Next.js.
- 2026-05-03 public-route update: the Access app was deleted with `scripts/configure_cloudflare_access.py --disable-access-app --apply`, and `uv run python scripts/check_public_external_demo.py --timeout-seconds 15` passed with no Access markers.

## Validation

| 검증 항목 | 시나리오 | 기대 결과 |
| --- | --- | --- |
| Landing 공개 | 시크릿 브라우저에서 `arabesque.cc/` 접속 | 공개 landing 표시 |
| App auth | 시크릿 브라우저에서 `arabesque.cc/app` 접속 | Google login redirect 또는 authenticated React app |
| Results auth | 시크릿 브라우저에서 `arabesque.cc/results` 접속 | Google login redirect 또는 authenticated Results route |
| API 공개 | 시크릿 브라우저에서 `/api/config` 호출 | 정상 JSON 응답 |
| Public health | 시크릿 브라우저에서 `/health` 접속 | minimal health만 공개 |
| Detailed health | 시크릿 브라우저에서 `/api/health` 접속 | 정상 JSON 응답 |
| SSE | run 실행 | progress stream 또는 polling fallback 유지 |
| CLI gate | `uv run python scripts/check_public_external_demo.py` | `/`, `/validation`, auth/session, health, config origin response |

## Done Definition

- [x] `arabesque.cc/` landing은 공개로 열린다.
- [x] `arabesque.cc/app*`, `results*`, and run/preset/export APIs are reachable through Cloudflare Tunnel and protected by app-level auth when configured.
- [x] Cloudflare Access allowlist app은 현재 데모 경로에서 제거되어 있다.
- [x] SSE가 공개 외부 경로에서 정상 작동한다.
- [x] Access 재활성화/비활성화 절차가 문서화되어 있다.
- [x] CLAUDE.md Phase 3 체크박스가 갱신되어 있다.

## Risks

| 리스크 | 가능성 | 완화 방안 |
| --- | --- | --- |
| 공개 데모 남용 | 낮음 | App-level auth, API quota/worker monitoring, provider rate limit |
| SSE 장기 연결 실패 | 중 | polling fallback 유지 |
| Access 재활성화 실수 | 낮음 | `scripts/check_public_external_demo.py`를 공개 데모 gate로 실행 |

## Out of Scope

- 조직/권한/청구가 포함된 full customer account system
- Google Workspace/Microsoft SSO
- 조직별 권한 관리
- 감사 로그 분석 자동화
