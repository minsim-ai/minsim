import {
  dedupeAssumptions,
  formatAssumptionDisplayValue,
  slotLabelFor,
  sourceLabelFor,
} from '../../intake/assumptionDisplay'
import type { IntakeSlotValue } from '../../intake/types'
import type { SimulationType } from '../../types/api'

export function AssumptionReviewPanel({
  assumptions,
  message,
  simulationType,
  onConfirm,
  variant = 'minsim',
  confirmLabel = '가정 확인하고 계속 →',
}: {
  assumptions: IntakeSlotValue[]
  message: string
  simulationType: SimulationType
  onConfirm: () => void
  variant?: 'minsim' | 'ks'
  confirmLabel?: string
}) {
  const rows = dedupeAssumptions(assumptions, simulationType)

  if (variant === 'ks') {
    return (
      <div className="ks-assumption-review">
        <div className="ks-assumption-box">
          <span className="ks-assumption-title">확인할 가정 · {rows.length}개</span>
          <p className="ks-assumption-lead">{message}</p>
          <div className="ks-assumption-rows">
            {rows.map((assumption, index) => (
              <AssumptionRow
                key={`${assumption.slotId}-${String(assumption.value)}`}
                assumption={assumption}
                simulationType={simulationType}
                variant="ks"
                isLast={index === rows.length - 1}
              />
            ))}
          </div>
        </div>
        <div className="ks-chat-actions">
          <button className="ks-chat-btn ks-chat-btn--primary" type="button" onClick={onConfirm}>
            {confirmLabel.replace(' →', '')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="minsim-action-card minsim-assumption-review">
      <div className="minsim-action-head minsim-assumption-head">
        <div className="minsim-assumption-title-row">
          <span className="lbl-mono">가정 확인</span>
          <span className="minsim-assumption-count">{rows.length}개 항목</span>
        </div>
        <p>{message}</p>
      </div>

      <div className="minsim-assumption-panel" aria-label="시뮬레이션 가정 목록">
        {rows.map((assumption, index) => (
          <AssumptionRow
            key={`${assumption.slotId}-${String(assumption.value)}`}
            assumption={assumption}
            simulationType={simulationType}
            variant="minsim"
            isLast={index === rows.length - 1}
          />
        ))}
      </div>

      <button className="minsim-assumption-confirm-btn" type="button" onClick={onConfirm}>
        {confirmLabel}
      </button>
    </div>
  )
}

function AssumptionRow({
  assumption,
  simulationType,
  variant,
  isLast = true,
}: {
  assumption: IntakeSlotValue
  simulationType: SimulationType
  variant: 'minsim' | 'ks'
  isLast?: boolean
}) {
  const values = formatAssumptionDisplayValue(assumption.value)
  const isList = values.length > 1
  const rowClass = variant === 'ks' ? 'ks-assumption-row' : `minsim-assumption-row${isLast ? '' : ' has-divider'}`
  const headClass = variant === 'ks' ? 'ks-assumption-row-head' : 'minsim-assumption-row-head'
  const sourceClass =
    variant === 'ks'
      ? `ks-assumption-source is-${assumption.source}`
      : `minsim-assumption-source is-${assumption.source}`
  const valueClass = variant === 'ks' ? 'ks-assumption-row-value' : 'minsim-assumption-row-value'
  const listClass = variant === 'ks' ? 'ks-assumption-list-values' : 'minsim-assumption-list-values'

  return (
    <article className={rowClass}>
      <div className={headClass}>
        <strong>{slotLabelFor(simulationType, assumption.slotId)}</strong>
        <span className={sourceClass}>{sourceLabelFor(assumption.source)}</span>
      </div>
      {isList ? (
        <ul className={listClass}>
          {values.map((value) => (
            <li key={value}>{value}</li>
          ))}
        </ul>
      ) : (
        <p className={valueClass}>{values[0]}</p>
      )}
    </article>
  )
}