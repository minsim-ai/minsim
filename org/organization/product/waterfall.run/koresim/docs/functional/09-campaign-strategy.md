---

title: 09 — 캠페인 전략 (Campaign Strategy)  
type: functional-spec  
tags: \[functional-spec, campaign-strategy\]  
created: 2026-04-30  
updated: 2026-05-03
status: implemented-v1
implementation: src/simulations/generic_suite.py + src/simulations/registry.py + frontend/src/simulations/registry.ts
related: \[\[overview\]\], \[\[../prd\]\], \[\[01-creative-testing\]\], \[\[05-market-segmentation\]\]  
priority: ★★

---

# 09 — 캠페인 전략

## Goal (비즈니스 질문)

> "**최적의 채널 × 메시지 조합**은 무엇인가? 어디에 어떤 메시지를 던져야 가장 효과적인가?"

채널(인스타·유튜브·네이버 등) × 메시지(가성비·품질·라이프스타일) 매트릭스를 시뮬레이션 → 최적 조합 발견 + 예상 ROI.

## 다른 시뮬레이션과의 차이

이건 **상위 종합 시뮬레이션**. 단일 차원이 아니라 다음을 결합:

*   \[\[01-creative-testing\]\] — 메시지 효과
*   \[\[05-market-segmentation\]\] — 세그먼트 식별
*   채널별 도달률 (외부 데이터)

→ 가장 복잡하고 마지막에 구현

## 사용자 시나리오

1.  화장품 회사가 신제품 출시 캠페인을 설계 중
2.  예산 5억 원으로 어디에 어떻게 쓸까?
3.  가능한 채널: 인스타그램, 유튜브, 네이버 검색, 카카오톡, TV
4.  가능한 메시지 톤: 자연스러움 / 럭셔리 / 가성비
5.  KoreaSim에 매트릭스 입력 → 각 조합의 효과 시뮬레이션 → 최적 조합 + ROI

## 입력 (Input Schema)

```python
class CampaignStrategyInput:
    product_context: str             # 제품·캠페인 목표
    channels: list[Channel]          # 2~5개
    messages: list[Message]          # 2~4개
    budget: int                      # 예산 (원)
    sample_size: int = 500           # 큰 샘플 권장 (조합 매트릭스라)
    target_filter: TargetFilter = None

class Channel(TypedDict):
    name: str                        # "인스타그램"
    description: str                 # "주 사용자: 20~40대, 시각 콘텐츠"
    cost_per_reach: int              # 1명 도달 비용 (원)

class Message(TypedDict):
    name: str                        # "자연스러운 일상"
    creative: str                    # 실제 광고 카피
```

## 처리 흐름

```
[1] N명 페르소나 샘플링
[2] 각 페르소나에 대해, 모든 채널×메시지 조합 평가
      → "이 메시지를 이 채널에서 봤다면, 클릭하시겠어요?"
      → CTR (Click-Through Rate) 추정
[3] 채널별 도달률 가중치 적용 (페르소나의 채널 사용 추정)
[4] 조합별 예상 효과 = CTR × 도달률 × 페르소나 수
[5] 예산 제약 하 최적 할당 (단순 그리디)
[6] ROI 추정 (구매 의향 × 평균 객단가)
```

## LLM Prompts

### System Prompt

