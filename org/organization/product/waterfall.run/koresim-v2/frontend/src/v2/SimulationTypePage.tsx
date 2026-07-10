import type { SimulationType } from '../types/api'
import { simulationLabels } from '../simulations/registry'
import { navigateTo } from './navigation'

const simulationTypes: SimulationType[] = [
  'creative_testing',
  'price_optimization',
  'product_launch',
  'value_proposition',
  'market_segmentation',
  'competitive_positioning',
  'brand_perception',
  'churn_prediction',
  'campaign_strategy',
]

export function SimulationTypePage({ projectId }: { projectId: string }) {
  return (
    <section className="v2-type-page">
      <div className="v2-page-head">
        <div>
          <p className="v2-kicker">Simulation</p>
          <h1>무엇을 검증할까요?</h1>
        </div>
      </div>
      <div className="v2-type-grid">
        {simulationTypes.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => navigateTo(`/projects/${encodeURIComponent(projectId)}/intake?type=${encodeURIComponent(type)}`)}
          >
            <span>{simulationLabels[type]}</span>
            <small>{type}</small>
          </button>
        ))}
      </div>
    </section>
  )
}
