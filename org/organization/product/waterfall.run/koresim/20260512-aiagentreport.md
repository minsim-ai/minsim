# 20260512 AI Agent Report

## 요약

2026-05-12 기준 KoreaSim의 analysis/report/QA agent를 실제 `LLMClient` 기반 run-level LLM agent로 연결했다. 기존 deterministic agent scaffold는 유지하되, LLM 응답 실패나 JSON 파싱 실패 시 fallback으로 사용한다.

이번 변경의 목표는 persona fanout 자체를 LangGraph로 옮기는 것이 아니라, 기존 RQ worker와 async batch simulation 위에 결과 해석 agent 계층을 올리는 것이다. 따라서 50~200명 persona 응답 생성 경로는 그대로 유지하고, 완료된 aggregate result envelope를 대상으로 analysis/report/QA agent가 후처리한다.

## 구현 현황

### LangGraph

- 구현 파일: `src/orchestration/graph.py`
- 현재 범위: run-level graph
- 단계: `prepare -> execute -> analyze -> report -> qa`
- 실행 위치: `src/jobs/worker.py`
- `ENABLE_LANGGRAPH=false`일 때도 같은 단계의 deterministic 실행 경로를 사용한다.
- 이번 변경에서 LangGraph는 persona fanout을 담당하지 않는다.

### Langfuse

- 구현 파일: `src/llm/tracing.py`
- 기본 trace mode: `metadata_only`
- redaction 대상: `persona`, `personas`, `persona_uuid`, `uuid`, `raw_results`, `prompt`, `system_prompt`, `user_prompt`, `messages`
- agent 실행도 기존 `LLMClient` 경계를 통과하므로 Langfuse tracing 정책을 공유한다.
- `trace_id`는 agent 응답 metadata에 포함되어 result envelope의 orchestration agent 결과에도 남는다.

### LLM Agent

- 신규 파일: `src/orchestration/llm_agents.py`
- 신규 entry point: `run_llm_agents(result, llm_client=...)`
- agent 종류:
  - `analysis`: aggregate metric과 segment 기반 해석
  - `report`: business-facing headline/recommendation/risk 작성
  - `qa`: sample quality, parse failure, unsupported conclusion 점검
- agent task type:
  - `analysis`
  - `report`
  - `qa`
- model routing은 기존 `src/llm/router.py`의 alias 정책을 사용한다.
- raw persona/result payload는 agent prompt에 넣지 않고, 안전한 aggregate key만 사용한다.

## 데이터 흐름

1. FastAPI가 run을 생성한다.
2. RQ worker가 simulation job을 실행한다.
3. 기존 `BatchSimulator`가 persona별 LLM 응답을 생성한다.
4. worker가 result envelope를 만든다.
5. LangGraph scaffold가 run-level state를 기록한다.
6. `run_llm_agents()`가 aggregate result만 받아 analysis/report/QA를 실행한다.
7. 결과는 `envelope["orchestration"]["agents"]`에 저장된다.

## 안전장치

- `ENABLE_LLM_AGENTS=true` 기본값을 추가했다.
- LLM agent 실패 시 deterministic `run_agents()` 결과로 fallback한다.
- agent prompt에는 `raw_results`, persona profile, persona response body를 포함하지 않는다.
- Langfuse는 metadata-only 기본 정책을 유지한다.
- API schema와 frontend TypeScript type에 `orchestration` field를 명시했다.

## 변경 파일

- `.env.example`
- `src/config.py`
- `src/orchestration/llm_agents.py`
- `src/jobs/worker.py`
- `src/api/routes.py`
- `src/api/schemas.py`
- `frontend/src/types/api.ts`
- `tests/test_phase7_orchestration.py`
- `tests/test_jobs_worker.py`
- `docs/phases/phase-7-llm-gateway-orchestration.md`
- `docs/execution/phase-7-llm-gateway-orchestration.md`
- `20260512-aiagentreport.md`

## 검증

통과한 focused tests:

```bash
uv run pytest tests/test_phase7_orchestration.py::test_llm_agents_run_analysis_report_qa_without_raw_persona_payload tests/test_jobs_worker.py::test_worker_saves_llm_agent_outputs_when_agent_client_returns_json -q
```

```bash
uv run pytest tests/test_phase7_orchestration.py tests/test_jobs_worker.py tests/test_llm_factory_tracing.py -q
```

최종 project verification:

