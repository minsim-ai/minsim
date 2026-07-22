---

title: 01 — 크리에이티브 테스트 (Creative Testing)  
type: functional-spec  
tags: \[functional-spec, creative-testing\]  
created: 2026-04-30  
updated: 2026-04-30  
status: implemented  
implementation: src/simulations/creative\_testing.py  
related: \[\[overview\]\], \[\[../prd\]\]

---

# 01 — 크리에이티브 테스트

> **상태**: ✅ 구현 완료 (`src/simulations/creative_testing.py`)  
> 이 문서는 구현된 코드의 명세 (역공학)

## Goal (비즈니스 질문)

> "여러 광고 카피·메시지 중 **어떤 것이 가장 효과적인가**?"

광고를 실제 집행하기 전에 한국인 페르소나에게 미리 보여주고 선호도를 측정.

## 사용자 시나리오

1.  마케팅팀이 신제품 출시 광고 카피 3안을 디자인
2.  어떤 카피로 결정할지 회의에서 의견 갈림
3.  KoreaSim에 3안 입력 → 200명 시뮬레이션 → 선호도 분포 + 이유 확인
4.  데이터 기반 의사결정

## 입력 (Input Schema)

```python
class CreativeTestingInput:
    creatives: list[str]              # 광고 카피 2~10개
    sample_size: int = 200            # 시뮬레이션할 인원
    target_filter: TargetFilter = None  # 페르소나 필터
```

### 입력 검증

*   `len(creatives)`: 2~10 사이여야 함 (그 외 ValueError)
*   각 creative는 빈 문자열 불가
*   `sample_size`: 1 이상

## 처리 흐름

```
[1] PersonaSampler.sample(sample_size, target_filter)
      ↓ list[dict] 페르소나 N명
[2] BatchSimulator(purpose="marketing").run(personas, user_prompt)
    각 페르소나에 대해:
      [a] PromptBuilder(persona, "marketing")
            → professional + family + culinary + persona narrative 결합
      [b] OllamaClient.chat(system, user_prompt)
            → "선택: A\n이유: ..."
[3] _aggregate(creatives, results)
      ↓ CreativeResult
```

## LLM Prompts

### System Prompt

