# 시뮬레이션 전략별 테스트 시나리오 (9종)

koresim-v2가 지원하는 9개 시뮬레이션 전략 각각에 대한 실행 가능한 테스트 시나리오다.
각 시나리오의 `input`은 `src/api/schemas.py`의 해당 `*Input` 모델과 정확히 일치하므로,
UI 인테이크로 만들거나 `POST /api/projects/{project_id}/runs` (또는 `POST /api/runs`) 바디로 바로 사용할 수 있다.

- 브라우저 e2e 검증 결과: `docs/verification/e2e/` 참고
- e2e/로컬 실행 시 `sample_size`는 5~12 (방향성 확인용), 프로덕션 리포트 기준은 50~200 권장
- `seed`를 고정하면 동일 패널이 재현되어 재실행 비교가 가능
- LLM 백엔드: 이 시나리오 배치는 **Upstage Solar**(`LLM_BACKEND=upstage`, `solar-pro2`)로 검증

각 시나리오 공통 필드
- `simulation_type`: 전략 키
- `sample_size` / `seed`: 표본 크기 / 시드
- `target_filter`: 페르소나 표본 필터 (`province`, `district`, `age_min`, `age_max`, `sex`, `education_level`, `occupation_keywords`, `exclude_unemployed`)
- `input`: 전략별 페이로드

---

## 1. 🎯 크리에이티브 비교 (`creative_testing`)
**핵심 질문:** 어떤 카피·메시지가 가장 끌리는가?
**시나리오:** 시니어 돌봄 AI 스피커 "안심이" — 4개 광고 헤드라인 중 자녀 구매층에게 가장 반응이 강한 카피 찾기.

```json
{
  "simulation_type": "creative_testing",
  "sample_size": 12,
  "seed": 42,
  "target_filter": { "age_min": 40, "age_max": 69, "exclude_unemployed": false },
  "input": {
    "creatives": [
      "부모님 곁의 24시간 말동무, 외로움을 덜어드립니다",
      "위급할 땐 자동으로 119·가족에게 바로 알립니다",
      "약 챙김부터 안부 확인까지, 떨어져 있어도 안심",
      "버튼 하나로 자녀와 연결되는 시니어 전용 스피커"
    ]
  }
}
```
**기대 신호:** 안별 선호율/격차, 연령·성별·지역 분포, 거부 사유, 그리고 기회·리스크 통합 맵(수용도·니즈·가격저항·신뢰우려·경쟁압력)과 주요 거부 요인.

---

## 2. 💰 가격 최적화 (`price_optimization`)
**핵심 질문:** 최적 가격대는 얼마인가?
**시나리오:** 반려동물 건강관리 구독 서비스 "펫케어 플러스" — 월 구독가 민감도.

```json
{
  "simulation_type": "price_optimization",
  "sample_size": 12,
  "seed": 42,
  "target_filter": { "age_min": 25, "age_max": 49, "occupation_keywords": ["직장", "사무", "자영"] },
  "input": {
    "protocol_id": "price_research_v2",
    "product_name": "펫케어 플러스",
    "product_description": "반려견·반려묘의 건강검진 리마인더, 사료·영양제 정기배송, 24시간 수의사 채팅 상담을 묶은 월 구독 서비스.",
    "price_points": [9900, 14900, 19900, 24900],
    "context_note": "1인 가구·맞벌이 반려인 대상. 기존에는 병원 방문마다 비용을 따로 지불."
  }
}
```
**기대 신호:** 선호 가격대, 가격별 구매 의향(수요 곡선 방향), 심리적 저항선, 지불의향(WTP) 힌트.

---

## 3. 🚀 신제품 반응 (`product_launch`)
**핵심 질문:** 신제품 시장 반응은 어떤가?
**시나리오:** 1인 가구용 초소형 식기세척기 "미니워시" — 초기 출시 매력도·구매 의향.

```json
{
  "simulation_type": "product_launch",
  "sample_size": 12,
  "seed": 42,
  "target_filter": { "age_min": 20, "age_max": 39, "province": ["서울", "경기", "인천"] },
  "input": {
    "product_concept": "설거지 6인분을 25분에 끝내는 1인 가구용 초소형 식기세척기. 설치 없이 콘센트만 꽂으면 되고, 3분 급속 헹굼 모드 지원.",
    "key_features": ["무설치 콘센트형", "6인분 25분 세척", "3분 급속 헹굼", "저소음 42dB", "월 전기료 약 3천원"],
    "target_use_case": "자취·신혼 1~2인 가구가 좁은 주방에서 설거지 시간을 줄이고 싶은 상황",
    "expected_price_range": "24만~29만원",
    "alternatives": ["손설거지", "빌트인 식기세척기", "일회용 식기"]
  }
}
```
**기대 신호:** 출시 매력도/구매 의향, 강점 드라이버, 대안 대비 포지셔닝 각, 세그먼트별 온도차.

