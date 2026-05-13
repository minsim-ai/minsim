---

title: 05 — 시장 세분화 (Market Segmentation)  
type: functional-spec  
tags: \[functional-spec, market-segmentation\]  
created: 2026-04-30  
updated: 2026-05-03
status: implemented-v1
implementation: src/simulations/generic_suite.py + src/simulations/registry.py + frontend/src/simulations/registry.ts
related: \[\[overview\]\], \[\[../prd\]\]  
priority: ★★★

---

# 05 — 시장 세분화

## Goal (비즈니스 질문)

> "이 시장에 **어떤 종류의 고객이 있는지** 자동으로 발견할 수 있을까?"

기존 인구통계 세분화(20대 여성, 30대 남성 등)를 넘어, **태도·니즈 기반 세그먼트**를 자동 발견.

## 사용자 시나리오

1.  건강식품 회사가 신규 제품 라인업 결정 전
2.  "건강식품에 관심 있는 한국인은 어떤 그룹들로 나뉘는가?"
3.  KoreaSim에 카테고리 입력 → 페르소나에게 자유 응답 → **응답 클러스터링** → 5~8개 세그먼트 자동 도출
4.  각 세그먼트의 특징·니즈·메시지 가이드 제공

## 다른 시뮬레이션과의 차이

대부분의 시뮬레이션이 **객관식 또는 척도** 응답인 반면, 이건 **자유 응답 + 클러스터링**.  
기술 난이도가 가장 높음.

## 입력 (Input Schema)

```python
class MarketSegmentationInput:
    category: str                    # "건강식품" / "전기차" / "온라인 교육" 등
    research_questions: list[str]    # 2~4개 질문
    n_segments: int = 6              # 추출할 세그먼트 수 (3~10)
    sample_size: int = 500           # 큰 샘플 권장
    target_filter: TargetFilter = None
```

## 처리 흐름

```
[1] N명 페르소나 샘플링 (보통 500명 이상)
[2] 각 페르소나에 자유 응답 LLM 호출 (3~4개 질문)
      → "건강식품을 어떻게 생각하시나요? 무엇이 중요한가요?"
[3] 응답 텍스트 임베딩 (sentence-transformers/jhgan/ko-sroberta-multitask)
[4] KMeans / HDBSCAN 클러스터링 → n_segments 그룹
[5] 각 클러스터마다 LLM 요약 호출
      → 세그먼트 라벨 + 특징 + 니즈 + 메시지 추천
[6] 인구통계와 교차 (각 세그먼트의 평균 나이, 주요 직업 등)
```

## LLM Prompts

### Step 1: 자유 응답 수집 (Per Persona)

#### System Prompt

