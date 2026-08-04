import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  createProjectRunFocusGroup,
  getProjectRunFocusGroup,
  listProjectRunFocusGroups,
} from '../api/projects'
import type { FocusGroupResponse, OpenSurveyMetrics } from '../types/api'

type Props = {
  projectId: string
  runId: string
  metrics: OpenSurveyMetrics
}

function phaseLabel(progress: FocusGroupResponse['progress']): string {
  if (!progress) return '준비 중'
  const phase = String(progress.phase || '')
  const map: Record<string, string> = {
    select_panel: '패널 선정',
    opening: '오프닝(각자 발언)',
    reaction: '반응 라운드(서로 듣기)',
    final_stance: '최종 입장',
    summarize: '요약',
    completed: '완료',
    failed: '실패',
  }
  const base = map[phase] || phase || '진행 중'
  const idx = progress.speaker_index
  const total = progress.speakers_total
  if (typeof idx === 'number' && typeof total === 'number' && total > 0 && phase !== 'completed') {
    return `${base} · ${idx}/${total}`
  }
  return base
}

function executionModeNote(session: FocusGroupResponse): string {
  const mode = String(session.progress?.execution_mode || session.config?.execution_mode || '')
  if (mode === 'rq') {
    return '워커 큐에서 실행 중입니다. 탭을 닫아도 이어질 수 있습니다.'
  }
  if (mode === 'thread') {
    return '이 서버 프로세스 안에서 실행 중입니다. 탭/서버를 유지하는 편이 안전합니다.'
  }
  if (mode === 'inline') {
    return '동기 실행 모드입니다.'
  }
  return '실행 경로를 확인하는 중입니다. 잠시만 기다려 주세요.'
}

