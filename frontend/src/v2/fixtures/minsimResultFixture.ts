import type { RunResultEnvelope } from '../../types/api'
import { reconcileCampusPolicyMetrics } from '../campusPolicyCopy'
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
  country_id: 'kr',
  dataset_name: 'Nemotron-Personas-Korea',
  language: 'Korean',
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

const marketSegmentationFixture: RunResultEnvelope = {
  ...minsimResultFixture,
  run_id: 'fixture-minsim-market-segmentation',
  simulation_type: 'market_segmentation',
  sample_size: 40,
  total_responses: 40,
  parse_failed: 0,
  metrics: {
    category: '캘리그래피 및 도장 서비스',
    segment_counts: {
      '감성선물 찾는 직장인': 9,
      '추억선물 찾는 중장년층': 6,
      '감성 소품 수집가': 5,
      '감성선물 준비족': 4,
      '추억선물 실용구매층': 3,
      '감성 선물 찾는 실용파': 2,
      '추억기록 소확행족': 2,
      '감성선물 찾는 예비부부': 2,
      '제주 감성 수집가': 1,
      '추억공예 취향층': 1,
      '추억 기록 희망자': 1,
      '감성선물 실용구매층': 1,
      '추억선물 장인': 1,
      '추억선물 취향층': 1,
      '감성 선물 준비족': 1,
    },
    segment_pct: {
      '감성선물 찾는 직장인': 22.5,
      '추억선물 찾는 중장년층': 15,
      '감성 소품 수집가': 12.5,
      '감성선물 준비족': 10,
      '추억선물 실용구매층': 7.5,
      '감성 선물 찾는 실용파': 5,
      '추억기록 소확행족': 5,
      '감성선물 찾는 예비부부': 5,
      '제주 감성 수집가': 2.5,
      '추억공예 취향층': 2.5,
      '추억 기록 희망자': 2.5,
      '감성선물 실용구매층': 2.5,
      '추억선물 장인': 2.5,
      '추억선물 취향층': 2.5,
      '감성 선물 준비족': 2.5,
    },
    recommended_first_target: '감성선물 찾는 직장인',
    needs: [{ label: '특별한 기념품 제작', count: 9 }],
    pains: [{ label: '제작 시간과 비용 부담', count: 22 }],
  },
  segments: {
    breakdown_by_age: {
      '20대': { '감성선물 찾는 직장인': 5, '감성 소품 수집가': 2, '감성선물 준비족': 1 },
      '30대': { '감성선물 찾는 직장인': 3, '감성선물 찾는 예비부부': 2, '감성 소품 수집가': 2 },
      '40대': { '추억선물 찾는 중장년층': 2, '추억선물 실용구매층': 2, '감성선물 찾는 직장인': 1 },
      '50대': { '추억선물 찾는 중장년층': 4, '추억기록 소확행족': 2 },
    },
    breakdown_by_sex: {
      남자: { '감성선물 찾는 직장인': 4, '추억선물 찾는 중장년층': 3, '감성 소품 수집가': 2 },
      여자: { '감성선물 찾는 직장인': 5, '추억선물 찾는 중장년층': 3, '감성선물 준비족': 3 },
    },
    breakdown_by_province: {
      경기: { '감성선물 찾는 직장인': 4, '감성선물 준비족': 3, '감성 소품 수집가': 2 },
      서울: { '추억선물 찾는 중장년층': 4, '감성선물 찾는 직장인': 3, '추억선물 실용구매층': 2 },
      부산: { '감성선물 찾는 직장인': 2, '감성 소품 수집가': 1 },
      제주: { '제주 감성 수집가': 1, '감성 선물 찾는 실용파': 1 },
    },
  },
  insights: [{ title: 'first_target', choice: '감성선물 찾는 직장인', count: 9, pct: 22.5 }],
  raw_results: [
    {
      uuid: 'persona-seg-1',
      persona: { name: '김민수', age: 34, sex: '남', province: '서울', occupation: '기획자' },
      response: '세그먼트: 감성선물 찾는 직장인\n니즈: 특별한 기념품 제작\n페인: 제작 시간과 비용 부담\n이유: 기념일에 개성 있는 선물이 필요하다.',
      parsed: {
        segment: '감성선물 찾는 직장인',
        need: '특별한 기념품 제작',
        pain: '제작 시간과 비용 부담',
        reason: '기념일에 개성 있는 선물이 필요하다.',
      },
    },
    {
      uuid: 'persona-seg-2',
      persona: { name: '이서연', age: 52, sex: '여', province: '경기', occupation: '주부' },
      response: '세그먼트: 추억선물 찾는 중장년층\n니즈: 추억 기록\n페인: 가격 부담\n이유: 손글씨 품질이 걱정된다.',
      parsed: {
        segment: '추억선물 찾는 중장년층',
        need: '추억 기록',
        pain: '가격 부담',
        reason: '손글씨 품질이 걱정된다.',
      },
    },
  ],
  orchestration: {
    agents: {
      analysis: {
        summary: "캘리그래피 시장에서 '감성선물 찾는 직장인'이 1순위 타깃으로 추천됩니다.",
        key_findings: [
          {
            finding: "가장 높은 니즈는 '특별한 기념품 제작'(9건)으로, 개인화된 선물 제작에 대한 수요 확인",
            evidence: "needs.count=9, needs.label='특별한 기념품 제작'",
            metric_key: 'needs',
            confidence: 0.8,
          },
          {
            finding: "가장 큰 페인 포인트는 '제작 시간과 비용 부담'(22건)",
            evidence: "pains.count=22, pains.label='제작 시간과 비용 부담'",
            metric_key: 'pains',
            confidence: 0.8,
          },
          {
            finding: "'감성선물 찾는 직장인'(9건)이 가장 큰 타깃 세그먼트",
            evidence: 'segment_counts.감성선물_찾는_직장인=9, segment_pct.감성선물_찾는_직장인=22.5',
            metric_key: 'segment_counts',
            confidence: 0.7,
          },
        ],
      },
      report: {
        headline: '감성 선물 수요 대응 및 비용 효율성 강화',
        recommendations: [
          { action: '개인화 선물 패키지 개발', reason: '직장인 타깃과 기념품 니즈가 겹칩니다.' },
        ],
        risks: [
          { risk: '품질 일관성 저하', mitigation: '샘플 테스트와 공정 표준화를 병행합니다.' },
        ],
      },
      qa: { warnings: [] },
    },
  },
  safe_intake_summary: {
    ...minsimResultFixture.safe_intake_summary!,
    simulation_type: 'market_segmentation',
    user_goal: '캘리그래피 시장 세그먼트 파악',
    decision_question: '어떤 타깃 세그먼트가 존재하는가?',
  },
}

