import type { RunResultEnvelope } from "../types/api";

export const creativeTestingSuccess10Envelope = {
  schema_version: "result-envelope/v1",
  run_id: "fixture-run-creative-testing-10",
  simulation_type: "creative_testing",
  status: "completed",
  seed: 42,
  sample_size: 10,
  total_responses: 10,
  parse_failed: 2,
  country_id: "kr",
  dataset_name: "Nemotron-Personas-Korea",
  language: "Korean",
  target_filter: {
    province: ["서울", "경기"],
    age_min: 20,
    age_max: 59,
  },
  sample_summary: {
    total: 10,
    by_age: {
      "20대": 2,
      "30대": 3,
      "40대": 3,
      "50대": 2,
    },
    by_sex: {
      여성: 5,
      남성: 5,
    },
    by_province: {
      서울: 6,
      경기: 4,
    },
  },
  quality: {
    parse_success_rate: 80,
    completed_rate: 100,
    grade: "B",
  },
  warnings: [
    "Parse success rate is below the preferred 85% threshold.",
    "This is a 10-person deterministic contract fixture, not a production sample.",
  ],
  metrics: {
    creatives: [
      "신선한 아침을 여는 한 잔, 카페라떼",
      "활기찬 하루의 시작, 진한 아메리카노",
      "건강한 시작, 따뜻한 녹차",
    ],
    choice_counts: {
      A: 4,
      B: 3,
      C: 1,
    },
    choice_pct: {
      A: 50,
      B: 37.5,
      C: 12.5,
    },
    reasons_by_choice: {
      A: [
        "아침 루틴과 잘 맞고 부드러운 느낌입니다.",
        "프리미엄 이미지가 가장 강합니다.",
      ],
      B: [
        "출근길에 필요한 카페인 니즈를 바로 건드립니다.",
        "메시지가 짧고 이해하기 쉽습니다.",
      ],
      C: ["건강한 시작이라는 메시지가 부담 없습니다."],
    },
  },
  segments: {
    breakdown_by_age: {
      "20대": { A: 1, B: 1, C: 0 },
      "30대": { A: 2, B: 1, C: 0 },
      "40대": { A: 1, B: 1, C: 1 },
      "50대": { A: 0, B: 0, C: 0 },
    },
    breakdown_by_sex: {
      여성: { A: 3, B: 1, C: 1 },
      남성: { A: 1, B: 2, C: 0 },
    },
    breakdown_by_province: {
      서울: { A: 3, B: 2, C: 1 },
      경기: { A: 1, B: 1, C: 0 },
    },
  },
  insights: [
    {
      type: "winner",
      title: "A안 우세",
      evidence: "유효 응답 8건 중 A안이 4건으로 가장 높습니다.",
    },
  ],
  raw_results: [
    {
      uuid: "fixture-001",
      persona: {
        uuid: "fixture-001",
        age: 32,
        sex: "여성",
        province: "서울",
        district: "마포구",
        occupation: "사무직",
        education_level: "대졸",
      },
      response: '{"choice":"A","reason":"아침 루틴과 잘 맞고 부드러운 느낌입니다."}',
      parsed: {
        choice: "A",
        reason: "아침 루틴과 잘 맞고 부드러운 느낌입니다.",
      },
      error: null,
    },
    {
      uuid: "fixture-007",
      persona: {
        uuid: "fixture-007",
        age: 45,
        sex: "남성",
        province: "경기",
        district: "성남시",
        occupation: "개발자",
        education_level: "대졸",
      },
      response: "잘 모르겠습니다. 세 안 모두 비슷합니다.",
      parsed: null,
      error: "PARSING_FAILED",
    },
  ],
  model_alias: "fixture_persona_default",
  provider: "fixture",
  provider_model: "creative_testing_10",
  llm_backend: "gemini",
  trace_id: null,
  orchestration: {
    graph: {
      steps: ["prepare", "execute", "analyze", "report", "qa"],
      qa: { passed: true },
    },
    agents: {
      analysis: {
        agent: "analysis",
        mode: "llm",
        task_type: "analysis",
        prompt_version: "analysis:v2-20260512",
        summary: "A안이 선택률과 정성 이유 모두에서 가장 안정적인 반응을 보입니다.",
        key_findings: [
          {
            metric_key: "choice_counts",
            finding: "A안이 유효 응답 8건 중 4건으로 1위입니다.",
            evidence: "choice_counts A=4, B=3, C=1",
            confidence: 0.78,
          },
          {
            metric_key: "reasons_by_choice",
            finding: "A안 선택 이유는 아침 루틴과 프리미엄 이미지로 반복됩니다.",
            evidence: "reasons_by_choice.A에 루틴/프리미엄 근거가 포함됩니다.",
            confidence: 0.72,
          },
        ],
        segment_notes: [
          {
            segment_key: "breakdown_by_age.30대",
            note: "30대에서 A안 반응이 상대적으로 강합니다.",
            evidence: "30대 A=2, B=1, C=0",
          },
        ],
      },
      report: {
        agent: "report",
        mode: "llm",
        task_type: "report",
        prompt_version: "report:v2-20260512",
        headline: "A안을 기준안으로 두고 메시지 세부 표현을 재검증합니다.",
        recommendations: [
          {
            priority: "high",
            action: "A안을 기준안으로 유지하고 B안의 짧은 메시지 장점을 보조 카피로 흡수합니다.",
            reason: "A안이 1위지만 B안과 격차가 작아 메시지 조합 검증 가치가 있습니다.",
          },
          {
            priority: "medium",
            action: "30대 여성 세그먼트에서 A안 루틴 메시지를 별도 확인합니다.",
            reason: "세그먼트 집계에서 A안 반응이 반복됩니다.",
          },
        ],
        risks: [
          {
            severity: "medium",
            risk: "10명 fixture는 출시 의사결정 표본으로 부족합니다.",
            mitigation: "동일 조건에서 50명 이상으로 재실행해 방향성을 고정합니다.",
          },
        ],
      },
      qa: {
        agent: "qa",
        mode: "llm",
        task_type: "qa",
        prompt_version: "qa:v2-20260512",
        passed: true,
        severity: "directional_only",
        warnings: [],
        review_notes: ["소표본 fixture이므로 방향성 검증으로만 해석합니다."],
        confidence: 0.74,
      },
    },
  },
} satisfies RunResultEnvelope;
