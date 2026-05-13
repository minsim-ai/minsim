---
title: Phase 1 — React + FastAPI 통합과 Cloudflare Tunnel
type: phase-plan
tags: [phase-1, react, fastapi, cloudflare, tunnel, infrastructure]
created: 2026-04-30
updated: 2026-05-03
status: completed
related: [[CLAUDE]], [[README]], [[../design/react-fastapi-migration]], [[../execution/phase-1-react-fastapi-rq-sqlite]]
---

# Phase 1 — React + FastAPI 통합과 Cloudflare Tunnel

## Execution Plan

- [[../execution/phase-1-react-fastapi-rq-sqlite]]

## Goal

1. React landing page를 `https://arabesque.cc/`에서 공개 제공한다.
2. React app과 실제 Python 시뮬레이션 엔진을 `https://arabesque.cc/app`에서 연결한다.
3. `https://arabesque.cc`를 Cloudflare Named Tunnel로 FastAPI origin에 연결한다.
4. 외부 데모는 단일 origin으로 제공한다: FastAPI가 React 정적 파일과 API를 함께 서빙한다.
5. Streamlit은 외부 MVP가 아니라 내부 fallback으로만 유지한다.

## Architecture

```text
arabesque.cc
  -> Cloudflare Access (Phase 3에서 적용)
  -> Cloudflare Named Tunnel
  -> http://localhost:8000
  -> FastAPI
     ├── /api/*                API
     ├── /api/runs/*/events    SSE
     ├── /                     public landing
     ├── /app                  protected simulation app
     └── /results              protected result view
  -> Redis/RQ worker executes long-running simulations
```

## Files

```text
.
├── frontend/                         # React/Vite UI
├── src/api/                          # 신규 FastAPI app
│   ├── __init__.py
│   ├── main.py
│   ├── schemas.py
│   ├── routes.py
│   └── static.py
├── src/jobs/                         # Phase 1부터 SQLite store 사용
│   ├── __init__.py
│   ├── models.py
│   ├── store.py                      # SQLite run/result store
│   ├── queue.py                      # Redis/RQ enqueue helpers
│   └── worker.py                     # RQ worker entrypoint
├── src/orchestration/                # LangGraph run-level scaffold
│   ├── __init__.py
│   └── graph.py
├── src/simulations/creative_testing.py
├── README.md
└── ~/.cloudflared/config.yml
```

## Execution Gate Order

- [x] **1A** Contracts, config, `LLMClient`, and LangGraph scaffold
- [x] **1B** FastAPI skeleton and React static/path serving
- [x] **1C** SQLite store and RQ queue skeleton with no-op worker
- [x] **1D** Creative Testing worker adapter and full result envelope
  - live Redis/Gemini/parquet validation passed with 10/50/200-person runs.
  - Ollama remains the configurable local fallback, but this machine does not currently have Ollama installed.
- [x] **1E** SSE and React API wiring
- [x] **1F** Local integration and Cloudflare Tunnel validation

The first implementation gate is **1A**. Phase 1 should not start from FastAPI routes or React API wiring until contracts and scaffolds are fixed.

## Tasks

- [x] **1.1** FastAPI 앱 뼈대 생성: `/health`, `/api/health`, `/api/config`
- [x] **1.2** React build를 FastAPI에서 정적 파일로 서빙
- [x] **1.3** React path routing 전환: `/` landing, `/app` app, `/results` result
- [x] **1.4** SQLite run/result store 최소 구현
- [x] **1.5** Redis/RQ queue와 worker 최소 구현
- [x] **1.6** 최소 run API 추가
  - [x] `POST /api/runs`
  - [x] `GET /api/runs/{run_id}`
  - [x] `GET /api/runs/{run_id}/result`
- [x] **1.6b** SSE events API 추가
  - [x] `GET /api/runs/{run_id}/events`
- [x] **1.7** Creative Testing 실제 엔진을 RQ worker에 연결
  - fake LLM/fake sampler로 10명/50명 worker 경로 검증 완료
  - live Redis/Ollama/parquet 검증은 로컬 서비스 준비 후 진행
- [x] **1.8** React mock flow를 API 호출 flow로 전환
  - run 생성, SSE hook, 결과 envelope 조회 연결 완료
  - 리포트 본문 전체 data replacement는 Phase 6 design sync에서 정교화
- [x] **1.9** 로컬 통합 실행 스크립트 추가 또는 문서화
  - [x] `npm run build` in `frontend/`
  - [x] Redis local server command
  - [x] RQ worker script
  - [x] `uvicorn src.api.main:app --host 127.0.0.1 --port 8000`
  - [x] `scripts/check_local_services.py`
- [x] **1.10** Cloudflare Named Tunnel 생성 또는 기존 tunnel 갱신
- [x] **1.10a** Cloudflare local readiness check 추가
  - `cloudflared` installed
  - `~/.cloudflared/config.yml` and tunnel credentials present for `koresim-arabesque`.
- [x] **1.11** Cloudflare DNS 기존 record 확인 후 `arabesque.cc` apex route 연결
- [x] **1.12** `https://arabesque.cc/` landing, `https://arabesque.cc/app` app, 50명 Creative Testing 1회 실행 검증
  - 2026-05-03: external 50-person Gemini run completed through `https://arabesque.cc/api/runs`, run `f7e4ba13-34e2-47ac-be77-b16c0f757276`, `parse_failed=0`.