```bash
uv run python scripts/verify.py
```

결과:

- Ruff 통과
- deterministic eval fixtures 통과
- backend pytest 138개 통과
- backend coverage 87.21%로 85% gate 통과
- frontend lint 통과
- frontend typecheck 통과
- frontend production build 통과
- Vite chunk size warning은 기존 bundle 크기 경고이며 build failure는 아니다.

## 남은 작업

- 실제 Gemini/LiteLLM 환경에서 agent trace가 Langfuse에 metadata-only로 기록되는지 live smoke test가 필요하다.
- Report UI에서 `orchestration.agents.report`를 별도 섹션으로 노출할지 결정해야 한다.
- LangGraph checkpoint/resume, human-in-the-loop, tool calling은 아직 구현 범위 밖이다.

## 2026-05-12 Improvement Loop Update

추가 구현:

- `agent_runs` SQLite 저장 구조를 추가했다.
- analysis/report/QA output에 `prompt_version`을 기록한다.
- agent output scoring harness를 추가했다.
- `evals/fixtures/agent_runs_v1.json`와 `evals/run_agent_eval.py`를 추가했다.
- `scripts/check_ai_agent_e2e.py`로 local worker E2E artifact를 생성한다.
- LangGraph run-level state를 `orchestration_checkpoints`에 저장한다.

생성된 E2E artifact:

- `docs/verification/e2e/ai-agent-20260512T121949Z/artifact.json`
- `docs/verification/e2e/ai-agent-20260512T121949Z/report.md`

최종 검증:

- `uv run python scripts/verify.py` 통과
- pytest 143개 통과
- coverage 87.69%
- frontend lint/typecheck/build 통과

제한:

- 이번 E2E는 deterministic local LLM/sampler 기반 worker E2E다.
- 외부 Gemini/LiteLLM/실제 Langfuse dashboard live smoke는 별도 credential 환경에서 추가로 실행해야 한다.

## 2026-05-12 Live LiteLLM/Langfuse Update

사용자 확인에 따라 dashboard 화면 검증 대신 Langfuse API/artifact 검증으로 운영 smoke를 수행했다.

검증 조건:

- `LLM_BACKEND=litellm`
- LiteLLM proxy: `http://127.0.0.1:4000`
- 외부 provider: Gemini through LiteLLM aliases
- Langfuse: `https://jp.cloud.langfuse.com`
- trace policy: `metadata_only`

생성된 live artifact:

- `docs/verification/e2e/ai-agent-live-20260512T123258Z/artifact.json`
- `docs/verification/e2e/ai-agent-live-20260512T123258Z/report.md`

결과:

- run status: completed
- sample size: 3
- total responses: 3
- parse failed: 0
- result provider: `litellm`
- result provider model: `koresim/gemini-persona-strong`
- agent runs: 3개 저장
- agent prompts:
  - `analysis:v1-20260512`
  - `report:v1-20260512`
  - `qa:v1-20260512`
- agent model aliases:
  - `koresim/gemini-analysis`
  - `koresim/gemini-report`
  - `koresim/gemini-repair`
- Langfuse trace API checks: 3개 모두 HTTP 200
- metadata-only leak check: passed

남은 운영 검증:

- 브라우저 UI에서 agent report/headline/recommendation/risk를 노출하고 API-only가 아닌 화면 기준 E2E artifact를 남긴다.

## 2026-05-12 Theme API Report Update

9개 simulation theme 전체를 API 생성 흐름으로 실행했다.

검증 조건:

- route: `POST /api/runs` -> worker -> `GET /api/runs/{run_id}/result`
- backend: `LLM_BACKEND=litellm`
- sample size: theme별 3명
- theme count: 9
- agent layer: analysis/report/QA

생성된 artifact:

- `docs/verification/e2e/ai-agent-theme-api-20260512T133836Z/artifact.json`
- `docs/verification/e2e/ai-agent-theme-api-20260512T133836Z/report.md`
- `20260512-aiagent-theme-api-report.md`

결과:

- 9개 theme 모두 completed
- parse failed: 0
- theme별 agent_runs 3개 저장
- agent output schema/no-raw-leak scores 통과
- 공통 개선 지점: QA severity 분리, analysis key findings 구조화, 한국어 출력 일관성, ResultsPage agent report 노출

## 2026-05-12 Agent V2 Completion Update

