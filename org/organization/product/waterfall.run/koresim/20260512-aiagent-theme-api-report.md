# 20260512 AI Agent Theme API Report

## V2 업데이트

2026-05-12에 Agent schema/prompt V2를 적용한 뒤 9개 simulation theme를 API 경로로 재실행했다.

검증 조건:

- route: `POST /api/runs` -> worker -> `GET /api/runs/{run_id}/result`
- backend: `LLM_BACKEND=litellm`
- provider: Gemini through LiteLLM aliases
- LiteLLM proxy: `http://127.0.0.1:4000`
- sample size: theme별 3명
- agent prompt versions: `analysis:v2-20260512`, `report:v2-20260512`, `qa:v2-20260512`
- artifact: `docs/verification/e2e/ai-agent-theme-api-v2-20260512T151016Z`

결과:

- 9개 theme 모두 completed
- 전체 parse failure: 0
- theme별 agent_runs 3개 저장
- provider: 전부 `litellm`
- eval gate V2: 전부 통과
- QA severity: 전부 `directional_only`
- ResultsPage browser E2E artifact: `docs/verification/e2e/results-page-agent-v2-20260512T152600Z`

V2에서 해결된 개선 지점:

- 소표본 한계를 `qa.passed=false` 품질 실패로 처리하지 않고 `severity=directional_only`로 분리했다.
- `key_findings`는 `metric_key`, `evidence`, `confidence`를 포함한다.
- `recommendations`와 `risks`는 action/reason, risk/mitigation을 분리한다.
- 한국어 output gate를 eval에 추가했고, 이번 9-theme V2 결과는 한국어 gate를 통과했다.
- UI에서 `AI Agent Report`, `Key findings`, `Recommendations`, `Risks`, QA status를 확인할 수 있다.

V2 관찰:

- 건강 간식 시장 세분화에서 일부 segment label이 instruction 조각처럼 섞였다. 이 문제는 agent schema가 아니라 해당 simulation의 persona response prompt/parser 품질 개선 대상으로 남긴다.
- sample size 3은 smoke 검증이므로 실제 제품 판단용 비교는 sample size 10 또는 50에서 다시 실행해야 한다.

### 2026-05-13 parser 품질 개선

위 market segmentation label 오염은 수정 후 단일 preset API smoke로 재검증했다.

- artifact: `docs/verification/e2e/market-segmentation-parser-v2-20260513T000000Z`
- preset: `healthy-snack-segmentation`
- provider: `litellm`
- sample size: 3
- parse failed: 0
- contaminated label search: no matches
- segment labels:
  - `똑똑한 자기관리 직장인`
  - `맛 성분 따지는 직장인`
  - `합리적 영양 추구자`

---

## 요약

2026-05-12에 KoreaSim의 9개 simulation theme 전체를 API 생성 흐름으로 실행했다. 각 run은 `POST /api/runs`로 생성했고, worker 실행 후 `/api/runs/{run_id}/result`에서 결과를 회수했다. LLM 경로는 LiteLLM proxy를 사용했다.

검증 조건:

- route: `POST /api/runs` -> worker -> `GET /api/runs/{run_id}/result`
- backend: `LLM_BACKEND=litellm`
- provider: Gemini through LiteLLM aliases
- sample size: theme별 3명
- agent layer: analysis/report/QA
- theme count: 9
- artifact: `docs/verification/e2e/ai-agent-theme-api-20260512T133836Z`

결과:

- 9개 theme 모두 completed
- 전체 parse failure: 0
- theme별 agent_runs 3개 저장
- analysis/report/QA trace id 저장
- agent output schema/no-raw-leak scores 통과
- Langfuse trace와 agent_runs score를 prompt version 기준으로 연결 가능

## 테마별 결과

### 1. Galaxy 광고 크리에이티브 비교

- simulation: `creative_testing`
- headline: `Productivity Partner` 포지셔닝이 직장인 타겟에 가장 강하게 반응
- 핵심 결과: 생산성 파트너 메시지가 66.7%로 우세, 라이프스타일 카메라 메시지는 반응 없음
- 권고: Galaxy AI 자체보다 업무/취미 생산성 편익을 전면화
- 리스크: sample size 3이므로 방향성 검증으로만 사용

### 2. 스페셜티 커피 가격 최적화

- simulation: `price_optimization`
- headline: 4,500원이 수요 극대화 가격, 5,500원이 심리적 저항선
- 핵심 결과: 모든 응답자의 선호 가격과 지불 의향 평균이 5,500원으로 나타남
- 권고: 4,500원 출시 가격으로 진입하고 5,500원을 premium 기준선으로 활용
- 리스크: 단위당 이익과 수요 극대화 가격 사이 trade-off

### 3. AI 홈클리너 제품 출시 반응

- simulation: `product_launch`
- headline: 시간 절약 소구는 긍정적, AI 기능 구체화와 가성비 입증이 관건
- 핵심 결과: 평균 4.33점, 구매 66.7%, 관망 33.3%
- 권고: 맞벌이 가구의 퇴근 후 청소 부담 감소, 저소음 야간 청소 편익을 강조
- 리스크: AI 학습 기능의 실제 효용을 입증하지 못하면 가격 저항 발생

