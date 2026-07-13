import { useEffect, useState } from 'react'
import { archiveProject, getProject, listProjectRuns, updateProject } from '../api/projects'
import type { ProjectResponse, ProjectRunItem } from '../types/api'
import { navigateTo } from './navigation'

export function ProjectDetailPage({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<ProjectResponse | null>(null)
  const [runs, setRuns] = useState<ProjectRunItem[]>([])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [productContext, setProductContext] = useState('')
  const [features, setFeatures] = useState('')
  const [prices, setPrices] = useState('')
  const [targetNotes, setTargetNotes] = useState('')
  const [alternatives, setAlternatives] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([getProject(projectId), listProjectRuns(projectId)])
      .then(([projectResponse, runsResponse]) => {
        if (cancelled) return
        setProject(projectResponse)
        setRuns(runsResponse.runs)
        setName(projectResponse.name)
        setDescription(projectResponse.description)
        setProductContext(stringFromContext(projectResponse.product_context))
        setFeatures(projectResponse.features.join('\n'))
        setPrices(projectResponse.prices.join('\n'))
        setTargetNotes(projectResponse.target_notes)
        setAlternatives(projectResponse.alternatives.join('\n'))
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
    return () => {
      cancelled = true
    }
  }, [projectId])

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const updated = await updateProject(projectId, {
        name,
        description,
        product_context: { product_description: productContext },
        features: splitLines(features),
        prices: splitLines(prices, { splitCommas: false }),
        target_notes: targetNotes,
        alternatives: splitLines(alternatives),
      })
      setProject(updated)
      setNotice('저장했습니다.')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const archive = async () => {
    if (!window.confirm('이 프로젝트를 보관하시겠습니까? 프로젝트 목록에서 숨겨집니다.')) return
    try {
      await archiveProject(projectId)
      navigateTo('/projects')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  if (error) return <p className="v2-error">{error}</p>
  if (!project) return <p className="v2-muted">프로젝트를 불러오는 중</p>

  return (
    <section className="v2-project-detail">
      <div className="v2-page-head">
        <div>
          <p className="v2-kicker">Project</p>
          <h1>{project.name}</h1>
        </div>
        <div className="v2-action-row">
          <button type="button" onClick={() => navigateTo(`/projects/${encodeURIComponent(projectId)}/type`)}>
            새 시뮬레이션
          </button>
          <button type="button" disabled={saving} onClick={save}>{saving ? '저장 중…' : '저장'}</button>
          <button className="v2-danger-action" type="button" onClick={archive}>프로젝트 보관</button>
        </div>
      </div>

      {notice && <p className="v2-muted">{notice}</p>}

      <div className="v2-editor-grid">
        <label>
          <span>이름</span>
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label>
          <span>설명</span>
          <input value={description} onChange={(event) => setDescription(event.target.value)} />
        </label>
        <label className="v2-wide-field">
          <span>제품 컨텍스트</span>
          <textarea value={productContext} onChange={(event) => setProductContext(event.target.value)} rows={5} />
        </label>
        <label>
          <span>기능</span>
          <textarea value={features} onChange={(event) => setFeatures(event.target.value)} rows={5} />
        </label>
        <label>
          <span>가격</span>
          <textarea value={prices} onChange={(event) => setPrices(event.target.value)} rows={5} />
        </label>
        <label className="v2-wide-field">
          <span>타겟 메모</span>
          <textarea value={targetNotes} onChange={(event) => setTargetNotes(event.target.value)} rows={4} />
        </label>
        <label className="v2-wide-field">
          <span>대안/경쟁재</span>
          <textarea value={alternatives} onChange={(event) => setAlternatives(event.target.value)} rows={4} />
        </label>
      </div>

      <section className="v2-report-section">
        <h2>실행 이력</h2>
        <div className="v2-run-list">
          {runs.map((item) => (
            <button
              key={item.run.run_id}
              type="button"
              onClick={() => navigateTo(`/results?project_id=${encodeURIComponent(projectId)}&run_id=${encodeURIComponent(item.run.run_id)}`)}
            >
              <span>{item.run_label ?? item.run.simulation_type}</span>
              <small>{item.run.status} · {item.run.done_count}/{item.run.total_count}</small>
            </button>
          ))}
          {runs.length === 0 && <p className="v2-muted">아직 실행한 시뮬레이션이 없습니다.</p>}
        </div>
      </section>
    </section>
  )
}

function splitLines(value: string, options: { splitCommas?: boolean } = {}): string[] {
  const separator = options.splitCommas === false ? /\n/ : /\n|,/
  return value.split(separator).map((item) => item.trim()).filter(Boolean)
}

function stringFromContext(value: ProjectResponse['product_context']): string {
  const description = value.product_description
  if (typeof description === 'string') return description
  return Object.entries(value)
    .map(([key, item]) => `${key}: ${String(item)}`)
    .join('\n')
}