이번 세션에서 앞선 개선 지점을 V2로 반영했다.

구현:

- agent prompt/schema를 `analysis:v2-20260512`, `report:v2-20260512`, `qa:v2-20260512`로 승격했다.
- `analysis.key_findings[]`를 `metric_key`, `finding`, `evidence`, `confidence` 구조로 정규화했다.
- `report.recommendations[]`를 `priority`, `action`, `reason` 구조로, `report.risks[]`를 `severity`, `risk`, `mitigation` 구조로 정규화했다.
- `qa.passed`와 `qa.severity`를 분리하고, 소표본은 `directional_only`로 평가하도록 prompt와 eval gate를 강화했다.
- eval gate V2에 `schema_valid`, `no_raw_leak`, `korean_output`, `evidence_valid`, `actionability_valid`, `risk_mitigation_valid`, `qa_severity_valid`, `small_sample_severity_valid`를 추가했다.
- ResultsPage에 `AI Agent Report` 섹션을 추가해 headline, key findings, recommendations, risks, QA status를 노출했다.

신규/갱신 artifact:

- local deterministic agent E2E: `docs/verification/e2e/ai-agent-20260512T150752Z`
- 9-theme API V2 성공 artifact: `docs/verification/e2e/ai-agent-theme-api-v2-20260512T151016Z`
- ResultsPage browser E2E: `docs/verification/e2e/results-page-agent-v2-20260512T152600Z`
- V2 eval fixture: `evals/fixtures/agent_runs_v2.json`

9-theme API V2 결과:

- LiteLLM proxy: `http://127.0.0.1:4000`, reachable
- provider: `litellm`
- theme count: 9
- sample size: 3
- parse failed: 0
- prompt versions: `analysis:v2-20260512`, `report:v2-20260512`, `qa:v2-20260512`
- QA severities: all `directional_only`
- eval gate V2: all rows passed

브라우저 E2E 결과:

- route: `/results/story/run_completed_creative_testing`
- screenshot 저장: `docs/verification/e2e/results-page-agent-v2-20260512T152600Z/screenshot.png`
- `AI Agent Report`, `Key findings`, `Recommendations`, `Risks` heading 확인
- `directional_only`에 해당하는 “방향성 검증” QA status 노출 확인
- Vite/error overlay 없음

남은 개선 후보:

- market segmentation persona 응답에서 일부 segment label이 prompt instruction 조각처럼 섞이는 케이스가 관찰됐다. 이는 agent V2가 아니라 simulation별 persona response parser/prompt 품질 개선 대상으로 분리한다.
- sample size 3은 smoke 기준으로만 유지하고, 다음 비교는 sample size 10 또는 50에서 V2 artifact를 재생성한다.

## 2026-05-13 Market Segmentation Parser Quality Update

이전 V2 9-theme artifact에서 `market_segmentation` 결과의 segment label에 `와 핵심 니즈를 답하세요.**` 같은 prompt instruction 조각이 섞이는 문제가 관찰됐다. 원인은 agent가 아니라 simulation parser였다.

수정:

- 공통 `parse_line()`을 줄 시작의 실제 `라벨:` 필드만 읽도록 강화했다.
- `세그먼트`라는 단어가 instruction 문장 중간에 있을 때 더 이상 값으로 추출하지 않는다.
- market segmentation prompt에서 “시장 세그먼트와 핵심 니즈를 답하세요”라는 모호한 문장을 제거하고, “고객군 이름을 만들라”는 지시로 바꿨다.
- market segmentation parser에 template residue guard를 추가했다.
  - `짧은 이름`
  - `짧은 표현`
  - `답변 형식`
  - `답하세요`
  - `와 핵심 니즈`

검증 artifact:

- `docs/verification/e2e/market-segmentation-parser-v2-20260513T000000Z`

결과:

- route: `POST /api/runs` -> worker -> `GET /api/runs/{run_id}/result`
- preset: `healthy-snack-segmentation`
- provider: `litellm`
- sample size: 3
- parse failed: 0
- contaminated label search: no matches
- segment labels:
  - `똑똑한 자기관리 직장인`
  - `맛 성분 따지는 직장인`
  - `합리적 영양 추구자`

이번 수정은 agent output 품질 개선이 아니라 persona response parser/prompt hygiene 개선이다. 다음 단계에서 sample size 10 또는 50으로 같은 preset을 재실행해 label stability를 볼 수 있다.
