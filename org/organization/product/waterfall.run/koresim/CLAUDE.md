---
title: KoreaSim — 프로젝트 진행 트래커
type: protocol
tags: [koresim, project-tracker, roadmap]
created: 2026-04-30
updated: 2026-05-14
status: stable
---

# KoreaSim Project — 작업 가이드

이 파일은 작업 세션 시작 시 먼저 읽는 운영 가이드다. 자세한 제품/로드맵 source of truth는 [[product/waterfall.run/koresim/README]]를 따른다.

## 현재 결정

- **제품**: KoreaSim — 한국형 AI 인간 행동 시뮬레이션 B2B SaaS
- **데이터**: NVIDIA Nemotron-Personas-Korea (100만 한국 페르소나, 26필드)
- **LLM 백엔드**: Ollama (`gemma3:27b`, 로컬 Mac Studio 128GB) 우선, 이후 provider-agnostic `LLMClient` + LiteLLM 기반 GPT/Gemini/Ollama routing
- **공식 외부 데모**: React + FastAPI
- **Fallback**: Streamlit `app.py`는 내부 운영/백업용
- **배포 도메인**: `https://arabesque.cc`
- **외부 노출**: Mac Studio local FastAPI origin + Cloudflare Named Tunnel
- **인증/외부 접근**: Cloudflare Tunnel은 공개 경로를 제공하지만 Cloudflare Access allowlist 보호는 현재 데모 요구사항에서 제거되었다. `/app*`, `/results*`, and run/preset/export APIs are protected by app-level auth when Google OAuth is configured.
- **앱 레벨 인증**: React+FastAPI 구조에서는 Better Auth를 직접 붙이지 않고 FastAPI Google OAuth + signed HTTP-only session cookie를 사용한다. Routine E2E는 Google OAuth UI를 클릭하지 않고 test/staging 전용 `/api/auth/test-login`을 사용한다.
- **출시용 무료 실행권**: 신규 인증 사용자는 기본 5회 무료 시뮬레이션 실행권을 받는다. `/api/runs`는 서버에서 SQLite usage ledger를 확인해 강제하며, 운영/테스트 계정은 env allowlist로 quota를 우회할 수 있다.
- **진행률**: SSE, polling fallback
- **영속화**: SQLite job/result store
- **작업 큐**: Redis + RQ worker
- **첫 외부 LLM provider**: Gemini API
- **Observability**: Langfuse, metadata-only 기본값
- **LLM Gateway 계획**: [[docs/design/llm-gateway-orchestration]]
- **Cloudflare 운영 Runbook**: [[docs/runbooks/cloudflare-tunnel-operations]]
- **LLM 운영 Runbook**: [[docs/runbooks/llm-gemini-langfuse-operations]]
- **장시간 자율작업 규칙**: [[docs/runbooks/autonomous-work-session]] — 2시간마다 검증, coherent commit, 보고
- **세션 초기화 후 다음 구현 지시서**: [[docs/runbooks/next-autonomous-implementation]]
- **Data Governance**: [[docs/design/data-governance-and-io-boundary]] — 제품 저장소의 full raw와 외부 provider/observability payload 정책을 분리한다.
- **Evaluation Framework**: [[docs/design/evaluation-framework]] — schema/import, deterministic fixture, live local run, provider comparison eval을 gate별로 분리한다.
- **Persona Simulation Protocol Engine**: [[docs/design/persona-simulation-protocol-engine]] — `price_optimization` 안에서 versioned protocol로 `price_research_v2`를 확장한다.

## 현재 배포 방식

`arabesque.cc`는 Vercel 배포가 아니다. Mac Studio 로컬 origin을 FastAPI가 띄우고, Cloudflare Named Tunnel이 외부 도메인으로 전달한다.

- Origin: `uv run uvicorn src.api.main:app --host 127.0.0.1 --port 8000`
- React build: `frontend/dist`
- Static serving: `src/api/static.py`가 `frontend/dist`를 FastAPI에서 서빙한다.
- Tunnel config: `/Users/qts/.cloudflared/koresim-arabesque.yml`
- Runtime path: `/Users/qts/koresim-runtime`
- launchd services:
  - `com.koresim.api` — FastAPI origin
  - `com.koresim.worker` — RQ worker
  - `com.koresim.tunnel` — Cloudflare tunnel

