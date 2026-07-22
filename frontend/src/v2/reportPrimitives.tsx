import { SMALL_SAMPLE_THRESHOLD, formatShare } from './minsimReport'

/** Unified low-sample warning badge (A-1). Renders nothing when n is enough. */
export function SampleBadge({ n, threshold = SMALL_SAMPLE_THRESHOLD }: { n: number; threshold?: number }) {
  if (n >= threshold) return null
  return <span className="minsim-sample-badge">표본 부족 · n={n}</span>
}

/** "8.3% (12명 중 1명)" — every share display carries absolute counts (A-1). */
export function ShareText({ pct, count, total }: { pct: number; count: number; total: number }) {
  return <>{formatShare(pct, count, total)}</>
}