\[\[overview#페르소나-시스템-프롬프트-표준\]\] (purpose=`marketing` + hobbies\_and\_interests 추가)

### User Prompt 1: 채널 사용성 (페르소나당 1회)

```
당신이 평소 다음 채널을 얼마나 자주 보시나요?

A) 인스타그램
B) 유튜브
C) 네이버 검색
D) 카카오톡
E) TV

답변 형식:
A: 매일 / 주 1~2회 / 월 1~2회 / 거의 안 봄
B: ...
C: ...
D: ...
E: ...
```

### User Prompt 2: 메시지×채널 효과 (페르소나당 메시지 수만큼)

```
당신이 {channel.name}을 보다가 다음 광고를 봤다고 상상해보세요.

【광고 메시지】
{message.creative}

【제품 컨텍스트】
{product_context}

이 광고를 보고 어떻게 하시겠어요?

답변 형식 (반드시 지켜주세요):
반응: 클릭 / 관심 / 무시 / 거부
의향: 1~5 (구매 의향)
이유: 한 문장
```

## 응답 파싱

```python
def _parse_channel_usage(response: str, channels: list[str]) -> dict[str, str]:
    usage = {}
    for letter, channel in zip("ABCDE", channels):
        m = re.search(rf"{letter}[:\s]+(매일|주 1~2회|월 1~2회|거의 안 봄)", response)
        if m:
            usage[channel] = m.group(1)
    return usage

def _parse_message_response(response: str) -> dict:
    reaction_m = re.search(r"반응[:\s]*(클릭|관심|무시|거부)", response)
    intent_m = re.search(r"의향[:\s]*([1-5])", response)
    reason_m = re.search(r"이유[:\s]*(.+?)(?:\n|$)", response)
    return {
        "reaction": reaction_m.group(1) if reaction_m else None,
        "intent": int(intent_m.group(1)) if intent_m else None,
        "reason": reason_m.group(1).strip()[:200] if reason_m else "",
    }
```

## 출력 (Output Schema)

```python
@dataclass
class CampaignStrategyResult:
    # 메타
    product_context: str
    channels: list[Channel]
    messages: list[Message]
    budget: int
    total_responses: int
    parse_failed: int

    # 메인 결과 — 채널 × 메시지 매트릭스
    matrix: dict[tuple[str, str], dict]
    # 예: {("인스타그램", "자연스러운 일상"): 
    #      {"ctr": 0.18, "intent_avg": 3.6, "score": 0.65}}
    
    # 채널별 도달률 추정
    channel_reach: dict[str, float]
    # {"인스타그램": 0.62, "유튜브": 0.78, ...}
    
    # 최적 할당
    optimal_allocation: dict[str, dict]
    # {("인스타그램", "메시지1"): {"budget": 200000000, "expected_reach": 12345, "expected_purchase": 432}}
    
    # 예상 ROI
    expected_total_reach: int
    expected_total_purchase: int
    expected_roi: float                 # 구매 가치 / 예산
    
    # 채널별 추천 메시지
    best_message_per_channel: dict[str, str]
    
    # 세그먼트
    breakdown_by_age: dict[str, dict]
    breakdown_by_sex: dict[str, dict]
    breakdown_by_province: dict[str, dict]
    
    raw_results: list[SimResult]
```

## 결과 시각화

### Section 1: KPI

*   추천 최적 조합: 인스타그램 + "자연스러운 일상" (예상 클릭률 22%, ROI 3.2x)
*   예상 도달: 50만 명
*   예상 구매: 8천 명

### Section 2: 채널 × 메시지 히트맵

*   가로: 채널, 세로: 메시지
*   색상: 효과 점수 (CTR × 의향)

### Section 3: 예산 할당 추천

*   각 조합별 추천 예산 (파이 차트)
*   예상 도달·구매·ROI

### Section 4: 채널별 도달률

*   각 채널의 페르소나 도달률 (bar chart)
*   세그먼트별 차이 표시

### Section 5: 채널별 베스트 메시지

*   채널마다 가장 효과적인 메시지 카드

### Section 6: ROI 시뮬레이션

*   예산 변경 슬라이더 → ROI 변화
*   한계 효용 (additional reach per ₩)

## 최적 할당 알고리즘

### V1: 단순 그리디

```python
def allocate_budget(matrix: dict, budget: int, channel_costs: dict) -> dict:
    """효과 점수 / 비용 = ROI 비율 기준 할당"""
    options = []
    for (channel, message), score_data in matrix.items():
        cost = channel_costs[channel]
        roi = score_data["score"] / cost
        options.append({
            "key": (channel, message),
            "roi": roi,
            "score": score_data["score"],
            "cost": cost,
        })
    
    options.sort(key=lambda x: x["roi"], reverse=True)
    
    allocation = {}
    remaining = budget
    for opt in options:
        allocation[opt["key"]] = {
            "budget": min(remaining, budget // 3),  # 다양화
            "expected_reach": ...,
        }
        remaining -= allocation[opt["key"]]["budget"]
        if remaining <= 0:
            break
    
    return allocation
```

### V2: 선형 계획법 (scipy.optimize.linprog)

*   정밀한 최적화
*   제약 조건 (각 채널 최소 예산 등)

## 권장 샘플 사이즈

채널 × 메시지 매트릭스가 크므로 **큰 샘플 필수**.

| 채널 × 메시지 수 | 권장 샘플 |
| --- | --- |
| 2 × 2 = 4 | 200 |
| 3 × 3 = 9 | 500 |
| 5 × 4 = 20 | 1,000 |

## 한계 및 주의사항

1.  **가장 복잡 = 가장 부정확**: 여러 추정이 곱해져 누적 오차
2.  **채널 도달률 추정 한계**: 페르소나의 자기보고 ≠ 실제 사용
3.  **장기 효과 무시**: 한 번 노출 = 일회성, 누적 효과 (브랜드 빌딩) 반영 안 됨
4.  **외부 데이터 필요**: 정확한 채널 cost\_per\_reach는 매체사 데이터로 보완해야
5.  **예산 정밀도**: ROI 절대값보다 **상대 비교**로 활용 권장

## 프리셋 예시

```python
PRESET_COSMETICS = {
    "product_context": "신규 자연주의 화장품 라인, 30~45세 여성 타겟, 객단가 5만원",
    "channels": [
        {"name": "인스타그램", "description": "20~40대 여성 강세", "cost_per_reach": 100},
        {"name": "유튜브", "description": "전 연령", "cost_per_reach": 150},
        {"name": "네이버 쇼핑", "description": "구매 직전 단계", "cost_per_reach": 300},
        {"name": "카카오톡", "description": "전 연령, 친근함", "cost_per_reach": 80},
    ],
    "messages": [
        {"name": "자연주의", "creative": "자연 그대로의 빛, 매일 쓰는 천연 화장품"},
        {"name": "효과 강조", "creative": "7일 만에 피부 톤 2단계 업, 임상 검증"},
        {"name": "가성비", "creative": "백화점 화장품 효과, 합리적 가격 4.9만원"},
    ],
    "budget": 500000000,
    "filter": {"age_min": 30, "age_max": 45, "sex": "여자", "exclude_unemployed": True},
    "sample_size": 1000,
}
```

## Aaru 비교

| 항목 | Aaru Lumen | KoreaSim |
| --- | --- | --- |
| 캠페인 시뮬레이션 | ⭕ | ⭕ |
| 한국 채널 인지 (카카오·네이버) | ❌ | ◎ |
| ROI 추정 | ⭕ | ⭕ |
| 한국적 광고 톤 (정·정중함) | ❌ | ◎ |

## 향후 개선

*   정밀 최적화 (linprog, MILP)
*   시간 시뮬레이션 (캠페인 1주차, 4주차 효과 차이)
*   외부 매체사 데이터 통합 (실제 cost\_per\_reach)
*   카니발리제이션 (같은 사람 여러 채널 노출 시 중복 제거)
*   다국어 캠페인 (한국 거주 외국인 타겟)
