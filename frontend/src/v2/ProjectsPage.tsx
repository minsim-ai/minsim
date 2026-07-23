import { useEffect, useState, type FormEvent } from 'react'
import { FlaskConical, Plus, Sparkles } from 'lucide-react'
import { loginPageHref } from '../api/auth'
import { APIError, userFacingErrorMessage } from '../api/client'
import { autofillProject } from '../api/intake'
import { createProject, listProjects } from '../api/projects'
import { PROJECT_KINDS, getProjectKindSpec, type ProjectKind } from '../modes/projectKinds'
import type { ProjectAutofillMeta, ProjectResponse } from '../types/api'
import { navigateTo } from './navigation'
import { AUTOFILL_ALL_FIELDS } from './projectAutofill'

function hasLandingProjectSeed(): boolean {
  // 랜딩에서 질문/갈래를 물고 온 경우에는 "새 프로젝트"가 이미 열린 상태로 보여준다.
  return Boolean(
    window.sessionStorage.getItem('minsim.heroPrompt')?.trim() ||
      window.sessionStorage.getItem('minsim.projectKind'),
  )
}

/** Derive a short project title from the one-line intro when the user skips naming. */
function titleFromIntro(intro: string): string {
  const cleaned = intro.trim().replace(/\s+/g, ' ')
  if (!cleaned) return '새 프로젝트'
  const firstChunk = cleaned.split(/[.。!?！？\n]/)[0]?.trim() || cleaned
  if (firstChunk.length <= 40) return firstChunk
  return `${firstChunk.slice(0, 40).trim()}…`
}

