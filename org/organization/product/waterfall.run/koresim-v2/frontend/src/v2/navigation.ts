export type V2Route =
  | { page: 'landing' }
  | { page: 'projects' }
  | { page: 'project'; projectId: string }
  | { page: 'type'; projectId: string }
  | { page: 'intake'; projectId: string; simulationType?: string | null }
  | { page: 'loading'; projectId: string | null; runId: string | null }
  | { page: 'results'; runId: string | null; projectId: string | null }
  | { page: 'classic-app' }
  | { page: 'classic-results' }
  | { page: 'admin' }
  | { page: 'validation' }
  | { page: 'results-story'; storyId: string }

export function parseV2Route(
  pathname = window.location.pathname,
  search = window.location.search,
  hash = window.location.hash,
): V2Route {
  if (hash === '#app') {
    window.history.replaceState(null, '', '/app')
    return { page: 'projects' }
  }
  if (hash === '#results') {
    window.history.replaceState(null, '', '/results')
    const params = new URLSearchParams(search)
    return { page: 'results', runId: params.get('run_id'), projectId: params.get('project_id') }
  }

  const path = pathname.replace(/\/+$/, '') || '/'
  const params = new URLSearchParams(search)
  if (path === '/app' || path === '/projects') return { page: 'projects' }
  if (path === '/admin') return { page: 'admin' }
  if (path === '/validation') return { page: 'validation' }
  if (path === '/classic/app') return { page: 'classic-app' }
  if (path === '/classic/results') return { page: 'classic-results' }
  if (path === '/loading') return { page: 'loading', projectId: params.get('project_id'), runId: params.get('run_id') }
  if (path === '/results') return { page: 'results', runId: params.get('run_id'), projectId: params.get('project_id') }
  if (path.startsWith('/results/story/')) {
    return { page: 'results-story', storyId: decodeURIComponent(path.slice('/results/story/'.length)) }
  }

  const projectType = path.match(/^\/projects\/([^/]+)\/type$/)
  if (projectType) return { page: 'type', projectId: decodeURIComponent(projectType[1]) }

  const projectIntake = path.match(/^\/projects\/([^/]+)\/intake$/)
  if (projectIntake) {
    return {
      page: 'intake',
      projectId: decodeURIComponent(projectIntake[1]),
      simulationType: params.get('type'),
    }
  }

  const project = path.match(/^\/projects\/([^/]+)$/)
  if (project) return { page: 'project', projectId: decodeURIComponent(project[1]) }

  return { page: 'landing' }
}

export function navigateTo(path: string): void {
  window.history.pushState(null, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}
