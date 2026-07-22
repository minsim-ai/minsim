import { Check, Copy, Plug } from 'lucide-react'
import { useEffect, useState } from 'react'
import { getAuthSession, googleLogin } from '../api/auth'
import { GoogleMark } from '../components/AuthStatus'
import { getMcpConnect, revokeMcpGrant } from '../api/mcpConnect'
import type { AuthSessionResponse, McpConnectResponse } from '../types/api'

export function McpConnectPage() {
  const [session, setSession] = useState<AuthSessionResponse | null>(null)
  const [connect, setConnect] = useState<McpConnectResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState<string | null>(null)
  const [revoking, setRevoking] = useState<string | null>(null)

  const reload = async () => {
    setLoading(true)
    setError(null)
    try {
      const auth = await getAuthSession()
      setSession(auth)
      if (!auth.authenticated) {
        setConnect(null)
        return
      }
      const payload = await getMcpConnect()
      setConnect(payload)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reload()
  }, [])

  const copyText = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(key)
      window.setTimeout(() => setCopied((current) => (current === key ? null : current)), 1600)
    } catch {
      setError('클립보드 복사에 실패했습니다. 텍스트를 직접 선택해 복사하세요.')
    }
  }

  const onRevoke = async (grantId: string) => {
    setRevoking(grantId)
    setError(null)
    try {
      await revokeMcpGrant(grantId)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRevoking(null)
    }
  }

  if (loading) {
    return (
      <div className="wrap mcp-connect" style={{ paddingTop: 44, paddingBottom: 72 }}>
        <p className="muted">MCP 연결 정보를 불러오는 중…</p>
      </div>
    )
  }

  if (!session?.authenticated) {
    return (
      <div className="wrap mcp-connect" style={{ paddingTop: 44, paddingBottom: 72 }}>
        <div className="col" style={{ gap: 12, maxWidth: 640 }}>
          <div className="kicker">Remote MCP</div>
          <h1 style={{ fontSize: 30 }}>Cursor / Claude Desktop 연결</h1>
          <p className="muted" style={{ lineHeight: 1.55 }}>
            MCP 호스트는 브라우저 세션 쿠키를 재사용하지 않습니다. Google로 로그인한 뒤, 호스트 OAuth 승인 흐름으로
            연결하세요.
          </p>
          <button className="ks-auth-button ks-auth-button--google" onClick={() => googleLogin('/connect')} type="button">
            <GoogleMark />
            <span>Google로 로그인</span>
          </button>
        </div>
      </div>
    )
  }

  if (!connect) {
    return (
      <div className="wrap mcp-connect" style={{ paddingTop: 44, paddingBottom: 72 }}>
        <p className="muted">{error ?? '연결 정보를 불러오지 못했습니다.'}</p>
      </div>
    )
  }

  const cursorJson = JSON.stringify(connect.configs.cursor, null, 2)
  const claudeJson = JSON.stringify(connect.configs.claude_desktop, null, 2)

  return (
    <div className="wrap mcp-connect" style={{ paddingTop: 44, paddingBottom: 72 }}>
      <div className="col" style={{ gap: 10, marginBottom: 28, maxWidth: 760 }}>
        <div className="kicker">Remote MCP</div>
        <h1 style={{ fontSize: 30, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Plug size={28} />
          MCP 연결
        </h1>
        <p className="muted" style={{ lineHeight: 1.55 }}>
          엔드포인트를 Cursor 또는 Claude Desktop에 추가하면 브라우저 OAuth 승인이 열립니다. 웹 로그인만으로는 호스트가
          자동 연결되지 않습니다.
        </p>
        {error && <p className="mcp-connect-error">{error}</p>}
      </div>

      <div className="mcp-connect-grid">
        <section className="mcp-connect-card">
          <h2>상태</h2>
          <dl className="mcp-connect-meta">
            <div>
              <dt>OAuth</dt>
              <dd>{connect.oauth_ready ? '준비됨' : '비활성'}</dd>
            </div>
            <div>
              <dt>Scope</dt>
              <dd>{connect.scopes.join(', ')}</dd>
            </div>
            <div>
              <dt>계정</dt>
              <dd>{session.user?.email ?? session.user?.name ?? 'logged in'}</dd>
            </div>
          </dl>
        </section>

        <section className="mcp-connect-card">
          <div className="spread" style={{ alignItems: 'center', gap: 12 }}>
            <h2 style={{ margin: 0 }}>엔드포인트</h2>
            <button className="mcp-copy-btn" onClick={() => void copyText('resource', connect.resource)} type="button">
              {copied === 'resource' ? <Check size={14} /> : <Copy size={14} />}
              {copied === 'resource' ? '복사됨' : '복사'}
            </button>
          </div>
          <code className="mcp-code-block">{connect.resource}</code>
          <p className="muted" style={{ fontSize: 13, lineHeight: 1.5, marginTop: 10 }}>
            Protected resource metadata:{' '}
            <a href={connect.protected_resource_metadata_url}>{connect.protected_resource_metadata_url}</a>
          </p>
        </section>

        <section className="mcp-connect-card">
          <div className="spread" style={{ alignItems: 'center', gap: 12 }}>
            <h2 style={{ margin: 0 }}>Cursor 설정</h2>
            <button className="mcp-copy-btn" onClick={() => void copyText('cursor', cursorJson)} type="button">
              {copied === 'cursor' ? <Check size={14} /> : <Copy size={14} />}
              {copied === 'cursor' ? '복사됨' : '복사'}
            </button>
          </div>
          <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
            Cursor MCP 설정에 붙여 넣으세요. URL만 넣으면 호스트가 OAuth discovery를 수행합니다.
          </p>
          <pre className="mcp-code-block">{cursorJson}</pre>
        </section>

        <section className="mcp-connect-card">
          <div className="spread" style={{ alignItems: 'center', gap: 12 }}>
            <h2 style={{ margin: 0 }}>Claude Desktop 설정</h2>
            <button className="mcp-copy-btn" onClick={() => void copyText('claude', claudeJson)} type="button">
              {copied === 'claude' ? <Check size={14} /> : <Copy size={14} />}
              {copied === 'claude' ? '복사됨' : '복사'}
            </button>
          </div>
          <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
            Claude Desktop remote MCP 항목에 맞게 스키마가 다를 수 있습니다. 최신 호스트 문서를 우선하세요.
          </p>
          <pre className="mcp-code-block">{claudeJson}</pre>
        </section>

        <section className="mcp-connect-card mcp-connect-card--wide">
          <h2>사용 가능한 도구</h2>
          <ul className="mcp-tool-list">
            {connect.tools.map((tool) => (
              <li key={tool.name}>
                <code>{tool.name}</code>
                <span className="muted">{tool.description}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="mcp-connect-card mcp-connect-card--wide">
          <h2>연결된 호스트 세션</h2>
          {connect.grants.length === 0 ? (
            <p className="muted" style={{ lineHeight: 1.5 }}>
              아직 승인된 OAuth grant가 없습니다. Cursor/Claude Desktop에서 서버를 추가하면 여기에 표시됩니다.
            </p>
          ) : (
            <ul className="mcp-grant-list">
              {connect.grants.map((grant) => (
                <li key={grant.grant_id}>
                  <div className="col" style={{ gap: 4 }}>
                    <strong>{grant.client_name}</strong>
                    <span className="muted" style={{ fontSize: 13 }}>
                      {grant.scope} · 생성 {grant.created_at}
                      {grant.last_used_at ? ` · 최근 사용 ${grant.last_used_at}` : ''}
                    </span>
                  </div>
                  <button
                    className="mcp-copy-btn mcp-copy-btn--danger"
                    disabled={revoking === grant.grant_id}
                    onClick={() => void onRevoke(grant.grant_id)}
                    type="button"
                  >
                    {revoking === grant.grant_id ? '취소 중…' : '연결 끊기'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mcp-connect-card mcp-connect-card--wide">
          <h2>보안 안내</h2>
          <ul className="mcp-notes">
            {connect.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}
