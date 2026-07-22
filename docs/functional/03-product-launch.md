---

title: 03 — 제품 출시 예측 (Product Launch)  
type: functional-spec  
tags: \[functional-spec, product-launch\]  
created: 2026-04-30  
updated: 2026-05-03
status: implemented-v1
implementation: src/simulations/generic_suite.py + src/simulations/registry.py + frontend/src/simulations/registry.ts
related: \[\[overview\]\], \[\[../prd\]\]  
priority: ★★★★

---

# 03 — 제품 출시 예측

## Goal (비즈니스 질문)

> "이 제품을 시장에 내놓으면 **얼마나 사람들이 좋아할까**? 누가 살까? 누가 안 살까?"

신제품의 시장 반응을 출시 전 예측. 5점 척도 + 거부 이유 분석.

## 사용자 시나리오

1.  가전 회사가 신규 무선청소기를 6개월 후 출시 예정
2.  제품 스펙·가격·핵심 셀링 포인트 확정
3.  출시 전 "타겟이 정말 살 의향이 있나?" 검증 필요
4.  KoreaSim에 제품 정보 입력 → 200명 평가 → 점수 분포 + 거부 이유 클러스터링

## 입력 (Input Schema)

```python
class ProductLaunchInput:
    product_name: str                # "LG 코드제로 X9 (2026)"
    product_description: str         # 제품 스펙·특징 (마크다운 가능)
    price: int                       # 단일 가격 (원)
    target_description: str = ""     # "30~50대 주부, 위생 민감"
    sample_size: int = 200
    target_filter: TargetFilter = None
```

## 처리 흐름

```
[1] N명 페르소나 샘플링
[2] 각 페르소나에 대해 LLM 호출
      → "구매 의향 점수 1~5 + 이유"
[3] 점수 분포 집계 → 평균·중앙값
[4] 1~2점 응답 → 거부 이유 클러스터링 (LLM 또는 키워드)
[5] 4~5점 응답 → 매력 포인트 클러스터링
```

## LLM Prompts

### System Prompt

