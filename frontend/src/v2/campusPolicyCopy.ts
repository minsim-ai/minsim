import type { CampusPolicyMetrics, StanceCount } from '../types/api'

export type CampusPolicyReconcile = {
  headcountLeader: string | null
  headcountPct: number
  headcountCount: number
  runnerUp: string | null
  runnerUpPct: number
  netSupport: number
  strongOppositionPct: number
  /** Headcount majority sign disagrees with intensity-weighted net support. */
  conflict: boolean
  oneLiner: string
  legend: string
}

function stanceRows(
  distribution: Record<string, StanceCount> | undefined,
): { stance: string; count: number; pct: number }[] {
  if (!distribution) return []
  return Object.entries(distribution)
    .map(([stance, item]) => ({
      stance,
      count: Number(item?.count ?? 0),
      pct: Number(item?.pct ?? 0),
    }))
    .filter((row) => row.count > 0 || row.pct > 0)
    .sort((a, b) => b.count - a.count || b.pct - a.pct || a.stance.localeCompare(b.stance))
}

/**
 * Reconcile headcount majority vs intensity-weighted net_support so the report
 * never sounds like “slightly approved” and “overall rejected” at once (#2).
 */
export function reconcileCampusPolicyMetrics(
  metrics: Pick<
    CampusPolicyMetrics,
    'stance_distribution' | 'net_support' | 'strong_opposition_pct'
  >,
): CampusPolicyReconcile {
  const rows = stanceRows(metrics.stance_distribution)
  const leader = rows[0] ?? null
  const runner = rows[1] ?? null
  const netSupport = Number(metrics.net_support ?? 0)
  const strongOppositionPct = Number(metrics.strong_opposition_pct ?? 0)

  const leaderIsSupport = leader?.stance === '찬성'
  const leaderIsOppose = leader?.stance === '반대'
  const conflict = Boolean(
    leader
    && ((leaderIsSupport && netSupport < 0) || (leaderIsOppose && netSupport > 0)),
  )

  const legend =
    '순지지도는 찬성/반대 머릿수가 아니라 의견 강도(1–5)를 반영한 값입니다. 반대가 더 세면 찬성이 조금 많아도 순지지도는 음수가 될 수 있습니다.'

  let oneLiner: string
  if (!leader) {
    oneLiner = `순지지도는 ${formatSigned(netSupport)}%p입니다.`
  } else if (conflict && leaderIsSupport) {
    oneLiner =
      `머릿수로는 찬성이 ${leader.pct}%(${leader.count}명)로 조금 많지만, ` +
      `반대 강도가 높아 순지지도는 ${formatSigned(netSupport)}%p입니다` +
      (strongOppositionPct > 0 ? ` (강한 반대 ${strongOppositionPct}%).` : '.')
  } else if (conflict && leaderIsOppose) {
    oneLiner =
      `머릿수로는 반대가 ${leader.pct}%(${leader.count}명)로 앞서지만, ` +
      `찬성 강도가 높아 순지지도는 ${formatSigned(netSupport)}%p입니다.`
  } else if (leaderIsSupport && netSupport >= 0) {
    oneLiner =
      `찬성 ${leader.pct}%(${leader.count}명)` +
      (runner ? `, ${runner.stance} ${runner.pct}%` : '') +
      ` · 순지지도 ${formatSigned(netSupport)}%p.`
  } else if (leaderIsOppose && netSupport <= 0) {
    oneLiner =
      `반대 ${leader.pct}%(${leader.count}명)` +
      (runner ? `, ${runner.stance} ${runner.pct}%` : '') +
      ` · 순지지도 ${formatSigned(netSupport)}%p.`
  } else {
    oneLiner =
      `${leader.stance} ${leader.pct}%(${leader.count}명)` +
      (runner ? `, ${runner.stance} ${runner.pct}%` : '') +
      ` · 순지지도 ${formatSigned(netSupport)}%p.`
  }

  return {
    headcountLeader: leader?.stance ?? null,
    headcountPct: leader?.pct ?? 0,
    headcountCount: leader?.count ?? 0,
    runnerUp: runner?.stance ?? null,
    runnerUpPct: runner?.pct ?? 0,
    netSupport,
    strongOppositionPct,
    conflict,
    oneLiner,
    legend,
  }
}

function formatSigned(value: number): string {
  if (Number.isNaN(value)) return '0'
  return `${value > 0 ? '+' : ''}${value}`
}
