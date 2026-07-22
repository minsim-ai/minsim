import type { CampusPriorityMetrics } from '../types/api'

const FALLBACK_TIER_ORDER = ['학부생', '석·박사 재학', '박사후연구원', '교직원']

/** Borda 점수를 최고점 대비 비율 막대로. 절대값은 항목 수에 따라 달라지므로 상대 비교만 의미가 있다. */
function barWidth(score: number, max: number): string {
  if (max <= 0) return '0%'
  return `${Math.max(2, Math.round((score / max) * 100))}%`
}

export function CampusPriorityResult({ metrics }: { metrics: CampusPriorityMetrics }) {
  const threshold = metrics.low_confidence_min_sample
  const rankingAvailable = metrics.ranking_available !== false && metrics.item_rows.length > 0
  const maxScore = metrics.item_rows[0]?.borda_score ?? 0
  const tierOrder = metrics.tier_axis?.length ? metrics.tier_axis : FALLBACK_TIER_ORDER
  const tierAxisLabel = metrics.tier_axis_label || '계층'
  const tiersWithData = tierOrder.filter((tier) => (metrics.tier_rankings[tier]?.n ?? 0) > 0)
  const validAnswers = metrics.valid_answer_count ?? 0

  if (!rankingAvailable) {
    const reason = metrics.ranking_suppressed_reason
    const detail =
      reason === 'zero_parse'
        ? '모든 응답 파싱에 실패했습니다.'
        : reason === 'low_parse_yield'
          ? `유효 응답이 ${validAnswers}명뿐이라 승자를 단정할 수 없습니다.`
          : '순위 집계에 쓸 응답이 없습니다.'
    return (
      <div className="minsim-campus-priority">
        <section className="card" role="alert">
          <header className="minsim-campus-priority-card-head">
            <h3>순위를 표시하지 않습니다</h3>
          </header>
          <p className="muted minsim-campus-priority-lead">
            {detail} 우선순위 항목을 <b>3~6개의 짧은 라벨</b>로 다시 입력한 뒤 재실행하세요.
            조사 목적 설명 문장 전체를 항목으로 넣으면 파싱이 실패하거나 가짜 1위가 생깁니다.
          </p>
          <p className="lbl-mono" style={{ marginTop: 12 }}>
            유효 응답 {validAnswers}명 · 억제 사유 {reason ?? 'unknown'}
          </p>
          {metrics.items.length > 0 && (
            <div className="minsim-campus-priority-options" style={{ marginTop: 14 }}>
              <span className="minsim-campus-priority-options-label">이번 실행에 사용된 항목 (검증용)</span>
              <ul>
                {metrics.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>
    )
  }

  return (
    <div className="minsim-campus-priority">
      {metrics.sampling.warnings.map((warning) => (
        <div className="card" key={warning}>
          <p className="muted" style={{ margin: 0 }}>
            표본 경고: {warning}
          </p>
        </div>
      ))}

      <section className="card">
        <header className="minsim-campus-priority-card-head">
          <h3>전체 순위</h3>
          <span className="lbl-mono" style={{ color: 'var(--segment-retain)' }}>
            항목 순서 무관 (tau +1.00)
          </span>
        </header>
        <p className="muted minsim-campus-priority-lead">
          Borda 점수 기준입니다. 1위 지목률만 보면 2~3순위 선호가 통째로 버려지고, 평균 순위만
          보면 극단적 호불호가 평균에 묻힙니다. 항목은 응답자마다 다른 순서로 제시되므로
          <b> 입력 순서가 결과를 바꾸지 않습니다</b>(2026-07-21 층화 100명 × 3변형 실측).
        </p>
        <ol className="minsim-campus-priority-bars">
          {metrics.item_rows.map((row) => (
            <li key={row.item}>
              <div className="minsim-campus-priority-bar-meta">
                <span>
                  <b>{row.overall_rank}.</b> {row.item}
                </span>
                <span className="lbl-mono">
                  평균 {row.mean_rank}위 · 1위 지목 {row.top_choice_pct}%
                </span>
              </div>
              <div className="minsim-campus-priority-bar-track" aria-hidden="true">
                <div
                  className="minsim-campus-priority-bar-fill"
                  style={{ width: barWidth(row.borda_score, maxScore) }}
                />
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="card">
        <header className="minsim-campus-priority-card-head">
          <h3>{tierAxisLabel}별 순위</h3>
        </header>
        <p className="muted minsim-campus-priority-lead">
          표본 {threshold}명 미만 계층은 비교 불가로 표시합니다. 방향만 참고하고 수치는 쓰지
          마세요.
        </p>
        {/*
          CSS grid rows (not <table>): fixed columns stay aligned on narrow
          phones where table-layout still let 계층/표본 stick together.
        */}
        <div className="minsim-tier-rank" role="table" aria-label={`${tierAxisLabel}별 순위 표`}>
          <div className="minsim-tier-rank-head" role="row">
            <span role="columnheader">{tierAxisLabel}</span>
            <span role="columnheader">표본</span>
            <span role="columnheader">순위</span>
          </div>
          {tiersWithData.map((tier) => {
            const ranking = metrics.tier_rankings[tier]
            return (
              <div
                key={tier}
                className={`minsim-tier-rank-row${ranking.low_confidence ? ' is-low-confidence' : ''}`}
                role="row"
              >
                <span className="minsim-tier-rank-tier" role="cell">
                  {tier}
                </span>
                <span className="minsim-tier-rank-sample lbl-mono" role="cell">
                  n={ranking.n}
                  {ranking.low_confidence ? ' ⚠' : ''}
                </span>
                <span className="minsim-tier-rank-order" role="cell">
                  {ranking.order.join(' › ')}
                </span>
              </div>
            )
          })}
        </div>
      </section>

      <section className="card">
        <header className="minsim-campus-priority-card-head">
          <h3>계층 간 순위 역전</h3>
        </header>
        {metrics.rank_inversions.length === 0 ? (
          <div className="minsim-campus-priority-callout" role="status">
            <span className="minsim-campus-priority-callout-badge lbl-mono">합의</span>
            <div>
              <p className="minsim-campus-priority-callout-title">
                순위가 {metrics.inversion_threshold}단계 이상 갈리는 항목이 없습니다.
              </p>
              <p className="muted" style={{ margin: '6px 0 0' }}>
                계층 간 합의된 안건으로 해석할 수 있습니다. 다만 표본이 한 계층에 몰려 있으면
                이 합의는 재검증이 필요합니다.
              </p>
            </div>
          </div>
        ) : (
          <>
            <p className="muted minsim-campus-priority-lead">
              평균 순위 하나만 보면 묻히는 집행 갈등입니다. 아래 항목은 계층에 따라 우선순위가
              {metrics.inversion_threshold}단계 이상 갈립니다.
            </p>
            <ul className="minsim-campus-priority-inversion-list">
              {metrics.rank_inversions.map((inversion) => (
                <li key={inversion.item} className="minsim-campus-priority-inversion-item">
                  <b>{inversion.item}</b>
                  <span className="muted">
                    {inversion.highest_tier} {inversion.highest_rank}위 ↔ {inversion.lowest_tier}{' '}
                    {inversion.lowest_rank}위 (gap {inversion.gap})
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {(metrics.top_reasons.length > 0 || metrics.bottom_reasons.length > 0) && (
        <section className="card">
          <header className="minsim-campus-priority-card-head">
            <h3>1순위·최하위 이유</h3>
          </header>
          <div className="minsim-campus-priority-reasons">
            {metrics.top_reasons.length > 0 && (
              <article className="minsim-campus-priority-reason-group">
                <h4>1순위를 고른 이유</h4>
                <ul>
                  {metrics.top_reasons.map((row) => (
                    <li key={row.reason}>
                      <span>{row.reason}</span>
                      {row.count > 1 ? (
                        <span className="muted">{row.count}명</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </article>
            )}
            {metrics.bottom_reasons.length > 0 && (
              <article className="minsim-campus-priority-reason-group">
                <h4>최하위를 고른 이유</h4>
                <ul>
                  {metrics.bottom_reasons.map((row) => (
                    <li key={row.reason}>
                      <span>{row.reason}</span>
                      {row.count > 1 ? (
                        <span className="muted">{row.count}명</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </article>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