/** price_optimization v1: intent can be 100% 구매 while preferred prices differ. */
const priceOptimizationFixture: RunResultEnvelope = {
  ...minsimResultFixture,
  run_id: 'fixture-minsim-price',
  simulation_type: 'price_optimization',
  sample_size: 200,
  total_responses: 200,
  parse_failed: 0,
  metrics: {
    price_points: [12900, 15900, 18900, 21900, 24900],
    intent_counts: { 구매: 200 },
    intent_pct: { 구매: 100 },
    preferred_price_counts: { '12900': 10, '15900': 70, '18900': 80, '21900': 40 },
    preferred_price_pct: { '12900': 5, '15900': 35, '18900': 40, '21900': 20 },
    demand_by_price: {
      '12900': { count: 200, pct: 100 },
      '15900': { count: 190, pct: 95 },
      '18900': { count: 120, pct: 60 },
      '21900': { count: 40, pct: 20 },
      '24900': { count: 0, pct: 0 },
    },
    recommended_price: 12900,
    avg_willingness_to_pay: 18150,
  },
  segments: {
    // Old production shape: intent-keyed segments. Report must rebuild from raw.
    breakdown_by_age: {
      '20대': { 구매: 32 },
      '30대': { 구매: 35 },
    },
    breakdown_by_sex: {
      남자: { 구매: 101 },
      여자: { 구매: 99 },
    },
    breakdown_by_province: {
      경기: { 구매: 37 },
      서울: { 구매: 35 },
    },
  },
  raw_results: [
    {
      uuid: 'price-persona-18900',
      persona: { name: '김선호', age: 29, sex: '남', province: '서울', occupation: '직장인' },
      response: '선호가격: 18900\n의향: 구매\n지불의향가격: 18900\n이유: 새벽 편의 값이 이 정도면 납득돼요.',
      parsed: {
        intent: '구매',
        preferred_price: 18900,
        primary: '18900',
        willingness_to_pay: 18900,
        reason: '새벽 편의 값이 이 정도면 납득돼요.',
      },
    },
    {
      uuid: 'price-persona-15900',
      persona: { name: '이관망', age: 34, sex: '여', province: '경기', occupation: '직장인' },
      response: '선호가격: 15900\n의향: 구매\n지불의향가격: 15900\n이유: 2만원은 부담되고 1만5천대가 편해요.',
      parsed: {
        intent: '구매',
        preferred_price: 15900,
        primary: '15900',
        willingness_to_pay: 15900,
        reason: '2만원은 부담되고 1만5천대가 편해요.',
      },
    },
  ],
  orchestration: {
    agents: {
      analysis: {
        summary: '18,900원 선호가 가장 많지만 15,900원까지 수요가 유지됩니다.',
        key_findings: [
          { finding: '선호 가격 1위는 18,900원', evidence: 'preferred_price_counts.18900=80' },
          { finding: '18,900원 이상에서 수요가 급감', evidence: 'demand_by_price.18900.pct=60' },
        ],
      },
      report: {
        headline: '선호 가격과 수요 곡선을 함께 보고 가격 전략을 정하세요.',
        recommendations: [
          { action: '기본가 15,900원 검토', reason: '누적 수요와 선호 분포의 균형' },
        ],
        risks: [
          { risk: 'intent 100% 구매만 보면 가격 차별이 안 보임', mitigation: '선호 가격·수요 곡선을 1위로 표시' },
        ],
      },
      qa: { warnings: [] },
    },
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

  if (view.cards.some((card) => card.label.includes('구조화') || card.label.includes('파싱'))) {
    failures.push('user-facing metric cards must not use 구조화/파싱 jargon')
  }
  if (!view.cards.some((card) => card.label === '응답 정리 성공')) {
    failures.push('expected 응답 정리 성공 metric card')
  }

  if (view.winnerLabel !== 'B안') failures.push(`expected B안 winner, got ${view.winnerLabel}`)
  if (view.segmentMatrices.length < 2) failures.push('expected age and province segment matrices')
  if (view.evidenceQuotes.length < 2) failures.push('expected evidence quotes from raw results')
  if (view.recommendations.length === 0) failures.push('expected recommendations')
  if (view.methodology.some((item) => /seed\s*\d+/i.test(item))) failures.push('expected no seed in methodology')
  if (!view.methodology.some((item) => item.includes('응답 정리 성공'))) failures.push('expected parse-success methodology line')

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

  // campus_policy: headcount 찬성 majority + negative net_support must reconcile (#2)
  const campusConflict = reconcileCampusPolicyMetrics({
    stance_distribution: {
      찬성: { count: 86, pct: 53.8 },
      반대: { count: 72, pct: 45.0 },
      판단유보: { count: 2, pct: 1.2 },
    },
    net_support: -6.3,
    strong_opposition_pct: 44.4,
  })
  if (!campusConflict.conflict) failures.push('expected campus headcount/net_support conflict flag')
  if (!campusConflict.oneLiner.includes('머릿수') || !campusConflict.oneLiner.includes('-6.3')) {
    failures.push(`expected reconciled campus one-liner, got ${campusConflict.oneLiner}`)
  }
  if (campusConflict.oneLiner.includes('소폭 높') && campusConflict.oneLiner.includes('부정') && !campusConflict.oneLiner.includes('순지지도')) {
    failures.push('reconciled line must not leave majority vs net_support unexplained')
  }

  const priceReport = buildMinsimReport(priceOptimizationFixture)
  if (priceReport.segment.mode !== 'price') {
    failures.push(`expected price mode, got ${priceReport.segment.mode}`)
  }
  if (priceReport.winner?.id !== '18900' || priceReport.winner?.pct !== 40) {
    failures.push(
      `expected preferred-price winner 18900 at 40%, got ${priceReport.winner?.id ?? 'none'} ${priceReport.winner?.pct ?? 'n/a'}%`,
    )
  }
  if (priceReport.winner?.label !== '18,900원') {
    failures.push(`expected winner label 18,900원, got ${priceReport.winner?.label ?? 'none'}`)
  }
  if (priceReport.runnerUp?.id !== '15900') {
    failures.push(`expected runner-up 15900, got ${priceReport.runnerUp?.id ?? 'none'}`)
  }
  if (priceReport.creatives.some((item) => item.id === '구매' || item.label === '구매')) {
    failures.push('price report must not use intent "구매" as primary outcome')
  }
  if (priceReport.intent !== null) {
    failures.push('expected intent bar suppressed when preferred prices drive the KPI')
  }
  if (!priceReport.segment.metricLabel.includes('선호')) {
    failures.push(`expected price metric label to mention 선호, got ${priceReport.segment.metricLabel}`)
  }
  if (priceReport.crowd.some((item) => item.choice === '구매')) {
    failures.push('expected crowd labels to use preferred prices, not intent')
  }
  if (!priceReport.crowd.some((item) => item.choice === '18900' || item.choice === '15900')) {
    failures.push('expected crowd choice labels from preferred_price')
  }
  // Old intent-keyed segments must be rebuilt so age cells follow prices.
  const priceAge = priceReport.ageFull.find((row) => row.label === '20대' || row.label === '30대')
  if (priceAge?.pct && Object.keys(priceAge.pct).includes('구매')) {
    failures.push('expected age breakdown keys to be prices after client-side rebuild')
  }
  if (priceAge?.pct && !Object.keys(priceAge.pct).some((key) => key === '18900' || key === '15900')) {
    failures.push(`expected age breakdown to include preferred prices, got ${Object.keys(priceAge.pct ?? {}).join(',')}`)
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

  const segmentReport = buildMinsimReport(marketSegmentationFixture)
  if (segmentReport.segment.mode !== 'segment') {
    failures.push(`expected market segmentation mode=segment, got ${segmentReport.segment.mode}`)
  }
  if (segmentReport.segment.focusLabel === 'N/A' || segmentReport.segment.focusId !== '감성선물 찾는 직장인') {
    failures.push(`expected recommended first target focus, got ${segmentReport.segment.focusLabel}`)
  }
  if (segmentReport.segment.overallPct <= 0) {
    failures.push('expected positive segment focus share')
  }
  if (!segmentReport.segment.metricLabel.includes('점유율')) {
    failures.push(`expected segment share metric label, got ${segmentReport.segment.metricLabel}`)
  }
  if (segmentReport.creatives.length < 2) {
    failures.push('expected market segmentation creatives from segment_counts')
  }
  if (segmentReport.ageFull.length === 0 || segmentReport.ageFull.some((row) => row.pct === null)) {
    failures.push('expected age rows with segment percentages')
  }
  const ageWithShare = segmentReport.ageFull.some((row) =>
    Object.values(row.pct ?? {}).some((value) => value > 0),
  )
  if (!ageWithShare) failures.push('expected at least one non-zero age segment cell')
  if (segmentReport.creatives.some((item) => item.label.endsWith('안'))) {
    failures.push('expected segment labels without choice 안 suffix')
  }
  if (segmentReport.creatives.every((item) => !item.id.includes('감성선물'))) {
    failures.push('expected top market segments in creatives')
  }
  const gyeonggi = segmentReport.regions.find((item) => item.name === '경기도')
  if (!gyeonggi || gyeonggi.focusPct <= 0 || gyeonggi.focusLabel === 'N/A') {
    failures.push('expected Gyeonggi segment focus share > 0')
  }
  if (segmentReport.report.findings.some((item) => item.body.includes('needs.count='))) {
    failures.push('expected machine-key evidence to be sanitized from findings body')
  }
  if (segmentReport.core.positives.some((item) => item.body.includes('needs.count=') || item.body.includes('pains.count='))) {
    failures.push('expected core positives without machine-key evidence')
  }
  const humanizedNeed = segmentReport.report.findings.some((item) => item.body.includes('「특별한 기념품 제작」'))
  if (!humanizedNeed) {
    failures.push('expected humanized needs evidence body')
  }
  if (segmentReport.crowd.some((item) => !item.choice)) {
    failures.push('expected segment labels on crowd respondents')
  }
  if (segmentReport.sentiment !== null || segmentReport.intent !== null) {
    failures.push('expected no synthetic sentiment/intent for market segmentation fixture')
  }

  // D-1 invariant I4: any envelope that validates server-side must never make
  // adaptRunResult/buildMinsimReport throw. These hostile shapes mirror the
  // minimal/degraded envelopes the worker now persists on failure paths.
  const adversarialCases: { name: string; envelope: RunResultEnvelope }[] = [
    {
      name: 'empty-metrics',
      envelope: { ...minsimResultFixture, metrics: {}, segments: {}, insights: [], raw_results: [] },
    },
    {
      name: 'zero-responses',
      envelope: {
        ...minsimResultFixture,
        total_responses: 0,
        parse_failed: 0,
        metrics: {},
        segments: {},
        raw_results: [],
      },
    },
    {
      name: 'all-parse-failed',
      envelope: {
        ...minsimResultFixture,
        parse_failed: minsimResultFixture.total_responses,
        raw_results: minsimResultFixture.raw_results.map((raw) => ({
          ...raw,
          parsed: null,
          error: 'PARSING_FAILED',
        })),
      },
    },
    {
      name: 'type-polluted-metrics',
      envelope: {
        ...minsimResultFixture,
        metrics: {
          choice_counts: { A: 'x', B: null },
          choice_pct: 'bogus',
          creatives: 42,
        } as RunResultEnvelope['metrics'],
        segments: {
          breakdown_by_age: { '30대': { A: 'NaN' } },
        } as RunResultEnvelope['segments'],
      },
    },
    {
      name: 'degraded-orchestration',
      envelope: {
        ...minsimResultFixture,
        orchestration: { status: 'degraded', error: 'RuntimeError', graph: {}, agents: {} },
      },
    },
    {
      name: 'minimal-partial-envelope',
      envelope: {
        ...minsimResultFixture,
        status: 'failed',
        metrics: {},
        segments: {},
        insights: [],
        quality: { result_completeness: 'partial', review_required: true, overall_grade: 'C' },
        warnings: ['시뮬레이션 후처리 중 오류가 발생해 부분 결과만 제공됩니다.'],
        orchestration: {},
      },
    },
    {
      name: 'age-n1-and-many-tags',
      envelope: {
        ...minsimResultFixture,
        metrics: {
          segment_counts: Object.fromEntries(
            Array.from({ length: 40 }, (_, index) => [`태그${index}`, 1]),
          ),
          segment_pct: {},
        },
        segments: { breakdown_by_age: { '10대': { 태그1: 1 } } },
      },
    },
  ]
  for (const { name, envelope } of adversarialCases) {
    try {
      adaptRunResult(envelope)
      buildMinsimReport(envelope)
    } catch (error) {
      failures.push(
        `adversarial fixture '${name}' threw: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  const usEnvelope: RunResultEnvelope = {
    ...minsimResultFixture,
    country_id: 'us',
    dataset_name: 'Nemotron-Personas-USA',
    language: 'American English',
    segments: {
      breakdown_by_sex: {
        Female: { A: 2, B: 4 },
        Male: { A: 1, B: 3 },
      },
      breakdown_by_province: {
        CA: { A: 1, B: 3 },
        TX: { A: 2, B: 4 },
      },
    },
    raw_results: [
      {
        uuid: 'us-persona-1',
        persona: {
          sex: 'Female',
          age: 34,
          province: 'CA',
          district: 'Ocala',
          occupation: 'paralegal_or_legal_assistant',
          persona: 'Mary Alberti is a routine-obsessed aficionado who balances work and community.',
          _country_id: 'us',
        },
        response: '선택: B\n이유: Price matters more than convenience.',
        parsed: { choice: 'B', reason: 'Price matters more than convenience.' },
      },
      {
        uuid: 'us-persona-2',
        persona: {
          sex: 'Male',
          age: 49,
          province: 'TX',
          district: 'Austin',
          occupation: 'engineer',
          persona: 'Julio Simmons is a 49-year-old restless polymath whose analytical mind fuels experiments.',
          _country_id: 'us',
        },
        response: '선택: A\n이유: Not convinced yet.',
        parsed: { choice: 'A', reason: 'Not convinced yet.' },
      },
    ],
  }
  const usReport = buildMinsimReport(usEnvelope)
  if (usReport.quotes[0]?.name !== 'Mary Alberti') {
    failures.push(`expected US quote name Mary Alberti, got ${usReport.quotes[0]?.name ?? 'none'}`)
  }
  if (usReport.quotes[1]?.name !== 'Julio Simmons') {
    failures.push(`expected US quote name Julio Simmons, got ${usReport.quotes[1]?.name ?? 'none'}`)
  }
  if (!usReport.quotes[0]?.meta.startsWith('여 ·')) {
    failures.push(`expected US female short label in quote meta, got ${usReport.quotes[0]?.meta ?? 'none'}`)
  }
  if (!usReport.quotes[1]?.meta.startsWith('남 ·')) {
    failures.push(`expected US male short label in quote meta, got ${usReport.quotes[1]?.meta ?? 'none'}`)
  }
  const usFemale = usReport.gender.find((item) => item.g === 'Female')
  const usMale = usReport.gender.find((item) => item.g === 'Male')
  if (!usFemale || !usMale) {
    failures.push('expected US Female/Male gender rows')
  }
  if (usReport.disclaimer) {
    failures.push(`expected empty result disclaimer (landing-only), got ${usReport.disclaimer}`)
  }

  return {
    ok: failures.length === 0,
    checked: 5 + adversarialCases.length,
    failures,
  }
}
