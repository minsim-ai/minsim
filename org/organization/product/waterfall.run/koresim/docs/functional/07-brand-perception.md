---

title: 07 — 브랜드 인지도 추적 (Brand Perception)  
type: functional-spec  
tags: \[functional-spec, brand-perception\]  
created: 2026-04-30  
updated: 2026-05-03
status: implemented-v1
implementation: src/simulations/generic_suite.py + src/simulations/registry.py + frontend/src/simulations/registry.ts
related: \[\[overview\]\], \[\[../prd\]\]  
priority: ★★

---

# 07 — 브랜드 인지도 추적

## Goal (비즈니스 질문)

> "사람들이 우리 브랜드를 **어떻게 인식**하고 있는가? 어떤 단어를 떠올리는가?"

브랜드의 정성적 이미지를 측정. 시간에 따른 변화 추적 가능 (반복 시뮬레이션).

## 사용자 시나리오

1.  광고 캠페인 후 "브랜드 이미지가 의도대로 형성되었는지" 확인
2.  또는 경쟁사 비교 차원에서 "우리는 어떤 브랜드로 인식되는가?"
3.  KoreaSim에 브랜드명 입력 → 페르소나에게 인식 질문 → 이미지 속성 매핑
4.  결과 → 마케팅 방향 조정

## 한계 (인정)

*   페르소나는 **실시간 시장 정보가 없음** — LLM이 학습 시점까지의 일반적 인식만 반영
*   신규 캠페인 효과는 측정 불가 (LLM이 모름)
*   "방금 본 광고 후 인상" 같은 시뮬레이션은 \[\[01-creative-testing\]\]이 더 적합

**이 시뮬레이션은 "현재의 일반적 브랜드 인지" 측정에 가장 적합**

## 입력 (Input Schema)

```python
class BrandPerceptionInput:
    brand: str                          # "스타벅스"
    brand_context: str = ""             # 선택: 추가 컨텍스트 (필요 시)
    comparison_brands: list[str] = []   # 선택: 비교 브랜드 (1~3개)
    image_attributes: list[str] = None  # 평가할 이미지 속성 (사용자 편집 가능)
    sample_size: int = 200
    target_filter: TargetFilter = None
```

### 이미지 속성 (사용자 편집 가능, 신규)

기본 8개 속성을 제공하되, 사용자가 자유롭게 추가/제거 가능:

```python
DEFAULT_BRAND_ATTRIBUTES = [
    "신뢰",      # 신뢰할 수 있다
    "고급",      # 고급스럽다
    "친근",      # 친근하다
    "혁신",      # 혁신적이다
    "전문",      # 전문적이다
    "안전",      # 안전하다
    "재미",      # 재미있다
    "한국적",   # 한국 정서에 맞다
]

# 추가 가능 후보 (UI에서 보여주는 추천)
ADDITIONAL_ATTRIBUTES = [
    "젊다", "남성적", "여성적", "프리미엄", "친환경",
    "글로벌", "토속적", "디지털", "아날로그", "모던",
    "클래식", "스포티", "엘레강트", "도전적",
]
```

**UI**: 멀티셀렉트 + 커스텀 추가 입력 (8~15개 권장).

## 처리 흐름

```
[1] N명 페르소나 샘플링
[2] 각 페르소나에게 LLM 호출
      → "이 브랜드 들으면 무슨 단어/이미지/감정이 떠오르나요?"
      → "이 브랜드를 한 단어로 표현한다면?"
[3] 응답 텍스트 → 키워드 추출 + 빈도 집계
[4] 감성 분석 (긍정/부정/중립)
[5] (선택) 비교 브랜드와 매트릭스
[6] 세그먼트별 인식 차이 분석
```

## LLM Prompts

### System Prompt

