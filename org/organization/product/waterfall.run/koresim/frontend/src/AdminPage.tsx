import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { APIError } from './api/client'
import {
  deleteAdminUser,
  getAdminExport,
  getAdminFeedback,
  getAdminOverview,
  getAdminRuns,
  getAdminUsers,
  pruneAdminRetention,
} from './api/admin'
import type { AdminOverviewResponse, JsonObject } from './types/api'

type AdminState = {
  overview: AdminOverviewResponse | null
  users: JsonObject[]
  runs: JsonObject[]
  feedback: JsonObject[]
}

export function AdminPage() {
  const [state, setState] = useState<AdminState>({
    overview: null,
    users: [],
    runs: [],
    feedback: [],
  })
  const [includeSensitive, setIncludeSensitive] = useState(false)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const loadAdminData = useMemo(() => {
    return () => {
      setLoading(true)
      return Promise.all([
        getAdminOverview(includeSensitive),
        getAdminUsers(50, includeSensitive),
        getAdminRuns(50, includeSensitive),
        getAdminFeedback(50, includeSensitive),
      ])
        .then(([overview, users, runs, feedback]) => {
          setState({
            overview,
            users: users.items,
            runs: runs.items,
            feedback: feedback.items,
          })
          setError(null)
        })
        .catch((err) => {
          setError(formatAdminError(err))
        })
        .finally(() => {
          setLoading(false)
        })
    }
  }, [includeSensitive])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      getAdminOverview(includeSensitive),
      getAdminUsers(50, includeSensitive),
      getAdminRuns(50, includeSensitive),
      getAdminFeedback(50, includeSensitive),
    ])
      .then(([overview, users, runs, feedback]) => {
        if (cancelled) return
        setState({
          overview,
          users: users.items,
          runs: runs.items,
          feedback: feedback.items,
        })
        setError(null)
      })
      .catch((err) => {
        if (cancelled) return
        setError(formatAdminError(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [includeSensitive])

  const policy = state.overview?.policy ?? {}
  const retentionDays = toNumber(policy.retention_days, 180)

  async function handleExport() {
    setActionLoading('export')
    try {
      const data = await getAdminExport(includeSensitive)
      downloadJson(data, `arabesque-admin-export-${new Date().toISOString().slice(0, 10)}.json`)
      setNotice('관리자 export를 생성했습니다.')
    } catch (err) {
      setError(formatAdminError(err))
    } finally {
      setActionLoading(null)
    }
  }

  async function handleRetentionDryRun() {
    setActionLoading('retention-dry-run')
    try {
      const response = await pruneAdminRetention({
        retention_days: retentionDays,
        dry_run: true,
        confirm: false,
      })
      setNotice(`Dry-run 완료: ${formatAdminValue(response.result.counts)}`)
    } catch (err) {
      setError(formatAdminError(err))
    } finally {
      setActionLoading(null)
    }
  }

  async function handleRetentionExecute() {
    const confirmed = window.confirm(`${retentionDays}일보다 오래된 보존 대상 데이터를 삭제합니다. 계속할까요?`)
    if (!confirmed) return
    setActionLoading('retention-execute')
    try {
      const response = await pruneAdminRetention({
        retention_days: retentionDays,
        dry_run: false,
        confirm: true,
      })
      setNotice(`보존 정책 삭제 완료: ${formatAdminValue(response.result.counts)}`)
      await loadAdminData()
    } catch (err) {
      setError(formatAdminError(err))
    } finally {
      setActionLoading(null)
    }
  }

  async function handleDeleteUser(row: JsonObject) {
    const userId = typeof row.user_id === 'string' ? row.user_id : ''
    if (!userId) return
    const confirmed = window.confirm(`사용자 ${formatAdminValue(row.email)}의 실행/피드백/이벤트 데이터를 삭제합니다.`)
    if (!confirmed) return
    setActionLoading(`delete-${userId}`)
    try {
      const response = await deleteAdminUser(userId)
      setNotice(`사용자 데이터 삭제 완료: ${formatAdminValue(response.result.counts)}`)
      await loadAdminData()
    } catch (err) {
      setError(formatAdminError(err))
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <main className="ks-admin-page">
      <header className="ks-admin-header">
        <div>
          <p className="ks-report-eyebrow">Operator Console</p>
          <h1>Arabesque Admin</h1>
          <span>사용자 입력, 실행, 결과 피드백을 제품 개선 관점으로 추적합니다.</span>
        </div>
        <nav>
          <button
            className="ks-admin-link-button"
            type="button"
            onClick={() => setIncludeSensitive((current) => !current)}
          >
            {includeSensitive ? '마스킹 켜기' : '민감 데이터 보기'}
          </button>
          <button className="ks-admin-link-button" type="button" onClick={handleExport} disabled={actionLoading === 'export'}>
            Export
          </button>
          <a href="/app">앱</a>
          <a href="/results">결과</a>
        </nav>
      </header>

      {loading && <p className="ks-admin-muted">관리자 데이터를 불러오는 중입니다.</p>}
      {error && <p className="ks-admin-error">{error}</p>}
      {notice && <p className="ks-admin-notice">{notice}</p>}

      {state.overview && (
        <>
          <section className="ks-admin-metrics" aria-label="운영 지표">
            <AdminMetric label="사용자" value={state.overview.users} />
            <AdminMetric label="실행" value={state.overview.runs} />
            <AdminMetric label="완료" value={state.overview.completed_runs} />
            <AdminMetric label="실패" value={state.overview.failed_runs} />
            <AdminMetric label="Intake" value={state.overview.intake_sessions} />
            <AdminMetric label="피드백" value={state.overview.feedback} />
            <AdminMetric label="이벤트" value={state.overview.analytics_events} />
          </section>

          <section className="ks-admin-grid">
            <AdminFunnel funnel={state.overview.funnel} />
            <AdminPolicy
              policy={policy}
              actionLoading={actionLoading}
              onDryRun={handleRetentionDryRun}
              onExecute={handleRetentionExecute}
            />
          </section>

          <section className="ks-admin-grid">
            <AdminTable
              title="조직/계정 프록시"
              rows={state.overview.accounts}
              columns={[
                'account_domain',
                'users',
                'runs',
                'completed_runs',
                'feedback',
                'paid_users',
                'quota_exhausted_users',
                'last_seen_at',
              ]}
            />
            <AdminTable
              title="시뮬레이션별 실행"
              rows={state.overview.by_simulation}
              columns={['simulation_type', 'count']}
            />
          </section>

          <AdminTable
            title="최근 제품 이벤트"
            rows={state.overview.recent_events}
            columns={['event_name', 'user_email', 'page', 'simulation_type', 'created_at']}
          />
        </>
      )}

      <section className="ks-admin-grid">
        <AdminTable
          title="최근 사용자"
          rows={state.users}
          columns={['email', 'plan', 'run_count', 'intake_count', 'feedback_count', 'last_seen_at']}
          actions={(row) => (
            <button
              className="ks-admin-danger-button"
              type="button"
              disabled={actionLoading === `delete-${row.user_id}`}
              onClick={() => handleDeleteUser(row)}
            >
              삭제
            </button>
          )}
        />
        <AdminTable
          title="최근 실행"
          rows={state.runs}
          columns={['user_email', 'simulation_type', 'status', 'sample_size', 'done_count', 'created_at']}
        />
      </section>

      <AdminTable
        title="결과 피드백"
        rows={state.feedback}
        columns={['user_email', 'usefulness_score', 'trust_score', 'actionability_score', 'intended_action', 'free_text', 'created_at']}
      />
    </main>
  )
}

function AdminMetric({ label, value }: { label: string; value: number }) {
  return (
    <article>
      <p>{label}</p>
      <strong>{value.toLocaleString('ko-KR')}</strong>
    </article>
  )
}

function AdminFunnel({ funnel }: { funnel: JsonObject }) {
  const steps = Array.isArray(funnel.steps) ? (funnel.steps as JsonObject[]) : []
  const maxActors = Math.max(1, ...steps.map((step) => toNumber(step.actors, 0)))
  return (
    <section className="ks-admin-panel">
      <h2>Funnel 분석</h2>
      {steps.length === 0 ? (
        <p className="ks-admin-muted">아직 funnel 이벤트가 없습니다.</p>
      ) : (
        <div className="ks-admin-funnel">
          {steps.map((step) => {
            const actors = toNumber(step.actors, 0)
            const width = Math.max(4, Math.round((actors / maxActors) * 100))
            return (
              <article key={String(step.step)} className="ks-admin-funnel-row">
                <div>
                  <strong>{humanizeAdminColumn(String(step.step))}</strong>
                  <span>{actors.toLocaleString('ko-KR')}명 · 전환 {formatConversion(step.conversion_from_previous)}</span>
                </div>
                <i style={{ width: `${width}%` }} />
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}

function AdminPolicy({
  policy,
  actionLoading,
  onDryRun,
  onExecute,
}: {
  policy: JsonObject
  actionLoading: string | null
  onDryRun: () => void
  onExecute: () => void
}) {
  return (
    <section className="ks-admin-panel">
      <h2>삭제 / Export / 보존 정책</h2>
      <dl className="ks-admin-policy-list">
        <div>
          <dt>기본 마스킹</dt>
          <dd>{formatAdminValue(policy.default_masking)}</dd>
        </div>
        <div>
          <dt>보존 기간</dt>
          <dd>{formatAdminValue(policy.retention_days)}일</dd>
        </div>
        <div>
          <dt>Raw persona export</dt>
          <dd>{formatAdminValue(policy.raw_persona_export)}</dd>
        </div>
        <div>
          <dt>Human review</dt>
          <dd>{formatAdminValue(policy.human_review_required_for_exports)}</dd>
        </div>
      </dl>
      <div className="ks-admin-actions">
        <button type="button" onClick={onDryRun} disabled={actionLoading === 'retention-dry-run'}>
          Retention dry-run
        </button>
        <button
          className="ks-admin-danger-button"
          type="button"
          onClick={onExecute}
          disabled={actionLoading === 'retention-execute'}
        >
          오래된 데이터 삭제
        </button>
      </div>
    </section>
  )
}

function AdminTable({
  title,
  rows,
  columns,
  actions,
}: {
  title: string
  rows: JsonObject[]
  columns: string[]
  actions?: (row: JsonObject) => ReactNode
}) {
  return (
    <section className="ks-admin-panel">
      <h2>{title}</h2>
      {rows.length === 0 ? (
        <p className="ks-admin-muted">아직 데이터가 없습니다.</p>
      ) : (
        <div className="ks-admin-table-wrap">
          <table className="ks-admin-table">
            <thead>
              <tr>
                {columns.map((column) => <th key={column}>{humanizeAdminColumn(column)}</th>)}
                {actions && <th>관리</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${title}-${index}`}>
                  {columns.map((column) => <td key={column}>{formatAdminValue(row[column])}</td>)}
                  {actions && <td>{actions(row)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function toNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function formatConversion(value: unknown): string {
  if (typeof value !== 'number') return '-'
  return `${value.toLocaleString('ko-KR')}%`
}

function formatAdminValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '-'
  if (typeof value === 'number') return value.toLocaleString('ko-KR')
  if (typeof value === 'boolean') return value ? '예' : '아니오'
  if (typeof value === 'string') return value.length > 72 ? `${value.slice(0, 72)}...` : value
  return JSON.stringify(value)
}

function humanizeAdminColumn(column: string): string {
  const labels: Record<string, string> = {
    account_domain: '계정 도메인',
    actionability_score: '실행성',
    analytics_events: '이벤트',
    app_viewed: '앱 진입',
    completed_runs: '완료',
    count: '수',
    created_at: '생성',
    done_count: '완료 수',
    event_name: '이벤트',
    export_clicked: 'Export',
    feedback: '피드백',
    feedback_count: '피드백',
    feedback_submitted: '피드백 제출',
    free_text: '코멘트',
    intake_count: 'Intake',
    intake_started: 'Intake 시작',
    intended_action: '후속 행동',
    last_seen_at: '마지막 접속',
    page: '페이지',
    paid_users: '유료 계정',
    plan: '플랜',
    quota_exhausted_users: '한도 소진',
    result_viewed: '결과 조회',
    run_count: '실행',
    run_created: '실행 생성',
    runs: '실행',
    sample_size: '표본',
    simulation_type: '유형',
    status: '상태',
    trust_score: '신뢰',
    usefulness_score: '유용성',
    user_email: '사용자',
    users: '사용자',
  }
  return labels[column] ?? column
}

function formatAdminError(err: unknown): string {
  if (err instanceof APIError) {
    if (err.status === 403) return '관리자 권한이 필요합니다. KORESIM_ADMIN_EMAILS에 등록된 계정으로 로그인해주세요.'
    return err.message
  }
  return err instanceof Error ? err.message : String(err)
}

function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
