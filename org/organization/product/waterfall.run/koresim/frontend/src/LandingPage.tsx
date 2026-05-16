import {
  ArrowRight,
  CaretRight,
  ChartBar,
  ChartPie,
  CheckCircle,
  Clock,
  CurrencyDollar,
  Eye,
  Lightning,
  Megaphone,
  Play,
  Scales,
  Sparkle,
  Stack,
  Star,
  Target,
  TrendDown,
  TrendUp,
  Users,
  XCircle,
  ChatText,
} from '@phosphor-icons/react'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { AuthStatus } from './components/AuthStatus'

const HeroScene = lazy(() =>
  import('./components/heroParticles/HeroParticleField').then((m) => ({ default: m.HeroParticleField }))
)

/* ─── util ─── */
function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) setInView(true) },
      { threshold }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [threshold])
  return { ref, inView }
}

function useIsMobile(maxWidth = 768) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia(`(max-width: ${maxWidth}px)`).matches
  })

  useEffect(() => {
    const query = window.matchMedia(`(max-width: ${maxWidth}px)`)
    const onChange = () => setMatches(query.matches)
    onChange()
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [maxWidth])

  return matches
}

function AnimatedCounter({ end, suffix = '' }: { end: number; suffix?: string }) {
  const [count, setCount] = useState(end)
  const { ref, inView } = useInView()
  useEffect(() => {
    if (!inView) return
    let start = 0
    const step = (end / 1800) * 16
    const timer = setInterval(() => {
      start += step
      if (start >= end) { setCount(end); clearInterval(timer) }
      else setCount(Math.floor(start))
    }, 16)
    return () => clearInterval(timer)
  }, [inView, end])
  return <span ref={ref}>{count.toLocaleString()}{suffix}</span>
}

