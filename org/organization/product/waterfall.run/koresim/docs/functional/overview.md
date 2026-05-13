---
title: 기능 명세 — Overview (9개 시뮬레이션 공통)
type: functional-spec
tags: [functional-spec, overview]
created: 2026-04-30
updated: 2026-04-30
status: stable
related: [[../prd]], [[../data-spec]], [[visualization-spec]], [[quality-and-trust]]
---

# Functional Spec — Overview

> 9개 시뮬레이션의 공통 흐름·인터페이스·표준을 정의한다.  
> 각 시뮬레이션 명세(`01~09-*.md`)는 이 문서를 전제로 한다.

> **공통 횡단 명세** (모든 시뮬레이션 적용):
> - [[visualization-spec]] — 노드 그래프 + 군중감 시각화
> - [[quality-and-trust]] — 품질 지표 + 면책 + 검증 케이스

---

## 공통 흐름 (Pipeline)

```
[1] 사용자 입력
      ↓
[2] PersonaSampler.sample(n, target_filter)
      ↓ list[dict]
[3] PromptBuilder.build_system_prompt(persona, purpose)
      ↓ system prompt (str)
[4] BatchSimulator.run(personas, user_prompt)
      ↓ asyncio.gather, Semaphore(8)
[5] OllamaClient.chat(system, user)
      ↓ list[SimResult]
[6] <SimulationName>._aggregate(results)
      ↓ <ResultDataclass>
[7] React 결과 시각화 (차트 + 페르소나 카드 + trust layer)
```

---

## 표준 시뮬레이션 인터페이스

모든 시뮬레이션 모듈은 다음 클래스를 구현한다:

```python
class <SimulationName>:
    async def run(
        self,
        # ── 시뮬레이션별 고유 입력 ──
        ...,
        # ── 공통 ──
        sample_size: int = 200,
        target_filter: Optional[TargetFilter] = None,
        on_progress: Optional[Callable[[int, int], None]] = None,
    ) -> <ResultDataclass>:
        ...
```

### 공통 파라미터

| 파라미터 | 타입 | 기본값 | 의미 |
| --- | --- | --- | --- |
| `sample_size` | int | 200 | 시뮬레이션할 페르소나 수 |
| `target_filter` | TargetFilter | None | 페르소나 필터 (province/district/age/sex/occupation/education/exclude_unemployed) |
| `seed` | int | 42 | 샘플링 시드 — 동일 조건+동일 시드는 동일 페르소나 보장 |
| `on_progress` | callable | None | 진행률 콜백 `(done, total) -> None` |

### TargetFilter (공통)

\[\[../data-spec\]\] 참조. 모든 시뮬레이션이 동일하게 사용.

### 시드 재현성 (Reproducibility)

**원칙**: 동일 입력 + 동일 시드 = 동일 페르소나 표본

```python
result_a = await CreativeTesting().run(creatives=[...], seed=42)
result_b = await CreativeTesting().run(creatives=[...], seed=42)
# result_a/b의 페르소나 uuid 집합 동일 (LLM 응답은 temperature 때문에 약간 다름)
```

**UI 요구사항**:
- 사이드바에 "시드" 입력 필드 (기본 42)
- "🎲 랜덤 시드" 버튼 (사용자가 매번 다른 표본 원할 때)
- 결과에 사용된 시드 표시 (재현 가능하게)

---

## 표준 결과 Dataclass

각 시뮬레이션의 `<ResultDataclass>`는 다음 필드를 **반드시 포함**한다:

```python
@dataclass
class <SimulationName>Result:
    # ── 메타 ──
    sample_size: int            # 요청한 샘플 수
    total_responses: int        # 실제 응답 수
    parse_failed: int           # LLM 응답 파싱 실패 수
    seed: int                   # 사용된 시드 (재현용)
    target_filter: dict         # 사용된 필터 (재현용)
    sample_summary: SampleSummary  # 추출된 표본의 분포 (아래 정의)

    # ── 메인 결과 (시뮬레이션마다 다름) ──
    ...

    # ── 세그먼트 브레이크다운 (공통) ──
    breakdown_by_age: dict[str, dict]      # 연령대별
    breakdown_by_sex: dict[str, dict]      # 성별
    breakdown_by_province: dict[str, dict] # 지역별

    # ── 품질 지표 (공통, [[quality-and-trust]] 참조) ──
    quality: QualityIndicators

    # ── 원본 ──
    raw_results: list[SimResult]   # 모든 LLM 응답 원본
```

