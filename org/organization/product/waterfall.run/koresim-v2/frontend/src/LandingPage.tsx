import { useRef, useState, type KeyboardEvent } from 'react'
import { AuthStatus } from './components/AuthStatus'
import { InteractiveKoreaMap } from './v2/KoreaReactionMap'
import type { MinsimRegion } from './v2/minsimReport'
import { navigateTo } from './v2/navigation'

const DEMO_PDF_PREVIEW_URL = 'https://drive.google.com/file/d/1cm-ydOpcMi6rslJOnmBaGoRp-eGarOgW/view?usp=sharing'

const examples = [
  {
    label: '강아지 로봇 구독',
    prompt: '어르신 동반 강아지 로봇, 월 39,000원 구독으로 출시하면 어떤 반응일까요?',
  },
  {
    label: '새벽 밀키트 가격',
    prompt: '1인 가구용 새벽 밀키트, 가격 저항을 테스트하고 싶어요.',
  },
  {
    label: '스마트링 헤드라인',
    prompt: '수면 추적 스마트링, 출시 헤드라인 3종을 비교해 주세요.',
  },
  {
    label: '세제 리브랜딩',
    prompt: '친환경 세제 리브랜딩, 40대 여성 반응이 궁금해요.',
  },
]

const stats = [
  { value: '5단계', label: '입력에서 다음 액션까지' },
  { value: '50-200명', label: '현재 지원하는 합성 패널' },
  { value: '~24초', label: '한 번의 시뮬레이션 평균' },
  { value: '100만', label: '한국 페르소나 풀' },
]

const steps = [
  { n: '01', title: '입력', body: 'AI가 필요한 것만 대화로 하나씩 묻습니다.' },
  { n: '02', title: '타깃 선정', body: '연령, 지역, 생활 조건으로 패널을 뽑습니다.' },
  { n: '03', title: '실행', body: '수백 명에게 동시에 묻고 진행률을 봅니다.' },
  { n: '04', title: '결과', body: '선호, 세그먼트, 근거 발언을 비교합니다.' },
  { n: '05', title: '대화', body: '결과가 애매하면 다시 질문하고 인터뷰합니다.' },
]

const audiences = [
  { n: '01', title: '초기 스타트업 PM', body: '컨셉은 정했는데 시장 반응을 알 방법이 없을 때' },
  { n: '02', title: '신제품 기획자', body: '경영진 보고 전에 진짜 반응을 미리 보고 싶을 때' },
  { n: '03', title: '마케팅 디렉터', body: '광고 헤드라인 후보 중 소구되는 카피를 비교할 때' },
  { n: '04', title: 'UX 리서처', body: '실제 인터뷰 전에 필요한 질문을 잡을 때' },
]

const segmentDemoRegions: MinsimRegion[] = [
  demoRegion('경기도', 62, 58, '이탈'),
  demoRegion('서울특별시', 48, 64, '이탈'),
  demoRegion('부산광역시', 25, 42, '관망'),
  demoRegion('충청남도', 25, 48, '관망'),
  demoRegion('경상남도', 22, 82, '이탈'),
  demoRegion('인천광역시', 18, 56, '이탈'),
]

const segmentDemoLegend = [
  { id: '유지', label: '유지', color: 'var(--segment-retain)' },
  { id: '관망', label: '관망', color: 'var(--segment-watch)' },
  { id: '이탈', label: '이탈', color: 'var(--segment-churn)' },
]