function SectionHeader({ en, ko, align = 'center' }: { en: string; ko: React.ReactNode; align?: 'center' | 'left' }) {
  const isMobile = useIsMobile()
  return (
    <div style={{ textAlign: align, marginBottom: isMobile ? 40 : 64 }}>
      <div style={{ marginBottom: 10, fontSize: 12, fontWeight: 600, color: 'var(--color-primary)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{en}</div>
      <h2 style={{ fontSize: isMobile ? 30 : 40, fontWeight: 700, color: 'var(--color-fg-strong)', margin: 0, letterSpacing: '-0.022em', lineHeight: 1.28 }}>{ko}</h2>
    </div>
  )
}

/* ─── 미니 SVG 시각화 ─── */
const MiniChartAB = () => (
  <svg width="48" height="32" viewBox="0 0 48 32" fill="none">
    <rect x="0" y="12" width="18" height="20" rx="2" fill="currentColor" opacity="0.12"/>
    <rect x="0" y="0" width="18" height="12" rx="2" fill="currentColor" opacity="0.45"/>
    <text x="9" y="23" fontSize="7" fill="currentColor" textAnchor="middle" opacity="0.7" fontWeight="600">43%</text>
    <rect x="30" y="6" width="18" height="26" rx="2" fill="currentColor" opacity="0.12"/>
    <rect x="30" y="0" width="18" height="6" rx="2" fill="currentColor" opacity="0.3"/>
    <text x="39" y="23" fontSize="7" fill="currentColor" textAnchor="middle" opacity="0.7" fontWeight="600">57%</text>
  </svg>
)

const MiniCurve = () => (
  <svg width="48" height="32" viewBox="0 0 48 32" fill="none">
    <path d="M0 28 Q12 24 24 14 Q36 4 48 8" stroke="currentColor" strokeWidth="1.5" opacity="0.3" strokeLinecap="round"/>
    <circle cx="24" cy="14" r="3" fill="currentColor" opacity="0.7"/>
    <line x1="24" y1="14" x2="24" y2="32" stroke="currentColor" strokeWidth="1" opacity="0.2" strokeDasharray="2 2"/>
  </svg>
)

const MiniTrendUp = () => (
  <svg width="48" height="32" viewBox="0 0 48 32" fill="none">
    <polyline points="0,28 12,22 24,16 36,8 48,4" stroke="currentColor" strokeWidth="1.5" opacity="0.3" strokeLinecap="round" strokeLinejoin="round"/>
    <circle cx="48" cy="4" r="3" fill="currentColor" opacity="0.7"/>
    <rect x="0" y="28" width="48" height="3" rx="1" fill="currentColor" opacity="0.08"/>
  </svg>
)

const MiniScales = () => (
  <svg width="48" height="32" viewBox="0 0 48 32" fill="none">
    <line x1="24" y1="4" x2="24" y2="28" stroke="currentColor" strokeWidth="1.5" opacity="0.3" strokeLinecap="round"/>
    <line x1="8" y1="10" x2="40" y2="10" stroke="currentColor" strokeWidth="1.5" opacity="0.3" strokeLinecap="round"/>
    <ellipse cx="12" cy="22" rx="8" ry="5" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="1"/>
    <ellipse cx="36" cy="18" rx="8" ry="5" fill="currentColor" opacity="0.25" stroke="currentColor" strokeWidth="1"/>
  </svg>
)

const MiniPie = () => (
  <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
    <circle cx="16" cy="16" r="12" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.12"/>
    <path d="M16 16 L16 4 A12 12 0 0 1 27.4 22 Z" fill="currentColor" opacity="0.5"/>
    <path d="M16 16 L27.4 22 A12 12 0 0 1 4.6 22 Z" fill="currentColor" opacity="0.25"/>
    <path d="M16 16 L4.6 22 A12 12 0 0 1 16 4 Z" fill="currentColor" opacity="0.1"/>
  </svg>
)

const MiniQuadrant = () => (
  <svg width="36" height="32" viewBox="0 0 36 32" fill="none">
    <line x1="18" y1="0" x2="18" y2="32" stroke="currentColor" strokeWidth="1" opacity="0.15"/>
    <line x1="0" y1="16" x2="36" y2="16" stroke="currentColor" strokeWidth="1" opacity="0.15"/>
    <circle cx="26" cy="8" r="4" fill="currentColor" opacity="0.7"/>
    <circle cx="10" cy="24" r="2.5" fill="currentColor" opacity="0.25"/>
    <circle cx="8" cy="10" r="2" fill="currentColor" opacity="0.2"/>
    <circle cx="28" cy="22" r="2" fill="currentColor" opacity="0.15"/>
  </svg>
)

const MiniGauge = () => (
  <svg width="48" height="28" viewBox="0 0 48 28" fill="none">
    <path d="M4 24 A20 20 0 0 1 44 24" stroke="currentColor" strokeWidth="3" opacity="0.1" strokeLinecap="round"/>
    <path d="M4 24 A20 20 0 0 1 33 8" stroke="currentColor" strokeWidth="3" opacity="0.55" strokeLinecap="round"/>
    <circle cx="24" cy="24" r="3" fill="currentColor" opacity="0.7"/>
  </svg>
)

const MiniTrendDown = () => (
  <svg width="48" height="32" viewBox="0 0 48 32" fill="none">
    <polyline points="0,8 12,10 24,16 36,22 48,28" stroke="currentColor" strokeWidth="1.5" opacity="0.3" strokeLinecap="round" strokeLinejoin="round"/>
    <circle cx="42" cy="26" r="4" fill="currentColor" opacity="0.6"/>
    <line x1="42" y1="20" x2="42" y2="16" stroke="currentColor" strokeWidth="1.5" opacity="0.5" strokeLinecap="round"/>
  </svg>
)

const MiniRadial = () => (
  <svg width="36" height="32" viewBox="0 0 36 32" fill="none">
    <line x1="18" y1="16" x2="18" y2="4" stroke="currentColor" strokeWidth="1.5" opacity="0.4" strokeLinecap="round"/>
    <line x1="18" y1="16" x2="29" y2="22" stroke="currentColor" strokeWidth="1.5" opacity="0.25" strokeLinecap="round"/>
    <line x1="18" y1="16" x2="7" y2="22" stroke="currentColor" strokeWidth="1.5" opacity="0.15" strokeLinecap="round"/>
    <circle cx="18" cy="16" r="4" fill="currentColor" opacity="0.5"/>
    <circle cx="18" cy="4" r="2.5" fill="currentColor" opacity="0.3"/>
    <circle cx="29" cy="22" r="2.5" fill="currentColor" opacity="0.2"/>
    <circle cx="7" cy="22" r="2.5" fill="currentColor" opacity="0.1"/>
  </svg>
)

/* ─── NAV ─── */
function Nav() {
  const [scrolled, setScrolled] = useState(false)
  const isMobile = useIsMobile()
  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', h)
    return () => window.removeEventListener('scroll', h)
  }, [])

  return (
    <nav style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
      transition: `background var(--duration-2) var(--ease-standard), border-color var(--duration-2) var(--ease-standard)`,
      background: scrolled ? 'var(--color-bg-glass)' : 'transparent',
      backdropFilter: scrolled ? 'blur(20px)' : 'none',
      borderBottom: scrolled ? '1px solid var(--color-border)' : '1px solid transparent',
    }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: isMobile ? '0 16px' : '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: isMobile ? 58 : 64, gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <img src="/organization/logo-a.png" alt="Arabesque 로고" style={{ width: 34, height: 34, objectFit: 'contain', display: 'block' }} />
          <span style={{ fontWeight: 700, fontSize: 17, color: 'var(--color-fg-strong)', letterSpacing: '-0.02em' }}>Arabesque</span>
        </div>

        <div style={{ display: isMobile ? 'none' : 'flex', alignItems: 'center', gap: 28 }}>
          {[
            { label: '제품', href: '#' },
            { label: '사용 사례', href: '#' },
            { label: '검증', href: '/validation' },
            { label: '비교', href: '#' },
          ].map((item) => (
            <a key={item.label} href={item.href} style={{ color: 'var(--color-fg-subtle)', fontSize: 14, fontWeight: 500, textDecoration: 'none', transition: `color var(--duration-1)` }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-fg)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-fg-subtle)')}>
              {item.label}
            </a>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 12, flexShrink: 0 }}>
          <AuthStatus compact={isMobile} />
          <button
            onClick={() => { window.location.hash = 'app' }}
            style={{ background: 'var(--color-primary)', color: 'var(--color-fg-on-primary)', border: 'none', borderRadius: 'var(--radius-pill)', padding: isMobile ? '8px 14px' : '8px 18px', fontSize: isMobile ? 13 : 14, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = 'var(--color-primary-hover)')}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'var(--color-primary)')}>
            {isMobile ? '시작하기' : '무료로 시작하기'}
          </button>
        </div>
      </div>
    </nav>
  )
}