### 표본 요약 분포 (SampleSummary) — 신규

필터 적용 후 실제 추출된 페르소나의 분포를 결과에 포함하여 사용자가 검증할 수 있게 한다.

```python
@dataclass
class SampleSummary:
    total: int                              # 추출된 페르소나 수
    by_sex: dict[str, int]                  # {"남자": 102, "여자": 98}
    by_age_bucket: dict[str, int]           # {"20대": 35, "30대": 50, ...}
    by_province: dict[str, int]             # {"서울": 60, "경기": 80, ...}
    by_occupation_top10: list[tuple[str, int]]  # 상위 10개 직업
    by_education: dict[str, int]            # 학력 분포
```

**UI 표시 (모든 시뮬레이션 결과 화면 상단)**:
```
┌────────────────────────────────────────────┐
│ 추출된 표본: 200명                         │
│  성별:  남자 51% · 여자 49%                │
│  연령:  20대 17% · 30대 25% · 40대 30% ... │
│  지역:  서울 30% · 경기 40% · 부산 12% ... │
│ [상세 보기 ▼]                              │
└────────────────────────────────────────────┘
```

**의의**:
- 사용자가 "내가 의도한 표본이 맞나" 즉시 검증
- 필터 효과 투명하게 보여줌
- 의사결정자에게 "한국 인구 정확한 단면"임을 강조

---

## 페르소나 시스템 프롬프트 표준

