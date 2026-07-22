import type { IntakeSlotValue } from '../../intake/types'
import type { SimulationType } from '../../types/api'
import { AssumptionReviewPanel } from './AssumptionReviewPanel'

export function AssumptionReviewMessage({
  assumptions,
  simulationType = 'creative_testing',
  onConfirm,
}: {
  assumptions: IntakeSlotValue[]
  simulationType?: SimulationType
  onConfirm: () => void
}) {
  return (
    <AssumptionReviewPanel
      assumptions={assumptions}
      message="아래 가정을 시뮬레이션에 함께 사용합니다."
      simulationType={simulationType}
      onConfirm={onConfirm}
      variant="ks"
      confirmLabel="가정 확인"
    />
  )
}