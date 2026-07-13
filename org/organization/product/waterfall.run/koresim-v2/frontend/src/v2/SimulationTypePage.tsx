import { useState } from 'react'
import { ChartLineDown, CurrencyKrw, FlagBanner, Megaphone, Package, PuzzlePiece, Quotes, Tag, Target } from '@phosphor-icons/react'
import type { SimulationType } from '../types/api'
import { navigateTo } from './navigation'

type TypeMeta = { id: SimulationType; icon: typeof Target; title: string; q: string }

const SIM_TYPES: TypeMeta[] = [
  { id: 'creative_testing', icon: Target, title: '크리에이티브 비교', q: '어떤 카피·메시지가 가장 끌리는가?' },
  { id: 'price_optimization', icon: CurrencyKrw, title: '가격 최적화', q: '최적 가격대는 얼마인가?' },
  { id: 'product_launch', icon: Package, title: '신제품 반응', q: '신제품 시장 반응은 어떤가?' },
  { id: 'value_proposition', icon: Quotes, title: '가치 제안', q: '어떤 VP가 설득력 있는가?' },
  { id: 'market_segmentation', icon: PuzzlePiece, title: '시장 세분화', q: '어떤 타깃 세그먼트가 존재하는가?' },
  { id: 'competitive_positioning', icon: FlagBanner, title: '경쟁 포지셔닝', q: '경쟁사 대비 우리는 어디에 있는가?' },
  { id: 'brand_perception', icon: Tag, title: '브랜드 인지도', q: '브랜드 이미지는 어떤가?' },
  { id: 'churn_prediction', icon: ChartLineDown, title: '이탈 예측', q: '어떤 고객이 떠나려 하는가?' },
  { id: 'campaign_strategy', icon: Megaphone, title: '캠페인 전략', q: '최적 채널·메시지 조합은?' },
]

export function SimulationTypePage({ projectId }: { projectId: string }) {
  const [selected, setSelected] = useState<SimulationType>('creative_testing')
  const chosen = SIM_TYPES.find((type) => type.id === selected) ?? SIM_TYPES[0]

  const start = () => {
    navigateTo(`/projects/${encodeURIComponent(projectId)}/intake?type=${encodeURIComponent(selected)}`)
  }

  return (
    <div className="wrap" style={{ paddingTop: 40, paddingBottom: 72 }}>
      <div className="spread" style={{ alignItems: 'flex-end', marginBottom: 8, flexWrap: 'wrap', gap: 16 }}>
        <div className="col" style={{ gap: 8 }}>
          <div className="kicker">먼저 선택</div>
          <h1 style={{ fontSize: 30 }}>어떤 시뮬레이션으로 볼까요?</h1>
          <p className="muted" style={{ fontSize: 14, maxWidth: 560, lineHeight: 1.55 }}>
            유형을 먼저 고르면 다음 대화에서 필요한 질문과 입력이 그 목적에 맞게 정리됩니다.
          </p>
        </div>
      </div>

      <div className="minsim-type-grid">
        {SIM_TYPES.map((type) => {
          const Icon = type.icon
          return (
          <button
            key={type.id}
            className="card"
            type="button"
            aria-pressed={selected === type.id}
            onClick={() => setSelected(type.id)}
            style={{
              padding: 20,
              textAlign: 'left',
              cursor: 'pointer',
              borderColor: selected === type.id ? 'var(--lime-line)' : 'var(--border)',
              background: selected === type.id ? 'var(--lime-soft)' : 'var(--surface)',
              position: 'relative',
            }}
          >
            <div className="spread">
              <Icon size={26} weight="duotone" aria-hidden="true" />
            </div>
            <div style={{ fontWeight: 600, fontSize: 16, margin: '16px 0 6px', color: selected === type.id ? 'var(--lime)' : 'var(--fg)' }}>
              {type.title}
            </div>
            <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.5 }}>{type.q}</div>
          </button>
          )
        })}
      </div>

      <div className="spread" style={{ marginTop: 28, padding: '18px 22px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--surface)', gap: 12, flexWrap: 'wrap' }}>
        <div className="muted" style={{ fontSize: 13.5 }}>
          현재 선택: <span style={{ color: 'var(--lime)', fontWeight: 600 }}>{chosen.title}</span>
        </div>
        <button className="btn primary" type="button" onClick={start}>이 유형으로 시작 →</button>
      </div>
    </div>
  )
}
