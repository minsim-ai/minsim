---
title: 품질·신뢰도 표기 + 면책 + 검증 케이스
type: functional-spec
tags: [functional-spec, quality, trust, validation]
created: 2026-04-30
updated: 2026-05-03
status: implemented-v1
implementation: src/simulations/common.py + src/jobs/result_envelope.py + frontend/src/ResultsPage.tsx + frontend/src/ValidationPage.tsx
related: [[overview]], [[../prd]]
priority: ★★★★
---

# 품질·신뢰도 표기 + 면책 + 검증 케이스

## Goal

> "AI 시뮬레이션을 신뢰할 수 있는가?"라는 의사결정자의 질문에 **데이터로 답한다.**

1. 모든 시뮬레이션 결과에 **품질 지표** 표시 (사용자가 결과를 얼마나 믿어야 하는지)
2. **면책 문구** 명시 (실제 시장조사 대체 X)
3. **검증 케이스** 공개 (외부 설문 vs KoreaSim 결과 비교) — 신뢰도의 근거

---

## 1. 품질 지표 표준 (모든 시뮬레이션 공통)

### 1.1 표시 위치

결과 화면 **최상단** (제목 바로 아래)에 4개 카드로 표시:

```
┌─────────────┬─────────────┬─────────────┬─────────────┐
│ 응답 수     │ 파싱 성공률 │ 표본 신뢰도 │ 일관성       │
│ 200 / 200   │ 96.5%       │ ⭐⭐⭐⭐ (높음) │ ⭐⭐⭐ (중간) │
└─────────────┴─────────────┴─────────────┴─────────────┘
```

### 1.2 4개 핵심 지표

#### A. 응답 수 (`total_responses`)
- 실제 LLM 응답 받은 페르소나 수
- 요청 샘플 수 대비 표시 (예: 198 / 200)

#### B. 파싱 성공률 (`parse_success_rate`)
```
parse_success_rate = (total_responses - parse_failed) / total_responses * 100
```
- 90%+ : 우수 ⭐⭐⭐⭐⭐
- 80~89% : 양호 ⭐⭐⭐⭐
- 70~79% : 주의 ⭐⭐⭐
- <70% : 결과 신뢰 어려움 ⭐⭐ (경고)

#### C. 표본 신뢰도 (`sample_quality`)
샘플 사이즈 + 세그먼트별 최소 인원 기준:

| 사이즈 | 등급 | 표시 |
|-------|------|------|
| 500+ | 매우 높음 | ⭐⭐⭐⭐⭐ |
| 200~499 | 높음 | ⭐⭐⭐⭐ |
| 100~199 | 중간 | ⭐⭐⭐ |
| 50~99 | 낮음 (방향성만) | ⭐⭐ ⚠️ |
| <50 | 통계적 의미 부족 | ⭐ ⚠️ |

#### D. 일관성 (`consistency`)
- 같은 시뮬레이션을 2회 돌렸을 때 결과 일치도 (옵션, V2)
- V1: temperature 기반 추정 ("temperature 0.3 → 일관성 높음 예상")

### 1.3 자동 경고

샘플 사이즈가 작거나 파싱 실패율 높을 때 화면 상단에 경고 배너:

```
⚠️ 표본이 작아 (50명) 결과는 방향성만 참고하세요.
   정밀 분석은 200명 이상 권장합니다.
```

```
⚠️ 응답 파싱 실패율이 높습니다 (35%).
   LLM 응답 형식이 안정적이지 않습니다. 모델 변경 또는 프롬프트 조정 필요.
```

### 1.4 세그먼트별 표본 검증

세그먼트 분석에서 **각 세그먼트 최소 5명** 미만은 회색 + 주의 표시:

```
연령대별 선호도
  20대 (32명) ████████ 45%
  30대 (28명) ██████ 36%
  40대 (24명) ██████ 32%
  50대 (4명)  ░░ 25% ⚠️ 표본 부족
```

---

## 2. 면책 문구 (Disclaimer)

### 2.1 모든 결과 화면 하단 고정 노출

```
─────────────────────────────────────────────
ⓘ 본 결과는 AI 시뮬레이션입니다.
  실제 인간 행동을 100% 대변하지 않으며,
  실제 시장조사를 대체할 수 없습니다.
  중요한 의사결정은 추가 검증과 함께 사용하세요.
─────────────────────────────────────────────
```

- 작은 글씨 (14px), 회색 배경 박스
- 사용자가 닫을 수 없음 (영구 노출)

### 2.2 시뮬레이션 시작 전 1회 동의 (옵션)

처음 사용자만:
```
┌─────────────────────────────────────────┐
│ KoreaSim 시뮬레이션 사용 안내           │
│                                         │
│ ✓ AI 시뮬레이션 결과는 참고용입니다     │
│ ✓ 실제 시장조사를 대체하지 않습니다     │
│ ✓ 의사결정 전 추가 검증을 권장합니다    │
│                                         │
│        [이해했습니다]                   │
└─────────────────────────────────────────┘
```

---

## 3. 검증 케이스 페이지

### 3.1 위치
- 메뉴: "검증 사례" 또는 "신뢰도"
- URL: `arabesque.cc/validation`

### 3.2 콘텐츠 구조

각 검증 케이스마다:

