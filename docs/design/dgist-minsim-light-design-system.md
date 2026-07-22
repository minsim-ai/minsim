---
title: DGIST Minsim Light Design System
type: design-doc
tags: [minsim-v2, frontend, light-theme, design-system, accessibility]
created: 2026-07-20
updated: 2026-07-20
status: approved
related: [[../execution/dgist-minsim-white-ui-v1]], [[../execution/mobile-ui-optimization-v1]], [[../execution/design-refresh-grainy-gradient-v1]]
---

# DGIST Minsim Light Design System

## Decision

KoreaSim V2의 제품 UI를 현재 다크 테마에서 DGIST Minsim 화이트 디자인 방향으로 전환한다.

- Drive 산출물은 시각 기준이며 현재 `koresim-v2` 코드가 기능·데이터·문구의 source of truth다.
- Drive의 React 폴더를 복사하거나 현재 화면을 정적 HTML로 교체하지 않는다.
- 현재 프로젝트, intake, loading, results, Research Workspace, 다국가 지도, 인증·quota 동작을 보존한 채 디자인 토큰과 컴포넌트 표현을 이식한다.
- 랜딩부터 V2 제품 경로까지 하나의 라이트 시스템을 사용한다. 호환 화면은 라이트 호환으로 정리하거나 명시적으로 격리하며 한 화면 안에 라이트·다크 표면을 혼합하지 않는다.
- 디자인 원본의 낮은 보조 텍스트 대비와 390px 가로 overflow는 결함으로 간주하고 구현 시 보정한다.

## Source Hierarchy

### External design source

- Google Drive folder:
  `https://drive.google.com/drive/folders/1JwL2pcCN91tZwhVBty1p0U4dICiiVoWH?usp=sharing`
- `DGIST Minsim Design System.dc.html`
  - 라이트 색상, 표면, 간격, radius, 기본 컴포넌트의 1차 시각 기준.
- `DGIST Minsim Landing.dc.html`
  - 화이트 랜딩의 조형, 정보 밀도, hero와 CTA composition 기준.
- `DGIST Minsim Demo.dc.html`
  - 다크 데모 비교 자료. 라이트 테마의 토큰 source가 아니다.
- Drive `frontend/`
  - 이전 다크 React 스냅샷. 구현 source가 아니며 복사·덮어쓰기 대상에서 제외한다.

### Product source of truth

- 현재 `frontend/src/Root.tsx`와 `frontend/src/v2/navigation.ts`의 라우트 계약.
- 현재 React 컴포넌트의 제품 문구, 상태, 접근성 의미와 interaction.
- 현재 API schema, intake planner, result envelope, project/run persistence.
- 현재 다국가 persona·지도, 9개 시뮬레이션, Research Workspace와 인증·quota 기능.
- `frontend/src/styles.css`, `frontend/src/mobile.css`, `frontend/src/auth-theme.css`의 기존 class hook.

충돌 시 제품 동작과 데이터 계약을 우선하고, 이 문서의 라이트 토큰 안에서 시각 표현을 조정한다.

## Authoritative Tokens

아래 값은 V1 구현의 기준값이다. 기존 변수명이 `--lime`, `--void`처럼 다크 테마 의미를 담고 있더라도 새 값은 이 계약에 맞추고, 후속 정리에서 의미 기반 alias로 수렴한다.

| Role | Value | Rule |
|---|---:|---|
| Primary | `#0066FF` | 주요 CTA, 활성 step, 선택 강조 |
| Primary hover | `#005EEB` | pointer hover; focus를 대신하지 않음 |
| Primary pressed | `#0052CC` | pressed/active feedback |
| Primary selected surface | `#EAF2FE` | 선택 카드·행의 배경 |
| Canvas | `#FFFFFF` | body와 최상위 shell |
| Surface subtle | `#F7F7F8` | 섹션·워크스페이스 보조 표면 |
| Surface muted | `#F4F4F5` | 입력·disabled·skeleton 배경 |
| Track | `#E8E9EB` | 진행 rail, divider track |
| Border | `#D8DADF` | 카드·입력의 기본 경계 |
| Text strong | `#171719` | 제목과 본문 핵심 정보 |
| Text secondary | `#4F4F57` | 보조 본문 |
| Text muted | `#66666E` | 작은 metadata의 최소 기준 |
| Focus ring | `#005FCC` | 3px outline + 2px offset |
| Success text | `#167A45` | 작은 상태 텍스트에 사용 가능 |
| Warning text | `#8A4B08` | 작은 상태 텍스트에 사용 가능 |
| Danger text | `#B42318` | 오류·위험 텍스트 |

