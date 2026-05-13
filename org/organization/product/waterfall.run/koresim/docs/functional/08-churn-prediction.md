---

title: 08 — 이탈 예측 (Churn Prediction)  
type: functional-spec  
tags: \[functional-spec, churn-prediction\]  
created: 2026-04-30  
updated: 2026-05-03
status: implemented-v1
implementation: src/simulations/generic_suite.py + src/simulations/registry.py + frontend/src/simulations/registry.ts
related: \[\[overview\]\], \[\[../prd\]\]  
priority: ★★

---

# 08 — 이탈 예측

## Goal (비즈니스 질문)

> "어떤 고객이 **떠나려 하는가**? 왜? 어떻게 잡을 수 있는가?"

기존 고객의 가상 시나리오에서 이탈 의향과 이유를 측정 → 예방 전략 도출.

## 다른 시뮬레이션과의 차이

| 항목 | Product Launch | Churn Prediction |
| --- | --- | --- |
| 시점 | 신규 고객 획득 | 기존 고객 유지 |
| 질문 | "사겠습니까?" | "계속 쓰겠습니까?" |
| 결과 활용 | 출시 결정 | 리텐션 캠페인 |

## 사용자 시나리오

1.  통신사가 5G 가입자 이탈률이 높음을 인지
2.  "어떤 가입자가 떠나려 하나? 왜?"
3.  KoreaSim에 현재 서비스 + 가상 변경 시나리오 입력
4.  페르소나에게 "당신이 이 통신사 가입자라면 어떻게 하겠나?" 질문
5.  이탈 위험 세그먼트 식별 + 예방 메시지 추출

## 입력 (Input Schema)

```python
class ChurnPredictionInput:
    service_name: str                # "통신사 A 5G 요금제"
    current_situation: str           # 현재 서비스 상황
    trigger_event: str               # 이탈 유발 이벤트
    competitor_offer: str = ""       # 경쟁사 대안 (선택)
    sample_size: int = 200
    target_filter: TargetFilter = None
```

### 예시

```python
{
    "service_name": "통신사 A 5G",
    "current_situation": "월 8.9만원, 데이터 무제한, 가입한 지 2년차",
    "trigger_event": "월 요금이 9.9만원으로 11% 인상 예정",
    "competitor_offer": "통신사 B에서 동일 조건 7.5만원 신규 할인",
}
```

## 처리 흐름

```
[1] N명 페르소나 샘플링 (서비스 사용자 페르소나로 가정)
[2] 각 페르소나에 LLM 호출
      → "이런 상황이면 어떻게 하시겠어요?"
      → 유지/관망/이탈 + 이유
[3] 이탈률 계산
[4] 이탈 위험 세그먼트 식별 (인구통계 교차)
[5] 예방 메시지 추천 (LLM 추가 호출, 옵션)
```

## LLM Prompts

### System Prompt

