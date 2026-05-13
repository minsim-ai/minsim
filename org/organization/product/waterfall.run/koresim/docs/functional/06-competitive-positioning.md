---

title: 06 — 경쟁적 포지셔닝 (Competitive Positioning)  
type: functional-spec  
tags: \[functional-spec, competitive-positioning\]  
created: 2026-04-30  
updated: 2026-05-03
status: implemented-v1
implementation: src/simulations/generic_suite.py + src/simulations/registry.py + frontend/src/simulations/registry.ts
related: \[\[overview\]\], \[\[../prd\]\]  
priority: ★★★

---

# 06 — 경쟁적 포지셔닝

## Goal (비즈니스 질문)

> "**경쟁사 대비** 우리 제품/브랜드는 어디에 있는가? 누가 우리를 선택하고 누가 경쟁사를 선택하는가?"

여러 경쟁 옵션을 동시에 보여주고, 시장 점유율 예측 + 포지셔닝 맵 작성.

## 사용자 시나리오

1.  신규 OTT 진입을 검토 중
2.  한국 OTT 시장: 넷플릭스, 티빙, 쿠팡플레이, 웨이브, 디즈니+ 등
3.  "우리가 진입하면 어떤 그룹이 우리로 올까? 누가 안 올까?"
4.  KoreaSim에 우리 + 경쟁사 입력 → 시뮬레이션 → 점유율 예측 + 인식 속성 매핑

## 입력 (Input Schema)

```python
class CompetitivePositioningInput:
    category: str                       # "OTT 서비스"
    competitors: list[CompetitorOption] # 우리 + 경쟁사 2~5개
    perception_attributes: list[str] = []  # 평가 속성 (선택)
    sample_size: int = 300
    target_filter: TargetFilter = None

class CompetitorOption(TypedDict):
    name: str                           # "넷플릭스"
    description: str                    # "글로벌 1위 OTT, 월 1.7만원, 오리지널 콘텐츠 강함"
    price: Optional[int] = None         # 월 1.7만원 표시용
    is_us: bool = False                 # 우리 제품 여부 (구분 표시)
```

## 처리 흐름

```
[1] N명 페르소나 샘플링
[2] 각 페르소나에 LLM 호출
      → "여러 옵션 중 무엇을 선택할 것인가?"
      → "각 옵션을 떠올리면 어떤 단어가 생각나나?"
[3] 점유율 = 선택 비율
[4] 인식 속성 매핑 = 각 옵션의 응답 키워드 → 속성별 점수
[5] 포지셔닝 맵 = 2D 산점도 (예: x=가성비, y=품질)
```

## LLM Prompts

### System Prompt