export function FocusGroupSection({ projectId, runId, metrics }: Props) {
  const options = metrics.options?.length ? metrics.options : metrics.choice_rows.map((r) => r.option)
  const defaultOption = metrics.choice_rows[0]?.option || options[0] || ''
  const [sessions, setSessions] = useState<FocusGroupResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cohortOption, setCohortOption] = useState(defaultOption)
  const [moderatorPrompt, setModeratorPrompt] = useState(metrics.question || '')
  const [starting, setStarting] = useState(false)
  const pollFailures = useRef(0)

  const availableForOption = useMemo(() => {
    const row = metrics.choice_rows.find((r) => r.option === cohortOption)
    return row?.count ?? 0
  }, [metrics.choice_rows, cohortOption])

  const refresh = useCallback(async () => {
    try {
      const res = await listProjectRunFocusGroups(projectId, runId)
      setSessions(res.focus_groups || [])
      setError(null)
      pollFailures.current = 0
    } catch (err) {
      setError(err instanceof Error ? err.message : '포커스 그룹을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [projectId, runId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const active = sessions.find((s) => s.status === 'queued' || s.status === 'running')

  useEffect(() => {
    if (!active) return
    const id = window.setInterval(async () => {
      try {
        const latest = await getProjectRunFocusGroup(projectId, runId, active.focus_group_id)
        pollFailures.current = 0
        setSessions((prev) => {
          const others = prev.filter((s) => s.focus_group_id !== latest.focus_group_id)
          return [latest, ...others]
        })
        setError(null)
      } catch (err) {
        pollFailures.current += 1
        if (pollFailures.current >= 3) {
          setError(
            err instanceof Error
              ? `진행 상태를 갱신하지 못했습니다: ${err.message}`
              : '진행 상태를 갱신하지 못했습니다. 네트워크/로그인을 확인하세요.',
          )
        }
      }
    }, 2000)
    return () => window.clearInterval(id)
  }, [active, projectId, runId])

  async function startFocusGroup() {
    if (!cohortOption || availableForOption < 9 || starting) return
    setStarting(true)
    setError(null)
    try {
      const created = await createProjectRunFocusGroup(projectId, runId, {
        cohort_option: cohortOption,
        moderator_prompt: moderatorPrompt.trim() || null,
        panel_size: 9,
      })
      setSessions((prev) => [created, ...prev.filter((s) => s.focus_group_id !== created.focus_group_id)])
    } catch (err) {
      setError(err instanceof Error ? err.message : '포커스 그룹을 시작하지 못했습니다.')
    } finally {
      setStarting(false)
    }
  }

  return (
    <div className="minsim-focus-group">
      <section className="card minsim-focus-group-card">
        <header className="minsim-open-survey-card-head">
          <h3>9인 포커스 그룹</h3>
        </header>
        <p className="muted minsim-open-survey-lead">
          같은 선택지를 고른 응답자 9명이 먼저 각자 이유를 말한 뒤, 서로의 말을 듣고 반응합니다.
          본 설문 분포는 바뀌지 않습니다. 반응 구간에는 동조·앵커 편향이 있을 수 있으며, 합의 숫자는
          탐색용 신호로만 보세요.
        </p>

        <div className="minsim-focus-group-launcher">
          <label className="col" style={{ gap: 6 }}>
            <span className="lbl">토론 대상 선택지</span>
            <select
              className="inp"
              value={cohortOption}
              onChange={(e) => setCohortOption(e.target.value)}
              disabled={Boolean(active) || starting}
            >
              {options.map((option) => {
                const count = metrics.choice_rows.find((r) => r.option === option)?.count ?? 0
                return (
                  <option key={option} value={option} disabled={count < 9}>
                    {option} ({count}명)
                  </option>
                )
              })}
            </select>
          </label>
          <label className="col" style={{ gap: 6, marginTop: 12 }}>
            <span className="lbl">모더레이터 질문 (선택)</span>
            <textarea
              className="inp"
              rows={2}
              value={moderatorPrompt}
              onChange={(e) => setModeratorPrompt(e.target.value)}
              disabled={Boolean(active) || starting}
            />
          </label>
          <p className="muted" style={{ margin: '10px 0 0', fontSize: 13 }}>
            규모 9명 고정
            {availableForOption < 9
              ? ` · 이 선택지는 ${availableForOption}명뿐이라 시작할 수 없습니다.`
              : null}
          </p>
          <button
            type="button"
            className="btn primary"
            style={{ marginTop: 14 }}
            disabled={Boolean(active) || starting || availableForOption < 9 || !cohortOption}
            onClick={() => void startFocusGroup()}
          >
            {starting ? '시작 중…' : active ? '진행 중인 토론이 있습니다' : '9인 토론 시작'}
          </button>
        </div>

        {error && (
          <p className="muted" style={{ color: 'var(--danger, #b91c1c)', marginTop: 12 }}>
            {error}
          </p>
        )}
        {loading && <p className="muted" style={{ marginTop: 12 }}>불러오는 중…</p>}
      </section>

      {sessions.map((session) => (
        <FocusGroupSessionCard key={session.focus_group_id} session={session} />
      ))}
    </div>
  )
}

function FocusGroupSessionCard({ session }: { session: FocusGroupResponse }) {
  const cfg = session.config || {}
  const summary = session.summary
  const isActive = session.status === 'queued' || session.status === 'running'
  const undecided =
    summary && typeof summary.undecided_count === 'number' ? Number(summary.undecided_count) : null

  return (
    <section className="card minsim-focus-group-card" style={{ marginTop: 14 }}>
      <header className="minsim-open-survey-card-head">
        <h3>
          {String(cfg.cohort_option || '선택지')} ·{' '}
          {session.status === 'completed'
            ? '완료'
            : session.status === 'failed'
              ? '실패'
              : session.status}
        </h3>
        <span className="lbl-mono" style={{ fontSize: 12 }}>
          {session.focus_group_id.slice(0, 12)}
        </span>
      </header>

      {isActive && (
        <div className="minsim-focus-group-progress">
          <strong>{phaseLabel(session.progress)}</strong>
          <p className="muted" style={{ margin: '6px 0 0', fontSize: 13 }}>
            {executionModeNote(session)}
          </p>
          <div className="minsim-open-survey-bar-track" aria-hidden="true" style={{ marginTop: 10 }}>
            <div
              className="minsim-open-survey-bar-fill"
              style={{
                width: `${Math.min(
                  100,
                  Math.round(
                    (Number(session.progress?.done_calls || 0) /
                      Math.max(1, Number(session.progress?.total_calls_est || 27))) *
                      100,
                  ),
                )}%`,
              }}
            />
          </div>
        </div>
      )}

      {session.status === 'failed' && (
        <p className="muted" style={{ color: 'var(--danger, #b91c1c)' }}>
          실패: {session.error || '알 수 없는 오류'}
          {session.timeline?.length
            ? ' · 아래는 중단 직전까지 저장된 부분 타임라인입니다.'
            : null}
        </p>
      )}

      {session.panel?.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <h4 style={{ margin: '0 0 8px', fontSize: 14 }}>참가자</h4>
          <div className="minsim-focus-group-panel">
            {session.panel.map((m) => (
              <div key={String(m.uuid)} className="minsim-focus-group-member">
                <strong>{String(m.display_name || m.uuid)}</strong>
                <span className="muted">{String(m.meta || '')}</span>
                <span>
                  초기: {String(m.initial_choice || '—')}
                  {m.final_choice ? ` → 최종: ${String(m.final_choice)}` : ''}
                </span>
                {m.initial_reason ? (
                  <span className="muted" style={{ fontSize: 12 }}>
                    {String(m.initial_reason).slice(0, 80)}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      )}

      {session.timeline?.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h4 style={{ margin: '0 0 8px', fontSize: 14 }}>토론 타임라인</h4>
          <div className="minsim-focus-group-timeline">
            {session.timeline.map((turn) => (
              <div
                key={`${turn.seq}-${turn.speaker_uuid || 'mod'}`}
                className={`minsim-focus-group-turn${turn.role === 'moderator' ? ' is-mod' : ''}`}
              >
                <div className="minsim-focus-group-turn-meta">
                  <strong>
                    {turn.role === 'moderator' ? '모더레이터' : String(turn.speaker_name || '참가자')}
                  </strong>
                  <span className="muted">{String(turn.round || '')}</span>
                </div>
                <p>{String(turn.text || '') || '(빈 발언)'}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {session.stance_table && session.stance_table.length > 0 && (
        <div style={{ marginTop: 16, overflowX: 'auto' }}>
          <h4 style={{ margin: '0 0 8px', fontSize: 14 }}>입장 변화</h4>
          <table className="minsim-focus-group-stance">
            <thead>
              <tr>
                <th>이름</th>
                <th>초기</th>
                <th>최종</th>
                <th>변화</th>
                <th>이유</th>
              </tr>
            </thead>
            <tbody>
              {session.stance_table.map((row) => (
                <tr key={String(row.uuid)}>
                  <td>{String(row.name || row.uuid)}</td>
                  <td>{String(row.initial_choice || '—')}</td>
                  <td>{String(row.final_choice || '—')}</td>
                  <td>
                    {row.changed === true ? '변경' : row.changed === false ? '유지' : '—'}
                  </td>
                  <td>{String(row.final_reason || '—')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {summary && (
        <div style={{ marginTop: 16 }}>
          <h4 style={{ margin: '0 0 8px', fontSize: 14 }}>요약</h4>
          <p style={{ margin: 0, fontWeight: 600 }}>{String(summary.headline || '')}</p>
          {undecided != null && undecided > 0 ? (
            <p className="muted" style={{ margin: '8px 0 0', fontSize: 13.5 }}>
              최종 입장 파싱 실패 {undecided}명 (입장 변화 집계에서 제외)
            </p>
          ) : null}
          {summary.agreement_note ? (
            <p className="muted" style={{ margin: '8px 0 0', fontSize: 13.5 }}>
              {String(summary.agreement_note)}
              {typeof summary.first_speaker_echo_rate === 'number' &&
              Number(summary.first_speaker_echo_rate) >= 0.5
                ? ' · 어휘 겹침 지표는 대략적 참고용이며 인과 설득 증거가 아닙니다.'
                : ''}
            </p>
          ) : null}
          {Array.isArray(summary.warnings) && summary.warnings.length > 0 ? (
            <ul className="muted" style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 12.5 }}>
              {summary.warnings.map((w) => (
                <li key={String(w)}>{String(w)}</li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </section>
  )
}