export function LandingPage() {
  const [draft, setDraft] = useState('')
  const [demoRegionSelection, setDemoRegionSelection] = useState<MinsimRegion | null>(segmentDemoRegions[0])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const composingRef = useRef(false)

  const grow = (element: HTMLTextAreaElement | null) => {
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${Math.min(element.scrollHeight, 200)}px`
  }

  const start = (prompt = draft.trim()) => {
    const seed = prompt.trim()
    if (seed) window.sessionStorage.setItem('minsim.heroPrompt', seed)
    navigateTo('/projects')
  }

  const pickExample = (prompt: string) => {
    setDraft(prompt)
    window.requestAnimationFrame(() => {
      grow(textareaRef.current)
      textareaRef.current?.focus()
    })
  }

  return (
    <div className="minsim-shell minsim-landing">
      <header className="topnav">
        <div className="wrap spread">
          <a className="brand minsim-brand-button" href="/" aria-label="minsim 홈">
            <span className="dot">m</span>
            minsim
          </a>
          <nav className="row minsim-top-actions" aria-label="주요 메뉴">
            <a className="navlink" href="/projects">
              프로젝트
            </a>
            <a className="navlink" href={DEMO_PDF_PREVIEW_URL} target="_blank" rel="noreferrer">
              데모 pdf 미리보기
            </a>
            <AuthStatus compact />
          </nav>
        </div>
      </header>

      <main className="screen" id="main-content">
        <section className="wrap minsim-hero">
          <div className="col minsim-hero-copy">
            <p className="kicker">출시 전 시장 반응 시뮬레이션</p>
            <h1>무엇을 시장에 물어볼까요?</h1>
            <p className="muted">
              제품 한 줄을 적으면 minsim이 필요한 것만 되묻고, 합성 페르소나 패널의 반응과 결과 보고서까지 만듭니다.
            </p>
          </div>

          <div className="hero-input">
            <label className="sr-only" htmlFor="minsim-question">시장에 확인하고 싶은 질문</label>
            <textarea
              id="minsim-question"
              ref={textareaRef}
              rows={1}
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value)
                grow(event.target)
              }}
              onCompositionStart={() => {
                composingRef.current = true
              }}
              onCompositionEnd={() => {
                composingRef.current = false
              }}
              onKeyDown={(event) => {
                if (isComposing(event, composingRef)) return
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  start()
                }
              }}
              placeholder="예: 어르신 동반 강아지 로봇, 월 39,000원 구독으로 출시하면 어떤 반응일까요?"
            />
            <button
              className="hero-send"
              type="button"
              onClick={() => start()}
              disabled={!draft.trim()}
              aria-label="시뮬레이션 시작"
              title="시뮬레이션 시작"
            >
              ↑
            </button>
          </div>

          <div className="row minsim-chip-row">
            {examples.map((example) => (
              <button className="hero-chip" key={example.label} type="button" onClick={() => pickExample(example.prompt)}>
                {example.label}
              </button>
            ))}
          </div>

          <div className="row minsim-stat-row">
            {stats.map((stat) => (
              <span className="row" key={stat.label}>
                <b>{stat.value}</b>
                {stat.label}
              </span>
            ))}
          </div>

        </section>

        <hr className="hr" />

        <section className="wrap minsim-section landing-segment-demo" aria-labelledby="landing-segment-title">
          <div className="landing-segment-head">
            <div>
              <p className="kicker">세그먼트 반응 예시</p>
              <h2 id="landing-segment-title">전국 200명 중, 누가 이탈하려는지 먼저 확인하세요.</h2>
              <p className="muted">비율만 줄 세우지 않고 지역별 표본과 신뢰도를 함께 보여줍니다.</p>
            </div>
            <div className="landing-demo-actions">
              <span>예시 데이터</span>
              <button className="btn primary" type="button" onClick={() => start()}>내 서비스로 시뮬레이션 →</button>
            </div>
          </div>

          <div className="landing-segment-kpis">
            <article><span>전체 이탈률</span><strong>63.4%</strong><small>합성 패널 200명</small></article>
            <article><span>신뢰 가능한 주의 지역</span><strong>서울 64%</strong><small>48명 · 신뢰 보통</small></article>
            <article><span>관측 최고</span><strong>경남 82%</strong><small>22명 · 낮은 신뢰</small></article>
          </div>

          <div className="landing-segment-grid">
            <div className="card landing-segment-map">
              <InteractiveKoreaMap
                regions={segmentDemoRegions}
                selectedRegion={demoRegionSelection}
                onSelect={setDemoRegionSelection}
                legend={segmentDemoLegend}
                metricLabel="이탈률"
                label="예시 지역별 이탈 반응 지도"
              />
            </div>
            <aside className="card landing-segment-rank" aria-label="예시 지역 반응 순위">
              <div className="landing-segment-rank-head">
                <span className="lbl-mono">신뢰 우선 지역</span>
                <span>총 200명</span>
              </div>
              {segmentDemoRegions.slice(0, 4).map((region) => (
                <button
                  key={region.name}
                  type="button"
                  className={demoRegionSelection?.name === region.name ? 'on' : ''}
                  onClick={() => setDemoRegionSelection(region)}
                >
                  <span><strong>{compactLandingRegion(region.name)}</strong><small>{region.focusLabel} · 신뢰 {region.reliability}</small></span>
                  <span><b>{region.focusPct}%</b><small>{region.n}명</small></span>
                </button>
              ))}
              <p>합성 페르소나의 관측 반응 예시이며 실제 고객 성과를 의미하지 않습니다.</p>
            </aside>
          </div>
        </section>

        <hr className="hr" />

        <section className="wrap minsim-section">
          <SectionHead kicker="어떻게 작동하나요" title="제품 아이디어를 적으면 5단계로 결과가 풀립니다." />
          <div className="minsim-step-grid">
            {steps.map((step) => (
              <article className="card" key={step.n}>
                <div className="num-lg">{step.n}</div>
                <h3>{step.title}</h3>
                <p className="muted">{step.body}</p>
              </article>
            ))}
          </div>
        </section>

        <hr className="hr" />

        <section className="wrap minsim-section">
          <SectionHead kicker="누구를 위한 도구인가요" title="제품을 처음 시장에 내야 하는 사람을 위해." />
          <div className="minsim-audience-grid">
            {audiences.map((item) => (
              <article className="card" key={item.n}>
                <span className="lbl-mono">{item.n}</span>
                <h3>{item.title}</h3>
                <p className="muted">{item.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="wrap minsim-final-cta">
          <div className="card">
            <h2>지금 제품 한 줄을 적어보세요.</h2>
            <p className="muted">합성 페르소나가 응답합니다.</p>
            <div className="row">
              <button className="btn primary lg" type="button" onClick={() => start()}>
                시뮬레이션 시작하기
              </button>
              <a className="btn lg" href={DEMO_PDF_PREVIEW_URL} target="_blank" rel="noreferrer">
                데모 pdf 미리보기
              </a>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}

function SectionHead({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div className="minsim-section-head">
      <p className="kicker">{kicker}</p>
      <h2>{title}</h2>
    </div>
  )
}

function isComposing(event: KeyboardEvent<HTMLTextAreaElement>, composingRef: { current: boolean }): boolean {
  const nativeEvent = event.nativeEvent as globalThis.KeyboardEvent & { keyCode?: number }
  return composingRef.current || nativeEvent.isComposing || nativeEvent.keyCode === 229
}

function demoRegion(name: string, n: number, focusPct: number, leadId: '관망' | '이탈'): MinsimRegion {
  const reliability = n >= 50 ? '높음' : n >= 30 ? '보통' : n >= 10 ? '낮음' : '참고'
  const reliabilityRank = n >= 50 ? 4 : n >= 30 ? 3 : n >= 10 ? 2 : 1
  return {
    name,
    svgId: name,
    leadId,
    lead: leadId,
    pct: `${leadId === '이탈' ? focusPct : 100 - focusPct}%`,
    pctValue: leadId === '이탈' ? focusPct : 100 - focusPct,
    focusId: '이탈',
    focusLabel: '이탈',
    focusPct,
    deltaPoint: Math.round((focusPct - 63.4) * 10) / 10,
    distribution: { 유지: 0, 관망: 100 - focusPct, 이탈: focusPct },
    n,
    reliability,
    reliabilityRank,
    why: '홈페이지에서 제품 결과 형태를 설명하기 위한 예시 데이터입니다.',
    actions: [],
  }
}

function compactLandingRegion(name: string): string {
  return name.replace('특별시', '').replace('광역시', '').replace(/도$/, '')
}