### 4. OTT 가치 제안 비교

- simulation: `value_proposition`
- headline: 독점 K-오리지널 선공개 가치 제안이 가장 강함
- 핵심 결과: 독점 오리지널 선공개가 66.7%, 가족 K-content 충족이 33.3%
- 권고: `오직 여기서`, `가장 먼저` 메시지를 전면화
- 리스크: 독점 콘텐츠 전략은 지속 투자와 흥행 의존성이 큼

### 5. 건강 간식 시장 세분화

- simulation: `market_segmentation`
- headline: 바쁜 직장인에게 맛, 성분 투명성, 합리 가격을 결합한 단백질 간식이 유효
- 핵심 결과: 가격, 맛 불확실성, 성분 불투명성이 주요 장벽
- 권고: trial size, 샘플링, 성분 투명성 메시지 강화
- 리스크: 맛에 대한 첫 인상이 나쁘면 재구매 형성이 어려움

### 6. OTT 경쟁 포지셔닝

- simulation: `competitive_positioning`
- headline: 독점 한국 오리지널 콘텐츠가 가격/기술 우려를 압도
- 핵심 결과: 프리미엄 OTT A가 100% 선호
- 권고: AI 추천이나 가격 경쟁보다 독점 콘텐츠 확보에 집중
- 리스크: 프리미엄 가격 정당화 실패 시 가입 저항

### 7. 커피 브랜드 인식

- simulation: `brand_perception`
- headline: Arabica Daily의 premium value 컨셉은 유효하나 price-quality 신뢰 입증 필요
- 핵심 결과: 평균 brand perception score 4.0/5
- 권고: premium quality가 합리 가격으로 가능한 근거를 투명하게 제시
- 리스크: 프리미엄과 가성비 메시지가 충돌할 수 있음

### 8. 통신 구독 이탈 위험

- simulation: `churn_prediction`
- headline: 요금 인상과 혜택 축소로 높은 이탈 위험
- 핵심 결과: 소표본에서 100% 이탈 위험 신호
- 권고: 가격 인상/혜택 축소 재검토, 체감 혜택 강화, 장기 고객 loyalty 회복
- 리스크: 즉각 조치 없으면 장기 고객 신뢰 훼손

### 9. 비건 선케어 캠페인 전략

- simulation: `campaign_strategy`
- headline: 네이버 검색에서 성분안심/후기검증 메시지가 효과적
- 핵심 결과: 네이버 검색 채널이 100% 클릭 반응, 성분안심 조합 평균 점수 5.0
- 권고: 네이버 검색과 SEO 콘텐츠에 성분/후기 신뢰를 집중
- 리스크: 단일 채널 집중으로 인스타그램 등 다른 채널 기회를 놓칠 수 있음

## 개선 지점

### 1. QAAgent의 sample-size 인식 개선

모든 테마에서 QAAgent가 소표본 한계를 감지했다. 이는 맞는 판단이지만, 현재 report에서는 “품질 문제”처럼만 보인다. 개선 방향은 다음과 같다.

- `qa.passed`와 `qa.severity`를 분리한다.
- sample size 3 smoke test는 `passed=true`, `severity=directional_only`로 표현한다.
- 실제 제품 UI에서는 “실패”가 아니라 “방향성 검증”으로 표시한다.

### 2. AnalysisAgent 출력 구조 강화

일부 테마에서 summary는 좋지만 `key_findings` 리스트가 충분히 구조화되지 않았다. 개선 방향:

- analysis output schema를 더 엄격하게 한다.
- `key_findings` 최소 2개를 eval gate에 추가한다.
- 각 finding에 `metric_key`, `evidence`, `confidence` 필드를 추가한다.

### 3. 언어 일관성 개선

일부 theme report가 영어로 생성됐다. 한국어 B2B SaaS demo에서는 한국어가 기본이어야 한다.

- agent system prompt에 `Write Korean by default`를 명시한다.
- output language score를 eval에 추가한다.
- 영어 고유명사는 허용하되 headline/recommendations/risks는 한국어로 제한한다.

### 4. Report UI 노출

현재 결과는 artifact/API에는 좋지만 UI에는 아직 노출되지 않는다.

- ResultsPage에 agent report 섹션을 추가한다.
- headline, recommendations, risks, QA status를 한 화면에서 확인 가능하게 한다.
- trace/provider/prompt_version은 trust metadata로 작게 표시한다.

### 5. Langfuse 기반 개선 루프

agent_runs와 Langfuse trace id가 연결되므로 다음 루프가 가능하다.

1. 결과물 모니터링: trace id, prompt_version, scores, output JSON 저장
2. 개선 지점 탐색: no_raw_leak, schema_valid, language, evidence coverage, QA severity score 비교
3. 개선 실행: prompt version 변경
4. 회귀 검증: 9-theme API report를 재실행해 이전 artifact와 비교

## 다음 실행 권장

1. QAAgent schema에 `severity`와 `confidence` 추가
2. AnalysisAgent schema에 evidence-linked findings 추가
3. Korean output eval 추가
4. ResultsPage에 agent report UI 노출
5. 9-theme API report를 sample size 10으로 재실행