\[\[overview#페르소나-시스템-프롬프트-표준\]\] 참조 (purpose=`marketing`)

### User Prompt

```
다음 광고 문구들 중 어떤 것이 가장 마음에 드시나요?

[A] {creatives[0]}
[B] {creatives[1]}
[C] {creatives[2]}
...

답변 형식 (반드시 지켜주세요):
선택: A/B/C 중 하나
이유: 한 문장으로 짧게
```

## 응답 파싱

```python
def _parse_choice(response: str, n_options: int) -> Optional[str]:
    valid = set("ABCDEFGHIJ"[:n_options])
    # 1순위: "선택: X" 패턴
    m = re.search(r"선택[:\s]*([A-J])", response)
    if m and m.group(1) in valid:
        return m.group(1)
    # 2순위: 응답 내 첫 번째 유효 알파벳
    for char in response.upper():
        if char in valid:
            return char
    return None  # 파싱 실패

def _parse_reason(response: str) -> str:
    m = re.search(r"이유[:\s]*(.+?)(?:\n|$)", response, re.DOTALL)
    return m.group(1).strip()[:200] if m else response.strip()[:200]
```

## 출력 (Output Schema)

```python
@dataclass
class CreativeResult:
    # 메타
    creatives: list[str]                   # 입력값 그대로
    total_responses: int
    parse_failed: int

    # 메인 결과
    choice_counts: dict[str, int]          # {"A": 87, "B": 64, "C": 42}
    choice_pct: dict[str, float]           # {"A": 45.0, "B": 33.0, "C": 22.0}
    reasons_by_choice: dict[str, list[str]]  # 선택별 이유 리스트

    # 세그먼트
    breakdown_by_age: dict[str, dict[str, int]]
    breakdown_by_sex: dict[str, dict[str, int]]
    breakdown_by_province: dict[str, dict[str, int]]

    # 원본
    raw_results: list[SimResult]
```

## 결과 시각화 (React)

> **공통 표준**: [[visualization-spec]] 참조 — 노드 그래프 + 군중감 (모든 시뮬레이션에 적용)
> **품질 표시**: [[quality-and-trust]] 참조 — 결과 상단에 4개 KPI 카드 + 면책 (필수)

### Section 0: 품질 헤더 (공통, [[quality-and-trust]])
- 응답 수 / 파싱 성공률 / 표본 신뢰도 / 종합 등급
- 표본 부족 또는 파싱 실패 시 경고 배너

### Section 1: 표본 요약 분포 (공통, [[overview#표본-요약-분포-sampleSummary]])
- 추출된 200명의 성별·연령·지역·학력 분포
- "내가 의도한 표본인가?" 즉시 검증

### Section 2: KPI 카드
- 각 크리에이티브별: 선택 % + 명수
- React KPI card component 사용

### Section 3: 안 비교 노드 그래프 ([[visualization-spec#노드-그래프-안-비교-시각화]])
- 각 안 = 메인 노드 (크기 = 선택 수)
- 자식 노드 = 주요 세그먼트
- 클릭 시 우측 패널에 세부 + 페르소나 카드

### Section 4: 군중감 (사람 아이콘 + 말풍선) ([[visualization-spec#사람-아이콘-말풍선-대표-인터뷰]])
- 안별로 100~200명 사람 아이콘 grid
- 자동 순환 말풍선 (대표 발언 5~12자)
- 클릭 시 페르소나 모달

### Section 5: 분포 차트 (보조)
- `plotly.express.pie` 도넛 차트
- 라벨: "A: {creative 앞 20자}..."

### Section 6: 세그먼트 브레이크다운
- 좌우 2-column
- 좌: 연령대별 stacked bar
- 우: 성별 stacked bar
- (선택) 지역별 — expander

### Section 7: 선택별 이유
- `st.tabs([A, B, C])`
- 각 탭에 상위 10개 이유 마크다운 리스트

### Section 8: 페르소나 익스플로러
- `st.expander` 내 30개 카드
- 페르소나 인구통계 캡션 + 응답 본문

### Section 9: 면책 (공통, [[quality-and-trust#면책-문구-disclaimer]])
- 화면 하단 고정 노출

## 권장 샘플 사이즈

| 사용 | 사이즈 | 시간 (gemma3:27b) |
| --- | --- | --- |
| 빠른 데모 | 50 | 2~5분 |
| 표준 (기본값) | 200 | 10~20분 |
| 정밀 분석 | 500 | 25~50분 |

## 권장 타겟 필터

광고 제품 카테고리에 따라 \[\[../data-spec#사용-권장-패턴\]\] 참조.

## 한계 및 주의사항

1.  **2~10개 옵션 제한**: 11개 이상은 LLM 응답 품질 저하
2.  **각 creative 100자 이내 권장**: 너무 길면 응답이 짧은 응답에 편향
3.  **창의성 평가 X**: 선호도만 측정, 광고 효과(구매·전환)는 별개
4.  **시각 광고 X**: 텍스트 카피만 가능, 이미지·동영상 평가 불가

## 프리셋 예시

\[\[../phases/phase-4-demo-content#프리셋-데이터-구조\]\] 참조.

## Aaru 비교

| 항목 | Aaru Lumen | KoreaSim |
| --- | --- | --- |
| 데이터 | 미국 인구조사 | 한국 NVIDIA Nemotron |
| 언어 | 영어 위주 | 한국어 네이티브 |
| 가격 | 비공개 (엔터프라이즈) | 공개 SaaS |
| 셀프서비스 | ❌ (컨설팅) | ✅ |
| 한국 카피 정확성 | △ (영어 번역) | ◎ |

## 향후 개선

*   응답 이유 자동 클러스터링 (LLM 또는 임베딩)
*   통계적 유의성 (chi-square test) 표시
*   이미지 광고 평가 (멀티모달 LLM 도입 시)
*   A/B 테스트 결과와의 상관관계 검증
