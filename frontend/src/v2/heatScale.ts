import type { CSSProperties } from 'react'

/**
 * Single heat-cell ramp for every report heatmap (A-2).
 *
 * Token contract (values remapped by the Hanover dark theme):
 * --heat-opp / --heat-risk / --heat-surface in the active theme block.
 */
export function heatCellStyle(
  value: number,
  opts: { kind?: 'opportunity' | 'risk'; colorVar?: string } = {},
): CSSProperties {
  const t = Math.max(0, Math.min(100, value)) / 100
  const color = opts.colorVar ?? (opts.kind === 'risk' ? 'var(--heat-risk)' : 'var(--heat-opp)')
  const mix = Math.round(8 + t * 52)
  return {
    background: `color-mix(in srgb, ${color} ${mix}%, var(--heat-surface))`,
    border: '1px solid var(--border-soft)',
  }
}

export function columnExtremes(rows: number[][]): { max: number[]; min: number[] } {
  const cols = rows[0]?.length ?? 0
  const max = Array.from({ length: cols }, (_, col) =>
    Math.max(...rows.map((row) => row[col] ?? 0)),
  )
  const min = Array.from({ length: cols }, (_, col) =>
    Math.min(...rows.map((row) => row[col] ?? 0)),
  )
  return { max, min }
}