- [x] **1.13** Streamlit fallback 실행법을 README에 남기되 외부 노출 계획에서는 제거
  - README는 Streamlit을 operator/internal fallback으로만 명시하고, 외부 demo surface는 React + FastAPI로 고정한다.
- [x] **1.14** LangGraph run-level scaffold 추가
  - Phase 1에서는 얇은 graph boundary만 둔다.
  - persona fanout은 기존 async batch simulator를 유지한다.
  - graph 사용 여부는 config flag로 제어한다.

## FastAPI Minimum Contract

```http
GET /health
```

```json
{
  "ok": true,
  "service": "koresim-api",
  "scope": "public-minimal"
}
```

```http
GET /api/health
```

```json
{
  "ok": true,
  "scope": "protected-detail",
  "sqlite": "ok",
  "redis": "ok",
  "queue": "ok",
  "model_provider": "ok"
}
```

```http
POST /api/runs
```

```json
{
  "simulation_type": "creative_testing",
  "input": {
    "creatives": ["A copy", "B copy", "C copy"]
  },
  "sample_size": 50,
  "target_filter": {
    "age_min": 25,
    "age_max": 55,
    "exclude_unemployed": true
  },
  "seed": 42
}
```

Phase 1 public demo gate validated at 50 people. Phase 2 raises the implementation cap to `sample_size <= 200`.

```http
GET /api/runs/{run_id}/events
```

SSE event names:

```text
queued
progress
partial_result
completed
failed
heartbeat
```

## Cloudflare config.yml Template

```yaml
tunnel: <UUID>
credentials-file: /Users/byeongsu/.cloudflared/<UUID>.json

ingress:
  - hostname: arabesque.cc
    service: http://localhost:8000
    originRequest:
      connectTimeout: 30s
      keepAliveTimeout: 90s
      keepAliveConnections: 100
  - service: http_status:404
```

## Validation

| 검증 항목 | 명령어 또는 시나리오 | 기대 결과 |
| --- | --- | --- |
| React build | `npm run build` | `frontend/dist` 생성 |
| API 실행 | `uvicorn src.api.main:app --port 8000` | 서버 시작 |
| Health | `curl http://127.0.0.1:8000/health` | `ok: true` |
| Redis/RQ | worker 실행 후 50명 run 생성 | RQ job이 queued → running → completed |
| React fallback | 브라우저 `http://127.0.0.1:8000` | React UI 표시 |
| Landing route | `http://127.0.0.1:8000/` | LandingPage 표시 |
| App route | `http://127.0.0.1:8000/app` | App 표시 |
| SQLite | 50명 run 생성 | `data/runtime/koresim.sqlite3`에 run/result 저장 |
| Run 생성 | `POST /api/runs` | `run_id` 반환 |
| SSE | `/api/runs/{run_id}/events` | progress 이벤트 수신 |
| 결과 조회 | `/api/runs/{run_id}/result` | Creative Testing 결과 반환 |
| Tunnel | `curl -I https://arabesque.cc/` | 200 OK |
| 외부 데모 | 외부 네트워크에서 50명 실행 | 완료 결과 표시 |

## Done Definition

- [x] `https://arabesque.cc/`에서 공개 landing page가 열린다.
- [x] `https://arabesque.cc/app`에서 React app이 열린다.
- [x] React UI/API에서 실제 Creative Testing run을 생성할 수 있다.
- [x] 진행률이 SSE/polling snapshot으로 표시된다.
- [x] RQ worker가 실제 시뮬레이션을 실행한다.
- [x] run 상태와 결과가 SQLite에 저장된다.
- [x] 완료 후 결과를 API에서 다시 조회할 수 있다.
- [x] Streamlit은 fallback으로 문서화되어 있고 외부 tunnel 대상이 아니다.
- [x] CLAUDE.md Phase 1 체크박스가 갱신되어 있다.

## Risks

| 리스크 | 가능성 | 완화 방안 |
| --- | --- | --- |
| apex domain이 기존 용도와 충돌 | 중 | DNS 변경 전 기존 record와 서비스 확인 |
| React mock UI와 실제 API 입력 구조 불일치 | 높음 | Phase 1에서 schemas.py를 먼저 고정 |
| 장기 실행 요청이 HTTP timeout과 충돌 | 중 | run 생성은 즉시 반환, 진행은 SSE로 분리 |
| Redis 또는 RQ worker 미실행 | 중 | `/health`에 queue 상태 노출, 로컬 실행 스크립트에 worker 포함 |
| SQLite write lock | 중 | 단일 프로세스 MVP로 제한, 짧은 write transaction 유지 |
| Ollama 콜드 스타트 | 중 | `/api/config` 또는 health에 model readiness 표시 |
| Streamlit 문서와 새 계획 혼재 | 높음 | README와 Phase 문서를 React+FastAPI 기준으로 통일 |

## Out of Scope

- Cloudflare Access 인증 정책 구성: Phase 3
- 서버 재시작 후 running job 복원: Phase 2
- 8개 추가 시뮬레이션 구현: Phase 5
- PDF/Excel export
