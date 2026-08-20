---
title: Getting Started (Local Setup From Zero)
type: onboarding-guide
tags: [setup, local-dev, onboarding]
created: 2026-08-20
updated: 2026-08-20
status: active
---

# Getting Started

이 문서는 **이 리포를 처음 clone한 사람**이 로컬에서 앱을 띄우고 테스트를 돌리기까지의 단계를 다룬다. README의 [로컬 실행](../README.md#로컬-실행) 섹션은 `.env`와 데이터가 이미 준비돼 있다고 전제하는 요약판이고, 이 문서는 그 전 단계(무엇을 설치하고, `.env`를 어떻게 채우고, 데이터를 어디서 받는지)를 채운다.

기존 워크트리에서 새 워크트리를 파생할 때는 이 문서 대신 [`scripts/bootstrap_worktree.sh`](../scripts/bootstrap_worktree.sh)를 쓴다 (아래 [추가 워크트리](#추가-워크트리) 참고).

## 0. 사전 준비물

| 도구 | 버전 | 확인 |
| --- | --- | --- |
| [uv](https://docs.astral.sh/uv/) | Python 3.13 관리 | `uv --version` |
| Node.js | 22 | `node --version` |
| Redis | 아무 최신 버전 | `redis-server --version` (macOS: `brew install redis`) |

## 1. 클론 + 의존성 설치

```bash
git clone <repo-url> koresim-v2
cd koresim-v2

# --extra dev를 빠뜨리면 ruff/pytest/ipython이 설치되지 않는다.
# uv sync (extra 없이)만 돌리면 겉보기엔 성공하지만 `ruff` 실행 시
# "Failed to spawn: ruff" 로 실패한다 — 실제로 겪은 문제다.
uv sync --extra dev

npm --prefix frontend install
```

## 2. `.env` 만들기

```bash
cp .env.example .env
chmod 600 .env
```

`.env.example`의 기본값만으로도 앱은 뜬다 (`KORESIM_EVENT_MODE=false`, 인증 키 전부 빈값 — 아래 [로그인](#로그인은-어떻게-되나) 참고). 최소한으로 채워야 하는 건 LLM 키뿐이다:

- `UPSTAGE_API_KEY` — 실제 시뮬레이션을 돌리려면 필요. 없으면 `LLM_BACKEND=fake`로 바꿔서 결정론적 가짜 응답으로 전체 흐름을 확인할 수 있다 (API 키 없이 UI·집계 로직 검증 가능. `evals/`와 `frontend/e2e/`도 이 백엔드를 쓴다).

**주의 — `KORESIM_EVENT_MODE`**: 행사장 데모용 표본 상한 모드다. 로컬에서 `true`로 켜두면 `max_sample_size`가 300으로 강제로 낮아지고, `/api/config`를 검증하는 pytest가 실패한다 (`tests/conftest.py`가 pytest 자체는 격리해주지만, 브라우저로 직접 확인할 때는 여전히 영향을 준다). 데모 중이 아니면 `false`로 둔다.

## 3. 페르소나 데이터

```bash
# 최소: 한국 데이터셋 (공개, HuggingFace, ~1.8GB)
uv run python scripts/download_dataset.py --country kr

# 필요하면 다른 국가 추가 (venture 프로젝트의 다국가 시뮬레이션용)
uv run python scripts/download_dataset.py --country us,jp,sg
# 또는 전체
uv run python scripts/download_dataset.py --country all
```

**DGIST 캠퍼스 풀(`data/dgist_personas.parquet`)은 공개 다운로드 경로가 없다.** [`scripts/import_dgist_personas.py`](../scripts/import_dgist_personas.py)가 비공개 소스 JSON을 변환하는 스크립트인데, 그 소스 파일 자체를 별도로 구해야 한다 — 팀 내부에 문의. 이 데이터가 없어도 나머지 12종 시뮬레이션·앱 전체는 정상 동작한다 (`campus_policy`/`campus_priority`/`open_survey`의 DGIST 풀 옵션만 못 씀).

## 4. Redis

```bash
redis-server
```

기본 `REDIS_URL=redis://127.0.0.1:6379/0`이 `.env.example` 기본값과 일치하므로 별도 설정 불필요.

## 5. 준비 상태 확인

```bash
uv run python scripts/check_local_services.py
```

`ok: false`가 나오면 어떤 항목이 빠졌는지 JSON으로 알려준다.

## 6. 실행

두 가지 방법이 있다.

### A. 프로덕션과 동일한 빌드 (터미널 3개)

```bash
# 터미널 1
redis-server

# 터미널 2
uv run python scripts/run_worker.py

# 터미널 3
cd frontend && npm run build && cd ..
uv run uvicorn src.api.main:app --host 127.0.0.1 --port 8000
```

확인: `curl http://127.0.0.1:8000/api/health`, 브라우저로 `http://127.0.0.1:8000/app`.

### B. 프론트엔드만 빠르게 반복 (Vite dev 서버)

프론트엔드 코드만 고칠 때는 매번 빌드하지 않고 Vite dev 서버를 백엔드에 프록시로 붙이는 게 빠르다.

```bash
# 터미널 1, 2: 위와 동일 (redis-server, uv run python scripts/run_worker.py)
# 터미널 3
uv run uvicorn src.api.main:app --host 127.0.0.1 --port 8000
# 터미널 4
cd frontend && npm run dev
```

`frontend/vite.config.ts`가 `/api`, `/mcp`를 `http://127.0.0.1:8000`으로 프록시한다.

## 로그인은 어떻게 되나

`.env.example` 기본값(Google OAuth 키 전부 빈값)으로는 인증 자체가 꺼진 상태다 — `localhost`/`127.0.0.1`에서는 자동으로 `local-dev-user`로 로그인된 것처럼 동작한다 (`KORESIM_AUTH_LOCAL_DEV_AUTO_LOGIN`, 기본 켜짐). 로그인 화면을 직접 테스트해야 할 때만 `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`KORESIM_SESSION_SECRET`을 채운다.

## 7. 검증 (커밋 전에)

```bash
# 전체 (프론트 빌드 + 전체 e2e 포함, 느림, 실제 데이터/Redis 필요)
uv run python scripts/verify.py

# 빠른 로컬 루프 (빌드/e2e 생략)
uv run python scripts/verify.py --skip-build

# CI와 동일한 조건 (kr 데이터만 있고 DGIST는 없는 환경 시뮬레이션)
uv run python scripts/verify.py --skip-build --skip-dataset-tests
```

PR을 올리면 `.github/workflows/verify.yml`이 자동으로 `--skip-build --skip-dataset-tests`를 돌린다 (Redis는 서비스 컨테이너로, `kr` 데이터셋은 캐싱해서 다운로드). DGIST 의존 테스트(`@pytest.mark.requires_dataset`로 표시됨, 총 12개)는 CI에서 제외되므로 로컬에서 최소 한 번은 전체 `scripts/verify.py`를 돌려봐야 한다.

## 추가 워크트리

이미 세팅된 워크트리가 있고, 거기서 데이터·`.env`를 복사해 격리된 두 번째 워크트리를 만들고 싶다면:

```bash
../새-워크트리-경로에서
../<이 스크립트가 있는 리포>/scripts/bootstrap_worktree.sh <기존-워크트리-경로> [redis-db] [api-port]
```

`git worktree`는 추적 파일만 만들기 때문에 `.env`·parquet·`node_modules`가 비어 있다 — 이 스크립트가 심볼릭 링크(데이터), `.env` 복사+포트/DB 격리, `uv sync --extra dev`, `npm install`을 대신 해준다.

## 자주 겪는 문제

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| `ruff`/`pytest` 실행 시 "command not found" 또는 "Failed to spawn" | `uv sync`를 `--extra dev` 없이 돌림 | `uv sync --extra dev` 재실행 |
| `/api/config`의 `max_sample_size`가 기대와 다름, 관련 pytest 실패 | `.env`의 `KORESIM_EVENT_MODE=true` | `.env`에서 `false`로 변경 (pytest 자체는 `tests/conftest.py`의 autouse fixture가 격리하므로 테스트만 돌린다면 무관) |
| `데이터셋 없음: .../dgist_personas.parquet` | DGIST 데이터는 비공개, 별도 확보 필요 | [3. 페르소나 데이터](#3-페르소나-데이터) 참고. 이 데이터 없이도 나머지는 다 동작함 |
| run 생성 시 "선택한 국가 데이터셋(kr)이 서버에 없습니다" | `kr` parquet 미다운로드 | `uv run python scripts/download_dataset.py --country kr` |
| `scripts/run_worker.py`가 Redis 연결 실패로 즉시 종료 | Redis 미실행 | `redis-server` |
