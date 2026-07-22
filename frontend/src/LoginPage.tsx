import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { getAuthSession, googleLogin } from './api/auth'
import { GoogleMark } from './components/AuthStatus'
import { BrandMark } from './components/BrandMark'
import { ThemeToggle } from './components/ThemeToggle'
import { navigateTo } from './v2/navigation'

function safeNext(raw: string | null): string {
  if (!raw) return '/projects'
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/projects'
  if (raw.startsWith('/login')) return '/projects'
  return raw
}

/**
 * Google-only login surface.
 * No email/password form, no GitHub — production identity is Google OAuth only.
 */
export function LoginPage() {
  const next = useMemo(() => {
    const params = new URLSearchParams(window.location.search)
    return safeNext(params.get('next'))
  }, [])
  const [checking, setChecking] = useState(true)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getAuthSession()
      .then((session) => {
        if (cancelled) return
        if (session.authenticated) {
          navigateTo(next)
          return
        }
        if (!session.auth_enabled) {
          // Public/demo mode without Google config — send user onward.
          navigateTo(next)
          return
        }
        setChecking(false)
      })
      .catch(() => {
        if (!cancelled) setChecking(false)
      })
    return () => {
      cancelled = true
    }
  }, [next])

  const startGoogle = () => {
    setStarting(true)
    setError(null)
    try {
      googleLogin(next)
    } catch (err) {
      setStarting(false)
      setError(err instanceof Error ? err.message : '로그인을 시작하지 못했어요.')
    }
  }

  return (
    <div className="minsim-shell minsim-login">
      <header className="topnav topnav--overlay">
        <div className="wrap spread">
          <a className="brand minsim-brand-button" href="/" aria-label="minsim 홈">
            <BrandMark />
            minsim
          </a>
          <div className="minsim-header-utilities">
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="minsim-login-main" id="main-content">
        <section className="minsim-login-panel" aria-label="minsim 비주얼">
          <img
            className="minsim-login-visual"
            src="/landing/login.png"
            alt=""
            width={467}
            height={640}
            decoding="async"
          />
        </section>

        <section className="minsim-login-card card" aria-labelledby="login-title">
          <div className="minsim-login-card-head">
            <h2 id="login-title">로그인</h2>
            <p className="muted">Google 계정 하나로 이어갈 수 있어요.</p>
          </div>

          {checking ? (
            <p className="muted minsim-login-status" role="status">
              로그인 상태를 확인하고 있어요…
            </p>
          ) : (
            <>
              <button
                type="button"
                className="minsim-login-google"
                onClick={startGoogle}
                disabled={starting}
              >
                <GoogleMark size={20} />
                <span>{starting ? 'Google로 이동 중…' : 'Google로 계속하기'}</span>
              </button>
              {error && (
                <p className="minsim-login-error" role="alert">
                  {error}
                </p>
              )}
            </>
          )}

          <a className="minsim-login-back" href="/">
            <ArrowLeft size={14} aria-hidden="true" />
            홈으로 돌아가기
          </a>
        </section>
      </main>
    </div>
  )
}