\[\[overview#페르소나-시스템-프롬프트-표준\]\] (purpose=`marketing` + cultural\_background 추가)

### User Prompt (단일 브랜드 + 속성 평가)
```
"{brand}" 브랜드에 대해 답해주세요.

다음 각 속성에 대해 1~5점으로 평가해주세요:
{image_attributes 리스트, 예: "신뢰: __, 고급: __, 친근: __, ..."}

추가 질문:
연상 단어: (3개, 콤마 구분)
한 단어 표현: (1단어)
감정: 긍정 / 부정 / 중립
이유: 한 문장

답변 형식 (반드시 지켜주세요):
신뢰: 4
고급: 5
친근: 3
...
연상 단어: 커피, 프리미엄, 매장
한 단어 표현: 프리미엄
감정: 긍정
이유: 분위기 좋고 품질 안정적
```

### User Prompt (비교)

```
다음 브랜드들에 대해 어떻게 생각하시나요?

A: {brand}
B: {comparison_brands[0]}
C: {comparison_brands[1]}

각 브랜드에 대해 답해주세요:

답변 형식:
A 연상: (3단어)
A 감정: 긍정/부정/중립
B 연상: (3단어)
B 감정: 긍정/부정/중립
C 연상: (3단어)
C 감정: 긍정/부정/중립
```

## 응답 파싱

```python
def _parse_brand_perception(response: str) -> dict:
    associations = re.search(r"연상[\s\w]*[:：]\s*(.+?)(?:\n|$)", response)
    one_word = re.search(r"한 단어[^:]*[:：]\s*(\S+)", response)
    sentiment_m = re.search(r"감정[:\s]*(긍정|부정|중립)", response)
    reason_m = re.search(r"이유[:\s]*(.+?)(?:\n|$)", response, re.DOTALL)
    
    return {
        "associations": [w.strip() for w in associations.group(1).split(",")] if associations else [],
        "one_word": one_word.group(1) if one_word else None,
        "sentiment": sentiment_m.group(1) if sentiment_m else "중립",
        "reason": reason_m.group(1).strip()[:200] if reason_m else "",
    }
```

## 출력 (Output Schema)

```python
@dataclass
class BrandPerceptionResult:
    # 메타
    brand: str
    comparison_brands: list[str]
    total_responses: int
    parse_failed: int

    # 메인 결과 (단일 브랜드)
    top_associations: list[tuple[str, int]]    # 연상 단어 빈도
    top_one_words: list[tuple[str, int]]       # 한 단어 표현 빈도
    sentiment_distribution: dict[str, float]    # {"긍정": 0.6, "부정": 0.15, "중립": 0.25}
    sentiment_score: float                       # -1~+1 (긍정-부정 차이)
    
    # 비교 (있을 시)
    comparison_associations: dict[str, list[tuple[str, int]]]
    comparison_sentiment: dict[str, dict[str, float]]
    
    # 세그먼트
    breakdown_by_age: dict[str, dict]
    breakdown_by_sex: dict[str, dict]
    breakdown_by_province: dict[str, dict]
    
    raw_results: list[SimResult]
```

## 결과 시각화

### Section 1: KPI

*   감성 점수: +0.45 (긍정 우세)
*   가장 많은 연상: "커피", "스타벅스", "프리미엄"
*   한 단어 표현 1위: "프리미엄"

### Section 2: 연상 단어 워드클라우드

*   빈도 비례 크기
*   색상 = 감성 (긍정=초록, 부정=빨강)

### Section 3: 감성 분포

*   도넛 차트 (긍정/부정/중립)

### Section 4: 비교 브랜드 매트릭스 (있을 시)

*   가로: 브랜드, 세로: 속성/감성
*   히트맵

### Section 5: 세그먼트별 인식 차이

*   연령대별 / 성별별 한 단어 표현 1위

### Section 6: 페르소나 익스플로러

*   감성 필터 (긍정/부정/중립)
*   응답 카드

## 키워드 추출

### V1: 단순 콤마 분리

```python
def aggregate_associations(results: list[SimResult]) -> Counter:
    counter = Counter()
    for r in results:
        parsed = _parse_brand_perception(r.response)
        for word in parsed["associations"]:
            if word and len(word) <= 10:
                counter[word] += 1
    return counter
```

### V2: 한국어 형태소 분석 (konlpy)

```python
from konlpy.tag import Okt
okt = Okt()

def extract_keywords(text: str) -> list[str]:
    return [w for w, pos in okt.pos(text) if pos in ("Noun", "Adjective")]
```

## 권장 샘플 사이즈

*   빠른 측정: 100
*   표준: 200
*   정밀 (매월 트래킹): 300

## 권장 타겟 필터

*   **전국민 인지도**: 필터 없음
*   **세그먼트별 인지도**: 타겟 segment로 좁히기
*   일반적으로 `exclude_unemployed=True` 권장 (소비자 한정)

## 한계 및 주의사항

1.  **LLM 학습 시점 한계**: 최신 캠페인·이슈 반영 안 됨
2.  **유명도 편향**: 유명한 브랜드는 풍부한 응답, 무명 브랜드는 빈약
3.  **신규 브랜드 측정 부적합**: LLM이 모르는 브랜드는 추측 응답
4.  **비교 브랜드 5개 이하**: 그 이상은 응답 품질 ↓
5.  **시간 변화 추적 어려움**: 캠페인 전후 비교 시 다른 시뮬레이션 추천

## 프리셋 예시

```python
PRESET_COFFEE_BRANDS = {
    "brand": "스타벅스",
    "comparison_brands": ["이디야", "투썸플레이스", "메가커피"],
    "filter": {"age_min": 20, "age_max": 50, "exclude_unemployed": True},
    "sample_size": 200,
}
```

## Aaru 비교

| 항목 | Aaru Lumen | KoreaSim |
| --- | --- | --- |
| 브랜드 인지 | ⭕ | ⭕ |
| 한국 브랜드 풍부함 | ❌ | ◎ |
| 한국 감정 표현 | △ | ◎ |
| 지역별 인지 차이 | △ | ◎ |

## 향후 개선

*   한국어 감성 분석 모델 도입 (KoBERT 등)
*   브랜드 페르소나 자동 도출 (어떤 사람이 좋아하나)
*   시점 비교 (캠페인 전/후 시뮬레이션 비교 도구)
*   위기 시나리오 (불매·이슈 발생 시 인식 변화)
