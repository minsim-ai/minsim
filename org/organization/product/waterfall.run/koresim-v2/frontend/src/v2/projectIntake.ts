import { prepareIntakeSession, createInitialIntakeSession } from '../intake/planner'
import { createSlot, upsertSlot } from '../intake/slotUtils'
import type { IntakeSession, IntakeSlotValue } from '../intake/types'
import type { ProjectResponse, SimulationType } from '../types/api'

export function createProjectIntakeSession(
  project: ProjectResponse,
  simulationType: SimulationType,
): IntakeSession {
  const base = createInitialIntakeSession()
  const projectDescription = projectDescriptionText(project)
  let slots = base.slots

  const add = (slotId: string, value: IntakeSlotValue['value']) => {
    if (!hasValue(value)) return
    slots = upsertSlot(slots, createSlot(slotId, value, 'user', 0.99, 'saved project context', false))
  }

  add('product_description', projectDescription)
  add('product_context', projectDescription)
  add('key_features', project.features)
  add('price_points', project.prices)
  add('target_customers', project.target_notes ? [project.target_notes] : [])

  switch (simulationType) {
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
    case 'creative_testing':
      break
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