\[\[overview#페르소나-시스템-프롬프트-표준\]\] (purpose=`marketing`)

### User Prompt

```
당신은 현재 {service_name}을 사용하고 있습니다.

【현재 상황】
{current_situation}

【최근 변화】
{trigger_event}

【경쟁사 제안】
{competitor_offer}

이런 상황에서 당신은 어떻게 하시겠어요?

답변 형식 (반드시 지켜주세요):
의향: 유지 / 관망 / 이탈
확신도: 1~5 (1=잘 모름, 5=확실)
이유: 한 문장
나를 잡으려면: (어떻게 해야 유지할 것 같은지, 한 문장)
```

## 응답 파싱

```python
def _parse_churn(response: str) -> dict:
    intent_m = re.search(r"의향[:\s]*(유지|관망|이탈)", response)
    conf_m = re.search(r"확신도[:\s]*([1-5])", response)
    reason_m = re.search(r"이유[:\s]*(.+?)(?:\n|$)", response)
    retention_m = re.search(r"나를 잡으려면[:\s]*(.+?)(?:\n|$)", response, re.DOTALL)
    
    return {
        "intent": intent_m.group(1) if intent_m else None,
        "confidence": int(conf_m.group(1)) if conf_m else 3,
        "reason": reason_m.group(1).strip()[:200] if reason_m else "",
        "retention_suggestion": retention_m.group(1).strip()[:200] if retention_m else "",
    }
```

## 출력 (Output Schema)

```python
@dataclass
class ChurnPredictionResult:
    # 메타
    service_name: str
    trigger_event: str
    total_responses: int
    parse_failed: int

    # 메인 결과
    churn_rate: float                       # 이탈 비율
    retention_rate: float                   # 유지 비율
    indecision_rate: float                  # 관망 비율
    avg_confidence: float                   # 평균 확신도
    
    # 위험 세그먼트
    high_risk_segments: list[dict]          # 이탈률 가장 높은 세그먼트들
    # [{"segment": "30대 남자 서울", "churn_rate": 0.65, "size": 28}]
    
    safe_segments: list[dict]               # 가장 잘 유지하는 세그먼트
    
    # 이유 분석
    top_churn_reasons: list[tuple[str, int]]
    top_retention_reasons: list[tuple[str, int]]
    
    # 잡을 방법 (Retention 메시지)
    top_retention_suggestions: list[tuple[str, int]]
    
    # 세그먼트 (공통)
    breakdown_by_age: dict[str, dict]
    breakdown_by_sex: dict[str, dict]
    breakdown_by_province: dict[str, dict]
    
    raw_results: list[SimResult]
```

## 결과 시각화

### Section 1: KPI (위험 신호)

*   **예상 이탈률**: 32%
*   **유지율**: 48%
*   **관망**: 20%
*   **평균 확신도**: 3.7 / 5

### Section 2: 의향 분포

*   도넛 차트 (유지/관망/이탈)
*   색상: 유지=초록, 관망=노랑, 이탈=빨강

### Section 3: 고위험 세그먼트 (Top 5)

*   인구통계 조합별 이탈률 랭킹
*   표 + 막대 차트

### Section 4: 이탈 이유 vs 유지 이유

*   좌: 이탈 이유 Top 10
*   우: 유지 이유 Top 10

### Section 5: 잡을 방법 (인사이트)

*   "이렇게 해주면 유지할게요" 응답 키워드
*   워드클라우드 또는 Top 10 리스트
*   → 리텐션 캠페인 메시지 추천

### Section 6: 대응 가설 자동 생성 (신규)

고위험 세그먼트별로 가능한 대응 가설을 4개 카테고리로 분류해 3~5개 자동 제안:

| 카테고리 | 예시 |
|---------|------|
| **가격** | "5G 가족 결합 시 월 1만원 할인 제공" |
| **기능** | "데이터 무제한 → 100GB 후 속도 제한 해제" |
| **CS** | "1년 이상 가입자 대상 전담 매니저 배정" |
| **메시지** | "지금까지 함께해주셔서 감사합니다. 특별 혜택을..." |

```python
@dataclass
class RetentionHypothesis:
    category: str          # "가격" / "기능" / "CS" / "메시지"
    proposal: str          # 구체 대응안 한 문장
    target_segment: str    # 어느 세그먼트에 효과적인지
    rationale: list[str]   # 응답에서 추출한 근거 인용 (3개)
    estimated_lift: float  # 예상 유지율 향상 (옵션, 추정)
```

UI: "💡 대응 가설" 섹션에 카드 형태로 노출.

### Section 7: 세그먼트별 의향
- Stacked bar (연령대 / 성별 / 지역)

## 고위험 세그먼트 자동 식별

```python
def find_high_risk_segments(results: list[SimResult], min_size: int = 10) -> list[dict]:
    """인구통계 조합별 이탈률 계산"""
    from collections import defaultdict
    
    segments = defaultdict(lambda: {"total": 0, "churn": 0})
    
    for r in results:
        parsed = _parse_churn(r.response)
        if not parsed["intent"]:
            continue
        
        age_b = age_bucket(r.persona["age"])
        sex = r.persona["sex"]
        province = r.persona["province"]
        
        # 단일 차원
        segments[(f"{age_b}",)]["total"] += 1
        if parsed["intent"] == "이탈":
            segments[(f"{age_b}",)]["churn"] += 1
        # 2차원 조합
        key = (age_b, sex)
        segments[key]["total"] += 1
        if parsed["intent"] == "이탈":
            segments[key]["churn"] += 1
    
    # 정렬
    high_risk = [
        {
            "segment": " · ".join(k),
            "churn_rate": v["churn"] / v["total"],
            "size": v["total"],
        }
        for k, v in segments.items()
        if v["total"] >= min_size
    ]
    high_risk.sort(key=lambda x: x["churn_rate"], reverse=True)
    return high_risk[:5]
```

## 권장 샘플 사이즈

*   빠른 진단: 100
*   **표준**: 200
*   정밀 (캠페인 결정 직전): 500

## 권장 타겟 필터

서비스 가입자 프로필에 맞춰:

*   통신: `age_min=18, age_max=70, exclude_unemployed=False`
*   구독 OTT: `age_min=18, age_max=55`
*   카드: `age_min=20, age_max=65, exclude_unemployed=True`

## 한계 및 주의사항

1.  **가입자 페르소나 한정 어려움**: Nemotron 데이터에 "현재 서비스 가입 여부" 정보 없음 → 페르소나가 가입자라고 가정
2.  **이탈 의향 ≠ 실제 이탈**: 선언과 행동 갭 존재
3.  **시간 차원 무시**: "지금 결정"만 측정, 시점에 따른 변동 반영 안 됨
4.  **경쟁사 정보 정확도**: `competitor_offer` 부정확하면 결과 왜곡

## 프리셋 예시

```python
PRESET_TELECOM = {
    "service_name": "통신사 A 5G 요금제",
    "current_situation": "월 8.9만원, 데이터 무제한, 가입 2년차, 멤버십 혜택 사용 중",
    "trigger_event": "월 요금 9.9만원으로 11% 인상 예정 (다음 달 청구부터)",
    "competitor_offer": "통신사 B에서 동일 조건 7.5만원, 가입비 면제, 첫 6개월 50% 할인",
    "filter": {"age_min": 20, "age_max": 60, "exclude_unemployed": False},
    "sample_size": 300,
}
```

## Aaru 비교

| 항목 | Aaru Lumen | KoreaSim |
| --- | --- | --- |
| 이탈 예측 | ⭕ | ⭕ |
| 한국 통신·금융 시장 이해 | ❌ | ◎ |
| 위험 세그먼트 식별 | ⭕ | ⭕ |
| 한국적 유지 인센티브 (멤버십·약정) | ❌ | ◎ |

## 향후 개선

*   시간 변화 시뮬레이션 (3개월 후, 6개월 후 의향)
*   가격 인상 폭별 이탈률 곡선
*   리텐션 메시지 자동 생성 (LLM 후처리)
*   신규 가입과 결합 (이탈 + 신규 = 순증감 예측)
