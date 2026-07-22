---

title: 02 — 가격 최적화 (Price Optimization)  
type: functional-spec  
tags: \[functional-spec, price-optimization\]  
created: 2026-04-30  
updated: 2026-05-03
status: implemented-v1
implementation: src/simulations/generic_suite.py + src/simulations/registry.py + frontend/src/simulations/registry.ts
related: \[\[overview\]\], \[\[../prd\]\]  
priority: ★★★★★

---

# 02 — 가격 최적화

## Goal (비즈니스 질문)

> "동일 제품을 **얼마에 팔 때 가장 많이 살까**? 가격을 올렸을 때 수요가 얼마나 떨어지나?"

가격-수요 곡선을 그려 **최적 가격대**와 \*\*가격 탄력성(E)\*\*을 측정.

## 사용자 시나리오

1.  신제품 출시를 앞두고 가격을 4,500/5,500/6,500/7,500원 중 결정해야 함
2.  너무 싸면 수익↓, 너무 비싸면 판매량↓
3.  KoreaSim에 4개 가격대 입력 → 각 가격에 대한 구매 의향 측정
4.  가격-수요 곡선에서 **수익(가격×수요)** 최대 지점 발견

## 입력 (Input Schema)

```python
class PriceOptimizationInput:
    product_name: str                # "프리미엄 자몽 에이드"
    product_description: str         # "스타벅스 신메뉴, 신선한 자몽 사용"
    price_points: list[int]          # [4500, 5500, 6500, 7500] (4~6개)
    sample_size: int = 200
    target_filter: TargetFilter = None
```

### 입력 검증

*   `len(price_points)`: 3~6 사이
*   가격은 오름차순 정렬
*   최저~최고 격차 최소 20% 권장

## 처리 흐름

### 핵심 차이 (Creative Testing과 다름)

각 페르소나에게 **모든 가격대를 한 번에 보여주고** 의향을 묻는다 (within-subject).  
이유: 같은 사람 기준으로 가격 변화에 따른 행동 변화를 측정해야 정확.

```
[1] N명 페르소나 샘플링
[2] 각 페르소나에 대해 1회 LLM 호출
      → 4개 가격 모두 평가 받음
[3] 가격별 "구매" 응답 비율 집계 → 수요 곡선
[4] 수익 = 가격 × 구매율 → 최적 가격
[5] 가격 탄력성 E = (Δ수요/수요) / (Δ가격/가격)
```

## LLM Prompts

### System Prompt

