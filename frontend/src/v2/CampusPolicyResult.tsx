import { useState } from 'react'
import { getRunSurvey, type SurveyExportResponse } from '../api/runs'
import type { CampusPolicyMetrics } from '../types/api'
import { reconcileCampusPolicyMetrics } from './campusPolicyCopy'

const FALLBACK_TIER_ORDER = ['학부생', '석·박사 재학', '박사후연구원', '교직원']
const FALLBACK_HOUSING_ORDER = ['기숙사', '현풍 원룸', '대구 시내 통근']
const STANCE_ORDER = ['찬성', '반대', '판단유보']

const STANCE_COLOR: Record<string, string> = {
  찬성: 'var(--segment-retain)',
  반대: 'var(--segment-churn)',
  판단유보: 'var(--fg-ghost)',
}

function signed(value: number): string {
  return `${value > 0 ? '+' : ''}${value}`
}

/** 순찬성 크기를 배경 농도로 바꾼다. 부호가 색을 결정한다. */
function heat(netSupport: number): string {
  const magnitude = Math.min(Math.abs(netSupport) / 60, 1)
  const rgb = netSupport >= 0 ? '67,217,163' : '242,105,140'
  return `rgba(${rgb},${(magnitude * 0.3).toFixed(3)})`
}

export function CampusPolicyResult({
  metrics,
  runId,
}: {
  metrics: CampusPolicyMetrics
  runId?: string | null
}) {
  // 계층 비교 성립 여부는 dominant_stance가 아니라 셀 간 폭이 정한다.
  const tierUsable = metrics.tier_spread >= metrics.tier_spread_min
  const [survey, setSurvey] = useState<SurveyExportResponse | null>(null)
  const [surveyBusy, setSurveyBusy] = useState(false)
  const [surveyError, setSurveyError] = useState<string | null>(null)

  const loadSurvey = async () => {
    if (!runId) return
    setSurveyBusy(true)
    setSurveyError(null)
    try {
      setSurvey(await getRunSurvey(runId))
    } catch (err) {
      setSurveyError(err instanceof Error ? err.message : String(err))
    } finally {
      setSurveyBusy(false)
    }
  }

  // 임계값은 백엔드 상수를 그대로 받아 쓴다. 문구와 표시가 어긋나면
  // 신뢰도 표기 전체를 믿을 수 없게 된다.
  const threshold = metrics.low_confidence_min_sample
  const tierOrder = metrics.tier_axis?.length ? metrics.tier_axis : FALLBACK_TIER_ORDER
  const housingOrder = metrics.housing_axis?.length ? metrics.housing_axis : FALLBACK_HOUSING_ORDER
  const tierAxisLabel = metrics.tier_axis_label || '계층'
  const housingAxisLabel = metrics.housing_axis_label || '거주'
  const reconcile = reconcileCampusPolicyMetrics(metrics)

  return (
    <div className="col" style={{ gap: 14 }}>
      <section
        className="card"
        style={{
          borderColor: reconcile.conflict ? 'var(--segment-watch)' : 'var(--border)',
          background: reconcile.conflict
            ? 'color-mix(in srgb, var(--segment-watch) 8%, var(--surface))'
            : undefined,
        }}
      >
        <div className="lbl-mono" style={{ marginBottom: 8, color: 'var(--lime)' }}>
          {reconcile.conflict ? '머릿수와 순지지도가 갈립니다' : '찬반 · 순지지도 한눈에'}
        </div>
        <p style={{ fontWeight: 650, fontSize: 15, lineHeight: 1.55, margin: 0 }}>{reconcile.oneLiner}</p>
        <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.55, marginTop: 10 }}>
          {reconcile.legend}
        </p>
        <ul className="row" style={{ gap: 14, listStyle: 'none', padding: 0, marginTop: 12, flexWrap: 'wrap' }}>
          {STANCE_ORDER.map((stance) => {
            const item = metrics.stance_distribution[stance]
            if (!item) return null
            return (
              <li key={stance}>
                <span style={{ color: STANCE_COLOR[stance] }}>■</span> {stance}{' '}
                <b>{item.count}명</b> <span className="lbl-mono">({item.pct}%)</span>
              </li>
            )
          })}
          <li>
            <span className="lbl-mono">순지지도 {signed(metrics.net_support)}%p</span>
          </li>
          <li>
            <span className="lbl-mono">강한 반대 {metrics.strong_opposition_pct}%</span>
          </li>
        </ul>
      </section>

      {metrics.unresolved_choice && (
        <div className="card" role="alert" style={{ borderColor: 'var(--segment-churn)' }}>
          <b>이 안건은 찬반 질문이 아닙니다</b>
          <p className="muted">{metrics.unresolved_choice.reason}</p>
          <ul>
            {metrics.unresolved_choice.branches.map((branch) => (
              <li key={branch}>{branch}</li>
            ))}
          </ul>
        </div>
      )}

      {metrics.bias_warning && (
        <div className="card" role="alert" style={{ borderColor: 'var(--segment-watch)' }}>
          <b>편향 경고</b>
          <p className="muted">{metrics.bias_warning}</p>
        </div>
      )}

      {metrics.sampling.warnings.map((warning) => (
        <div className="card" key={warning}>
          <p className="muted">표본 경고: {warning}</p>
        </div>
      ))}

      {metrics.dominant_stance && (
        <div className="card" style={{ borderColor: 'var(--segment-watch)' }}>
          <h3>
            응답의 {metrics.dominant_stance.pct}%가 &ldquo;{metrics.dominant_stance.stance}&rdquo;입니다
          </h3>
          <p className="muted">
            찬반이 갈리는 안건이 아닙니다. 순찬성 수치 하나로는 이 사실이 덮이므로, 아래 조건
            범주를 먼저 보세요.
          </p>
        </div>
      )}

      {metrics.negated_condition_count > 0 && (
        <div className="card" role="alert">
          <p className="muted">
            조건 칸에 부정문(&ldquo;~하면 반대&rdquo;)을 쓴 응답이{' '}
            <b>{metrics.negated_condition_count}건</b> 있습니다. 반대가 조건부찬성으로 집계됐을 수
            있으니 해당 응답을 확인하세요.
          </p>
        </div>
      )}

      <section className="card">
        <div className="row" style={{ justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <h3>
            {tierAxisLabel} × {housingAxisLabel}
            {tierUsable && ' — 이 결과의 핵심'}
          </h3>
          <span
            className="lbl-mono"
            style={{ color: tierUsable ? 'var(--segment-retain)' : 'var(--segment-churn)' }}
          >
            {tierUsable
              ? `${tierAxisLabel} 간 격차 ${metrics.tier_spread}%p — 비교 성립`
              : `${tierAxisLabel} 간 격차 ${metrics.tier_spread}%p — 비교 불가`}
          </span>
        </div>
        {!tierUsable && (
          <p className="muted" style={{ color: 'var(--segment-churn)' }}>
            신뢰 셀 간 순찬성 격차가 {metrics.tier_spread}%p로 기준({metrics.tier_spread_min}%p)에
            못 미칩니다. <b>{tierAxisLabel} 간 비교를 주장하지 마세요.</b> 아래 셀 값 차이는 의미 없는
            변동입니다. 조건 범주를 보세요.
          </p>
        )}
        <p className="muted">
          절대 수치는 흔들려도 <b>{tierAxisLabel} 간 상대 순위는 유지됩니다</b>.
          이 시뮬레이션이 답하는 질문은 &ldquo;몇 %가 찬성하는가&rdquo;가 아니라
          <b> &ldquo;어느 {tierAxisLabel}이 상대적으로 더 찬성하는가&rdquo;</b>입니다.
          셀은 강도 가중 순찬성 %p이고, 표본 {threshold}명 미만은 비교 불가로 표시합니다.
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th scope="col" />
                {housingOrder.map((housing) => (
                  <th key={housing} scope="col">
                    {housing}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tierOrder.map((tier) => (
                <tr key={tier}>
                  <th scope="row">{tier}</th>
                  {housingOrder.map((housing) => {
                    const cell = metrics.tier_housing_matrix[tier]?.[housing]
                    if (!cell) return <td key={housing}>—</td>
                    return (
                      <td
                        key={housing}
                        style={{
                          background: cell.low_confidence ? 'transparent' : heat(cell.net_support),
                          opacity: cell.low_confidence ? 0.55 : 1,
                          textAlign: 'center',
                        }}
                      >
                        <b>{signed(cell.net_support)}</b>
                        {cell.low_confidence && <span title="비교 불가"> ⚠</span>}
                        <div className="lbl-mono">n={cell.n}</div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card" style={{ opacity: 0.9 }}>
        <div className="row" style={{ justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <h3 style={{ fontSize: 16 }}>절대 찬성률 (참고용)</h3>
          <span className="lbl-mono" style={{ color: 'var(--segment-watch)' }}>
            프롬프트 문구에 따라 ±25%p 변동
          </span>
        </div>
        <p className="muted" style={{ fontSize: 12.5 }}>
          머릿수 비율만 보면 방향을 오해하기 쉽습니다. 위 카드의 순지지도(강도 가중)와 함께 보세요.
          선택지 순서만 바꿔도 절대 찬성률이 크게 움직일 수 있어, 의사결정 단독 근거로 쓰지 마세요.
        </p>
        <p className="muted" style={{ marginTop: 8 }}>
          강도 가중 순찬성 {signed(metrics.net_support)}%p · 강한 반대(강도 4–5){' '}
          {metrics.strong_opposition_pct}%
        </p>
        <div className="row" style={{ height: 36, borderRadius: 7, overflow: 'hidden', gap: 0 }}>
          {STANCE_ORDER.map((stance) => {
            const item = metrics.stance_distribution[stance]
            if (!item || item.pct === 0) return null
            return (
              <div
                key={stance}
                style={{ width: `${item.pct}%`, background: STANCE_COLOR[stance] }}
                title={`${stance} ${item.pct}% (${item.count}명)`}
              />
            )
          })}
        </div>
        <ul className="row" style={{ gap: 16, listStyle: 'none', padding: 0, marginTop: 12, flexWrap: 'wrap' }}>
          {STANCE_ORDER.map((stance) => (
            <li key={stance}>
              <span style={{ color: STANCE_COLOR[stance] }}>■</span> {stance}{' '}
              <b>{metrics.stance_distribution[stance]?.count ?? 0}명</b>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h3>출신지별 — 주말 잔류 프록시</h3>
        <p className="muted">
          출신지는 소속이 아니라 본가·가족 주거지입니다. 귀향 비용의 대리 지표로 읽으세요.
          근거리 출신은 주말에 본가로 가고 원거리 출신은 캠퍼스에 남으므로, 주말·심야 수요는 이
          분포가 결정합니다. 정렬은 표본이 많은 순입니다.
        </p>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {metrics.region_breakdown.rows.map((row) => (
            <li
              key={row.province}
              className="row"
              style={{ gap: 12, opacity: row.low_confidence ? 0.55 : 1 }}
            >
              <span style={{ minWidth: 88 }}>{row.province}</span>
              <span className="lbl-mono">
                {signed(row.net_support)}%p · n={row.n}
                {row.low_confidence && ' ⚠ 비교 불가'}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h3>무엇을 보장하면 되는가</h3>
        <p className="muted">
          자유서술을 그대로 세면 응답 수만큼 서로 다른 문자열이 나옵니다. 범주로 집계합니다.
          {metrics.other_rate > 20 && (
            <>
              {' '}
              <b style={{ color: 'var(--segment-watch)' }}>
                &ldquo;기타&rdquo;가 {metrics.other_rate}%입니다 — 범주가 실제 조건을 담지 못하고
                있으니 다시 설계하세요.
              </b>
            </>
          )}
        </p>
        <ul style={{ listStyle: 'none', padding: 0, marginTop: 12 }}>
          {metrics.condition_categories.map((row) => (
            <li key={row.category} className="col" style={{ gap: 4, marginBottom: 12 }}>
              <div className="row" style={{ justifyContent: 'space-between', gap: 12 }}>
                <span>{row.category}</span>
                <span className="lbl-mono">
                  {row.count}명 · {row.pct}%
                </span>
              </div>
              <div style={{ height: 8, borderRadius: 4, background: 'var(--surface-3)' }}>
                <div
                  style={{
                    width: `${Math.max(2, row.pct)}%`,
                    height: '100%',
                    borderRadius: 4,
                    background: 'var(--segment-watch)',
                  }}
                />
              </div>
              {row.representative && (
                <span className="muted" style={{ fontSize: 12 }}>
                  예: {row.representative}
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>

      {metrics.condition_conflicts.length > 0 && (
        <section className="card" style={{ borderColor: 'var(--segment-churn)' }}>
          <h3>양립 불가한 조건</h3>
          <p className="muted">
            아래 두 조건은 동시에 만족할 수 없습니다. 평균만 보면 묻히지만 집행 단계에서 터지는
            갈등입니다. 각 {metrics.conflict_min_share}% 이상 지지받을 때만 표시합니다.
          </p>
          <ul style={{ listStyle: 'none', padding: 0, marginTop: 10 }}>
            {metrics.condition_conflicts.map((conflict) => (
              <li key={`${conflict.left}-${conflict.right}`} style={{ marginBottom: 8 }}>
                <b>{conflict.left}</b> ({conflict.left_pct}%) ↔ <b>{conflict.right}</b> (
                {conflict.right_pct}%)
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <h3>실제 설문으로 검증하기</h3>
        <p className="muted">
          이 시뮬레이션은 <b>사전 탐색</b>입니다. 절대 수치는 프롬프트 문구에 따라 흔들리므로,
          결론을 확정하려면 실제 구성원에게 물어야 합니다. 아래 문항을 그대로 설문 도구에
          붙여넣으세요.
        </p>
        <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <button className="btn" type="button" onClick={() => void loadSurvey()} disabled={!runId || surveyBusy}>
            {surveyBusy ? '생성 중…' : '설문 문항 생성'}
          </button>
          {survey && (
            <button
              className="btn ghost"
              type="button"
              onClick={() => void navigator.clipboard?.writeText(survey.plain_text)}
            >
              복사
            </button>
          )}
          {surveyError && <span role="alert" className="muted">{surveyError}</span>}
        </div>
        {survey && (
          <ol style={{ marginTop: 14 }}>
            {survey.questions.map((question) => (
              <li key={question.text} style={{ marginBottom: 10 }}>
                {question.text}
                {question.options.length > 0 && (
                  <ul>
                    {question.options.map((option) => (
                      <li key={option} className="muted">{option}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="card">
        <h3>반대 사유</h3>
        <ol>
          {metrics.opposition_reasons.map((item) => (
            <li key={item.reason}>
              {item.reason} <b>{item.count}명</b>
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}
