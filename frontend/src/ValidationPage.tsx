import { ArrowLeft, CircleCheck, CircleAlert } from 'lucide-react'

type ValidationMetric = {
  label: string
  value: string
  detail: string
}

const liveMetrics: ValidationMetric[] = [
  {
    label: '9 simulations',
    value: '9/9',
    detail: 'All public external API runs completed through arabesque.cc.',
  },
  {
    label: 'Persona responses',
    value: '1,800',
    detail: '200 responses per simulation preset using Gemini primary path.',
  },
  {
    label: 'Parse failures',
    value: '3',
    detail: 'Only Product Launch had parse misses; no run failed or interrupted.',
  },
  {
    label: 'Public route gate',
    value: 'PASS',
    detail: '/, /app, /results, /api/health, and /api/config returned origin responses.',
  },
]

const cases = [
  {
    title: 'External Gemini 9x200 completion',
    status: 'Passed',
    body:
      'Arabesque completed all 9 simulation presets with 200 personas each through arabesque.cc. The 1,800-response workload finished without failures, demonstrating end-to-end reliability of the public demo path.',
    evidence: [
      'Artifact: docs/verification/external-gemini-9-simulations-200-2026-05-03.json',
      'Provider: gemini / gemini-3-flash-preview',
      'Outcome: 9 completed runs, 0 failed runs, 3 parse failures total',
    ],
  },
  {
    title: 'Public route and SSE replay',
    status: 'Passed',
    body:
      'The current demo route policy is public Cloudflare Tunnel access. The public route gate found no Cloudflare Access challenge markers, and a completed Creative Testing run replayed snapshot, queue, running, and progress SSE events externally.',
    evidence: [
      'Gate: uv run python scripts/check_public_external_demo.py --timeout-seconds 15',
      'SSE run: 8a75b18a-39d0-4eca-b50b-5e07e85f3b17',
      'Browser: live Campaign Strategy result rendered at /results?run_id=5ae261f3-4a17-479d-8457-49618c7a4927',
    ],
  },
]

function navigateToApp() {
  window.history.pushState(null, '', '/app')
  window.dispatchEvent(new PopStateEvent('popstate'))
}

function StatusPill({ status }: { status: string }) {
  const passed = status === 'Passed'
  return (
    <span
      className={passed ? 'ks-validation-pill ks-validation-pill--pass' : 'ks-validation-pill ks-validation-pill--warn'}
    >
      {passed ? <CircleCheck size={14} /> : <CircleAlert size={14} />}
      {status}
    </span>
  )
}

export function ValidationPage() {
  return (
    <div className="ks-validation-page">
      <header className="ks-validation-header">
        <button className="ks-validation-back" onClick={navigateToApp} type="button">
          <ArrowLeft size={14} strokeWidth={2.5} />
          앱으로 돌아가기
        </button>
        <div className="ks-validation-titlebar">
          <p>Arabesque Validation</p>
          <span>public external demo evidence</span>
        </div>
      </header>

      <main className="ks-validation-main">
        <section className="ks-validation-hero">
          <p className="ks-validation-eyebrow">Trust evidence</p>
          <h1>검증 가능한 한국 페르소나 시뮬레이션</h1>
          <p>
            Arabesque 결과는 실제 시장조사를 대체하지 않습니다. 이 페이지는 현재 외부 데모가 어떤
            실행·복구·품질 게이트를 통과했는지 공개해 결과 해석 범위를 분명히 합니다.
          </p>
        </section>

        <section className="ks-validation-metrics" aria-label="Live validation metrics">
          {liveMetrics.map((metric) => (
            <article className="ks-validation-metric" key={metric.label}>
              <p>{metric.label}</p>
              <strong>{metric.value}</strong>
              <span>{metric.detail}</span>
            </article>
          ))}
        </section>

        <section className="ks-validation-cases" aria-label="Validation cases">
          {cases.map((item) => (
            <article className="ks-validation-case" key={item.title}>
              <div className="ks-validation-case-head">
                <h2>{item.title}</h2>
                <StatusPill status={item.status} />
              </div>
              <p>{item.body}</p>
              <ul>
                {item.evidence.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </article>
          ))}
        </section>

        <section className="ks-validation-disclaimer">
          <h2>해석 원칙</h2>
          <p>
            공개 benchmark survey와의 수치 비교는 별도 외부 데이터 사용 허가와 재현 가능한 표본
            정의가 확보된 뒤 추가합니다. 현재 V1 검증 페이지는 live execution reliability,
            parser quality, public route/SSE behavior, local fallback 한계를 공개하는 운영 검증
            케이스입니다.
          </p>
        </section>
      </main>
    </div>
  )
}