```markdown
## 케이스 #1 — 한국 OTT 가입자 선호도

### 외부 설문 (대조군)
- 출처: 한국갤럽 2025년 OTT 만족도 조사
- 표본: 1,000명 (전국, 20~60대)
- 결과: 넷플릭스 41%, 티빙 28%, 쿠팡플레이 18%, ...

### KoreaSim 시뮬레이션
- 표본: 1,000명 (동일 필터)
- 결과: 넷플릭스 38%, 티빙 31%, 쿠팡플레이 17%, ...

### 비교
| 서비스 | 갤럽 | KoreaSim | 차이 |
|-------|------|---------|------|
| 넷플릭스 | 41% | 38% | -3pp |
| 티빙 | 28% | 31% | +3pp |
| 쿠팡플레이 | 18% | 17% | -1pp |

**상관계수**: 0.92 (매우 높음)
**평균 절대 오차**: 2.3pp

### 해석
시뮬레이션이 실측을 잘 재현했음. 단, 신규 진입 서비스에서는
오차가 더 클 수 있음.
```

### 3.3 최소 발행 기준

V1 (출시 시): **최소 1개 케이스**
V2 (3개월): **3개 이상**
V3 (6개월): **5개 이상 (산업별)**

### 3.4 케이스 발굴 우선순위

1. **공개 설문 데이터와 비교** — 한국갤럽, 코리아리서치, KSDC
2. **자체 PoC 결과** — 클라이언트 동의 시 익명화 후 공개
3. **선거 예측** — 실제 결과와 비교 (Aaru의 Dynamo 케이스 모방)

---

## 4. 결과 신뢰 등급 (종합)

각 시뮬레이션 결과 상단에 종합 신뢰 등급 표시:

```
🟢 신뢰도 A — 사용 권장
  - 표본 500명 이상
  - 파싱 성공률 95%+
  - 검증된 카테고리
```

```
🟡 신뢰도 B — 참고용
  - 표본 200~500명
  - 파싱 성공률 85%+
  - 검증 케이스 부족 카테고리
```

```
🔴 신뢰도 C — 방향성만 참고
  - 표본 200명 미만
  - 파싱 성공률 70~85%
  - 또는 신규 카테고리 (LLM 학습 부족)
```

---

## 5. 코드 인터페이스

```python
# src/quality.py

@dataclass
class QualityIndicators:
    total_responses: int
    parse_success_rate: float
    sample_quality_grade: str   # "S/A/B/C/D"
    consistency_score: Optional[float]  # V2
    overall_grade: str          # "A/B/C"
    warnings: list[str]         # 사용자에게 보여줄 경고

def calculate_quality(result: Any) -> QualityIndicators:
    """모든 시뮬레이션 결과에서 품질 지표 자동 계산"""
    ...
```

각 시뮬레이션의 `result` 객체에 `quality: QualityIndicators` 필드 추가:

```python
@dataclass
class CreativeResult:
    # 기존 필드들...
    quality: QualityIndicators   # 신규
```

---

## 6. UI 컴포넌트

```python
# src/ui/quality_badge.py

def render_quality_header(quality: QualityIndicators):
    """결과 상단에 4개 카드 + 경고"""
    cols = st.columns(4)
    cols[0].metric("응답", f"{quality.total_responses}")
    cols[1].metric("파싱 성공률", f"{quality.parse_success_rate:.1f}%")
    cols[2].metric("표본 신뢰도", quality.sample_quality_grade)
    cols[3].metric("종합", quality.overall_grade)
    
    for warn in quality.warnings:
        st.warning(warn)

def render_disclaimer():
    """모든 결과 화면 하단 면책"""
    st.markdown("""
    <div style="background:#f0f0f0; padding:10px; font-size:12px; color:#666; border-radius:5px;">
    ⓘ 본 결과는 AI 시뮬레이션입니다. 실제 인간 행동을 100% 대변하지 않으며,
    실제 시장조사를 대체할 수 없습니다.
    </div>
    """, unsafe_allow_html=True)
```

---

## 7. 구현 우선순위

### Phase 4 (데모 콘텐츠 직전)
- [x] `quality` envelope 계산 함수
- [x] 4개 카드 UI 컴포넌트
- [x] 면책 문구 고정 노출
- [x] 표본 부족 자동 경고

### Phase 5 (시뮬레이션 확장과 함께)
- [x] 모든 신규 시뮬레이션에 quality 필드 통합
- [x] 세그먼트별 표본 검증

### V2 (정식 릴리스)
- [x] 검증 케이스 페이지 (`/validation`) V1
- [x] 종합 신뢰 등급 자동 부여

V2 research backlog:

- 일관성 점수 (2회 실행 비교)

## 7.1 구현 상태

- 결과 envelope는 `quality`, `warnings`, `sample_summary`, `seed`, `model_alias/provider_model`, `trace_id`를 포함한다.
- React 결과 화면은 응답 수, 파싱 성공률, 표본 등급, 종합 등급, seed/model/timestamp, 고정 disclaimer를 표시한다.
- `/validation`은 live Gemini 9개 시뮬레이션 200-person 외부 검증, public route/SSE replay, Ollama fallback 한계를 운영 검증 케이스로 공개한다.
- 공개 benchmark survey와 2회 실행 consistency score는 V2 research item으로 남긴다.

---

## 8. 비즈니스 임팩트

### Aaru의 약점 (KoreaSim의 기회)
- Aaru는 EY 검증 사례에서 **-37.82% 역상관** 발생 → 신뢰도 의문
- 공개 검증 케이스 부족
- "어느 정도 믿어야 하나?" 질문에 답을 안 줌

### KoreaSim의 차별
- **모든 결과에 신뢰도 명시** (의사결정자가 판단 가능)
- **검증 케이스 공개** (투명성)
- **명확한 한계 인정** (역설적으로 신뢰 ↑)

→ "검증 가능한 한국 시뮬레이션"이라는 포지셔닝

---

## 9. Out of Scope

- ❌ 실시간 검증 (사용자가 즉시 외부 데이터와 비교)
- ❌ 자동 모델 평가 (LLM이 자기 결과를 평가)
- ❌ 보증·보험 (결과 보증 제공)
