import { getIntakePack } from './packRegistry'
import type { IntakeSlotValue } from './types'
import type { SimulationType } from '../types/api'

const SOURCE_LABELS: Record<IntakeSlotValue['source'], string> = {
  generated: 'AI 생성',
  inferred: '추론',
  default: '기본값',
  user: '직접 입력',
}

const FALLBACK_SLOT_LABELS: Record<string, string> = {
  product_description: '제품 설명',
  product_context: '제품 컨텍스트',
  item_description: '아이템 설명',
  problem_statement: '해결하려는 문제',
  key_features: '핵심 기능',
  alternatives: '대안/경쟁',
  price_hint: '예상 가격',
  price_points: '비교할 가격 후보',
  target_customers: '핵심 고객',
  main_benefit: '가장 큰 장점',
  creative_surface: '테스트할 문구 위치',
  sample_size: '패널 크기',
  seed: '패널 시드',
  n_segments: '세그먼트 수',
  budget: '예산',
}

export function slotLabelFor(simulationType: SimulationType, slotId: string): string {
  const pack = getIntakePack(simulationType)
  return pack.slots.find((slot) => slot.id === slotId)?.label ?? FALLBACK_SLOT_LABELS[slotId] ?? slotId
}

export function sourceLabelFor(source: IntakeSlotValue['source']): string {
  return SOURCE_LABELS[source] ?? source
}

export function formatAssumptionDisplayValue(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') return item.trim()
        if (item && typeof item === 'object' && 'text' in item) {
          return String((item as { text?: unknown }).text ?? '').trim()
        }
        return String(item).trim()
      })
      .filter(Boolean)
  }
  if (typeof value === 'number') return [value.toLocaleString('ko-KR')]
  const text = String(value ?? '').trim()
  return text ? [text] : []
}

function normalizeAssumptionValue(value: unknown): string {
  return formatAssumptionDisplayValue(value).join('|').toLowerCase()
}

export function dedupeAssumptions(
  assumptions: IntakeSlotValue[],
  simulationType: SimulationType,
): IntakeSlotValue[] {
  const pack = getIntakePack(simulationType)
  const slotOrder = new Map(pack.slots.map((slot, index) => [slot.id, index]))
  const seenValues = new Set<string>()

  return [...assumptions]
    .sort((left, right) => (slotOrder.get(left.slotId) ?? 999) - (slotOrder.get(right.slotId) ?? 999))
    .filter((assumption) => {
      const normalized = normalizeAssumptionValue(assumption.value)
      if (!normalized) return false
      if (seenValues.has(normalized)) return false
      seenValues.add(normalized)
      return true
    })
}