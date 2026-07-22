export type V2Stage = 'projects' | 'type' | 'intake' | 'results'

export type V2StatusTone = 'neutral' | 'success' | 'warning' | 'danger'

export type V2MetricCard = {
  label: string
  value: string
  detail: string
}

export type V2RankRow = {
  id: string
  label: string
  name: string
  count: number | null
  pct: number | null
  detail: string | null
  color: string
  winner: boolean
}

export type V2SegmentCell = {
  label: string
  count: number
  pct: number
}

export type V2SegmentRow = {
  segment: string
  total: number
  cells: V2SegmentCell[]
}

export type V2SegmentMatrix = {
  id: string
  label: string
  columns: string[]
  rows: V2SegmentRow[]
}

export type V2EvidenceQuote = {
  uuid: string
  label: string
  meta: string
  body: string
  tone: 'positive' | 'neutral' | 'negative'
  cohort: string
}

export type V2ResultView = {
  runId: string
  simulationLabel: string
  headline: string
  conclusion: string
  winnerLabel: string
  winnerName: string
  winnerPct: number | null
  runnerUpLabel: string | null
  marginPct: number | null
  confidenceLabel: string
  confidenceBody: string
  statusLabel: string
  cards: V2MetricCard[]
  ranks: V2RankRow[]
  positiveSignals: string[]
  objections: string[]
  recommendations: string[]
  warnings: string[]
  segmentMatrices: V2SegmentMatrix[]
  evidenceQuotes: V2EvidenceQuote[]
  methodology: string[]
}

export type V2FollowupLogEntry = {
  id: string
  kind: 'followup' | 'interview'
  question: string
  cohort: string
  summary: string
  answers: string[]
}
