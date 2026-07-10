import type { ReactNode } from 'react'
import { AuthStatus } from '../components/AuthStatus'
import type { V2Stage } from './types'
import type { V2Route } from './navigation'
import { navigateTo } from './navigation'

type Props = {
  route: V2Route
  children: ReactNode
}

const stages: { id: V2Stage; label: string }[] = [
  { id: 'projects', label: '프로젝트' },
  { id: 'type', label: '유형' },
  { id: 'intake', label: '입력' },
  { id: 'results', label: '결과' },
]

function activeStage(route: V2Route): V2Stage {
  if (route.page === 'project') return 'projects'
  if (route.page === 'loading') return 'results'
  if (route.page === 'type' || route.page === 'intake' || route.page === 'results' || route.page === 'projects') {
    return route.page
  }
  return 'projects'
}

export function V2AppShell({ route, children }: Props) {
  const active = activeStage(route)
  return (
    <div className="v2-shell">
      <header className="v2-topbar">
        <button className="v2-brand" type="button" onClick={() => navigateTo('/projects')}>
          KoreaSim V2
        </button>
        <nav className="v2-nav" aria-label="Primary">
          <button type="button" onClick={() => navigateTo('/projects')}>
            프로젝트
          </button>
          <button type="button" onClick={() => navigateTo('/classic/app')}>
            Classic
          </button>
        </nav>
        <AuthStatus compact />
      </header>
      <div className="v2-flow-rail">
        {stages.map((stage) => (
          <span className={stage.id === active ? 'active' : ''} key={stage.id}>
            {stage.label}
          </span>
        ))}
      </div>
      <main className="v2-main">{children}</main>
    </div>
  )
}
