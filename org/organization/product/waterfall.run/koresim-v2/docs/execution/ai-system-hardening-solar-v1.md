---
title: AI System Hardening + Solar Pro V1
type: execution-plan
tags: [ai-system, solar, security, intake, orchestration, trust]
created: 2026-07-13
updated: 2026-07-13
status: implementation-complete-deployment-pending
related: [[../design/llm-gateway-orchestration]], [[ai-agent-improvement-loop-v1]], [[agentic-intake-layer-v2]]
---

# AI System Hardening + Solar Pro V1

## 0. Metadata

- [x] Execution plan id: `ai-system-hardening-solar-v1`
- [x] Target phase: Phase 5/7 post-demo productization
- [x] Owner: Codex
- [x] Status: implementation-complete-deployment-pending
- [x] Created/updated: 2026-07-13

## 1. Objective

현재 구현과 제품 설명의 차이를 제거하고, Solar Pro 중심의 명시적 모델
경로, 승인된 intake 가정, 실제 agent workflow, 품질 경고, 안전한 운영
정보를 갖춘다.

## 2. AS-IS → TO-BE Checklist

| 상태 | 영역 | AS-IS | TO-BE |
| --- | --- | --- | --- |
| [x] | 공개 health/config | 내부 경로와 provider 설정 노출 | 공개 응답은 최소 상태/제품 계약만, 상세 응답은 인증 필요 |
| [x] | 모델 backend | 알 수 없는 backend가 Gemini로 묵시적 fallback | `upstage`, `gemini`, `litellm`, `fake`만 허용하고 나머지는 즉시 실패 |
| [ ] | 프로덕션 모델 | `.env`가 Gemini, Solar key 없음 | Upstage `solar-pro2` 목표; key 준비 후 live 전환 |
| [x] | Ollama | 문서와 LiteLLM config에 활성 fallback | 운영 범위에서 제거, 과거 검증 기록만 보존 |
| [x] | 모델 override | 요청 alias allowlist 없음 | 운영 설정에 등록된 alias만 허용 |
| [x] | 결과 모델 기록 | 요청 alias가 없으면 `model_alias=null` 가능 | 실제 resolved alias/provider model 기록 |
| [x] | Intake planner | React/Python planner가 모두 기준처럼 보임 | React planner v3 단일 정책, backend는 저장·검증·legacy 호환 |
| [x] | Intake 기본값 | payload builder가 숨은 가격·예산·표본 기본값 삽입 | 기본값을 slot provenance에 기록하고 실행 전 표시 |
| [x] | Intake 서버 방어 | 미검토 가정이 있어도 run 생성 가능 | `unreviewed_assumption_count > 0` 요청 거부 |
| [x] | Intake 소유권 | session과 타 사용자 run 연결 검증이 약함 | session/run user ownership 일치, 익명 조회 격리 |
| [x] | Agent orchestration | agents 실행 후 별도 graph scaffold 기록 | Analysis → Report → QA가 실제 graph node로 실행 |
| [x] | LLM client 수명 | 공유 client가 persona batch 뒤 닫힐 수 있음 | 생성 주체만 close하고 result agents가 안전하게 재사용 |
| [x] | QA gate | QA/fallback이어도 일반 완료와 동일 | `review_required`, mode, warning, 품질 downgrade 반영 |
| [x] | 결과 휴리스틱 | 관측 부족 시 감정·의향을 승자 비율로 생성 | 직접 관측값이 없으면 `데이터 없음`, 휴리스틱은 명시 |
| [x] | 통계 표현 | “전체 시장 안정”, “바로 전환 가능” 표현 | synthetic panel 방향성·추가 검증 필요 표현 |
| [x] | 신뢰구간 | 임의 band 계산 | 선택 비율에 Wilson 95% interval 사용 |
| [x] | 재현성 | seed를 전체 결과 재현처럼 표현 | persona panel seed와 LLM 변동성을 구분 |
| [x] | 마케팅 표본 | 랜딩/mock 8–1,000명, backend 최대 200명 | 제품 입력·표시를 50–200명으로 일치 |
| [x] | 직접 LLM 호출 | 후보/후속 질문에 별도 사용 제한 없음 | 사용자별 action rate limit과 follow-up 표본 상한 |
| [x] | 관측성 | provider/model 중심 metadata | latency, usage, retry, run/simulation metadata; 오류 본문 redaction |
| [x] | 문서 | Gemini/Ollama 중심 현재 상태 | Solar 목표, 실제 live 상태, 외부 dependency 명시 |

## 3. Scope

### Completed implementation

- [x] 공개/상세 health 계약 및 공개 config redaction
- [x] provider/backend/alias validation
- [x] Solar Pro 목표 경로와 Ollama 운영 제거
- [x] intake planner ownership, default provenance, persistence, ownership, server validation
- [x] actual result-agent graph, checkpoint, and QA quality gate
- [x] 결과 UI 과도 추론 제거, Wilson interval, 재현성/방법론 표기
- [x] interactive LLM action rate limit and follow-up sample cap
- [x] LLM metadata-only telemetry and error redaction
- [x] tests and architecture/runbook documentation
- [ ] project-scoped commit and live deployment

### External validation dependency

- [ ] 실제 고객 설문/패널 정답 데이터와 비교 calibration
- [ ] provider별 실제 비용·정확도 A/B benchmark
- [ ] Upstage API key를 local `.env`에 주입한 live Solar run

외부 검증 항목은 자격증명이나 실제 조사 데이터 없이 코드만으로 통과
처리하지 않는다.

## 4. Acceptance Criteria

- [x] 공개 `/api/health`와 `/api/config`에 절대 경로, URL, 모델 상세가 없다.
- [x] 상세 health는 인증 경로에서만 확인할 수 있다.
- [x] 미지원 backend와 미허용 model alias는 실행 전에 거부된다.
- [x] Ollama가 현재 LiteLLM config와 운영 source-of-truth에서 제거된다.
- [x] 자동 기본값이 `source=default`로 기록되고 run-ready 화면에 표시된다.
- [x] 미검토 intake 가정이 포함된 run 생성 요청이 거부된다.
- [x] intake session과 linked run의 사용자 소유권이 일치한다.
- [x] agent output과 graph state가 동일 workflow 실행 결과다.
- [x] QA warning/fail/fallback이 result warning과 `review_required`에 반영된다.
- [x] 감정/구매 의향 원자료가 부족하면 UI가 수치를 만들지 않는다.
- [x] synthetic panel 범위를 넘어 시장 전체를 단정하지 않는다.
- [x] 후보 생성·후속 질문에 사용자별 rate limit이 적용된다.
- [x] `uv run python scripts/verify.py`가 통과한다.
- [ ] 프로젝트 범위만 커밋하고 live readiness가 통과한다.

## 5. Validation Log

- 2026-07-13: `uv run ruff check src tests scripts` passed.
- 2026-07-13: focused backend hardening suite passed: 111 tests.
- 2026-07-13: `npm --prefix frontend run check:intake` passed: 126 fixtures.
- 2026-07-13: `npm --prefix frontend run check:minsim` passed: 1 result fixture.
- 2026-07-13: first full gate correctly caught the stale one-checkpoint E2E
  expectation after the workflow moved to three node checkpoints.
- 2026-07-13: `uv run python scripts/verify.py` passed after updating the
  checkpoint contract: 202 tests, 89.33% backend coverage, deterministic
  creative/result/agent evals, frontend lint/typecheck/production build.
- 2026-07-13: runtime credential inspection found no `UPSTAGE_API_KEY`; Solar
  live execution remains an external dependency and is not marked complete.
