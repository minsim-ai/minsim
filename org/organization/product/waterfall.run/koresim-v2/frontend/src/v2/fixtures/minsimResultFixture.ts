import type { RunResultEnvelope } from '../../types/api'
import { adaptRunResult } from '../resultAdapter'
import { buildMinsimReport } from '../minsimReport'

export type MinsimResultFixtureCheck = {
  ok: boolean
  checked: number
  failures: string[]
}

export const minsimResultFixture: RunResultEnvelope = {
  schema_version: 'result-envelope/v1',
  run_id: 'fixture-minsim-result',
  simulation_type: 'creative_testing',
  status: 'completed',
  seed: 42,
  sample_size: 10,
  total_responses: 10,
  parse_failed: 0,
  target_filter: { province: ['서울'] },
  sample_summary: { actual_sample_size: 10 },
  quality: { parse_success_rate: 100, overall_grade: 'B' },
  warnings: [],
  metrics: {
    creatives: ['외로움 해소', '안심 연결'],
    choice_counts: { A: 3, B: 7 },
    choice_pct: { A: 30, B: 70 },
    reasons_by_choice: {
      B: ['가족이 안심할 수 있다는 점이 분명합니다.', '구매 결정권자에게 바로 와닿습니다.'],
    },
  },
  segments: {
    breakdown_by_age: {
      '40대': { A: 1, B: 4 },
      '60대': { A: 2, B: 3 },
    },
    breakdown_by_province: {
      서울: { A: 1, B: 5 },
      경기: { A: 2, B: 2 },
    },
  },
  insights: [{ title: 'Creative B leads', choice: 'B', count: 7, pct: 70 }],
  raw_results: [
    {
      uuid: 'persona-1',
      persona: { name: '김민수', age: 44, sex: '남', province: '서울', occupation: '기획자' },
      response: '선택: B\n이유: 부모님 상태를 확인할 수 있어 가족 입장에서 안심됩니다.',
      parsed: { choice: 'B', reason: '가족 안심', score: 5 },
    },
    {
      uuid: 'persona-2',
      persona: { name: '이서연', age: 61, sex: '여', province: '경기', occupation: '자영업' },
      response: '선택: A\n이유: 정서적 위로는 좋지만 가격이 걱정됩니다.',
      parsed: { choice: 'A', reason: '가격 우려', score: 2 },
    },
  ],
  model_alias: 'fixture',
  provider: 'fixture',
  provider_model: 'fixture-model',
  llm_backend: 'fixture',
  trace_id: 'trace-fixture',
  orchestration: {
    agents: {
      analysis: {
        summary: 'B안은 안심 가치가 분명해 구매 결정자에게 더 강합니다.',
        key_findings: [{ finding: 'B안의 선택률이 가장 높습니다.' }],
      },
      report: {
        headline: 'B안 안심 연결 메시지를 기준안으로 권장합니다.',
        recommendations: [{ action: 'B안을 기준안으로 상세페이지를 구성합니다.', reason: '선택률 70%' }],
        risks: [{ risk: '가격 우려가 남아 있습니다.', mitigation: '가격 조건부 후속 질문을 실행합니다.' }],
      },
      qa: { warnings: [] },
    },
  },
  safe_intake_summary: {
    schema_version: 'safe-intake-summary/v1',
    user_goal: '카피 비교',
    decision_question: '어떤 카피가 더 설득력 있는가?',
    simulation_type: 'creative_testing',
    user_provided: {},
    inferred: {},
    generated: {},
    defaults: {},
    reviewed_assumptions: {},
    generated_candidates: [],
    constraints: {},
    source_counts: {},
    unreviewed_assumption_count: 0,
  },
}

