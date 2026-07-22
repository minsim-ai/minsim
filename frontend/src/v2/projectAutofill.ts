import type { ProjectAutofillMeta, ProjectResponse } from '../types/api'

export const AUTOFILL_ALL_FIELDS = [
  'name',
  'description',
  'product_context',
  'features',
  'prices',
  'target_notes',
  'alternatives',
] as const

/** 여론조사 프로젝트에는 기능·가격·대안 칸이 없다. 숨은 칸을 몰래 채우지 않는다. */
export const AUTOFILL_POLL_FIELDS = [
  'name',
  'description',
  'product_context',
  'target_notes',
] as const

export function autofillMetaOf(project: ProjectResponse): ProjectAutofillMeta | null {
  const raw = project.product_context.autofill
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const meta = raw as Partial<ProjectAutofillMeta>
  if (meta.source !== 'generated' || typeof meta.recommended_simulation_type !== 'string') {
    return null
  }
  return {
    source: 'generated',
    prompt: typeof meta.prompt === 'string' ? meta.prompt : '',
    recommended_simulation_type: meta.recommended_simulation_type,
    simulation_input:
      meta.simulation_input && typeof meta.simulation_input === 'object'
        ? meta.simulation_input
        : {},
    assumptions: Array.isArray(meta.assumptions) ? meta.assumptions : [],
    notes: Array.isArray(meta.notes) ? meta.notes.filter((note) => typeof note === 'string') : [],
    filled_fields: Array.isArray(meta.filled_fields)
      ? meta.filled_fields.filter((field): field is string => typeof field === 'string')
      : [],
  }
}