\[\[01-creative-testing#system-prompt\]\]에 구현된 형식을 모든 시뮬레이션이 사용한다:

```
당신은 다음 프로필을 가진 한국인입니다. 이 사람의 입장에서 자연스럽게 답변하세요.
절대 'AI' 또는 '제가 답변드리겠습니다' 같은 어색한 말투를 쓰지 마세요.
당신이 실제로 그 사람인 것처럼, 그 사람의 가치관과 경험으로 대답하세요.

## 인구통계
- 나이, 성별, 거주지, 직업, 학력, 결혼상태, 가족형태, 주거형태

## 페르소나
[professional_persona] / [family_persona] / [culinary_persona] / [persona]
(시뮬레이션 목적별로 다른 narrative 필드 조합)
```

### Purpose별 narrative 조합

| purpose | 사용하는 narrative 필드 |
| --- | --- |
| `marketing` (기본) | professional\_persona + family\_persona + culinary\_persona + persona |
| `political` | cultural\_background + professional\_persona + persona |
| `lifestyle` | family\_persona + sports\_persona + arts\_persona + travel\_persona + persona |
| `b2b` | professional\_persona + skills\_and\_expertise + career\_goals\_and\_ambitions + persona |

---

## User Prompt 표준 패턴

각 시뮬레이션은 LLM이 **파싱 가능한 정형 응답**을 받도록 user prompt를 설계한다:

### 패턴 1: 객관식 선택 (Creative Testing, Value Proposition, Competitive Positioning)

```
다음 [선택지]들 중 어떤 것이 가장 [질문 키워드]?

[A] {옵션 1}
[B] {옵션 2}
...

답변 형식 (반드시 지켜주세요):
선택: A/B/C 중 하나
이유: 한 문장으로 짧게
```

### 패턴 2: 5점 척도 (Product Launch, Brand Perception)

```
[제품/메시지/브랜드]에 대해 답해주세요.

[설명]

답변 형식:
점수: 1~5 (1=전혀 아니다, 5=매우 그렇다)
이유: 한 문장으로 짧게
```

### 패턴 3: 이항 선택 (Price Optimization, Churn Prediction)

```
[상황 설명]

답변 형식:
의향: 예/아니오/관망
이유: 한 문장으로 짧게
```

### 패턴 4: 자유 응답 (Market Segmentation)

```
[질문]에 대해 자유롭게 답해주세요. (3문장 이내)
```

---

## 응답 파싱 규칙

```python
import re

def parse_choice(response: str, valid: set[str]) -> Optional[str]:
    m = re.search(r"선택[:\s]*([A-J])", response)
    if m and m.group(1) in valid:
        return m.group(1)
    # fallback: 첫 등장 알파벳
    for char in response.upper():
        if char in valid:
            return char
    return None

def parse_score(response: str) -> Optional[int]:
    m = re.search(r"점수[:\s]*([1-5])", response)
    return int(m.group(1)) if m else None

def parse_reason(response: str) -> str:
    m = re.search(r"이유[:\s]*(.+?)(?:\n|$)", response, re.DOTALL)
    return m.group(1).strip()[:200] if m else response.strip()[:200]
```

---

## 결과 시각화 표준 (React)

모든 시뮬레이션 결과 화면은 다음 3-section 구조를 따른다:

```
┌─────────────────────────────────────────────┐
│ Section 1. 핵심 지표 (KPI 카드)               │
│  - React KPI cards 3~5개                    │
│  - 30초 안에 핵심 인사이트 파악 가능           │
├─────────────────────────────────────────────┤
│ Section 2. 분포·비교 차트                    │
│  - SVG/Recharts/D3/Plotly 등                │
│  - responsive layout                        │
├─────────────────────────────────────────────┤
│ Section 3. 세그먼트 브레이크다운              │
│  - 연령대 / 성별 / 지역별                    │
│  - 탭 또는 expander                         │
├─────────────────────────────────────────────┤
│ Section 4. (선택) 페르소나 익스플로러         │
│  - 개별 응답 30개 카드                       │
│  - 검색·필터                                 │
└─────────────────────────────────────────────┘
```

---

## 샘플 사이즈 가이드

| 사이즈 | 용도 | 시간 (gemma3:27b) | 정확도 |
| --- | --- | --- | --- |
| 10명 | 개발 smoke test | ~30초 | ❌ 통계적 의미 없음 |
| 50명 | 빠른 데모·아이디어 검증 | 2~5분 | △ 방향성만 |
| 200명 | 표준 (기본값) | 10~20분 | ○ 세그먼트별 5명 이상 |
| 500명 | 정밀 분석 | 25~50분 | ◎ 세그먼트별 통계 가능 |
| 1,000명 | 정식 리포트 | 50~100분 | ◎◎ 신뢰도↑ |
| 10,000명 | 대규모 검증 | 8~16시간 | 클라우드 GPU 필요 |

---

## 동시 요청 (Concurrency)

`.env`의 `CONCURRENCY=8` 기본값.

| 모델 | 권장 동시 요청 | 비고 |
| --- | --- | --- |
| gemma3:27b | 8 | M2 Studio 128GB 기준 |
| gpt-oss:20b | 12 | 더 작아서 더 많이 가능 |
| gpt-oss:120b | 2 | 메모리 빠듯 |
| 클라우드 (NIM/Groq) | 50~100 | 네트워크 한도 내 |

---

## 에러 처리 표준

| 에러 종류 | 처리 |
| --- | --- |
| Ollama 연결 실패 | 명확한 사용자 메시지 ("ollama serve 실행하세요") |
| LLM 응답 timeout (60초) | 1회 retry, 그래도 실패 시 `parse_failed` 카운트 |
| 응답 파싱 실패 | `parse_failed`로 카운트, 원본은 raw\_results에 보존 |
| 필터 결과 0명 | "조건에 해당하는 페르소나가 없습니다" 명시 |
| 메모리 부족 | sample\_size 자동 축소 + 사용자 경고 |

---

## Out of Scope (공통)

*   ❌ 시뮬레이션 결과의 통계적 유의성 자동 계산 (V1.5)
*   ❌ 다중 시뮬레이션 동시 실행 (한 번에 1개만)
*   ❌ 결과 자동 인사이트 LLM 요약 (V1.5)