\[\[overview#페르소나-시스템-프롬프트-표준\]\] (purpose=`marketing` 또는 `lifestyle`)

#### User Prompt

```
{category}에 대해 어떻게 생각하시나요?

다음 질문들에 솔직하게 답변해주세요 (각 1~2문장):

1. {research_questions[0]}
2. {research_questions[1]}
3. {research_questions[2]}

답변 형식:
1. ...
2. ...
3. ...
```

### Step 2: 클러스터별 요약 (Per Cluster)

```
다음은 어떤 그룹의 사람들이 {category}에 대해 답한 내용입니다:

{cluster_responses[:30]}

이 그룹의 공통 특징을 요약해주세요:

답변 형식:
세그먼트 라벨: (5단어 이내, 예: "건강 추구 중장년")
특징: (3문장)
니즈: (3가지)
추천 메시지: (이 세그먼트에 효과적일 만한 광고 메시지 1줄)
```

## 출력 (Output Schema)

```python
@dataclass
class Segment:
    label: str                      # "건강 추구 중장년"
    size: int                       # 클러스터 크기
    pct: float                      # 전체 대비 비율
    characteristics: str            # 3문장 특징
    needs: list[str]                # 3가지 니즈
    recommended_message: str        # 추천 메시지
    
    # 인구통계 평균
    avg_age: float
    sex_distribution: dict[str, float]
    top_provinces: list[tuple[str, int]]
    top_occupations: list[tuple[str, int]]
    top_education: list[tuple[str, int]]
    
    # 샘플 응답
    sample_responses: list[str]     # 대표 응답 5개

@dataclass
class MarketSegmentationResult:
    category: str
    research_questions: list[str]
    total_responses: int
    parse_failed: int
    
    segments: list[Segment]         # n_segments 개
    
    raw_results: list[SimResult]
```

## 결과 시각화

### Section 1: 세그먼트 도넛

*   각 세그먼트 비율 (도넛 차트)
*   라벨 = 세그먼트 이름

### Section 2: 세그먼트 카드 (Top 8)

*   각 카드: 라벨, 비율, 특징, 니즈, 추천 메시지
*   인구통계 미니 차트 (성별·연령대)

### Section 3: 인구통계 매트릭스

*   세그먼트 × 연령대 히트맵
*   세그먼트 × 지역 히트맵

### Section 4: 세그먼트 비교 표

*   세그먼트별 핵심 차이 한눈에 보기

### Section 5: 페르소나 익스플로러 (세그먼트 필터)

*   세그먼트 선택 → 해당 클러스터의 페르소나 카드

## 클러스터링 알고리즘

### V1: KMeans (단순)

```python
from sentence_transformers import SentenceTransformer
from sklearn.cluster import KMeans

embedder = SentenceTransformer("jhgan/ko-sroberta-multitask")
embeddings = embedder.encode([r.response for r in results])

km = KMeans(n_clusters=n_segments, random_state=42)
labels = km.fit_predict(embeddings)
```

### V2: HDBSCAN (자동 클러스터 수)

*   n\_segments 지정 안 하고 자동 발견
*   노이즈 자동 제외

## 권장 샘플 사이즈

세분화는 **큰 샘플 필수**.

| 사이즈 | 권장 클러스터 수 | 정확도 |
| --- | --- | --- |
| 200 | 3~4 | 낮음 |
| 500 | 5~6 | 표준 |
| 1,000 | 6~8 | 높음 |
| 2,000+ | 8~10 | 정밀 |

## 권장 타겟 필터

*   카테고리에 따라 사전 필터링
*   너무 좁으면 의미 있는 세그먼트 안 나옴
*   일반적으로 `exclude_unemployed=True` 권장

## 한계 및 주의사항

1.  **임베딩 품질 의존**: 한국어 임베딩 모델 성능에 결과 좌우
2.  **k 결정 어려움**: 너무 적으면 정보 부족, 너무 많으면 노이즈
3.  **세그먼트 라벨 일관성**: 매 실행마다 라벨 다를 수 있음 (LLM 응답 변동)
4.  **계산 비용**: 임베딩 + 클러스터링 추가 시간 (500명 = 추가 2~3분)
5.  **샘플 작으면 의미 없음**: 200명 미만은 클러스터링 비추천

## 프리셋 예시

```python
PRESET_HEALTH_FOOD = {
    "category": "건강식품",
    "research_questions": [
        "평소 건강식품에 얼마나 관심이 있으신가요?",
        "건강식품을 살 때 가장 중요한 것은 무엇인가요?",
        "어떤 건강식품을 주로 사거나 사고 싶으신가요?",
    ],
    "n_segments": 6,
    "filter": {"exclude_unemployed": True},
    "sample_size": 500,
}
```

## 추가 의존성

*   `sentence-transformers>=3.0.0`
*   `scikit-learn>=1.4.0`
*   `hdbscan>=0.8.33` (V2)

`pyproject.toml`에 옵션 그룹으로 추가:

```
[project.optional-dependencies]
segmentation = [
    "sentence-transformers>=3.0.0",
    "scikit-learn>=1.4.0",
]
```

## Aaru 비교

| 항목 | Aaru Lumen | KoreaSim |
| --- | --- | --- |
| 세분화 | ⭕ | ⭕ |
| 한국어 임베딩 | △ (영어 중심) | ◎ (jhgan/ko-sroberta) |
| 한국 시장 카테고리 인지 | △ | ◎ |
| 자동 라벨 한국어 | ❌ | ◎ |

## 향후 개선

*   HDBSCAN 도입 (자동 k)
*   세그먼트 간 유사도 매트릭스
*   시간 변화 추적 (반복 시뮬레이션 비교)
*   페르소나 narrative 자체로 세분화 (응답 없이도 가능)