배포 업데이트 순서:

```bash
npm --prefix frontend run build
launchctl kickstart -k gui/$(id -u)/com.koresim.api
launchctl kickstart -k gui/$(id -u)/com.koresim.worker
uv run python scripts/check_mac_studio_production.py --external --timeout-seconds 15
```

일반적인 UI/API 코드 변경은 tunnel 재시작이 필요 없다. Cloudflare 설정이나 터널 연결 상태를 바꿀 때만 `com.koresim.tunnel`을 재시작한다.

주의: 로그인 전 공개 랜딩에서 필요한 정적 asset 폴더를 새로 추가하면 `src/api/static.py` mount와 `src/api/main.py`의 `_is_public_path()`를 함께 업데이트한다.

## 디자인 시스템

프론트엔드는 Wanted Design System (Community, CC BY 4.0)을 사용한다.

- 토큰 파일: `frontend/src/styles.css`
- 폰트: `frontend/public/fonts/PretendardVariable.woff2`, `WantedSansVariable.woff2`
- Primary blue: `#0066FF` (`--color-primary`)
- 카드: border 또는 shadow 중 하나만 사용
- 버튼: pill radius (`--radius-pill`) 기본
- 배경: 그라디언트 없는 flat color 우선
- 새 컴포넌트는 CSS 변수 기반으로 작성

## 작업 규칙

### Phase 시작 전

- 해당 Phase 문서(`docs/phases/<phase>.md`)를 반드시 읽는다.
- `Goal`, `Done Definition`, `Risks`를 확인한다.
- React+FastAPI 외부 데모 방향과 충돌하는 Streamlit 중심 구현을 추가하지 않는다.

### Task 진행 중

- 각 task 완료 시 해당 Phase 문서의 미완료 체크박스를 완료 체크박스로 갱신한다.
- 동시에 이 파일의 Phase 요약 체크박스도 갱신한다.
- frontmatter `updated` 날짜를 갱신한다.

### 코드 작성 전

- 관련 기능 명세(`docs/functional/`)가 있으면 먼저 읽는다.
- API/schema 변경은 React mock 또는 UI 변경보다 먼저 정리한다.
- 결과 화면은 항상 trust layer를 고려한다.
- `raw_results`는 protected product result에는 보존할 수 있지만, 외부 provider/Langfuse에는 기본적으로 metadata-only 정책을 따른다.
- Gate 1A는 schema/import 테스트만 요구하고, live LLM eval은 Gate 1D 이후로 미룬다.
- Complex 작업은 `docs/templates/execution-plan-template.md`를 기준으로 `docs/execution/`에 execution plan을 만든 뒤 구현한다.
- LLM 호출 코드는 provider SDK를 simulation module에서 직접 import하지 않고 내부 LLM client boundary를 거친다.
- Gemini/Langfuse/Cloudflare 키는 `.env` 또는 secret manager에만 둔다. 실제 키를 문서, 코드, frontend bundle, git에 남기지 않는다.
- 2시간 이상 자율작업은 [[docs/runbooks/autonomous-work-session]]에 따라 2시간마다 검증, commit 가능 단위 정리, 보고를 수행한다.

### Phase 완료 시

- 모든 task 체크
- Validation 통과
- Done Definition 충족
- 현재 활성 Phase를 다음 Phase로 이동
- `log.md`가 있으면 완료 기록

## 현재 활성 Phase

**Phase 5/7: Simulation Expansion + LLM Orchestration live gate**

Phase 1 tunnel, Phase 2 stability, public external route gate, Phase 4 trust content, Phase 5 simulation expansion, and Phase 7 LLM orchestration are validated for the current live external demo gate. 남은 work는 V2 research items and product polish only unless a new phase is opened.

Current status:

