import { useRef, useState, type KeyboardEvent } from 'react'
import { AuthStatus } from './components/AuthStatus'
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

export function LandingPage() {
  const [draft, setDraft] = useState('')
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

          <aside className="minsim-result-preview" aria-label="결과 보고서 예시">
            <div>
              <span className="lbl-mono">결과 예시</span>
              <strong>C안 선호 63%</strong>
              <small>예시 데이터 · 실제 결과는 입력과 실행 표본에 따라 달라집니다.</small>
            </div>
            <div className="minsim-preview-proof">
              <span>표본 조건</span><span>세그먼트 비교</span><span>근거 발언</span><span>재현 seed</span>
            </div>
          </aside>
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
