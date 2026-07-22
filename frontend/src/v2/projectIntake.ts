import { prepareIntakeSession, createInitialIntakeSession } from '../intake/planner'
import { createSlot, upsertSlot } from '../intake/slotUtils'
import type { IntakeSession, IntakeSlotValue } from '../intake/types'
import { getProjectKindSpec } from '../modes/projectKinds'
import type { ProjectResponse, SimulationType } from '../types/api'
import { autofillMetaOf } from './projectAutofill'

export function createProjectIntakeSession(
  project: ProjectResponse,
  simulationType: SimulationType,
): IntakeSession {
  const base = createInitialIntakeSession()
  const projectDescription = projectDescriptionText(project)
  const autofill = autofillMetaOf(project)
  const generatedFields = new Set(autofill?.filled_fields ?? [])
  let slots = base.slots

  // AI-filled fields the user has not edited stay `generated` so the existing
  // assumption-review gate surfaces them before a run can start.
  const add = (slotId: string, value: IntakeSlotValue['value'], sourceField?: string) => {
    if (!hasValue(value)) return
    const generated = sourceField ? generatedFields.has(sourceField) : false
    slots = upsertSlot(
      slots,
      createSlot(
        slotId,
        value,
        generated ? 'generated' : 'user',
        generated ? 0.6 : 0.99,
        generated ? 'ai project autofill' : 'saved project context',
        generated,
      ),
    )
  }

  add('product_description', projectDescription, 'product_context')
  add('product_context', projectDescription, 'product_context')
  add('key_features', project.features, 'features')
  add('price_points', project.prices, 'prices')
  add('target_customers', project.target_notes ? [project.target_notes] : [], 'target_notes')
  // 갈래 기본 풀을 슬롯에 심어 payload가 nationwide로 조용히 떨어지지 않게 한다.
  // 사용자는 실행 준비 단계의 풀 선택기로 언제든 바꿀 수 있다.
  add('persona_pool', preselectedPersonaPool(project.kind))

  switch (simulationType) {
    case 'startup_item_validation':
      add('item_description', projectDescription, 'product_context')
      add('problem_statement', project.description, 'description')
      add('alternatives', project.alternatives, 'alternatives')
      add('price_hint', project.prices[0] ?? '', 'prices')
      break
    case 'price_optimization':
      add('product_description', projectDescription)
      break
    case 'product_launch':
      add('product_concept', projectDescription)
      add('target_use_case', project.target_notes)
      break
    case 'value_proposition':
      add('product_context', projectDescription)
      break
    case 'market_segmentation':
      add('category', project.name)
      add('product_family', projectDescription)
      add('core_questions', project.description ? [project.description] : [])
      break
    case 'competitive_positioning': {
      add('category_context', projectDescription)
      const products = [project.name, ...project.alternatives].filter(Boolean)
      if (products.length >= 2) add('products', products)
      break
    }
    case 'brand_perception':
      add('brand_name', project.name)
      add('category', project.description || projectDescription)
      add('comparison_brands', project.alternatives)
      break
    case 'churn_prediction':
      add('service_name', project.name)
      add('current_situation', project.description)
      add('competitor_offer', project.alternatives.join('\n'))
      break
    case 'campaign_strategy':
      add('product_context', projectDescription)
      break
    case 'campus_priority': {
      add('question', project.description || `${project.name} 우선순위를 어디에 둘까요?`)
      const fromFeatures = project.features.map((item) => item.trim()).filter(Boolean)
      if (fromFeatures.length >= 3) {
        add('items', fromFeatures.slice(0, 6), 'features')
      }
      break
    }
    case 'campus_policy':
      add('agenda', project.name)
      add('current_state', projectDescription)
      break
    case 'open_survey':
      add('question', project.description || project.name)
      break
    case 'creative_testing':
      break
  }

  if (autofill) {
    for (const assumption of autofill.assumptions) {
      if (!assumption || typeof assumption.slot_id !== 'string') continue
      const value = assumption.value as IntakeSlotValue['value']
      if (!hasValue(value)) continue
      if (hasValue(slots[assumption.slot_id]?.value as IntakeSlotValue['value'])) continue
      slots = upsertSlot(
        slots,
        createSlot(
          assumption.slot_id,
          value,
          'generated',
          typeof assumption.confidence === 'number' ? assumption.confidence : 0.5,
          'ai project autofill',
          true,
        ),
      )
    }
  }

  return prepareIntakeSession({
    ...base,
    messages: [],
    action: null,
    slots,
    taskFrame: {
      taskId: `project-${project.project_id}-${simulationType}`,
      userGoal: project.description || `${project.name}의 의사결정을 검증합니다.`,
      decisionQuestion: project.description || `${project.name}에 대한 반응을 확인합니다.`,
      likelySimulationTypes: [simulationType],
      primarySimulationType: simulationType,
      preSimulationActions: simulationType === 'creative_testing' ? ['generate_creative_candidates'] : [],
      confidence: 0.99,
      evidence: ['saved project context', 'explicit simulation type selection'],
    },
  })
}

function projectDescriptionText(project: ProjectResponse): string {
  const storedDescription = project.product_context.product_description
  if (typeof storedDescription === 'string' && storedDescription.trim()) return storedDescription.trim()
  return [project.description, ...project.features].map((item) => item.trim()).filter(Boolean).join('\n') || project.name
}

function hasValue(value: IntakeSlotValue['value']): boolean {
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'string') return value.trim().length > 0
  return value !== null && value !== undefined
}

/** 프로젝트 갈래 기본 풀. sessionStorage에 선점이 있으면 그걸 우선한다. */
function preselectedPersonaPool(projectKind?: string | null): string {
  try {
    const stored = window.sessionStorage.getItem('minsim.personaPool')
    if (stored === 'dgist' || stored === 'nationwide') return stored
  } catch {
    // sessionStorage 접근 불가 시 갈래 기본값.
  }
  return getProjectKindSpec(projectKind).defaultPersonaPool
}