- Phase 5 implementation is complete: all 9 simulations have schemas, presets, registry entries, API/RQ worker execution, common result envelopes, trust-layer rendering, React result renderer registry support, V1 crowd visualization, and live external 200-person validation.
- Phase 7 implementation is complete for the current demo gate: task-based model routing, run-level graph, analysis/report/QA agent boundaries, project/session memory schema, Gemini primary path, LiteLLM alias scaffold, Langfuse metadata-only traces, and Ollama fallback boundary are implemented.
- App-level auth is implemented for the current React+FastAPI architecture: `GET /api/auth/session`, Google OAuth login/callback/logout, signed session cookie, disabled-by-default test login for E2E, and login enforcement for `/app*`, `/results*`, and run/preset/export APIs when auth is configured.
- Run cancellation and human-review JSON export are implemented as post-demo product controls. Export excludes `raw_results` and requires human review before external sharing.
- Agentic Intake Layer V2 is implemented for productization: `IntakeContextEnvelope`, `safe_intake_summary`, `/api/intake/advance`, 9-simulation intake regression fixtures, and result-agent safe context propagation are complete.
- Persona Simulation Performance Upgrade V1 is in progress: slices now include `price_research_v2` as a versioned `price_optimization` protocol, `product_qa_v1` as a versioned `value_proposition` protocol, aggregate calibration metadata, deterministic interview guide generation, result envelope `protocol` metadata, React metric rendering, and fake LLM benchmark artifact generation.
- Small external Price Research V2 benchmark passed on 2026-05-14: `sample_size=10`, 10 responses, 0 parse failures, 100.0% parse success, 33.162 seconds, artifact `docs/verification/benchmarks/persona-simulation-benchmark-external-20260514T032811Z.json`.
- Deterministic 50/200-person validation artifact: `docs/verification/phase-5-phase-7-deterministic-validation.json`.
- Live external Gemini 9-simulation 200-person validation passed through `https://arabesque.cc/api/runs`: 1,800 total responses, 3 parse failures, no failed runs, artifact `docs/verification/external-gemini-9-simulations-200-2026-05-03.json`.
- Public `arabesque.cc` route gate passed with `/`, `/app`, `/results`, `/api/health`, and `/api/config` returning origin responses without Cloudflare Access markers. External SSE replay returned snapshot/progress events for a completed 200-person run.
- Small local Ollama fallback validation now includes a completed `smollm2:135m` Creative Testing 200-person run. Latest artifact: `docs/verification/local-ollama-smollm2-creative-200-2026-05-03-fixed.json` with 200 responses, 82.5% parse success, provider `ollama`, and `llm_backend=ollama`.

## 전체 Phase 진행 현황

### Phase 0: 코어 엔진 + Creative Testing MVP (완료)

- [x] 프로젝트 구조 생성
- [x] 데이터 레이어 (loader, sampler)
- [x] LLM 클라이언트 (Ollama)
- [x] 프롬프트 빌더
- [x] 비동기 시뮬레이터
- [x] Creative Testing 시뮬레이션
- [x] Streamlit MVP 앱
- [x] Smoke test 통과
- [x] React mock UI 존재 확인

### Phase 1: React + FastAPI 통합과 Cloudflare Tunnel — [[docs/phases/phase-1-cloudflare-tunnel]]

- [x] FastAPI 앱 뼈대
- [x] React build 정적 서빙
- [x] `/` 공개 랜딩, `/app` 앱 라우팅
- [x] SQLite run/result store 최소 구현
- [x] Redis/RQ queue와 worker 최소 구현
- [x] run 생성/status/result API
- [x] SSE API
- [x] Creative Testing 실제 엔진 연결
  - fake LLM/fake sampler worker 경로 검증 완료
  - live Redis/Gemini/parquet 검증 완료; Ollama fallback은 adapter/factory 수준으로 유지
- [x] React mock flow를 실제 API flow로 전환
  - 결과 리포트 전체 데이터 치환은 Phase 6 design sync에서 확장
- [x] 로컬 통합 실행 스크립트와 runbook
  - Redis/persona parquet/Gemini live 검증 완료
- [x] 개발 자동화 하네스
  - `uv run python scripts/verify.py`
  - full-repo ruff, pytest with 85% backend coverage threshold, frontend ESLint/typecheck/build
  - import-boundary tests
- [x] Deterministic eval fixture
  - `evals/fixtures/creative_testing_10.json`
  - `uv run python evals/run_creative_fixture_eval.py`
- [x] API envelope fixture and schema parity
  - `uv run python evals/run_result_envelope_fixture_eval.py`
  - backend Pydantic schema ↔ frontend TypeScript type parity tests
- [x] Frontend API fixture contract
  - `frontend/src/data/apiFixtures.ts`
  - frontend `RunResultEnvelope` typecheck gate