\[\[overview#페르소나-시스템-프롬프트-표준\]\] (purpose=`marketing` 또는 `lifestyle`)

### User Prompt

```
{category}을 새로 가입하려고 합니다. 아래 옵션들을 비교해보세요.

[A] {competitors[0].name} — {competitors[0].description}
[B] {competitors[1].name} — {competitors[1].description}
[C] {competitors[2].name} — {competitors[2].description}
...

답변 형식 (반드시 지켜주세요):
선택: A/B/C 중 하나
이유: 한 문장
A의 인상: (3단어 이내)
B의 인상: (3단어 이내)
C의 인상: (3단어 이내)
```

## 응답 파싱

```python
def _parse_positioning(response: str, n_competitors: int) -> dict:
    valid = set("ABCDE"[:n_competitors])
    
    choice_m = re.search(r"선택[:\s]*([A-E])", response)
    reason_m = re.search(r"이유[:\s]*(.+?)(?:\n|$)", response)
    
    impressions = {}
    for letter in valid:
        m = re.search(rf"{letter}의 인상[:\s]*(.+?)(?:\n|$)", response)
        if m:
            impressions[letter] = m.group(1).strip()[:50]
    
    return {
        "choice": choice_m.group(1) if choice_m and choice_m.group(1) in valid else None,
        "reason": reason_m.group(1).strip()[:200] if reason_m else "",
        "impressions": impressions,
    }
```

## 출력 (Output Schema)

```python
@dataclass
class CompetitivePositioningResult:
    # 메타
    category: str
    competitors: list[CompetitorOption]
    total_responses: int
    parse_failed: int

    # 메인 결과
    market_share: dict[str, float]              # {"A": 0.35, "B": 0.28, ...}
    market_share_counts: dict[str, int]
    
    # 인식 속성
    impressions_by_competitor: dict[str, list[tuple[str, int]]]
    # 예: {"A": [("재밌다", 45), ("비싸다", 32), ("오리지널", 28), ...]}
    
    # 포지셔닝 맵 (자동 추출)
    positioning_axes: dict[str, dict[str, float]]
    # 예: {"가성비": {"A": 2.3, "B": 4.1, ...}, "품질": {"A": 4.5, "B": 3.2, ...}}
    
    # 세그먼트
    breakdown_by_age: dict[str, dict]
    breakdown_by_sex: dict[str, dict]
    breakdown_by_province: dict[str, dict]
    
    # 옵션별 선택 이유
    reasons_by_choice: dict[str, list[str]]
    
    raw_results: list[SimResult]
```

## 결과 시각화

### Section 1: 시장 점유율 (KPI)

*   각 경쟁사별 점유율 % (도넛)
*   우리 제품은 다른 색상으로 강조

### Section 2: 포지셔닝 맵 (2D 산점도)

*   x축, y축은 사용자 선택 (예: 가격-품질, 혁신-안정)
*   각 경쟁사는 점 (크기 = 점유율)
*   자동 추출된 인식 속성에서 2개 축 자동 제안

### Section 3: 인식 속성 비교

*   경쟁사별 워드클라우드
*   또는 속성 매트릭스 (경쟁사 × 속성, 점수 색상)

### Section 4: 세그먼트별 선호 경쟁사

*   연령대 / 성별 / 지역별 1순위
*   우리가 강한 세그먼트 = 진입 전략 힌트

### Section 5: 선택 이유 분석

*   각 경쟁사 선택 이유 Top 10
*   우리 제품의 강점·약점 자동 추출

## 인식 속성 자동 추출

```python
COMMON_ATTRIBUTES_BY_CATEGORY = {
    "OTT": ["가격", "콘텐츠 다양성", "한국 콘텐츠", "오리지널", "품질"],
    "스마트폰": ["성능", "디자인", "카메라", "배터리", "가성비"],
    "은행": ["수수료", "신뢰", "지점 수", "앱 편의성", "혜택"],
    # ...
}

def extract_attribute_scores(impressions: list[str], attributes: list[str]) -> dict:
    """impression 텍스트에서 각 속성 언급 빈도 → 점수화"""
    scores = {attr: 0 for attr in attributes}
    for imp in impressions:
        for attr in attributes:
            if attr in imp or any(syn in imp for syn in SYNONYMS.get(attr, [])):
                scores[attr] += 1
    # 정규화
    total = sum(scores.values()) or 1
    return {attr: round(s / total * 5, 2) for attr, s in scores.items()}
```

## 차별화 메시지 자동 추천 (신규)

시뮬레이션 결과를 바탕으로 우리 제품의 차별화 메시지 3~5개를 자동 생성한다.

### 흐름

```
[1] 우리 제품을 선택한 페르소나의 응답 이유 추출
[2] 경쟁사를 거부한 페르소나의 이유 추출
[3] 두 그룹의 공통 키워드 = 우리의 강점
[4] LLM에 강점 키워드 + 우리 제품 특성 → 메시지 3~5개 생성
[5] 세그먼트별로 가장 잘 먹히는 메시지 매핑
```

### 출력 형식

```python
@dataclass
class DifferentiationMessages:
    messages: list[str]              # 추천 메시지 3~5개
    rationale: dict[str, list[str]]  # 각 메시지의 근거 (응답 인용)
    best_segment_per_message: dict[str, list[str]]  # 메시지별 적합 세그먼트
```

**UI**: 결과 화면 별도 섹션 "💡 차별화 메시지 추천"으로 노출.

### 예시 출력

```
💡 차별화 메시지 추천 (5개)

1. "한국 콘텐츠 100%, 자막 걱정 없는 OTT"
   → 30~50대 남성, 지방 거주자에서 강세
   → 근거: "자막 보기 힘들어요" (47회 언급)

2. "월 9,900원, 부담 없는 K-드라마 천국"
   → 20대, 학생·사회초년생에서 강세
   → 근거: "넷플릭스 가격 부담" (38회 언급)
...
```

---

## 권장 샘플 사이즈

*   빠른 점유율 확인: 100
*   **표준**: 300
*   정밀 포지셔닝 맵: 500~1,000

## 권장 타겟 필터

카테고리 사용자 그룹에 맞춰:

*   OTT: `age_min=18, age_max=55`
*   자동차: `age_min=30, age_max=65, exclude_unemployed=True`
*   명품: `education_level=["4년제","대학원"], age_min=30`

## 한계 및 주의사항

1.  **경쟁사 정보 정확성**: `description`이 불완전하면 평가 왜곡
2.  **선언된 선호 ≠ 실제 사용**: 응답과 실제 구매·구독 갭
3.  **신규 진입자 평가 어려움**: 페르소나가 모르는 브랜드는 평가 회피
4.  **양면 시장 무시**: 플랫폼은 양면 효과 (네트워크 효과) 반영 안 됨
5.  **5개 이하 비교 권장**: 6개 이상은 응답 품질 ↓

## 프리셋 예시

```python
PRESET_OTT = {
    "category": "OTT 서비스",
    "competitors": [
        {"name": "넷플릭스", "description": "월 1.7만원, 글로벌 오리지널 강함, 화질 좋음", "price": 17000, "is_us": False},
        {"name": "티빙", "description": "월 1.4만원, JTBC/tvN/예능 강함, 한국 콘텐츠 중심", "price": 14000, "is_us": False},
        {"name": "쿠팡플레이", "description": "쿠팡 와우 구독 시 무료, 스포츠 중계 + K-드라마", "price": 0, "is_us": False},
        {"name": "디즈니+", "description": "월 1.4만원, 마블/픽사/스타워즈 + 한국 오리지널", "price": 13900, "is_us": False},
        {"name": "(우리) 신규 OTT", "description": "월 9,900원, K-콘텐츠 100% 한국어 자막, AI 추천", "price": 9900, "is_us": True},
    ],
    "filter": {"age_min": 18, "age_max": 50},
    "sample_size": 300,
}
```

## Aaru 비교

| 항목 | Aaru Lumen | KoreaSim |
| --- | --- | --- |
| 경쟁 분석 | ⭕ | ⭕ |
| 한국 경쟁사 데이터 | ❌ (미국 브랜드 위주) | ◎ |
| 한국적 인식 속성 (가성비·체면 등) | ❌ | ◎ |
| 지역별 선호도 | △ | ◎ (시군구 단위) |

## 향후 개선

*   자동 포지셔닝 축 추천 (PCA로 주요 차원 발견)
*   시간 시뮬레이션 (가격 인상 시 점유율 변화)
*   신규 진입 시 시장 잠식 (cannibalization) 분석
*   경쟁사 변경 (가격 인하·기능 추가) 시나리오