export function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectResponse[]>([])
  const [creating, setCreating] = useState(() => hasLandingProjectSeed())
  // 랜딩의 '여론조사' 버튼이 심어둔 갈래를 기본 선택으로 쓴다.
  const [kind, setKind] = useState<ProjectKind>(
    () => (window.sessionStorage.getItem('minsim.projectKind') === 'poll' ? 'poll' : 'venture'),
  )
  // 사용자는 한 줄 소개만 적는다. 이름은 AI 또는 intro에서 자동으로 만든다.
  const [description, setDescription] = useState(() => window.sessionStorage.getItem('minsim.heroPrompt') ?? '')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [aiBusy, setAiBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listProjects()
      .then((response) => setProjects(response.projects))
      .catch((err) => {
        if (err instanceof APIError && err.reason === 'auth_required') {
          navigateTo(loginPageHref('/projects'))
          return
        }
        setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => setLoading(false))
  }, [])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const intro = description.trim()
    if (!intro) {
      setError('한 줄 소개를 적어주세요.')
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      const project = await createProject({
        name: titleFromIntro(intro),
        kind,
        description: intro,
        product_context: { product_description: intro },
        features: [],
        prices: [],
        alternatives: [],
      })
      window.sessionStorage.removeItem('minsim.heroPrompt')
      window.sessionStorage.removeItem('minsim.projectKind')
      navigateTo(`/projects/${encodeURIComponent(project.project_id)}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  const aiCreate = async () => {
    const prompt = description.trim()
    if (!prompt) {
      setError('한 줄 소개를 적어주세요. AI가 이름과 나머지 항목을 채웁니다.')
      return
    }
    setError(null)
    setAiBusy(true)
    try {
      const draft = await autofillProject({
        prompt,
        kind,
        current_fields: {
          name: '',
          description: prompt,
          product_context: '',
          features: [],
          prices: [],
          target_notes: '',
          alternatives: [],
        },
      })
      const fields = draft.project_fields
      const autofill: ProjectAutofillMeta = {
        source: 'generated',
        prompt,
        recommended_simulation_type: draft.recommended_simulation_type,
        simulation_input: draft.simulation_input,
        assumptions: draft.assumptions,
        notes: draft.notes,
        filled_fields: [...AUTOFILL_ALL_FIELDS],
      }
      const project = await createProject({
        name: fields.name.trim() || titleFromIntro(prompt),
        // kind를 빼면 서버 기본값(venture)이 채워져 AI로 만든 여론조사가 창업 프로젝트가 된다.
        kind,
        description: fields.description || prompt,
        product_context: { product_description: fields.product_context, autofill },
        features: fields.features,
        prices: fields.prices,
        target_notes: fields.target_notes,
        alternatives: fields.alternatives,
      })
      window.sessionStorage.removeItem('minsim.heroPrompt')
      window.sessionStorage.removeItem('minsim.projectKind')
      navigateTo(`/projects/${encodeURIComponent(project.project_id)}`)
    } catch (err) {
      setError(
        userFacingErrorMessage(
          err,
          'AI 채움에 실패했습니다. 직접 입력하거나 잠시 후 다시 시도해주세요.',
        ),
      )
    } finally {
      setAiBusy(false)
    }
  }

  const cancelCreate = () => {
    setCreating(false)
    setDescription('')
    window.sessionStorage.removeItem('minsim.heroPrompt')
    window.sessionStorage.removeItem('minsim.projectKind')
  }

  return (
    <div className="wrap" style={{ paddingTop: 44, paddingBottom: 72 }}>
      <div className="spread" style={{ alignItems: 'flex-end', marginBottom: 8, flexWrap: 'wrap', gap: 14 }}>
        <div className="col" style={{ gap: 8 }}>
          <div className="kicker">워크스페이스</div>
          <h1 style={{ fontSize: 30 }}>대시보드</h1>
          <p className="muted" style={{ fontSize: 14, maxWidth: 580, lineHeight: 1.55 }}>
            아이디어를 한 번 돌리고 끝내는 게 아니라, 프로젝트마다 계속 다듬는 실험실입니다.
          </p>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <button className="btn primary" type="button" onClick={() => setCreating(true)}><Plus size={16} /> 새 프로젝트</button>
        </div>
      </div>

      {creating && (
        <form className="card" style={{ padding: 22, marginTop: 22, marginBottom: 8 }} onSubmit={submit}>
          <div className="spread" style={{ marginBottom: 14 }}>
            <span className="lbl-mono">새 프로젝트</span>
            <button type="button" className="btn ghost sm" onClick={cancelCreate}>취소</button>
          </div>
          <div className="minsim-project-form-grid">
            <div className="minsim-project-form-field minsim-project-kind">
              <span className="lbl">무엇을 하시나요?</span>
              <div className="minsim-project-kind-grid">
                {Object.values(PROJECT_KINDS).map((spec) => (
                  <button
                    key={spec.kind}
                    type="button"
                    className={`btn minsim-project-kind-option${kind === spec.kind ? ' primary' : ''}`}
                    onClick={() => setKind(spec.kind)}
                    aria-pressed={kind === spec.kind}
                  >
                    {kind === spec.kind ? (
                      <span className="minsim-project-kind-selected">✓ 선택됨</span>
                    ) : null}
                    <b>{spec.label}</b>
                    <span>{spec.blurb}</span>
                  </button>
                ))}
              </div>
            </div>
            <label className="minsim-project-form-field minsim-project-intro">
              <span className="lbl">한 줄 소개</span>
              <textarea
                className="inp"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={
                  kind === 'poll'
                    ? '예: 중앙도서관 24시간 개방에 대한 학생 여론을 보고 싶어요'
                    : '예: 어르신 동반 강아지 로봇, 월 3.9만 원 구독으로 출시하면 반응은?'
                }
                rows={2}
                required
              />
            </label>
            <div className="minsim-project-form-actions">
              <div className="minsim-project-form-buttons">
                <button className="btn btn-ai" type="button" onClick={aiCreate} disabled={aiBusy || submitting}>
                  <Sparkles size={15} aria-hidden="true" /> {aiBusy ? 'AI가 채우는 중…' : 'AI로 채우기'}
                </button>
                <button className="btn primary" type="submit" disabled={submitting || aiBusy}>{submitting ? '만드는 중…' : '만들고 정보 등록 →'}</button>
              </div>
              <p className="minsim-project-form-hint">
                {kind === 'poll'
                  ? '이름 입력은 없습니다. 한 줄만 적으면 AI가 안건 이름·배경·응답자 메모를 초안으로 만듭니다.'
                  : '이름 입력은 없습니다. 한 줄만 적으면 AI가 프로젝트 이름·가격·타깃·기능 초안을 만듭니다.'}
              </p>
            </div>
          </div>
        </form>
      )}

      {error && <p className="muted" role="alert" style={{ color: 'var(--fg)', marginTop: 12 }}>오류: {error}</p>}

      <div className="lbl-mono" style={{ marginTop: 28, marginBottom: 12 }}>최근 프로젝트</div>
      <div className="v2-project-dashboard-grid">
        {projects.map((project) => (
          <button
            key={project.project_id}
            className="card"
            type="button"
            onClick={() => navigateTo(`/projects/${encodeURIComponent(project.project_id)}`)}
            style={{ padding: 22, textAlign: 'left', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 14, minHeight: 210 }}
          >
            <div className="spread">
              <span className="minsim-project-icon"><FlaskConical size={28} aria-hidden="true" /></span>
              <span className={`minsim-project-kind-badge${project.kind === 'poll' ? ' is-poll' : ''}`}>
                {getProjectKindSpec(project.kind).label}
              </span>
            </div>
            <div className="col" style={{ gap: 8, flex: 1 }}>
              <span style={{ fontWeight: 600, fontSize: 16 }}>{project.name}</span>
              <span
                className="muted"
                style={{ fontSize: 12.5, lineHeight: 1.55, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
              >
                {project.description || project.target_notes || '등록 정보 없음'}
              </span>
            </div>
            {project.kind !== 'poll' && (
              <div className="row" style={{ gap: 8, borderTop: '1px dashed var(--border-soft)', paddingTop: 12, flexWrap: 'wrap' }}>
                <span className="lbl-mono">기능 {project.features.length}</span>
                <span className="lbl-mono faint">· 가격 {project.prices.length}</span>
              </div>
            )}
            <div className="spread">
              <span className="lbl">{new Date(project.updated_at).toLocaleDateString('ko-KR')}</span>
            </div>
          </button>
        ))}
        {projects.length > 0 && <button
          className="card"
          type="button"
          onClick={() => setCreating(true)}
          style={{ padding: 22, cursor: 'pointer', border: '1px dashed var(--border-strong)', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 210, color: 'var(--fg-faint)' }}
        >
          <div className="col" style={{ alignItems: 'center', gap: 10 }}>
            <Plus size={26} aria-hidden="true" />
            <span style={{ fontSize: 14 }}>새 프로젝트 만들기</span>
          </div>
        </button>}
      </div>

      {!loading && projects.length === 0 && !creating && (
        <div className="card minsim-empty-projects">
          <FlaskConical size={28} aria-hidden="true" />
          <strong>아직 프로젝트가 없습니다</strong>
          <p className="muted">제품이나 서비스별로 프로젝트를 만들면 입력 정보와 실행 이력이 함께 쌓입니다.</p>
          <button className="btn primary" type="button" onClick={() => setCreating(true)}><Plus size={16} /> 첫 프로젝트 만들기</button>
        </div>
      )}

      {loading && <p className="muted" style={{ marginTop: 16 }}>불러오는 중…</p>}
    </div>
  )
}