### Shape and elevation

| Element | Radius | Elevation |
|---|---:|---|
| Button, input, compact control | `7px` | 기본은 border, hover 시 미세 shadow |
| Card | `10px` | `0 1px 2px rgba(23,23,25,.05)` |
| Large panel, dialog, workspace | `14px` | `0 8px 28px rgba(23,23,25,.08)` |
| Pill, badge | `999px` | shadow 없음 |

- 기본 간격은 기존 8px 계열을 유지한다.
- body와 주요 surface는 투명 검정/흰색 overlay가 아니라 불투명 라이트 토큰을 사용한다.
- 라이트 블루 bloom은 랜딩 hero와 마지막 CTA에만 제한한다.
- grain은 콘텐츠 가독성을 해치지 않는 수준으로 제한하고 시각 강도는 기존 다크 구현 대비 약 35%를 상한으로 한다.
- 폰트와 타이포그래피 위계는 현재 제품의 Pretendard/Wanted Sans 구성을 보존한다.

## Component Contract

### Theme preference

- 화이트 디자인은 fallback 기본값이며, 저장된 선택이 없는 첫 방문에서는 `prefers-color-scheme`을 따른다.
- 사용자가 헤더 토글을 누르면 `minsim.theme` localStorage의 `light` 또는 `dark` 값이 OS 설정보다 우선한다.
- `minsim`과 `minsim-dark`는 동일 component tree와 semantic token 계약을 공유한다. 화면별 분기 마크업을 만들지 않는다.
- 초기 HTML에서 저장값과 OS 설정을 먼저 해석해 React hydration 전에 `data-theme`과 `color-scheme`을 적용한다.
- 토글은 landing과 V2 shell header에 노출하고, 접근 가능한 이름 `다크 모드`와 `aria-pressed`로 현재 상태를 전달하며 실행 결과는 tooltip으로 안내한다.
- 토글은 desktop/mobile 모두 `44×44px`이며 Google 인증, navigation, primary CTA보다 시각적 우선순위가 낮다.

### Actions and form controls

- primary action은 파란 배경과 흰 텍스트를 사용한다.
- secondary action은 흰 배경, 명시적 border, `#171719` 계열 텍스트를 사용한다.
- hover, pressed, selected, disabled, loading, focus-visible 상태를 각각 구분한다.
- 선택 상태는 배경색만 사용하지 않고 primary border 또는 inset indicator와 텍스트·아이콘 상태를 함께 제공한다.
- 모든 핵심 pointer target은 최소 `44×44px`다.
- disabled는 opacity만 낮추지 않고 배경·border·cursor·설명 문구로 실행 불가를 전달한다.

### Cards, panels, navigation

- 공통 header는 흰색 기반의 얕은 glass 표현을 허용하되 배경 콘텐츠와 텍스트 대비를 유지한다.
- V2 4단계 진행 rail은 흰 surface, 회색 track, 파란 현재·완료 상태를 사용한다.
- 카드 계층은 border와 제한된 elevation으로 구분한다. 다크 glow를 라이트 shadow로 단순 치환하지 않는다.
- quota, trust, warning, low-confidence badge는 의미별 라이트 surface와 고대비 텍스트를 사용한다.

### Data visualization

- 녹색·주황·분홍 등 원본의 밝은 데이터 색은 넓은 chart mark나 heatmap cell에 사용할 수 있다.
- 작은 텍스트나 얇은 선에는 위 표의 고대비 상태색을 사용한다.
- 색상만으로 series, 최고값, 경고, 선택 상태를 전달하지 않는다. label, icon, pattern, border 또는 굵기를 함께 쓴다.
- 지도 tooltip, legend, table header와 heatmap label은 라이트 surface와 명시적 border를 사용한다.
- partial result, 낮은 신뢰도, 표본 부족은 차트 장식이 아니라 읽을 수 있는 상태 문구로 제공한다.

### Motion

- loading의 Three.js/particle 표현은 라이트 orb 방향으로 조정하되 진행 정보가 주 콘텐츠다.
- `prefers-reduced-motion: reduce`에서는 장식 motion을 정지하거나 정적 대체 표현을 사용한다.
- motion은 상태 변화의 보조 수단이며 완료·실패·선택을 motion만으로 전달하지 않는다.

## Route and State Coverage Matrix

