import type { ReactNode } from 'react'
import { AuthStatus } from '../components/AuthStatus'
import { BrandMark } from '../components/BrandMark'
import { OnboardingModal } from '../components/OnboardingModal'
import { ThemeToggle } from '../components/ThemeToggle'
import { useOnboardingGate } from '../hooks/useOnboardingGate'
import type { V2Stage } from './types'
import { navigateTo, stageHref, type V2Route } from './navigation'

type Props = {
  route: V2Route
  children: ReactNode
}

/** Loading keeps progress visible; connect is MCP setup outside first-run profile. */
function shouldGateOnboarding(route: V2Route): boolean {
  return route.page !== 'loading' && route.page !== 'connect'
}

const stages: { id: V2Stage; label: string }[] = [
  { id: 'projects', label: '프로젝트' },
  { id: 'type', label: '유형 선택' },
  { id: 'intake', label: '입력' },
  { id: 'results', label: '결과' },
]

function activeStage(route: V2Route): V2Stage {
  if (route.page === 'project' || route.page === 'connect') return 'projects'
  if (route.page === 'loading') return 'results'
  if (route.page === 'type' || route.page === 'intake' || route.page === 'results' || route.page === 'projects') {
    return route.page
  }
  return 'projects'
}

export function V2AppShell({ route, children }: Props) {
  const active = activeStage(route)
  const activeIndex = stages.findIndex((stage) => stage.id === active)
  const gateEnabled = shouldGateOnboarding(route)
  const { needsOnboarding, markCompleted } = useOnboardingGate(gateEnabled)

  return (
    <div className="minsim-shell">
      <a className="minsim-skip-link" href="#main-content">본문으로 건너뛰기</a>
      <header className="topnav">
        <div className="wrap spread">
          <a className="brand minsim-brand-button" href="/" aria-label="minsim 홈">
            <BrandMark />
            minsim
          </a>
          <nav className="row minsim-top-actions" aria-label="주요 메뉴">
            <a className="navlink" href="/">
              제품
            </a>
            <a className="navlink" href="/projects" aria-current={route.page === 'projects' ? 'page' : undefined}>
              프로젝트
            </a>
            <a className="navlink" href="/connect" aria-current={route.page === 'connect' ? 'page' : undefined}>
              MCP
            </a>
          </nav>
          <div className="minsim-header-utilities">
            <ThemeToggle />
            <AuthStatus compact />
          </div>
        </div>
      </header>
      <div className="minsim-flow-rail">
        <ol className="wrap row" aria-label="시뮬레이션 진행 단계">
          {stages.map((stage, index) => {
            const href = stageHref(stage.id, route)
            const isActive = index === activeIndex
            const isComplete = index < activeIndex
            const canNavigate = Boolean(href) && !isActive
            const className = [
              isComplete ? 'complete' : '',
              isActive ? 'active' : '',
              canNavigate ? 'is-clickable' : '',
              !href ? 'is-locked' : '',
            ]
              .filter(Boolean)
              .join(' ')

            return (
              <li
                className={className}
                aria-current={isActive ? 'step' : undefined}
                key={stage.id}
              >
                {canNavigate && href ? (
                  <button
                    type="button"
                    className="minsim-flow-step-button"
                    onClick={() => navigateTo(href)}
                    aria-label={`${index + 1}. ${stage.label} 단계로 이동`}
                  >
                    <b>{index + 1}</b>
                    <span>{stage.label}</span>
                  </button>
                ) : (
                  <span className="minsim-flow-step-static" aria-disabled={!href || isActive ? true : undefined}>
                    <b>{index + 1}</b>
                    <span>{stage.label}</span>
                  </span>
                )}
              </li>
            )
          })}
        </ol>
      </div>
      <main className="v2-main screen" id="main-content" aria-hidden={needsOnboarding || undefined}>
        {children}
      </main>
      <OnboardingModal open={needsOnboarding} onCompleted={markCompleted} />
    </div>
  )
}
