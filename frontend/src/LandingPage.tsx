import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import {
  ArrowRight,
  ArrowUp,
  ChartColumn,
  Database,
  Lightbulb,
  ListChecks,
  Megaphone,
  Package,
  Search,
  ShieldCheck,
  Timer,
  TrendingDown,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { getAuthSession, loginPageHref } from './api/auth'
import { AuthStatus } from './components/AuthStatus'
import { BrandMark } from './components/BrandMark'
import { GitHubStarCta } from './components/GitHubStarCta'
import { LordIcon } from './components/LordIcon'
import { ThemeToggle } from './components/ThemeToggle'
import { InteractiveKoreaMap } from './v2/KoreaReactionMap'
import type { MinsimRegion } from './v2/minsimReport'
import { navigateTo } from './v2/navigation'


/** Keep in sync with `.hero-input textarea { max-height }` in styles.css */
const HERO_TEXTAREA_MAX_HEIGHT = 200

/** Hero title cycles these two lines with a typewriter effect. */
const HERO_TYPEWRITER_PHRASES = [
  '어떤걸로 여론조사를 할까요?',
  '무엇을 시장에 물어볼까요?',
] as const

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
  {
    label: '예산 우선순위',
    prompt: '복지 항목들의 우선순위를 매겨주세요.',
    // 이 프롬프트가 요구하는 유형은 여론조사 갈래에만 있다.
    kind: 'poll' as const,
  },
]

const stats: { value: string; label: string; icon: LucideIcon }[] = [
  { value: '5단계', label: '입력에서 다음 액션까지', icon: ListChecks },
  { value: '200~2,000명', label: '한 번에 돌릴 수 있는 합성 패널', icon: Users },
  { value: '~24초', label: '한 번의 시뮬레이션 평균', icon: Timer },
  { value: '100만+', label: '한국·다국가 페르소나 풀', icon: Database },
]

const steps = [
  { n: '01', title: '입력', body: 'AI가 필요한 것만 대화로 하나씩 묻습니다.', icon: '/lordicon/input.json' },
  { n: '02', title: '타깃 선정', body: '연령, 지역, 생활 조건으로 패널을 뽑습니다.', icon: '/lordicon/target.json' },
  { n: '03', title: '실행', body: '수백 명에게 동시에 묻고 진행률을 봅니다.', icon: '/lordicon/run.json' },
  { n: '04', title: '결과', body: '선호, 세그먼트, 근거 발언을 비교합니다.', icon: '/lordicon/results.json' },
  { n: '05', title: '대화', body: '결과가 애매하면 다시 질문하고 인터뷰합니다.', icon: '/lordicon/chat.json' },
]