| Surface | Route | Required states |
|---|---|---|
| Landing | `/` | default, auth loading, signed-out, signed-in, CTA hover/focus, responsive hero |
| Project hub | `/app`, `/projects` | loading, empty, populated, create form, validation error, API error, quota exhausted |
| Project detail | `/projects/:id` | loading, populated, edit, run history, empty history, archive confirm/error |
| Simulation type | `/projects/:id/type` | default, recommended, selected, hover/focus, disabled/continue |
| Intake | `/projects/:id/intake` | question, dynamic form, candidate generation/review, assumption review, run-ready, validation/API/auth error |
| Loading | `/loading` | queued, running, partial progress, cancel, failed, retry/back navigation, reduced motion |
| Results | `/results` | missing run, loading, partial, completed, failed, restored, export/feedback/follow-up |
| Research Workspace | results section | quote view, respondent view, cohort follow-up, interview loading/history/error, empty |
| Connect | `/connect` | signed-out, consent/login, connected, token/error, loading |
| Compatibility | `/admin`, `/validation` | default, empty/loading/error where applicable; 라이트 호환 또는 명시적 격리 |
| Classic | `/classic/app`, `/classic/results` | 기존 동작 보존; 혼합 테마 금지 |
| Story/SEO | `/results/story/*`, `/simulations/*`, `/use-cases/*` | 정적·공개 경로 가독성, 링크·focus, mobile overflow |

모든 표면은 `empty`, `loading`, `error`, `partial`, `completed` 중 실제로 발생 가능한 상태를 빠짐없이 포함한다. 존재하지 않는 상태를 인위적으로 추가하지 않는다.

## Responsive and Accessibility Corrections

### Contrast

- 일반 텍스트는 배경 대비 최소 `4.5:1`, 큰 텍스트와 UI component boundary는 최소 `3:1`을 충족한다.
- 원본의 작은 보조 텍스트 색상은 측정값 `3.64:1`로 사용하지 않는다. 작은 metadata는 최소 `#66666E`/white 조합으로 보정한다.
- primary `#0066FF` 위 텍스트는 흰색을 사용한다.
- chart palette는 텍스트 palette와 분리한다.

### Overflow and reflow

- 원본 390px 렌더링의 약 `163px` document-level horizontal overflow를 재현하지 않는다.
- 검증 viewport는 `1440×900`, `1024×768`, `390×844`, `375×812`, `812×375`다.
- document overflow 허용값은 `0px`다.
- 넓은 결과 표만 명시적 내부 scroller를 사용할 수 있다. `role="region"`, 접근 가능한 이름, 키보드 focus와 스크롤 안내를 제공한다.
- 200% 확대에서도 핵심 action, dialog, composer가 가려지거나 viewport 밖으로 고정되지 않는다.

### Keyboard and semantics

- 모든 interactive element에 visible `:focus-visible`을 제공한다.
- tab order는 시각 순서와 일치해야 하며 keyboard trap을 만들지 않는다.
- 현재 page/step/selection은 `aria-current`, native checked/selected state 또는 적절한 label로 노출한다.
- tooltip의 핵심 정보는 pointer hover에만 의존하지 않는다.

## Explicit Exclusions

- DGIST 전용 브랜드·캠퍼스 문구, persona 구성, 샘플 수치를 KoreaSim 제품 데이터로 복사하지 않는다.
- Drive React 폴더의 다크 `styles.css`, component tree, package state를 덮어쓰지 않는다.
- API, DB, queue, auth, intake schema, result envelope를 테마 전환만을 위해 변경하지 않는다.
- 현재 다국가 지도, Research Workspace, simulation-specific result renderer를 축소하지 않는다.
- 새 UI framework나 별도 design-system dependency를 도입하지 않는다.
- 다크 테마의 부분 rollback으로 혼합 테마를 만들지 않는다.

## Acceptance Boundary

이 디자인 전환은 다음을 모두 만족해야 완료다.

1. route/state matrix의 실제 상태가 라이트 시스템으로 렌더링된다.
2. 현재 제품 기능·문구·데이터 계약과 9개 시뮬레이션 경로가 유지된다.
3. contrast, focus, touch target, reduced motion, overflow 기준을 통과한다.
4. 자동 검증 후 desktop/mobile 실제 브라우저와 프로덕션 `arabesque.cc`에서 관찰된다.
5. 검증 증거가 [[../execution/dgist-minsim-white-ui-v1]]에 기록된다.

후속 light/dark 사용자 선택 구현과 검증은 [[../execution/minsim-theme-toggle-v1]]에서 관리한다.
