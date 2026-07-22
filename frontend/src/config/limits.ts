// Defaults mirror backend /api/config. Event mode overrides via applyPublicConfig().

export let MAX_SAMPLE_SIZE = 2000
export let SAMPLE_SIZE_PRESETS: readonly number[] = [100, 200, 300]
export let DEFAULT_SAMPLE_SIZE = 100
export let EVENT_MODE_ENABLED = false
export let EVENT_BANNER: string | null = null

// Rough fanout throughput at CONCURRENCY≈48, used only for the pre-run duration hint.
export const ESTIMATED_PERSONAS_PER_SECOND = 10

export type PublicConfigSnapshot = {
  max_sample_size?: number
  sample_size_presets?: number[]
  default_sample_size?: number
  event_mode?: {
    enabled?: boolean
    default_sample_size?: number
    max_sample_size?: number
    banner?: string | null
  }
}

export function applyPublicConfig(config: PublicConfigSnapshot | null | undefined): void {
  if (!config) return
  const event = config.event_mode
  EVENT_MODE_ENABLED = Boolean(event?.enabled)
  EVENT_BANNER = event?.banner ?? (EVENT_MODE_ENABLED ? '행사장 체험 모드 · 권장 표본 100명' : null)
  if (EVENT_MODE_ENABLED) {
    MAX_SAMPLE_SIZE = Number(event?.max_sample_size ?? config.max_sample_size ?? 300)
    DEFAULT_SAMPLE_SIZE = Number(event?.default_sample_size ?? config.default_sample_size ?? 100)
    const presets = (config.sample_size_presets ?? [100, 200, 300]).filter(
      (n) => Number.isFinite(n) && n >= 1 && n <= MAX_SAMPLE_SIZE,
    )
    SAMPLE_SIZE_PRESETS = presets.length > 0 ? presets : [Math.min(100, MAX_SAMPLE_SIZE)]
  } else {
    MAX_SAMPLE_SIZE = Number(config.max_sample_size ?? 2000)
    DEFAULT_SAMPLE_SIZE = Number(config.default_sample_size ?? 100)
    const presets = (config.sample_size_presets ?? [100, 200, 300]).filter(
      (n) => Number.isFinite(n) && n >= 1 && n <= MAX_SAMPLE_SIZE,
    )
    SAMPLE_SIZE_PRESETS = presets.length > 0 ? presets : [100]
  }
}

export function clampSampleSize(value: number, fallback = DEFAULT_SAMPLE_SIZE): number {
  if (!Number.isFinite(value) || value < 1) return fallback
  return Math.max(1, Math.min(Math.floor(value), MAX_SAMPLE_SIZE))
}

export function estimatedRunSeconds(sampleSize: number): number {
  return Math.max(10, Math.ceil(sampleSize / ESTIMATED_PERSONAS_PER_SECOND))
}