const audiences: { n: string; title: string; body: string; icon: LucideIcon }[] = [
  { n: '01', title: '초기 스타트업 PM', body: '컨셉은 정했는데 시장 반응을 알 방법이 없을 때', icon: Lightbulb },
  { n: '02', title: '신제품 기획자', body: '경영진 보고 전에 진짜 반응을 미리 보고 싶을 때', icon: Package },
  { n: '03', title: '마케팅 디렉터', body: '광고 헤드라인 후보 중 소구되는 카피를 비교할 때', icon: Megaphone },
  { n: '04', title: 'UX 리서처', body: '실제 인터뷰 전에 필요한 질문을 잡을 때', icon: Search },
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
    // Measure natural content height, then expand without an inner scrollbar.
    element.style.height = 'auto'
    const contentHeight = element.scrollHeight
    element.style.height = `${Math.min(contentHeight, HERO_TEXTAREA_MAX_HEIGHT)}px`
    element.style.overflowY = contentHeight > HERO_TEXTAREA_MAX_HEIGHT ? 'auto' : 'hidden'
  }

  // Grow after React commits draft changes (chip autofill + typing).
  // requestAnimationFrame after setState can run before the value is in the DOM.
  useLayoutEffect(() => {
    grow(textareaRef.current)
  }, [draft])

  /** Unauthenticated users go to /login; hero prompt stays in sessionStorage for post-login resume. */
  const goToWorkspace = async (path = '/projects') => {
    try {
      const session = await getAuthSession()
      if (session.auth_required && !session.authenticated) {
        navigateTo(loginPageHref(path))
        return
      }
    } catch {
      navigateTo(loginPageHref(path))
      return
    }
    navigateTo(path)
  }

  const start = (prompt = draft.trim()) => {
    const seed = prompt.trim()
    if (seed) window.sessionStorage.setItem('minsim.heroPrompt', seed)
    void goToWorkspace('/projects')
  }

  /** 여론조사 갈래를 선점한 뒤 프로젝트 생성으로 보낸다. /dgist 별도 화면을 대체한다. */
  const startPoll = () => {
    window.sessionStorage.setItem('minsim.projectKind', 'poll')
    void goToWorkspace('/projects')
  }

  const pickExample = (prompt: string, kind?: 'poll') => {
    // 갈래가 정해진 예시는 플래그를 심어야 그 유형을 고를 수 있는 화면으로 간다.
    if (kind === 'poll') window.sessionStorage.setItem('minsim.projectKind', 'poll')
    else window.sessionStorage.removeItem('minsim.projectKind')
    // Do not focus the textarea after chip autofill — programmatic focus flashes a blue ring.
    setDraft(prompt)
  }

  return (
    <div className="minsim-shell minsim-landing">
      <header className="topnav topnav--overlay">
        <div className="wrap spread">
          <a className="brand minsim-brand-button" href="/" aria-label="minsim 홈">
            <BrandMark />
            minsim
          </a>
          <nav className="row minsim-top-actions" aria-label="주요 메뉴">
            <button className="navlink" type="button" onClick={() => void goToWorkspace('/projects')}>
              프로젝트
            </button>
            <button className="navlink" type="button" onClick={() => startPoll()}>
              여론조사
            </button>
            <div className="minsim-header-utilities">
              <ThemeToggle />
              <AuthStatus compact />
            </div>
          </nav>
        </div>
      </header>

      <main className="screen" id="main-content">
        <section className="wrap minsim-hero bloom-hero">
          <div className="grain" aria-hidden="true" />
          <div className="col minsim-hero-copy">
            <p className="kicker">출시 전 시장 반응 시뮬레이션</p>
            <HeroTypewriter phrases={HERO_TYPEWRITER_PHRASES} />
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
              <ArrowUp size={18} aria-hidden="true" />
            </button>
          </div>

          <div className="row minsim-chip-row">
            {examples.map((example) => (
              <button className="hero-chip" key={example.label} type="button" onClick={() => pickExample(example.prompt, 'kind' in example ? example.kind : undefined)}>
                {example.label}
              </button>
            ))}
          </div>

          <div className="row minsim-stat-row">
            {stats.map((stat) => (
              <span className="row" key={stat.label}>
                <stat.icon size={15} className="minsim-stat-icon" aria-hidden="true" />
                <b>{stat.value}</b>
                {stat.label}
              </span>
            ))}
          </div>

          <GitHubStarCta
            className="minsim-landing-github-star"
            page="/"
            title="오픈소스로 키우는 중이에요 · ⭐ 깃허브 스타 하나면 큰 힘이 돼요"
            subtitle="선택 사항 · 새 탭 💛"
          />
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
              <button className="btn primary" type="button" onClick={() => start()}>
                내 서비스로 시뮬레이션 <ArrowRight size={14} aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="landing-segment-kpis">
            <article><span><TrendingDown size={14} aria-hidden="true" /> 전체 이탈률</span><strong>63.4%</strong><small>합성 패널 200명</small></article>
            <article><span><ShieldCheck size={14} aria-hidden="true" /> 신뢰 가능한 주의 지역</span><strong>서울 64%</strong><small>48명 · 신뢰 보통</small></article>
            <article><span><ChartColumn size={14} aria-hidden="true" /> 관측 최고</span><strong>경남 82%</strong><small>22명 · 낮은 신뢰</small></article>
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
                <div className="minsim-step-head">
                  <LordIcon src={step.icon} size={40} trigger="loop-on-hover" />
                  <span className="lbl-mono">{step.n}</span>
                </div>
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
                <div className="minsim-audience-head">
                  <item.icon size={20} className="minsim-audience-icon" aria-hidden="true" />
                  <span className="lbl-mono">{item.n}</span>
                </div>
                <h3>{item.title}</h3>
                <p className="muted">{item.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="wrap minsim-final-cta">
          <div className="card bloom-cta">
            <div className="grain" aria-hidden="true" />
            <h2>지금 제품 한 줄을 적어보세요.</h2>
            <p className="muted">합성 페르소나가 응답합니다.</p>
            <div className="row">
              <button className="btn primary lg" type="button" onClick={() => start()}>
                시뮬레이션 시작하기 <ArrowRight size={15} aria-hidden="true" />
              </button>
              <button className="btn lg" type="button" onClick={() => startPoll()}>
                여론조사는 여기로
              </button>
            </div>
          </div>
        </section>
      </main>

      <footer className="minsim-footer">
        <div className="wrap spread">
          <span>© minsim — 합성 페르소나 시장 반응 시뮬레이션</span>
          <a href="https://lordicon.com/" target="_blank" rel="noreferrer">
            Animated icons by Lordicon.com
          </a>
        </div>
      </footer>
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

/**
 * CSS-Tricks style typewriter:
 * https://css-tricks.com/snippets/css/typewriter-effect/
 *
 * Always types one character at a time (including under prefers-reduced-motion).
 * Korean proportional fonts can't use pure CSS steps(width) reliably, so we drive
 * the string with JS and keep the classic blinking border-right caret.
 */
function HeroTypewriter({ phrases }: { phrases: readonly string[] }) {
  const [display, setDisplay] = useState('')
  // Stable string key so React Strict Mode remounts don't get a new array identity each render.
  const phraseKey = phrases.join('\u0001')

  useEffect(() => {
    const list = phraseKey ? phraseKey.split('\u0001') : []
    if (list.length === 0) return

    let cancelled = false
    const timers = new Set<number>()

    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        const id = window.setTimeout(() => {
          timers.delete(id)
          resolve()
        }, ms)
        timers.add(id)
      })

    // Always type character-by-character. Only calm the caret blink when OS
    // asks for reduced motion — never replace typing with a static full line.
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const TYPE_MS = prefersReduced ? 90 : 170
    const DELETE_MS = prefersReduced ? 45 : 85
    const HOLD_MS = prefersReduced ? 1800 : 2600
    const GAP_MS = prefersReduced ? 350 : 550

    setDisplay('')

    const run = async () => {
      let phraseIndex = 0
      await wait(300)
      while (!cancelled) {
        const phrase = list[phraseIndex % list.length] ?? ''
        const chars = Array.from(phrase)

        for (let i = 1; i <= chars.length; i += 1) {
          if (cancelled) return
          setDisplay(chars.slice(0, i).join(''))
          await wait(TYPE_MS)
        }

        await wait(HOLD_MS)
        if (cancelled) return

        for (let i = chars.length - 1; i >= 0; i -= 1) {
          if (cancelled) return
          setDisplay(chars.slice(0, i).join(''))
          await wait(DELETE_MS)
        }

        phraseIndex = (phraseIndex + 1) % list.length
        await wait(GAP_MS)
      }
    }

    void run()
    return () => {
      cancelled = true
      for (const id of timers) window.clearTimeout(id)
      timers.clear()
    }
  }, [phraseKey])

  return (
    <h1 className="minsim-hero-typewriter" data-typewriter="live" aria-label={phrases.join(' ')}>
      <span className="sr-only">{phrases.join(' ')}</span>
      <span
        className="minsim-hero-typewriter-line has-caret"
        aria-hidden="true"
        data-typed-length={Array.from(display).length}
      >
        {display.length > 0 ? display : '\u00a0'}
      </span>
    </h1>
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
