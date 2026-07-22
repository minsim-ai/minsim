import { useEffect, useState } from 'react'
import { getAuthSession, loginPageHref, safeAuthNext } from '../api/auth'
import { navigateTo } from '../v2/navigation'

/**
 * SPA soft-nav never hits FastAPI middleware. Gate protected UI here.
 * When auth is not required (or local-dev session summary is authenticated), allow through.
 */
export function useRequireAuth(enabled: boolean) {
  const [allowed, setAllowed] = useState(!enabled)

  useEffect(() => {
    if (!enabled) {
      setAllowed(true)
      return
    }
    let cancelled = false
    setAllowed(false)
    getAuthSession()
      .then((session) => {
        if (cancelled) return
        if (!session.auth_required || session.authenticated) {
          setAllowed(true)
          return
        }
        const next = safeAuthNext(`${window.location.pathname}${window.location.search}`, '/projects')
        navigateTo(loginPageHref(next))
      })
      .catch(() => {
        if (cancelled) return
        const next = safeAuthNext(`${window.location.pathname}${window.location.search}`, '/projects')
        navigateTo(loginPageHref(next))
      })
    return () => {
      cancelled = true
    }
  }, [enabled])

  return allowed
}
