---

title: 04 — 가치 제안 테스트 (Value Proposition Testing)  
type: functional-spec  
tags: \[functional-spec, value-proposition\]  
created: 2026-04-30  
updated: 2026-05-03
status: implemented-v1
implementation: src/simulations/generic_suite.py + src/simulations/registry.py + frontend/src/simulations/registry.ts
related: \[\[overview\]\], \[\[../prd\]\]  
priority: ★★★★

---

# 04 — 가치 제안 테스트

## Goal (비즈니스 질문)

> "이 제품의 **핵심 가치**를 어떻게 표현해야 가장 설득력 있을까?"

같은 제품의 다른 가치 표현 방식 (예: 품질 강조 vs 가성비 강조 vs 라이프스타일 강조) 중 어느 것이 가장 잘 통하는지 측정.

## Creative Testing과의 차이

| 항목 | Creative Testing | Value Proposition |
| --- | --- | --- |
| 목적 | 광고 카피 선택 | 핵심 메시지 방향 결정 |
| 입력 | 광고 문구 (감성·표현) | 가치 명제 (논리·약속) |
| 시점 | 캠페인 직전 | 제품 포지셔닝 단계 |
| 예시 | "신선한 아침" vs "활기찬 하루" | "가장 빠른" vs "가장 안전한" vs "가장 저렴한" |

## 사용자 시나리오

1.  SaaS 스타트업이 새 제품 랜딩 페이지 헤더 카피를 결정해야 함
2.  가능한 가치 제안 3개:
    *   "10분 안에 설정 끝나는 가장 빠른 도구"
    *   "한국 기업 데이터 100% 안전한 도구"
    *   "월 9만원, 가격 부담 없는 도구"
3.  어느 메시지가 타겟에게 가장 설득력 있는지 시뮬레이션
4.  결과 → 랜딩 페이지·세일즈 자료에 반영

## 입력 (Input Schema)

```python
class ValuePropositionInput:
    product_context: str             # 제품 한 줄 설명
    value_propositions: list[str]    # 가치 제안 2~5개
    sample_size: int = 200
    target_filter: TargetFilter = None
```

## LLM Prompts

### System Prompt

\[\[overview#페르소나-시스템-프롬프트-표준\]\] (purpose=`marketing` 또는 `b2b`)

### User Prompt

```
{product_context}

이 제품에 대해 아래 세 가지 약속 중 어떤 것이 가장 마음에 드시나요?

[A] {value_propositions[0]}
[B] {value_propositions[1]}
[C] {value_propositions[2]}

답변 형식 (반드시 지켜주세요):
선택: A/B/C 중 하나
설득력: 1~5 (선택한 것의 설득력)
이유: 한 문장으로 짧게
```

## 응답 파싱

```python
def _parse_vp_response(response: str, n_options: int) -> dict:
    valid = set("ABCDE"[:n_options])
    
    choice_m = re.search(r"선택[:\s]*([A-E])", response)
    score_m = re.search(r"설득력[:\s]*([1-5])", response)
    reason_m = re.search(r"이유[:\s]*(.+?)(?:\n|$)", response, re.DOTALL)
    
    return {
        "choice": choice_m.group(1) if choice_m and choice_m.group(1) in valid else None,
        "score": int(score_m.group(1)) if score_m else None,
        "reason": reason_m.group(1).strip()[:200] if reason_m else "",
    }
```

## 출력 (Output Schema)

```python
@dataclass
class ValuePropositionResult:
    # 메타
    value_propositions: list[str]
    total_responses: int
    parse_failed: int

    # 메인 결과
    choice_counts: dict[str, int]
    choice_pct: dict[str, float]
    avg_persuasion_by_choice: dict[str, float]   # 각 선택의 평균 설득력
    
    # 강점·약점 키워드
    keywords_by_choice: dict[str, list[tuple[str, int]]]
    
    # 세그먼트
    breakdown_by_age: dict[str, dict]
    breakdown_by_sex: dict[str, dict]
    breakdown_by_province: dict[str, dict]
    
    raw_results: list[SimResult]
```

## 결과 시각화

### Section 1: KPI

*   가장 설득력 있는 VP: B (45%, 평균 설득력 4.2/5)
*   가장 약한 VP: C (18%, 평균 설득력 2.8/5)

### Section 2: 선호도 분포

*   도넛 차트 (Creative Testing과 동일)

### Section 3: 설득력 비교

*   가로 bar chart (각 VP의 평균 설득력)
*   5점 만점 기준

### Section 4: 세그먼트별 선호 VP

*   연령대별 / 성별 1순위 VP 표

### Section 5: 키워드 분석

*   각 VP를 선택한 이유에서 빈출 키워드

## 권장 샘플 사이즈

*   빠른 검증: 100
*   표준: 200
*   B2B 의사결정: 300

## 권장 타겟 필터

VP 자체가 타겟 segment에 맞춰진 메시지이므로, **타겟 segment를 정확히 좁혀서 시뮬레이션**.

| VP 타겟 | 권장 필터 |
| --- | --- |
| 30~40대 IT 종사자 | `age_min=30, age_max=49, occupation_keywords=["프로그래머","엔지니어","개발","IT"]` |
| 중소기업 CEO | `age_min=40, age_max=60, occupation_keywords=["관리자","임원","대표"], education_level=["4년제","대학원"]` |
| 20대 학생/사회초년생 | `age_min=20, age_max=29` |

## 한계 및 주의사항

1.  **VP 길이 통제**: 모든 VP를 비슷한 길이로 (긴 것이 유리해 보일 수 있음)
2.  **설득력 ≠ 구매**: 설득력 높다고 실제 구매율 높지 않을 수 있음
3.  **컨텍스트 필요**: `product_context` 잘 작성해야 의미 있는 차이 나옴
4.  **B2B vs B2C**: B2B는 `purpose="b2b"` (career\_goals\_and\_ambitions 활용)

## 프리셋 예시

```python
PRESET_SAAS_HEADER = {
    "product_context": "한국어 데이터 기반 AI 분석 SaaS, 월 99,000원~",
    "value_propositions": [
        "10분 만에 데이터 인사이트, 가장 빠른 분석 도구",
        "한국어 데이터에 최적화된 유일한 AI 분석",
        "월 99,000원으로 시작, 첫 달 무료",
    ],
    "filter": {
        "age_min": 30, "age_max": 49,
        "occupation_keywords": ["관리자", "사무", "마케팅"],
        "education_level": ["4년제 대학교", "대학원"],
    },
    "sample_size": 200,
}
```

## Aaru 비교

| 항목 | Aaru Lumen | KoreaSim |
| --- | --- | --- |
| VP 테스트 | ⭕ | ⭕ |
| B2B 페르소나 정확성 | △ (미국 직군) | ◎ (한국 직군 분류) |
| 한국적 가치관 (체면·관계) | ❌ | ◎ |

## 향후 개선

*   VP 자동 생성 (LLM이 product\_context로 5개 후보 생성)
*   A/B 분기 테스트 (이긴 VP끼리 토너먼트)
*   산업별 가치관 가중치 (예: 금융=안전, 식음료=신선)
