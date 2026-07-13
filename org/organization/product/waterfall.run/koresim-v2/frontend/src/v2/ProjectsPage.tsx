import { useEffect, useState, type FormEvent } from 'react'
import { Flask, Plus } from '@phosphor-icons/react'
import { createProject, listProjects } from '../api/projects'
import type { ProjectResponse } from '../types/api'
import { navigateTo } from './navigation'

export function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectResponse[]>([])
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState(() => window.sessionStorage.getItem('minsim.heroPrompt') ?? '')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (window.sessionStorage.getItem('minsim.heroPrompt')) setCreating(true)
    listProjects()
      .then((response) => setProjects(response.projects))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false))
  }, [])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const project = await createProject({
        name,
        description,
        product_context: description ? { product_description: description } : {},
        features: [],
        prices: [],
        alternatives: [],
      })
      window.sessionStorage.removeItem('minsim.heroPrompt')
      navigateTo(`/projects/${encodeURIComponent(project.project_id)}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
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
            <button type="button" className="btn ghost sm" onClick={() => setCreating(false)}>취소</button>
          </div>
          <div className="minsim-project-form-grid">
            <label className="col" style={{ gap: 6 }}>
              <span className="lbl">프로젝트 이름</span>
              <input className="inp" value={name} onChange={(event) => setName(event.target.value)} placeholder="예: 어르신 동반 강아지 로봇" required />
            </label>
            <label className="col" style={{ gap: 6 }}>
              <span className="lbl">한 줄 설명</span>
              <textarea className="inp" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="가격, 타깃, 검증하고 싶은 질문을 적어주세요." rows={2} />
            </label>
            <button className="btn primary" type="submit" disabled={submitting}>{submitting ? '만드는 중…' : '만들고 정보 등록 →'}</button>
          </div>
        </form>
      )}

      {error && <p className="muted" style={{ color: 'var(--fg)', marginTop: 12 }}>⚠ {error}</p>}

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
              <span className="minsim-project-icon"><Flask size={28} weight="duotone" aria-hidden="true" /></span>
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
            <div className="row" style={{ gap: 8, borderTop: '1px dashed var(--border-soft)', paddingTop: 12, flexWrap: 'wrap' }}>
              <span className="lbl-mono">기능 {project.features.length}</span>
              <span className="lbl-mono faint">· 가격 {project.prices.length}</span>
            </div>
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

      {loading && <p className="muted" style={{ marginTop: 16 }}>불러오는 중…</p>}
    </div>
  )
}