---

## 4. 💬 가치 제안 (`value_proposition`)
**핵심 질문:** 어떤 VP가 설득력 있는가?
**시나리오:** 중소기업 대상 AI 세무 비서 "택스메이트" — VP 문장 3종의 명료성·설득력 비교.

```json
{
  "simulation_type": "value_proposition",
  "sample_size": 12,
  "seed": 42,
  "target_filter": { "age_min": 30, "age_max": 59, "occupation_keywords": ["대표", "자영", "사업", "회계"] },
  "input": {
    "protocol_id": "product_qa_v1",
    "product_context": "부가세·종합소득세 신고를 자동 정리하고 절세 포인트를 알려주는 소상공인용 AI 세무 비서 SaaS.",
    "statements": [
      "세무사 없이도 클릭 3번으로 부가세 신고 끝",
      "놓친 공제·경비를 찾아 세금을 평균 18% 줄여드립니다",
      "장부·영수증 정리부터 신고까지, 사장님의 세무 부담을 대신합니다"
    ],
    "criteria": ["명료성", "설득력", "신뢰성", "차별성"]
  }
}
```
**기대 신호:** VP별 선호/점수, 기준(criteria)별 강약, 어떤 문장이 신뢰·설득에서 앞서는지.

---

## 5. 🧩 시장 세분화 (`market_segmentation`)
**핵심 질문:** 어떤 타깃 세그먼트가 존재하는가?
**시나리오:** 홈트레이닝 구독 앱 "핏홈" — 수요 기반 세그먼트 도출.

```json
{
  "simulation_type": "market_segmentation",
  "sample_size": 12,
  "seed": 42,
  "target_filter": { "age_min": 20, "age_max": 54 },
  "input": {
    "category": "홈트레이닝·운동 구독 앱",
    "product_family": "AI 자세 교정, 라이브 클래스, 식단 코칭을 제공하는 구독형 홈트 서비스",
    "core_questions": [
      "운동을 시작/지속하지 못하는 가장 큰 이유는 무엇인가?",
      "홈트 앱에 월 얼마까지 지불할 의향이 있는가?",
      "어떤 기능(자세교정/라이브/식단)이 가장 중요한가?"
    ],
    "n_segments": 5
  }
}
```
**기대 신호:** 니즈 기반 세그먼트 클러스터, 세그먼트별 규모·핵심 니즈·지불의향.

---

## 6. 🎲 경쟁 포지셔닝 (`competitive_positioning`)
**핵심 질문:** 경쟁사 대비 우리는 어디에 있는가?
**시나리오:** 국내 OTT 시장 — 우리 서비스 "코리아플레이"의 상대적 위치.

```json
{
  "simulation_type": "competitive_positioning",
  "sample_size": 12,
  "seed": 42,
  "target_filter": { "age_min": 20, "age_max": 49 },
  "input": {
    "category_context": "월 구독형 OTT 스트리밍. 한국 오리지널 콘텐츠 100%를 내세운 신규 서비스 '코리아플레이'가 넷플릭스·티빙·쿠팡플레이와 경쟁.",
    "products": ["코리아플레이", "넷플릭스", "티빙", "쿠팡플레이"],
    "attributes": ["콘텐츠 다양성", "가격 합리성", "오리지널 강도", "사용 편의성", "추천 정확도"]
  }
}
```
**기대 신호:** 선호 점유율, 제품별 강점/약점, 속성 맵상 빈 공간(기회 영역).

---

## 7. 🏷️ 브랜드 인지도 (`brand_perception`)
**핵심 질문:** 브랜드 이미지는 어떤가?
**시나리오:** 토종 제로칼로리 탄산음료 "제로톡" — 브랜드 연상·속성 인식.

```json
{
  "simulation_type": "brand_perception",
  "sample_size": 12,
  "seed": 42,
  "target_filter": { "age_min": 20, "age_max": 44 },
  "input": {
    "brand_name": "제로톡",
    "category": "제로칼로리 탄산음료",
    "attributes": ["맛", "건강함", "가격", "디자인/힙함", "믿을 수 있는 브랜드", "구매 의향"],
    "context_note": "글로벌 제로 콜라 대비 '한국인 입맛에 맞춘 국산 제로'를 강조하는 신생 브랜드."
  }
}
```
**기대 신호:** 브랜드 스코어, 긍정/부정 연상 테마, 속성별 인식 강약.

