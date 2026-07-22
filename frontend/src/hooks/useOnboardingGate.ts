import { useCallback, useEffect, useState } from 'react'
import { getAuthSession, getUserOnboarding } from '../api/auth'
import { recordAnalyticsEvent } from '../api/analytics'

type GateState = {
  loading: boolean
  needsOnboarding: boolean
  error: string | null
}

const INITIAL: GateState = { loading: true, needsOnboarding: false, error: null }

/**
 * First-login gate for V2 shell pages.
 * test/local_dev providers are completed=true on the server (bypassed).
 */
export function useOnboardingGate(enabled: boolean) {
  const [state, setState] = useState<GateState>(INITIAL)

  const refresh = useCallback(async () => {
    if (!enabled) {
      setState({ loading: false, needsOnboarding: false, error: null })
      return
    }
    setState((current) => ({ ...current, loading: true, error: null }))
    try {
      const session = await getAuthSession()
      if (!session.authenticated) {
        setState({ loading: false, needsOnboarding: false, error: null })
        return
      }
      const onboarding = await getUserOnboarding()
      const needsOnboarding = !onboarding.completed
      if (needsOnboarding) {
        void recordAnalyticsEvent({
          event_name: 'onboarding_shown',
          page: '/onboarding',
        }).catch(() => undefined)
      }
      setState({ loading: false, needsOnboarding, error: null })
    } catch (err) {
      // Fail open for API errors so a flaky onboarding endpoint never hard-locks the app.
      setState({
        loading: false,
        needsOnboarding: false,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }, [enabled])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const markCompleted = useCallback(() => {
    setState({ loading: false, needsOnboarding: false, error: null })
  }, [])

  return { ...state, refresh, markCompleted }
}