/* ─── HERO ─── */
function PersonaCard({
  style,
  name,
  meta,
  choice,
  delay,
  imageSrc,
}: {
  style: React.CSSProperties
  name: string
  meta: string
  choice: 'A' | 'B'
  delay: number
  imageSrc: string
}) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 800 + delay * 600)
    return () => clearTimeout(t)
  }, [delay])
  return (
    <div style={{
      ...style,
      opacity: visible ? 1 : 0,
      transform: `${style.transform ?? ''} translateY(${visible ? 0 : 12}px)`,
      transition: 'opacity 0.6s ease, transform 0.6s ease',
      background: 'rgba(248,250,252,0.76)', border: '1px solid rgba(255,255,255,0.48)',
      borderRadius: 'var(--radius-16)', padding: '10px 12px',
      minWidth: 244, boxShadow: 'var(--shadow-4)',
      backdropFilter: 'blur(18px)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        <img
          src={imageSrc}
          alt=""
          style={{
            width: 46,
            height: 46,
            borderRadius: '50%',
            objectFit: 'cover',
            objectPosition: 'center 24%',
            background: 'var(--color-bg-subtle)',
            border: '1px solid var(--color-border-faint)',
            flexShrink: 0,
          }}
        />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ color: '#171719', fontWeight: 700, fontSize: 13 }}>{name}</div>
          <div style={{ color: 'rgba(23,23,25,0.58)', fontSize: 11, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{meta}</div>
        </div>
        <span style={{ background: choice === 'A' ? 'var(--color-status-positive)' : 'var(--color-primary)', color: choice === 'A' ? '#fff' : '#08090a', fontWeight: 700, fontSize: 11, padding: '2px 9px', borderRadius: 'var(--radius-6)' }}>
          {choice}
        </span>
      </div>
    </div>
  )
}

function HeroSection() {
  const isMobile = useIsMobile()
  const heroSceneHeight = isMobile ? 360 : 620
  return (
    <section style={{ minHeight: isMobile ? 'auto' : '100vh', position: 'relative', display: 'flex', alignItems: 'stretch', background: 'var(--color-bg)', overflow: 'hidden' }}>
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: isMobile ? 'auto' : 0,
          right: 0,
          bottom: 0,
          left: isMobile ? 0 : '36%',
          height: isMobile ? heroSceneHeight : 'auto',
          minHeight: isMobile ? heroSceneHeight : undefined,
          background: 'rgb(20,25,30)',
          zIndex: 0,
        }}
      >
        <Suspense fallback={<div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ color: 'var(--color-primary)', fontSize: 13 }}>Loading...</span></div>}>
          <HeroScene />
        </Suspense>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background: isMobile
              ? 'linear-gradient(180deg, var(--color-bg) 0%, rgba(20,25,30,0.12) 22%, rgba(20,25,30,0) 58%)'
              : 'linear-gradient(90deg, var(--color-bg) 0%, rgba(8,9,10,0.88) 18%, rgba(8,9,10,0.22) 36%, rgba(8,9,10,0) 56%)',
          }}
        />
      </div>

      <div style={{ position: 'relative', zIndex: 1, padding: isMobile ? `96px 16px ${heroSceneHeight + 48}px` : '120px clamp(24px, 5vw, 88px) 84px', width: '100%', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(420px, 560px) minmax(0, 1fr)', gap: isMobile ? 36 : 56, alignItems: 'center' }}>
        <div style={{ maxWidth: 560 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'var(--color-primary-bg)', borderRadius: 'var(--radius-pill)', padding: '5px 13px', marginBottom: 32 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-primary)' }} />
            <span style={{ color: 'var(--color-primary)', fontSize: 12, fontWeight: 600 }}>NVIDIA Nemotron 데이터 기반</span>
          </div>

          <h1 style={{ margin: 0, lineHeight: 1.1, letterSpacing: '-0.025em', fontFamily: 'var(--font-display)' }}>
            <span style={{ display: 'block', fontSize: isMobile ? 40 : 60, fontWeight: 700, color: 'var(--color-fg-strong)' }}>100만 한국인의</span>
            <span style={{ display: 'block', fontSize: isMobile ? 40 : 60, fontWeight: 700, color: 'var(--color-primary)' }}>목소리로</span>
            <span style={{ display: 'block', fontSize: isMobile ? 40 : 60, fontWeight: 700, color: 'var(--color-fg-strong)' }}>시장을 검증</span>
          </h1>

          <p style={{ marginTop: 28, fontSize: 17, lineHeight: 1.7, color: 'var(--color-fg-muted)', maxWidth: 440 }}>
            전통 시장조사의 비용과 시간 없이, AI가 <strong style={{ color: 'var(--color-fg)', fontWeight: 600 }}>1,000,000명의 한국인 페르소나</strong>로 당신의 제품·마케팅 전략을 <strong style={{ color: 'var(--color-fg)', fontWeight: 600 }}>수분 만에</strong> 검증합니다.
          </p>

          <div style={{ display: 'flex', gap: 12, marginTop: 36, flexWrap: 'wrap' }}>
            <button onClick={() => { window.location.hash = 'app' }} style={{ background: 'var(--color-primary)', color: 'var(--color-fg-on-primary)', border: 'none', borderRadius: 'var(--radius-pill)', padding: '14px 26px', fontSize: 15, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, transition: `background var(--duration-1)` }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--color-primary-hover)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--color-primary)' }}>
              <Play size={16} weight="fill" /> 무료 데모 시작하기
            </button>
            <button style={{ background: 'transparent', color: 'var(--color-fg)', border: '1px solid var(--color-border-strong)', borderRadius: 'var(--radius-pill)', padding: '14px 26px', fontSize: 15, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7 }}
              onMouseEnter={e => ((e.currentTarget as HTMLElement).style.borderColor = 'var(--color-fg-muted)')}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.borderColor = 'var(--color-border-strong)')}>
              영업팀 문의 <CaretRight size={16} weight="bold" />
            </button>
          </div>

          <div style={{ marginTop: 28, display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
            {['신용카드 불필요', '5회 무료 시뮬레이션', '즉시 시작 가능'].map(item => (
              <span key={item} style={{ color: 'rgba(255,255,255,0.82)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 5 }}>
                <CheckCircle size={13} weight="fill" color="var(--color-status-positive)" /> {item}
              </span>
            ))}
          </div>
        </div>

        <div style={{ position: 'relative', height: isMobile ? 0 : 'min(62vh, 620px)', minHeight: isMobile ? 0 : 520, minWidth: 0 }}>
          {!isMobile && (
            <>
              <PersonaCard style={{ position: 'absolute', top: '10%', left: '2%' }} name="김지수" meta="35세 · 서울 강남 · 마케팅 팀장" choice="A" delay={0} imageSrc="/persona/image.png" />
              <PersonaCard style={{ position: 'absolute', bottom: '14%', right: '4%' }} name="박민준" meta="28세 · 경기 성남 · 개발자" choice="B" delay={0.3} imageSrc="/persona/image2.png" />
              <PersonaCard style={{ position: 'absolute', top: '50%', left: '-6%', transform: 'translateY(-50%)' }} name="이현아" meta="42세 · 부산 해운대 · 자영업" choice="A" delay={0.6} imageSrc="/landing/portraits/portrait-21.png" />
            </>
          )}
        </div>
      </div>
    </section>
  )
}

/* ─── LOGO STRIP ─── */
function LogoStripSection() {
  const isMobile = useIsMobile()
  const partners = [
    { name: 'NVIDIA', sub: 'Nemotron 페르소나 데이터', logo: '/landing/logos/nvidia.svg', width: 124 },
    { name: '통계청', sub: '인구통계 검증 기반', logo: '/landing/logos/statistics-korea.svg', width: 138 },
    { name: '한국갤럽', sub: '조사방법론 참조', logo: '/landing/logos/gallup-korea.png', width: 132 },
    { name: 'KOTRA', sub: '시장·산업 데이터', logo: '/landing/logos/kotra.png', width: 116 },
    { name: 'KDI', sub: '경제연구원 기반', logo: '/landing/logos/kdi.png', width: 88 },
  ]
  return (
    <section style={{ padding: '52px 24px', background: 'var(--color-bg-alt)', borderTop: '1px solid var(--color-border-faint)', borderBottom: '1px solid var(--color-border-faint)' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-fg-subtle)', letterSpacing: '0.08em', textTransform: 'uppercase', textAlign: 'center', marginBottom: 36 }}>
          신뢰할 수 있는 데이터 파트너
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(5, minmax(0, 1fr))', gap: 14 }}>
          {partners.map(p => (
            <div key={p.name} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
              padding: '22px 14px',
              background: '#fff',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 'var(--radius-12)',
            }}>
              <div style={{ height: 40, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <img src={p.logo} alt={`${p.name} 로고`} style={{ width: p.width, maxWidth: '100%', maxHeight: 34, objectFit: 'contain', display: 'block' }} />
              </div>
              <span style={{ fontSize: 10, color: 'rgba(23,23,25,0.58)', letterSpacing: '0.01em', textAlign: 'center', lineHeight: 1.4 }}>{p.sub}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ─── STATS ─── */
function StatsSection() {
  const isMobile = useIsMobile()
  const stats = [
    { value: 1000000, suffix: '+', label: '한국인 페르소나', icon: <Users size={24} weight="duotone" color="var(--color-primary)" /> },
    { value: 9, suffix: '가지', label: '시뮬레이션 유형', icon: <Stack size={24} weight="duotone" color="var(--color-primary)" /> },
    { value: 10000, suffix: '원', label: '시뮬레이션당 (최대)', icon: <CurrencyDollar size={24} weight="duotone" color="var(--color-status-positive)" /> },
    { value: 5, suffix: '분', label: '이내 결과 확인', icon: <Clock size={24} weight="duotone" color="var(--color-accent-teal)" /> },
  ]
  return (
    <section style={{ background: 'var(--color-bg)', borderTop: '1px solid var(--color-border)', borderBottom: '1px solid var(--color-border)', padding: '52px 24px' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))', gap: isMobile ? 20 : 24 }}>
        {stats.map(s => (
          <div key={s.label} style={{ textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>{s.icon}</div>
            <div style={{ fontSize: 38, fontWeight: 800, color: 'var(--color-fg-strong)', letterSpacing: '-0.027em', lineHeight: 1 }}>
              <AnimatedCounter end={s.value} suffix={s.suffix} />
            </div>
            <div style={{ color: 'var(--color-fg-subtle)', fontSize: 13, marginTop: 6, fontWeight: 500 }}>{s.label}</div>
          </div>
        ))}
      </div>
    </section>
  )
}

/* ─── PAIN ─── */
function PainSection() {
  const { ref, inView } = useInView()
  const isMobile = useIsMobile()
  const pains = [
    { icon: <CurrencyDollar size={28} weight="duotone" color="var(--color-status-destructive)" />, title: '비용이 너무 비쌉니다', highlight: '₩50M~500M', desc: '전통 시장조사는 기획·설계·현장·분석까지 5,000만~5억 원이 소요됩니다. 중소기업은 엄두도 못 내고, 대기업도 신중히 고르는 이유입니다.' },
    { icon: <Clock size={28} weight="duotone" color="var(--color-status-cautionary)" />, title: '너무 오래 걸립니다', highlight: '3~6개월', desc: '설문 설계부터 데이터 수집, 분석, 보고서 작성까지 평균 3~6개월. 그 사이 시장은 변하고, 경쟁사는 먼저 출시합니다.' },
    { icon: <Target size={28} weight="duotone" color="var(--color-primary)" />, title: '샘플이 너무 적습니다', highlight: '1,000~3,000명', desc: '1,000~3,000명의 응답으로 5,100만 명의 다양한 한국인을 대변할 수 있을까요? 오차 범위와 신뢰도의 한계가 있습니다.' },
  ]
  return (
    <section style={{ padding: '120px 24px', background: 'var(--color-bg)' }}>
      <div ref={ref} style={{ maxWidth: 1200, margin: '0 auto' }}>
        <SectionHeader en="Problem Recognition" ko={<>기존 시장조사가<br />망가진 이유</>} />
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 24 }}>
          {pains.map((p, i) => (
            <div key={p.title} style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-20)', padding: 32, opacity: inView ? 1 : 0, transform: inView ? 'translateY(0)' : 'translateY(24px)', transition: `opacity 0.6s ease ${i * 0.12}s, transform 0.6s ease ${i * 0.12}s` }}>
              <div style={{ marginBottom: 20 }}>{p.icon}</div>
              <div style={{ fontSize: 38, fontWeight: 800, color: 'var(--color-fg-muted)', marginBottom: 12, letterSpacing: '-0.022em', lineHeight: 1 }}>{p.highlight}</div>
              <h3 style={{ fontSize: 19, fontWeight: 700, color: 'var(--color-fg-strong)', margin: '0 0 10px' }}>{p.title}</h3>
              <p style={{ color: 'var(--color-fg-subtle)', fontSize: 14, lineHeight: 1.7, margin: 0 }}>{p.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ─── SOLUTION ─── */
function SolutionSection() {
  const { ref, inView } = useInView()
  const isMobile = useIsMobile()
  const solutions = [
    { icon: <Lightning size={24} weight="duotone" color="var(--color-status-positive)" />, iconBg: 'var(--color-status-positive-bg)', title: '수분 만에 결과', desc: 'AI가 100만 페르소나를 동시에 시뮬레이션합니다. 커피 한 잔 마시는 동안 결과가 나옵니다.' },
    { icon: <CurrencyDollar size={24} weight="duotone" color="var(--color-primary)" />, iconBg: 'var(--color-primary-bg)', title: '수천 원/회', desc: '시뮬레이션당 1,000~10,000원. 전통 조사 대비 1/100,000 비용으로 더 많은 인사이트를.' },
    { icon: <Users size={24} weight="duotone" color="var(--color-accent-violet)" />, iconBg: 'var(--color-accent-violet-bg)', title: '100만 한국인', desc: 'NVIDIA Nemotron-Personas-Korea. 26개 필드로 구성된 현실적인 한국인 페르소나 100만 명.' },
  ]
  return (
    <section style={{ padding: '120px 24px', background: 'var(--color-bg-alt)' }}>
      <div ref={ref} style={{ maxWidth: 1200, margin: '0 auto' }}>
        <SectionHeader en="Arabesque Solution" ko={<>모든 것을<br />바꿉니다</>} />
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 24 }}>
          {solutions.map((s, i) => (
            <div key={s.title} style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-20)', padding: 36, opacity: inView ? 1 : 0, transform: inView ? 'translateY(0)' : 'translateY(24px)', transition: `opacity 0.6s ease ${i * 0.12}s, transform 0.6s ease ${i * 0.12}s` }}>
              <div style={{ width: 50, height: 50, borderRadius: 'var(--radius-12)', background: s.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
                {s.icon}
              </div>
              <h3 style={{ fontSize: 19, fontWeight: 700, color: 'var(--color-fg-strong)', margin: '0 0 10px' }}>{s.title}</h3>
              <p style={{ color: 'var(--color-fg-subtle)', fontSize: 14, lineHeight: 1.7, margin: 0 }}>{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ─── FEATURES ─── */
type StarCount = 2 | 3 | 4 | 5

function FeaturesSection() {
  const { ref, inView } = useInView()
  const isMobile = useIsMobile()
  const features: { icon: React.ReactNode; miniSvg: React.ReactNode; name: string; desc: string; stars: StarCount; tag: string }[] = [
    { icon: <ChatText size={20} weight="duotone" />, miniSvg: <MiniChartAB />, name: 'Creative Testing', desc: '어떤 광고 문구가 최선인가?', stars: 5, tag: '베스트' },
    { icon: <TrendUp size={20} weight="duotone" />, miniSvg: <MiniCurve />, name: 'Price Optimization', desc: '최적 가격대는 얼마인가?', stars: 5, tag: '베스트' },
    { icon: <ChartBar size={20} weight="duotone" />, miniSvg: <MiniTrendUp />, name: 'Product Launch', desc: '출시 전 시장 반응 예측', stars: 4, tag: '' },
    { icon: <Scales size={20} weight="duotone" />, miniSvg: <MiniScales />, name: 'Value Proposition', desc: '어떤 포지셔닝이 설득력 있나?', stars: 4, tag: '' },
    { icon: <ChartPie size={20} weight="duotone" />, miniSvg: <MiniPie />, name: 'Market Segmentation', desc: '어떤 타겟 세그먼트가 존재하나?', stars: 3, tag: '' },
    { icon: <Target size={20} weight="duotone" />, miniSvg: <MiniQuadrant />, name: 'Competitive Positioning', desc: '경쟁사 대비 우리 포지션은?', stars: 3, tag: '' },
    { icon: <Eye size={20} weight="duotone" />, miniSvg: <MiniGauge />, name: 'Brand Perception', desc: '브랜드 인지도·이미지 추적', stars: 2, tag: '' },
    { icon: <TrendDown size={20} weight="duotone" />, miniSvg: <MiniTrendDown />, name: 'Churn Prediction', desc: '이탈 위험 고객 사전 파악', stars: 2, tag: '' },
    { icon: <Megaphone size={20} weight="duotone" />, miniSvg: <MiniRadial />, name: 'Campaign Strategy', desc: '최적 채널·메시지 조합', stars: 2, tag: '지원' },
  ]

  return (
    <section style={{ padding: '120px 24px', background: 'var(--color-bg)' }}>
      <div ref={ref} style={{ maxWidth: 1200, margin: '0 auto' }}>
        <SectionHeader en="9 Simulation Types" ko={<>9가지 시뮬레이션으로<br />모든 것을 검증하세요</>} />
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 14 }}>
          {features.map((feat, i) => (
            <div key={feat.name} style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-16)', padding: '22px', opacity: inView ? 1 : 0, transform: inView ? 'translateY(0)' : 'translateY(20px)', transition: `opacity 0.5s ease ${i * 0.07}s, transform 0.5s ease ${i * 0.07}s, border-color var(--duration-1), background var(--duration-1)`, cursor: 'pointer', position: 'relative', overflow: 'hidden' }}
              onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'var(--color-primary-bg)'; el.style.borderColor = 'var(--color-primary)' }}
              onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'var(--color-bg)'; el.style.borderColor = 'var(--color-border)' }}>

              {/* mini SVG decoration — top right */}
              <div style={{ position: 'absolute', top: 16, right: 16, color: 'var(--color-primary)', opacity: 0.22, pointerEvents: 'none' }}>
                {feat.miniSvg}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                <div style={{ width: 38, height: 38, borderRadius: 'var(--radius-8)', background: 'var(--color-primary-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-primary)' }}>
                  {feat.icon}
                </div>
                {feat.tag && (
                  <span style={{ fontSize: 11, fontWeight: 600, background: feat.tag === '베스트' ? 'rgba(0,191,64,0.1)' : 'var(--color-bg-subtle)', color: feat.tag === '베스트' ? 'var(--color-status-positive)' : 'var(--color-fg-subtle)', border: `1px solid ${feat.tag === '베스트' ? 'rgba(0,191,64,0.28)' : 'var(--color-border)'}`, borderRadius: 'var(--radius-pill)', padding: '2px 9px' }}>
                    {feat.tag}
                  </span>
                )}
              </div>

              <div style={{ fontWeight: 700, color: 'var(--color-fg-strong)', fontSize: 14, marginBottom: 5 }}>{feat.name}</div>
              <div style={{ color: 'var(--color-fg-subtle)', fontSize: 13, marginBottom: 14, lineHeight: 1.5 }}>{feat.desc}</div>
              <div style={{ display: 'flex', gap: 3 }}>
                {Array.from({ length: 5 }).map((_, si) => (
                  <Star key={si} size={12} weight={si < feat.stars ? 'fill' : 'regular'} color={si < feat.stars ? '#f59e0b' : 'var(--color-border)'} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ─── PRODUCT SCREENSHOT ─── */
function ProductScreenshotSection() {
  const isMobile = useIsMobile()
  return (
    <section style={{ padding: '120px 24px', background: 'var(--color-bg-alt)' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <SectionHeader en="Product in Action" ko={<>결과를 한눈에</>} />

        {/* 브라우저 목업 프레임 */}
        <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-16)', overflow: 'hidden', boxShadow: 'var(--shadow-4)' }}>
          {/* 브라우저 크롬 */}
          <div style={{ background: 'var(--color-bg-subtle)', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--color-border-faint)' }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {['#FF5F57','#FFBD2E','#28C840'].map(c => <div key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c }} />)}
            </div>
            <div style={{ flex: 1, maxWidth: 280, margin: '0 auto', background: 'var(--color-bg)', border: '1px solid var(--color-border-faint)', borderRadius: 'var(--radius-pill)', padding: '4px 12px', fontSize: 11, color: 'var(--color-fg-faint)', textAlign: 'center' }}>
              arabesque.cc/results
            </div>
          </div>

          <div style={{ aspectRatio: '16/9', background: 'var(--color-bg)', padding: isMobile ? 16 : 28, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.1fr 0.9fr', gap: isMobile ? 14 : 20 }}>
            <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'start' }}>
                <div>
                  <div style={{ color: 'var(--color-primary)', fontSize: 12, fontWeight: 800, textTransform: 'uppercase' }}>Price Optimization</div>
                  <div style={{ marginTop: 6, color: 'var(--color-fg-strong)', fontSize: isMobile ? 22 : 30, fontWeight: 800, lineHeight: 1.15 }}>39,000원 조건부 우세</div>
                </div>
                <div style={{ color: 'var(--color-fg-subtle)', fontSize: 12, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-pill)', padding: '5px 10px' }}>n=200</div>
              </div>
              {[
                ['29,000원', 31, '#00A878'],
                ['39,000원', 46, '#0066FF'],
                ['49,000원', 23, '#7C3AED'],
              ].map(([label, pct, color]) => (
                <div key={label} style={{ display: 'grid', gap: 7 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-fg-muted)', fontSize: 13, fontWeight: 700 }}>
                    <span>{label}</span>
                    <span>{pct}%</span>
                  </div>
                  <div style={{ height: 9, borderRadius: 5, background: 'var(--color-bg-subtle)', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: color }} />
                  </div>
                </div>
              ))}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, marginTop: 4 }}>
                {['의사결정 보조 가능', '구조화 성공 97%', '세그먼트 차이 확인'].map((label) => (
                  <div key={label} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-8)', padding: 10, color: 'var(--color-fg-muted)', fontSize: 12, lineHeight: 1.35 }}>
                    {label}
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
              <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-8)', padding: 14 }}>
                <div style={{ color: 'var(--color-fg-strong)', fontSize: 13, fontWeight: 800, marginBottom: 8 }}>핵심 결론</div>
                <div style={{ color: 'var(--color-fg-muted)', fontSize: 13, lineHeight: 1.6 }}>39,000원이 선호와 수익성의 균형점입니다. 49,000원은 기능 신뢰 근거가 추가될 때 재검토할 수 있습니다.</div>
              </div>
              <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-8)', padding: 14 }}>
                <div style={{ color: 'var(--color-fg-strong)', fontSize: 13, fontWeight: 800, marginBottom: 8 }}>추천 행동</div>
                <ol style={{ margin: 0, paddingLeft: 18, color: 'var(--color-fg-muted)', fontSize: 12, lineHeight: 1.7 }}>
                  <li>39,000원을 1차 가격 후보로 유지</li>
                  <li>고가 저항 이유를 상세페이지 문구로 보완</li>
                </ol>
              </div>
              {!isMobile && (
                <div style={{ color: 'var(--color-fg-subtle)', fontSize: 12, lineHeight: 1.5 }}>
                  페르소나 응답, 세그먼트 반응, 품질 검수 상태를 같은 화면에서 확인합니다.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 스크린샷 아래 — 주요 결과 구성 요소 설명 */}
        <div style={{ marginTop: 56, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, minmax(0, 1fr))', gap: 24 }}>
          {[
            {
              icon: <ChartBar size={20} weight="duotone" color="var(--color-primary)" />,
              label: '선호도 순위',
              desc: 'A / B / C 크리에이티브별 선택 비율과 통계적 유의성을 즉시 확인합니다.',
            },
            {
              icon: <ChartPie size={20} weight="duotone" color="var(--color-accent-violet)" />,
              label: '세그먼트 분석',
              desc: '연령·지역·직군·성별로 교차한 응답 분포 — 어느 집단이 선택했는지 한눈에.',
            },
            {
              icon: <Stack size={20} weight="duotone" color="var(--color-accent-teal)" />,
              label: '선택 이유 TOP 10',
              desc: '자연어 응답을 자동 클러스터링해 핵심 선택 이유를 순위로 추출합니다.',
            },
            {
              icon: <Users size={20} weight="duotone" color="var(--color-status-positive)" />,
              label: '페르소나 코멘트',
              desc: '실제 페르소나의 응답 원문 — 정성 조사 수준의 생생한 인사이트를 제공합니다.',
            },
          ].map(item => (
            <div key={item.label} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-8)', background: 'var(--color-bg)', border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {item.icon}
              </div>
              <div style={{ fontWeight: 600, color: 'var(--color-fg-strong)', fontSize: 14 }}>{item.label}</div>
              <div style={{ color: 'var(--color-fg-subtle)', fontSize: 13, lineHeight: 1.65 }}>{item.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ─── HOW IT WORKS ─── */
function HowItWorksSection() {
  const { ref, inView } = useInView()
  const isMobile = useIsMobile()
  const steps = [
    { num: '01', title: '시뮬레이션 선택', desc: '9가지 시뮬레이션 유형 중 목적에 맞는 것을 선택하세요.' },
    { num: '02', title: '조건 설정', desc: '나이, 지역, 직군, 성별 등 타겟 조건을 직접 설정합니다.' },
    { num: '03', title: 'AI 분석', desc: 'AI가 100만 페르소나 중 조건에 맞는 페르소나를 샘플링해 응답을 시뮬레이션합니다.' },
    { num: '04', title: '인사이트 확인', desc: '시각화된 결과와 페르소나별 응답으로 명확한 인사이트를 얻습니다.' },
  ]
  return (
    <section style={{ padding: '120px 24px', background: 'var(--color-bg)' }}>
      <div ref={ref} style={{ maxWidth: 1200, margin: '0 auto' }}>
        <SectionHeader en="How It Works" ko="어떻게 작동하나요?" />
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, minmax(0, 1fr))', gap: isMobile ? 28 : 0, position: 'relative' }}>
          {!isMobile && <div style={{ position: 'absolute', top: 40, left: '12.5%', right: '12.5%', height: 1, background: 'var(--color-primary)', opacity: inView ? 0.2 : 0, transition: 'opacity 0.8s ease 0.4s' }} />}
          {steps.map((step, i) => (
            <div key={step.num} style={{ textAlign: 'center', padding: '0 20px', opacity: inView ? 1 : 0, transform: inView ? 'translateY(0)' : 'translateY(20px)', transition: `opacity 0.6s ease ${i * 0.15}s, transform 0.6s ease ${i * 0.15}s` }}>
              <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'var(--color-bg)', border: '2px solid var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 28px', boxShadow: 'var(--shadow-1)' }}>
                <span style={{ color: 'var(--color-primary)', fontSize: 18, fontWeight: 800, fontFamily: 'var(--font-mono)' }}>{step.num}</span>
              </div>
              <h3 style={{ color: 'var(--color-fg-strong)', fontSize: 16, fontWeight: 700, margin: '0 0 10px' }}>{step.title}</h3>
              <p style={{ color: 'var(--color-fg-subtle)', fontSize: 13, lineHeight: 1.65, margin: 0 }}>{step.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ─── COMPARISON ─── */
function ComparisonSection() {
  const { ref, inView } = useInView()
  const isMobile = useIsMobile()
  type CellValue = string | boolean
  const rows: { label: string; koresim: CellValue; traditional: CellValue; foreign: CellValue }[] = [
    { label: '비용/회', koresim: '₩1,000~10,000', traditional: '₩50M~500M', foreign: '수억 원' },
    { label: '소요 기간', koresim: '수분', traditional: '3~6개월', foreign: '미공개' },
    { label: '샘플 크기', koresim: '최대 100만', traditional: '1,000~3,000명', foreign: '미국 데이터' },
    { label: '반복 가능', koresim: true, traditional: false, foreign: false },
    { label: '한국 문화 이해', koresim: true, traditional: true, foreign: false },
    { label: '자체 서비스', koresim: true, traditional: false, foreign: false },
    { label: '즉시 시작', koresim: true, traditional: false, foreign: false },
  ]
  function CellDisplay({ value }: { value: CellValue }) {
    if (typeof value === 'boolean') return value
      ? <CheckCircle size={19} weight="fill" color="var(--color-status-positive)" />
      : <XCircle size={19} weight="fill" color="var(--color-status-destructive)" style={{ opacity: 0.4 }} />
    return <span>{value}</span>
  }
  return (
    <section style={{ padding: '120px 24px', background: 'var(--color-bg-alt)' }}>
      <div ref={ref} style={{ maxWidth: 900, margin: '0 auto', opacity: inView ? 1 : 0, transition: 'opacity 0.7s ease' }}>
        <SectionHeader en="Clear Comparison" ko={<>명확한 비교</>} />
        <div style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-20)', overflowX: isMobile ? 'auto' : 'hidden', overflowY: 'hidden' }}>
          <table style={{ width: '100%', minWidth: isMobile ? 640 : undefined, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                <th style={{ padding: '18px 24px', textAlign: 'left', color: 'var(--color-fg-subtle)', fontSize: 13, fontWeight: 500 }}>비교 항목</th>
                <th style={{ padding: '18px 24px', textAlign: 'center', color: 'var(--color-primary)', fontSize: 13, fontWeight: 700, background: 'var(--color-primary-bg)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}><Sparkle size={14} weight="fill" /> Arabesque</span>
                </th>
                <th style={{ padding: '18px 24px', textAlign: 'center', color: 'var(--color-fg-subtle)', fontSize: 13, fontWeight: 500 }}>전통 시장조사</th>
                <th style={{ padding: '18px 24px', textAlign: 'center', color: 'var(--color-fg-subtle)', fontSize: 13, fontWeight: 500 }}>해외 AI (Aaru)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.label} style={{ borderBottom: i < rows.length - 1 ? '1px solid var(--color-border-faint)' : 'none' }}>
                  <td style={{ padding: '16px 24px', color: 'var(--color-fg-muted)', fontSize: 13 }}>{row.label}</td>
                  <td style={{ padding: '16px 24px', textAlign: 'center', background: 'var(--color-primary-bg)', color: 'var(--color-fg-strong)', fontSize: 13, fontWeight: 600 }}><CellDisplay value={row.koresim} /></td>
                  <td style={{ padding: '16px 24px', textAlign: 'center', color: 'var(--color-fg-subtle)', fontSize: 13 }}><CellDisplay value={row.traditional} /></td>
                  <td style={{ padding: '16px 24px', textAlign: 'center', color: 'var(--color-fg-subtle)', fontSize: 13 }}><CellDisplay value={row.foreign} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

/* ─── CTA ─── */
function CtaSection() {
  const isMobile = useIsMobile()
  return (
    <section style={{ padding: '120px 24px', background: 'rgb(20,25,30)', position: 'relative', overflow: 'hidden' }}>
      <div style={{ maxWidth: 640, margin: '0 auto', textAlign: 'center', position: 'relative' }}>
        <div style={{ marginBottom: 14, fontSize: 12, fontWeight: 600, color: 'var(--color-primary)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Get Started</div>
        <h2 style={{ fontSize: isMobile ? 36 : 48, fontWeight: 700, color: 'white', margin: 0, letterSpacing: '-0.025em', lineHeight: 1.15, fontFamily: 'var(--font-display)' }}>
          지금 바로<br /><span style={{ color: 'var(--color-primary)' }}>시작하세요</span>
        </h2>
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 17, lineHeight: 1.7, marginTop: 24, marginBottom: 40 }}>
          5번의 무료 시뮬레이션으로 Arabesque를 경험해보세요.<br />신용카드가 필요 없습니다.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => { window.location.hash = 'app' }} style={{ background: 'rgba(255,255,255,0.92)', color: '#08090a', border: 'none', borderRadius: 'var(--radius-pill)', padding: '15px 30px', fontSize: 15, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 9 }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)')}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.transform = 'translateY(0)')}>
            무료 데모 시작하기 <ArrowRight size={18} weight="bold" />
          </button>
          <button style={{ background: 'transparent', color: 'rgba(255,255,255,0.75)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 'var(--radius-pill)', padding: '15px 30px', fontSize: 15, fontWeight: 500, cursor: 'pointer' }}>
            영업팀에 문의하기
          </button>
        </div>
        <div style={{ marginTop: 32, color: 'rgba(255,255,255,0.25)', fontSize: 13 }}>
          문의: <a href="mailto:qudtnrh@gmail.com" style={{ color: 'rgba(255,255,255,0.72)', textDecoration: 'none' }}>qudtnrh@gmail.com</a>
        </div>
      </div>
    </section>
  )
}

/* ─── FLICKERING GRID BACKGROUND ─── */
function FlickeringGridBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const SQUARE = 4
    const GAP = 7
    let W = 0, H = 0, cols = 0, rows = 0
    let opacities: Float32Array = new Float32Array(0)
    let animId: number

    const resize = () => {
      W = canvas.offsetWidth
      H = canvas.offsetHeight
      canvas.width = W
      canvas.height = H
      cols = Math.ceil(W / (SQUARE + GAP))
      rows = Math.ceil(H / (SQUARE + GAP))
      opacities = new Float32Array(cols * rows).map(() => Math.random() * 0.18)
    }

    resize()
    window.addEventListener('resize', resize)

    const draw = () => {
      ctx.clearRect(0, 0, W, H)
      ctx.fillStyle = '#e4f222'
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const idx = r * cols + c
          if (Math.random() < 0.025) opacities[idx] = Math.random() * 0.18
          ctx.globalAlpha = opacities[idx]
          ctx.fillRect(c * (SQUARE + GAP), r * (SQUARE + GAP), SQUARE, SQUARE)
        }
      }
      animId = requestAnimationFrame(draw)
    }

    draw()
    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
    />
  )
}

/* ─── FOOTER ─── */
function Footer() {
  const isMobile = useIsMobile()
  return (
    <footer style={{ background: 'var(--color-bg)', borderTop: '1px solid var(--color-border)', padding: '56px 24px', position: 'relative', overflow: 'hidden', minHeight: 160 }}>
      <FlickeringGridBackground />
      <div style={{ maxWidth: 1200, margin: '0 auto', position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', flexDirection: isMobile ? 'column' : 'row', flexWrap: 'wrap', gap: 20 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 7 }}>
            <img src="/organization/logo-a.png" alt="Arabesque 로고" style={{ width: 30, height: 30, objectFit: 'contain', display: 'block' }} />
            <span style={{ fontWeight: 700, color: 'var(--color-fg-strong)', fontSize: 15 }}>Arabesque</span>
          </div>
          <div style={{ color: 'var(--color-fg-subtle)', fontSize: 12 }}>
            powered by <a href="https://waterfall.run" style={{ color: 'var(--color-primary)', textDecoration: 'none' }}>waterfall.run</a>
          </div>
        </div>
        <div style={{ color: 'var(--color-fg-subtle)', fontSize: 12, textAlign: isMobile ? 'left' : 'right' }}>
          <div>NVIDIA Nemotron-Personas-Korea 기반</div>
          <div style={{ marginTop: 4 }}>© 2026 Arabesque. All rights reserved.</div>
        </div>
      </div>
    </footer>
  )
}

/* ─── EXPORT ─── */
export function LandingPage() {
  return (
    <div className="ks-landing-page" style={{ fontFamily: 'var(--font-sans)', background: 'var(--color-bg)', color: 'var(--color-fg)' }}>
      <Nav />
      <HeroSection />
      <LogoStripSection />
      <StatsSection />
      <PainSection />
      <SolutionSection />
      <FeaturesSection />
      <ProductScreenshotSection />
      <HowItWorksSection />
      <ComparisonSection />
      <CtaSection />
      <Footer />
    </div>
  )
}