\[\[overview#페르소나-시스템-프롬프트-표준\]\] (purpose=`marketing`)

### User Prompt

```
{product_name}을 구매하려고 합니다.
{product_description}

다음 가격대 각각에 대해 구매 의향을 답해주세요:

가격 A: {price_points[0]:,}원
가격 B: {price_points[1]:,}원
가격 C: {price_points[2]:,}원
가격 D: {price_points[3]:,}원

각 가격에 대해 "구매" / "관망" / "거부" 중 하나로 답하고, 마지막에 한 줄로 종합 의견을 적어주세요.

답변 형식 (반드시 지켜주세요):
A: 구매 / 관망 / 거부
B: 구매 / 관망 / 거부
C: 구매 / 관망 / 거부
D: 구매 / 관망 / 거부
종합: 한 문장
```

## 응답 파싱

```python
def _parse_price_responses(response: str, n_prices: int) -> dict[str, str]:
    """각 가격대별 응답 추출"""
    result = {}
    for letter in "ABCDEFGH"[:n_prices]:
        m = re.search(rf"{letter}[:\s]+(구매|관망|거부)", response)
        if m:
            result[letter] = m.group(1)
    return result
```

## 출력 (Output Schema)

```python
@dataclass
class PriceOptimizationResult:
    # 메타
    product_name: str
    price_points: list[int]
    total_responses: int
    parse_failed: int

    # 메인 결과
    purchase_rate_by_price: dict[int, float]   # {4500: 0.78, 5500: 0.55, ...}
    indifferent_rate_by_price: dict[int, float] # 관망 비율
    reject_rate_by_price: dict[int, float]      # 거부 비율
    revenue_by_price: dict[int, float]          # 가격 × 구매율 (정규화)
    optimal_price: int                          # 수익 최대 가격
    price_elasticity: float                     # E (절대값)

    # 세그먼트
    breakdown_by_age: dict[str, dict[int, float]]   # 연령대별 가격×구매율
    breakdown_by_sex: dict[str, dict[int, float]]
    breakdown_by_province: dict[str, dict[int, float]]

    # 종합 의견 (감성 분석용)
    overall_opinions: list[str]

    raw_results: list[SimResult]
```

## 결과 시각화

### Section 1: KPI

*   **최적 가격**: ₩5,500 (예시)
*   **예상 구매율**: 67%
*   **가격 탄력성**: -1.3 (탄력적)

### Section 2: 수요·수익 곡선

*   좌: 가격-수요 곡선 (line chart, x=가격, y=구매율)
*   우: 가격-수익 곡선 (line chart, 최고점 마킹)
*   `plotly.express.line` 사용

### Section 3: 가격 격차에 따른 의향 변화

*   Stacked bar (각 가격대별 구매/관망/거부 비율)

### Section 4: 세그먼트

*   연령대별 / 성별 가격 민감도 비교

### Section 5: 종합 의견 워드클라우드

*   응답 텍스트의 키워드 빈도

## 가격 탄력성 계산

```python
def calculate_elasticity(prices: list[int], demand: list[float]) -> float:
    """선형 회귀로 평균 탄력성 계산"""
    # 중간 가격 기준 변화율
    mid = len(prices) // 2
    p0, p1 = prices[mid-1], prices[mid+1] if mid+1 < len(prices) else prices[-1]
    d0, d1 = demand[mid-1], demand[mid+1] if mid+1 < len(prices) else demand[-1]
    
    delta_price_pct = (p1 - p0) / p0
    delta_demand_pct = (d1 - d0) / d0 if d0 > 0 else 0
    
    return abs(delta_demand_pct / delta_price_pct) if delta_price_pct else 0
```

해석:

*   E > 1: 탄력적 (가격 인상 시 매출 ↓)
*   E \< 1: 비탄력적 (가격 인상 시 매출 ↑)
*   E = 1: 단위 탄력 (가격 변화와 매출 동일)

## 권장 샘플 사이즈

가격 결정은 **중요도 높음** → 큰 샘플 권장.

| 사용 | 사이즈 |
| --- | --- |
| 초기 탐색 | 100 |
| 표준 | 300 |
| 의사결정 직전 | 500 |

## 권장 타겟 필터

*   **기본**: `exclude_unemployed=True` (구매력 없는 그룹 제외)
*   제품 카테고리별: \[\[../data-spec#사용-권장-패턴\]\]

## 한계 및 주의사항

1.  **선언된 의향 ≠ 실제 구매**: WTP(Willingness To Pay) 갭 존재
2.  **가격 외 요인 무시**: 브랜드, 시점, 경쟁사 가격 영향 반영 안 됨
3.  **가격대 간격**: 너무 좁으면(예: 100원 차이) 의미 있는 차이 안 나옴 → 최소 10% 권장
4.  **로컬 LLM 한계**: 한국 가격 감각 (예: 5,000원 vs 10,000원의 심리적 의미) 학습 부족 가능

## 프리셋 예시

```python
PRESET_COFFEE_DRINK = {
    "product_name": "스타벅스 신메뉴 자몽 에이드",
    "product_description": "신선한 자몽으로 만든 시즌 한정 음료, 1잔 350ml",
    "price_points": [4500, 5500, 6500, 7500],
    "filter": {"age_min": 20, "age_max": 45, "exclude_unemployed": True},
    "sample_size": 200,
}
```

## Aaru 비교

| 항목 | Aaru Lumen | KoreaSim |
| --- | --- | --- |
| 가격 단위 | $/€ | ₩ (원) |
| 한국 가격 감각 | △ (학습 부족) | ◎ |
| 탄력성 측정 | ⭕ | ⭕ |
| 세그먼트별 가격 민감도 | ⭕ | ⭕ |
| 한국 시장 케이스 | ❌ | ◎ |

## 향후 개선

*   Conjoint Analysis (가격 외 다른 속성도 함께 측정)
*   가격 정책 시뮬레이션 (할인·번들·구독)
*   경쟁사 가격 변동 시뮬레이션 (가격전쟁)
*   시간 변화 (계절·이벤트) 효과
