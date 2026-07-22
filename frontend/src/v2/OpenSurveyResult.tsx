import type { OpenSurveyMetrics } from '../types/api'

const FALLBACK_TIER_ORDER = ['학부생', '석·박사 재학', '박사후연구원', '교직원']

/** 최다 선택지 대비 상대 폭. 선택지 수가 달라도 눈으로 비교되게 한다. */
function barWidth(pct: number, max: number): string {
  if (max <= 0) return '0%'
  return `${Math.max(2, Math.round((pct / max) * 100))}%`
}

export function OpenSurveyResult({ metrics }: { metrics: OpenSurveyMetrics }) {
  const threshold = metrics.low_confidence_min_sample
  const maxPct = metrics.choice_rows[0]?.pct ?? 0
  const tierOrder = metrics.tier_axis?.length
    ? metrics.tier_axis
    : FALLBACK_TIER_ORDER
  const tierAxisLabel = metrics.tier_axis_label || '계층'
  const tiersWithData = tierOrder.filter(
    (tier) => (metrics.tier_rows.find((row) => row.tier === tier)?.n ?? 0) > 0,
  )
  const reasonGroups = metrics.options
    .map((option) => ({ option, reasons: metrics.reasons_by_choice[option] ?? [] }))
    .filter((group) => group.reasons.length > 0)

  return (
    <div className="minsim-open-survey">
      <section className="card minsim-open-survey-card">
        <header className="minsim-open-survey-card-head">
          <h3>물어본 질문</h3>
        </header>
        <p className="minsim-open-survey-question">
          {metrics.question || '질문이 기록되지 않았습니다.'}
        </p>
        <div className="minsim-open-survey-options" aria-label={`선택지 ${metrics.options.length}개`}>
          <span className="minsim-open-survey-options-label">선택지 {metrics.options.length}개</span>
          <ul>
            {metrics.options.map((option) => (
              <li key={option}>{option}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="card minsim-open-survey-card">
        <header className="minsim-open-survey-card-head">
          <h3>선택지별 응답</h3>
        </header>
        <p className="muted minsim-open-survey-lead">
          응답자가 고른 선택지 분포입니다. 표본 {threshold}명 미만인 계층은 아래 표에서 흐리게
          표시되며, 그 계층의 결론은 근거로 쓰지 않는 것이 안전합니다.
        </p>
        <ol className="minsim-open-survey-bars">
          {metrics.choice_rows.map((row, index) => (
            <li key={row.option}>
              <div className="minsim-open-survey-bar-meta">
                <span>
                  <b>{index + 1}.</b> {row.option}
                </span>
                <span className="lbl-mono">
                  {row.count}명 · {row.pct}%
                </span>
              </div>
              <div className="minsim-open-survey-bar-track" aria-hidden="true">
                <div
                  className={`minsim-open-survey-bar-fill${index === 0 ? ' is-lead' : ''}`}
                  style={{ width: barWidth(row.pct, maxPct) }}
                />
              </div>
            </li>
          ))}
        </ol>
      </section>

      {tiersWithData.length > 0 && (
        <section className="card minsim-open-survey-card">
          <header className="minsim-open-survey-card-head">
            <h3>{tierAxisLabel}별 선택</h3>
          </header>
          <p className="muted minsim-open-survey-lead">
            같은 질문에도 {tierAxisLabel}에 따라 답이 갈릴 수 있습니다. 절대 비율보다 집단 간 차이를 보세요.
          </p>
          <div className="minsim-open-survey-table-wrap" role="region" aria-label={`${tierAxisLabel}별 선택 표`} tabIndex={0}>
            <table className="minsim-open-survey-table">
              <thead>
                <tr>
                  <th scope="col">{tierAxisLabel}</th>
                  <th scope="col">표본</th>
                  <th scope="col">최다 선택</th>
                </tr>
              </thead>
              <tbody>
                {metrics.tier_rows
                  .filter((row) => row.n > 0)
                  .map((row) => (
                    <tr key={row.tier} className={row.low_confidence ? 'is-low-confidence' : undefined}>
                      <td>{row.tier}</td>
                      <td className="lbl-mono">
                        {row.n}명{row.low_confidence ? ' ⚠' : ''}
                      </td>
                      <td>{row.top_option || '—'}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <p className="muted minsim-open-survey-footnote">
            ⚠ 표시는 표본 {threshold}명 미만입니다.
          </p>
        </section>
      )}

      {reasonGroups.length > 0 && (
        <section className="card minsim-open-survey-card">
          <header className="minsim-open-survey-card-head">
            <h3>선택 이유</h3>
          </header>
          <div className="minsim-open-survey-reasons">
            {reasonGroups.map(({ option, reasons }) => (
              <article key={option} className="minsim-open-survey-reason-group">
                <h4>{option}</h4>
                <ul>
                  {reasons.map((item) => (
                    <li key={item.reason}>
                      <span>{item.reason}</span>
                      {/* Free-text reasons almost never cluster, so count=1 after every quote is noise. */}
                      {item.count > 1 ? (
                        <span className="muted">({item.count}명)</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