const churnResultFixture: RunResultEnvelope = {
  ...minsimResultFixture,
  run_id: 'fixture-minsim-churn',
  simulation_type: 'churn_prediction',
  sample_size: 164,
  total_responses: 164,
  metrics: {
    intent_counts: { 유지: 2, 관망: 58, 이탈: 104 },
    intent_pct: { 유지: 1.2, 관망: 35.4, 이탈: 63.4 },
  },
  segments: {
    breakdown_by_age: {
      '20대': { 유지: 2, 관망: 21, 이탈: 28 },
      '30대': { 관망: 19, 이탈: 30 },
      '40대': { 관망: 18, 이탈: 46 },
    },
    breakdown_by_sex: {
      여자: { 유지: 2, 관망: 58, 이탈: 104 },
    },
    breakdown_by_province: {
      경기: { 유지: 1, 관망: 21, 이탈: 29 },
      서울: { 유지: 1, 관망: 13, 이탈: 23 },
      경상남: { 유지: 0, 관망: 1, 이탈: 13 },
      경상북: { 유지: 0, 관망: 2, 이탈: 12 },
      부산: { 유지: 0, 관망: 6, 이탈: 3 },
      인천: { 유지: 0, 관망: 4, 이탈: 5 },
      대구: { 유지: 0, 관망: 3, 이탈: 5 },
      강원: { 유지: 0, 관망: 1, 이탈: 3 },
      충청남: { 유지: 0, 관망: 2, 이탈: 2 },
      광주: { 유지: 0, 관망: 0, 이탈: 3 },
      울산: { 유지: 0, 관망: 2, 이탈: 1 },
      충청북: { 유지: 0, 관망: 1, 이탈: 2 },
      전라남: { 유지: 0, 관망: 1, 이탈: 1 },
      대전: { 유지: 0, 관망: 0, 이탈: 1 },
      전북: { 유지: 0, 관망: 0, 이탈: 1 },
      제주: { 유지: 0, 관망: 1, 이탈: 0 },
    },
  },
  raw_results: [
    {
      uuid: 'persona-churn-1',
      persona: { name: '김영희', age: 67, sex: '여', province: '경기', occupation: '주부' },
      response: '의향: 이탈\n이유: 가격이 오르면 가족과 다시 상의하고 싶습니다.',
      parsed: { intent: '이탈', reason: '가격 인상 부담' },
    },
    {
      uuid: 'persona-churn-2',
      persona: { name: '박정자', age: 72, sex: '여', province: '서울', occupation: '은퇴' },
      response: '의향: 관망\n이유: 돌봄 효과를 조금 더 확인하고 싶습니다.',
      parsed: { intent: '관망', reason: '효과 검증 필요' },
    },
  ],
}

export function runMinsimResultFixtureCheck(): MinsimResultFixtureCheck {
  const view = adaptRunResult(minsimResultFixture)
  const report = buildMinsimReport(minsimResultFixture)
  const failures: string[] = []

  if (view.winnerLabel !== 'B안') failures.push(`expected B안 winner, got ${view.winnerLabel}`)
  if (view.segmentMatrices.length < 2) failures.push('expected age and province segment matrices')
  if (view.evidenceQuotes.length < 2) failures.push('expected evidence quotes from raw results')
  if (view.recommendations.length === 0) failures.push('expected recommendations')
  if (!view.methodology.some((item) => item.includes('seed 42'))) failures.push('expected seed in methodology')

  if (!report.oppRisk) {
    failures.push('expected opportunity/risk map')
  } else {
    if (report.oppRisk.cols.length !== 5) failures.push('expected 5 opportunity/risk columns')
    if (report.oppRisk.rows.length < 2) failures.push('expected opportunity/risk rows for age segments')
    if (!report.oppRisk.rows.every((row) => row.v.length === 5)) failures.push('expected 5 metrics per opportunity/risk row')
    if (!report.oppRisk.rows.every((row) => row.v.every((value) => value >= 0 && value <= 100))) {
      failures.push('expected opportunity/risk values within 0-100')
    }
    if (!report.oppRisk.rows.some((row) => row.sweet)) failures.push('expected one sweet-spot segment')
  }
  if (!report.objections.some((item) => item.reason.includes('가격') && item.pct > 0)) {
    failures.push('expected price objection derived from persona reasons')
  }

  const churnReport = buildMinsimReport(churnResultFixture)
  const churnLabels = churnReport.creatives.map((creative) => creative.label).sort()
  if (churnLabels.join(',') !== '관망,유지,이탈') {
    failures.push(`expected churn intent columns, got ${churnLabels.join(',') || 'none'}`)
  }
  if (churnReport.ageFull.some((row) => row.pct === null)) {
    failures.push('expected churn age rows to include intent percentages')
  }
  if (churnReport.segment.mode !== 'intent' || churnReport.segment.focusId !== '이탈') {
    failures.push('expected churn segment focus to use 이탈 intent')
  }
  if (churnReport.gender.some((item) => item.lead.endsWith('안'))) {
    failures.push('expected churn gender labels without choice suffix')
  }
  if (churnReport.crowd.some((item) => !['이탈', '관망'].includes(item.choice))) {
    failures.push('expected churn respondent intent labels in research workspace')
  }
  const gyeongnam = churnReport.regions.find((item) => item.name === '경상남도')
  if (!gyeongnam || gyeongnam.focusPct !== 92.9 || gyeongnam.lead !== '이탈') {
    failures.push('expected normalized Gyeongnam churn segment')
  }
  const jeju = churnReport.regions.find((item) => item.name === '제주특별자치도')
  if (!jeju || jeju.reliability !== '참고') {
    failures.push('expected sub-10 region to be marked 참고')
  }

  return {
    ok: failures.length === 0,
    checked: 2,
    failures,
  }
}
