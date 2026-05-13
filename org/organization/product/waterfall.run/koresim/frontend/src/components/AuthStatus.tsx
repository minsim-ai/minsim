import { SignIn, SignOut } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { getAuthSession, googleLogin, logout } from '../api/auth'
import type { AuthSessionResponse } from '../types/api'

export function AuthStatus({ compact = false }: { compact?: boolean }) {
  const [session, setSession] = useState<AuthSessionResponse | null>(null)

  useEffect(() => {
    let cancelled = false
    getAuthSession()
      .then((value) => {
        if (!cancelled) setSession(value)
      })
      .catch(() => {
        if (!cancelled) setSession(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (!session) return null

  if (session.authenticated && session.user) {
    return (
      <button className="ks-auth-button ks-auth-button--secondary" onClick={() => logout('/')} type="button">
        {!compact && <span className="ks-auth-user">{session.user.name ?? session.user.email}</span>}
        <SignOut size={15} weight="bold" />
      </button>
    )
  }

  if (!session.auth_enabled) {
    return compact ? null : <span className="ks-auth-muted">Public demo</span>
  }

  return (
    <button className="ks-auth-button" onClick={() => googleLogin('/app')} type="button">
      <SignIn size={15} weight="bold" />
      {!compact && <span>Google 로그인</span>}
    </button>
  )
}