- [x] Queue health guardrail
  - Redis reachability and active RQ worker readiness are reported separately
- [x] Cloudflare Named Tunnel
- [x] `arabesque.cc` apex DNS route
- [x] 외부 50명 Creative Testing 검증
  - run `f7e4ba13-34e2-47ac-be77-b16c0f757276`, `parse_failed=0`

### Phase 2: 안정성 — [[docs/phases/phase-2-stability]]

- [x] SQLite 복구 동작 강화
- [x] run lifecycle 관리
- [x] SSE heartbeat와 replay/fallback
- [x] polling fallback
- [x] React 새로고침 복원
- [x] LLM timeout 60초 + retry 1회
- [x] partial result 저장
- [x] 200명 외부 완주 검증
  - run `ead192c8-5c47-43b1-9a04-e6dc9dc0bd67`, `parse_failed=0`

### Phase 3: Cloudflare Access / Public Route Decision — [[docs/phases/phase-3-cloudflare-access]]

- [x] Zero Trust 셋업
- [x] `arabesque.cc/app*`, `results*`, `api*` Access Application 추가 후 현재 정책에 맞춰 삭제
- [x] Google IdP 정책 작성
- [x] allowlist 이메일 등록
- [x] Cloudflare Access app 삭제 후 공개 app/API 경로 검증
- [x] 공개 React/API/SSE 흐름 테스트
- [x] access-policy 문서 작성

### Phase 4: React Demo Content and Trust Layer — [[docs/phases/phase-4-demo-content]]

- [x] 기업 데모용 preset 3종
- [x] React quick-start flow
- [x] 실제 API result 기반 ResultsPage
- [x] 품질 카드
- [x] sample summary
- [x] seed/filter/model/timestamp 표시
- [x] 고정 disclaimer
- [x] 3분 demo script

### Phase 5: Simulation Expansion — [[docs/phases/phase-5-simulations]]

- [x] 5.0 공통 simulation framework
- [x] 5.1 Price Optimization reference implementation
- [x] 5.2 Product Launch
- [x] 5.3 Value Proposition
- [x] 5.4 Market Segmentation
- [x] 5.5 Competitive Positioning
- [x] 5.6 Brand Perception
- [x] 5.7 Churn Prediction
- [x] 5.8 Campaign Strategy

### Phase 6: Design Sync — [[docs/phases/phase-6-design-sync]]

- [x] shared API/result schema document
- [x] frontend mock shape 정리
- [x] frontend API client
- [x] TypeScript API types
- [x] ResultsPage hardcoded result 제거
- [x] running/failed/partial/completed states
- [x] design QA checklist
- [x] 새 simulation 추가 checklist

### Phase 7: LLM Gateway and Agentic Orchestration — [[docs/phases/phase-7-llm-gateway-orchestration]]

- [x] provider-agnostic `LLMClient`
- [x] Ollama adapter
- [x] LiteLLM Proxy config
- [x] GPT/Gemini/Ollama model aliases
- [x] full task-based model routing for analysis/report/repair/QA tasks
- [x] metadata-only observability
- [x] run-level LangGraph prototype
- [x] project/session memory schema

## 공통 횡단 기능

- [x] 품질·신뢰도 표기 + 면책 + 검증 케이스 — [[docs/functional/quality-and-trust]]
- [x] 표본 요약 분포 표시
- [x] 시드 재현성
- [x] React result renderer registry
- [x] simulation registry
- [x] API schema와 frontend types 동기화
- [x] LLM model alias와 observability metadata 동기화
- [x] 앱 레벨 Google OAuth/session scaffold
- [x] test/staging 전용 auth bypass for E2E
- [x] run cancel action
- [x] human-review JSON export without raw persona rows

## 산출물 위치

```text
org/organization/product/waterfall.run/koresim/
├── README.md
├── CLAUDE.md
├── app.py                         # Streamlit fallback
├── frontend/                      # React/Vite UI
├── src/                           # Python simulation engine + API
├── docs/
│   ├── prd.md
│   ├── data-spec.md
│   ├── functional/
│   ├── research/
│   ├── design/
│   ├── execution/
│   └── phases/
└── pyproject.toml
```

## 프로젝트 외부 연계

- Vault wiki page: `org/organization/wiki/aaru.md`
- Repo: https://github.com/OpenScoutAI/obsidian-org-knowledge