---

## 8. 📉 이탈 예측 (`churn_prediction`)
**핵심 질문:** 어떤 고객이 떠나려 하는가?
**시나리오:** 유료 뉴스레터 구독 "모닝브리핑" — 갱신 시점 이탈 위험.

```json
{
  "simulation_type": "churn_prediction",
  "sample_size": 12,
  "seed": 42,
  "target_filter": { "age_min": 25, "age_max": 54, "occupation_keywords": ["직장", "사무", "마케팅", "기획"] },
  "input": {
    "service_name": "모닝브리핑 (월 9,900원 유료 뉴스레터)",
    "current_situation": "가입 6개월 차 구독자. 최근 오픈율이 떨어졌고, 콘텐츠가 예전만큼 새롭지 않다고 느끼는 중.",
    "trigger_event": "다음 달 자동결제(갱신) 안내 메일을 받았다.",
    "competitor_offer": "경쟁 뉴스레터가 첫 3개월 무료 + AI 요약 기능을 제공."
  }
}
```
**기대 신호:** 잔류/관망/이탈 의향 분포, 이탈 방아쇠, 리텐션 훅.

---

## 9. 📡 캠페인 전략 (`campaign_strategy`)
**핵심 질문:** 최적 채널·메시지 조합은?
**시나리오:** 동네 베이커리 "오븐하우스" 신메뉴 캠페인 — 채널×메시지 조합 반응.

```json
{
  "simulation_type": "campaign_strategy",
  "sample_size": 12,
  "seed": 42,
  "target_filter": { "age_min": 20, "age_max": 49, "province": ["서울", "경기"] },
  "input": {
    "product_context": "동네 베이커리 '오븐하우스'가 유기농 통밀 소금빵 신메뉴를 출시. 반경 3km 지역 고객에게 첫 방문·재구매를 유도하는 캠페인.",
    "channels": [
      { "name": "인스타그램 릴스", "description": "굽는 과정·비주얼 중심 숏폼", "cost_per_reach": 30 },
      { "name": "당근마켓 동네광고", "description": "반경 지역 타겟 노출", "cost_per_reach": 20 },
      { "name": "네이버 플레이스", "description": "검색·리뷰 기반 유입", "cost_per_reach": 45 }
    ],
    "messages": [
      { "name": "갓구운감성", "creative": "방금 나온 유기농 소금빵, 오늘만 이 향" },
      { "name": "동네혜택", "creative": "우리 동네 이웃님께 첫 방문 1+1" },
      { "name": "건강강조", "creative": "설탕 줄인 유기농 통밀, 아이 간식으로도 안심" }
    ],
    "budget": 3000000
  }
}
```
**기대 신호:** 채널×메시지 조합 랭킹, 예상 반응, 세그먼트별 채널 적합도.

---

## 부록 A. 실행 방법

### UI (실 브라우저)
1. `/app` → 프로젝트 생성 → 시뮬레이션 유형 선택(위 9개 카드)
2. 인테이크(목표 우선 대화)에서 위 시나리오 내용을 제시 → 실행
3. `/results?run_id=...&project_id=...`에서 리포트 확인

### API (직접 실행)
```bash
# 프로젝트 생성
curl -s -X POST http://127.0.0.1:8000/api/projects \
  -H 'Content-Type: application/json' \
  -d '{"name":"시나리오 검증"}'

# 위 각 시나리오 JSON을 그대로 run 생성 바디로 사용
curl -s -X POST "http://127.0.0.1:8000/api/projects/<PROJECT_ID>/runs" \
  -H 'Content-Type: application/json' \
  -d @scenario.json
```

## 부록 B. Upstage(Solar) 백엔드로 실행
```bash
LLM_BACKEND=upstage \
UPSTAGE_API_KEY=up_xxx \
UPSTAGE_MODEL=solar-pro2 \
uv run python scripts/run_local_upstage_e2e.py   # 격리 인스턴스(포트 8099, 인라인 실행, 임시 DB)
```
`scripts/run_local_upstage_e2e.py`는 프로덕션 Redis 큐/DB/서비스를 건드리지 않는 완전 격리 로컬 인스턴스다.