\[\[overview#페르소나-시스템-프롬프트-표준\]\] (purpose=`marketing`)

### User Prompt

```
다음 신제품을 소개합니다.

【제품】 {product_name}
【가격】 {price:,}원
【설명】
{product_description}

이 제품을 구매할 의향이 어느 정도이신가요?

답변 형식 (반드시 지켜주세요):
점수: 1~5 (1=절대 안 살 것, 2=별로, 3=보통, 4=긍정적, 5=꼭 살 것)
이유: 한 문장으로 짧게
```

## 응답 파싱

```python
def _parse_score(response: str) -> Optional[int]:
    m = re.search(r"점수[:\s]*([1-5])", response)
    if m:
        return int(m.group(1))
    # fallback: 본문 첫 숫자
    m = re.search(r"\b([1-5])\b", response)
    return int(m.group(1)) if m else None
```

## 출력 (Output Schema)

```python
@dataclass
class ProductLaunchResult:
    # 메타
    product_name: str
    price: int
    total_responses: int
    parse_failed: int

    # 메인 결과
    avg_score: float                    # 1.0~5.0
    median_score: float
    score_distribution: dict[int, int]  # {1: 12, 2: 28, 3: 60, 4: 70, 5: 30}
    
    # 분류
    intent_to_buy_pct: float            # 4~5점 비율 (긍정)
    rejection_pct: float                # 1~2점 비율 (부정)
    neutral_pct: float                  # 3점 비율
    
    # 이유 클러스터
    top_attraction_reasons: list[tuple[str, int]]  # [(이유, 빈도), ...]
    top_rejection_reasons: list[tuple[str, int]]
    
    # 세그먼트
    breakdown_by_age: dict[str, dict]   # 연령대별 평균 점수 + 분포
    breakdown_by_sex: dict[str, dict]
    breakdown_by_province: dict[str, dict]
    
    # 종합 인사이트 (LLM 요약, 옵션)
    ai_insight: str = ""
    
    raw_results: list[SimResult]
```

## 결과 시각화

### Section 1: KPI

*   **평균 점수**: 3.7 / 5
*   **구매 의향 (4~5점)**: 56%
*   **거부 (1~2점)**: 18%

### Section 2: 점수 분포

*   Histogram (1~5점, 막대)
*   색상: 1~2점 빨강, 3점 회색, 4~5점 파랑

### Section 3: 이유 분석

*   좌: 매력 이유 Top 10 (긍정 응답에서 추출)
*   우: 거부 이유 Top 10 (부정 응답에서 추출)
*   워드클라우드 옵션

### Section 4: 세그먼트별 평균 점수

*   연령대 / 성별 / 지역별 평균 점수 (bar chart)
*   "어디에서 잘 팔릴까" 시각화

### Section 5: 페르소나 익스플로러

*   점수별 필터 (1~5)
*   각 페르소나 카드

## 이유 클러스터링

### 단순 키워드 (V1)

```python
def extract_keywords(reasons: list[str], top_n: int = 10) -> list[tuple[str, int]]:
    # 한국어 명사 추출 + 빈도
    from collections import Counter
    # konlpy 사용 또는 단순 어절 분리
    ...
```

### LLM 기반 (V1.5)

```python
async def cluster_reasons(reasons: list[str], n_clusters: int = 5) -> list[str]:
    """LLM에게 reason 묶음을 주고 클러스터 라벨 생성"""
    prompt = f"""다음 응답들을 {n_clusters}개의 주요 카테고리로 묶어주세요:
    {chr(10).join(reasons[:50])}
    
    각 카테고리의 라벨만 반환하세요."""
    ...
```

## 권장 샘플 사이즈

*   빠른 검증: 100
*   **표준 (권장)**: 300
*   출시 결정 직전: 500~1,000

## 권장 타겟 필터

*   제품 카테고리에 따라 \[\[../data-spec#사용-권장-패턴\]\]
*   고가 제품이면 `education_level=["4년제 대학교","대학원"]` 추가

## 한계 및 주의사항

1.  **신제품 = 학습 데이터 없음**: LLM이 제품을 "상상"해서 평가함 → 추상적 카테고리는 정확도 ↓
2.  **프리미엄 vs 가성비**: 같은 페르소나가 가격에 따라 의견 다름 → 가격을 명시해야 함
3.  **혁신 제품**: 새로운 카테고리(예: 첫 OTT 출시)는 페르소나가 이해 못 할 수 있음 → 비교군 명시
4.  **5점 척도 편향**: LLM이 중간값(3) 응답 많이 함 → 평균보다 분포 보기

## 프리셋 예시

```python
PRESET_VACUUM = {
    "product_name": "LG 코드제로 X9 (2026)",
    "product_description": """
    - 무선·물걸레 일체형
    - 흡입력: 250W
    - 배터리: 2시간
    - HEPA 필터 13급
    - 자동 도킹 + 먼지 비움
    """,
    "price": 1490000,
    "target_description": "30~50대 주부, 위생 민감",
    "filter": {"age_min": 30, "age_max": 55, "sex": "여자", "exclude_unemployed": False},
    "sample_size": 300,
}
```

## Aaru 비교

| 항목 | Aaru Lumen | KoreaSim |
| --- | --- | --- |
| 신제품 평가 | ⭕ | ⭕ |
| 한국 제품 카테고리 인지 | △ | ◎ |
| 거부 이유 추출 | ⭕ | ⭕ |
| 한국적 가치관 반영 | ❌ (가성비·체면 등) | ◎ |

## 향후 개선

*   LLM 기반 이유 자동 클러스터링 (V1.5)
*   가격 시나리오 통합 (Price Optimization과 합쳐 동시 분석)
*   시각 자료 입력 (제품 이미지·동영상 — 멀티모달 LLM)
*   출시 후 실제 데이터와 상관관계 분석 (벤치마크)
