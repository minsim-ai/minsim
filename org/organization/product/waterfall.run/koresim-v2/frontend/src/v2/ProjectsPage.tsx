import { useEffect, useState, type FormEvent } from 'react'
import { createProject, listProjects } from '../api/projects'
import type { ProjectResponse } from '../types/api'
import { navigateTo } from './navigation'

export function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectResponse[]>([])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listProjects()
      .then((response) => setProjects(response.projects))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false))
  }, [])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    const project = await createProject({
      name,
      description,
      product_context: {},
      features: [],
      prices: [],
      alternatives: [],
    })
    navigateTo(`/projects/${encodeURIComponent(project.project_id)}`)
  }

  return (
    <section className="v2-projects">
      <div className="v2-page-head">
        <div>
          <p className="v2-kicker">Projects</p>
          <h1>제품 단위로 시뮬레이션을 이어갑니다</h1>
        </div>
      </div>
      <form className="v2-create-project" onSubmit={submit}>
        <input value={name} onChange={(event) => setName(event.target.value)} aria-label="프로젝트 이름" required />
        <input value={description} onChange={(event) => setDescription(event.target.value)} aria-label="짧은 설명" />
        <button type="submit">새 프로젝트</button>
      </form>
      {loading && <p className="v2-muted">불러오는 중</p>}
      {error && <p className="v2-error">{error}</p>}
      <div className="v2-project-grid">
        {projects.map((project) => (
          <button
            className="v2-project-card"
            key={project.project_id}
            type="button"
            onClick={() => navigateTo(`/projects/${encodeURIComponent(project.project_id)}`)}
          >
            <span>{project.name}</span>
            <small>{project.description || '등록 정보 없음'}</small>
          </button>
        ))}
      </div>
    </section>
  )
}
