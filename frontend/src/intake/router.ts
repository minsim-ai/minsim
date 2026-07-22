import type { SimulationType } from "../types/api";
import { intakePackRegistry } from "./packRegistry";
import type { PreSimulationAction, TaskFrame } from "./types";

const creativeSurfaceHints = [
  { hint: "상세페이지", surface: "상세페이지 헤드라인" },
  { hint: "랜딩", surface: "랜딩페이지 헤드라인" },
  { hint: "헤드라인", surface: "헤드라인" },
  { hint: "광고", surface: "광고 문구" },
  { hint: "카피", surface: "광고 카피" },
  { hint: "문구", surface: "문구" },
];

export function routeIntent(message: string, selectedSimulationType?: SimulationType): TaskFrame {
  const normalized = normalize(message);
  const scored = Object.values(intakePackRegistry)
    .map((pack) => ({
      simulationType: pack.simulationType,
      score: scorePack(normalized, pack.simulationType, pack.routeHints),
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score);

  const primary = selectedSimulationType ?? scored[0]?.simulationType ?? "creative_testing";
  const confidence = selectedSimulationType
    ? 0.99
    : scored[0]?.score ? Math.min(0.96, 0.58 + scored[0].score * 0.12) : 0.45;
  const likelySimulationTypes = [
    primary,
    ...scored.map((candidate) => candidate.simulationType).filter((simulationType) => simulationType !== primary),
  ].slice(0, 3);

  return {
    taskId: buildTaskId(primary, normalized),
    userGoal: message.trim(),
    decisionQuestion: buildDecisionQuestion(primary, normalized),
    likelySimulationTypes,
    primarySimulationType: primary,
    preSimulationActions: buildPreSimulationActions(primary, normalized),
    confidence,
    evidence: [
      ...(selectedSimulationType ? [`selected:${selectedSimulationType}`] : []),
      ...scored.slice(0, 3).map((candidate) => `${candidate.simulationType}:${candidate.score}`),
    ],
  };
}

export function inferCreativeSurface(message: string): string {
  const normalized = normalize(message);
  return creativeSurfaceHints.find(({ hint }) => normalized.includes(hint))?.surface ?? "마케팅 문구";
}

function scorePack(message: string, simulationType: SimulationType, routeHints: string[]): number {
  const baseScore = routeHints.reduce((score, hint) => score + (message.includes(normalize(hint)) ? 1 : 0), 0);
  const boosts: Partial<Record<SimulationType, number>> = {
    price_optimization: /\d[\d,]*\s*원|요금제|구독료|가격/.test(message) ? 2 : 0,
    churn_prediction: /이탈|해지|떠날|전환|구독 취소/.test(message) ? 4 : 0,
    campaign_strategy: /캠페인|채널|매체|예산/.test(message) ? 3 : 0,
    product_launch: /신제품|출시|런칭|시장 반응|컨셉|먹힐/.test(message) ? 2 : 0,
    value_proposition: /가치 제안|장점|소구점|usp|어필/.test(message) ? 2 : 0,
    market_segmentation: /고객군|세그먼트|타겟|분류|나누/.test(message) ? 2 : 0,
    competitive_positioning: /경쟁|포지션|포지셔닝|대비/.test(message) ? 3 : 0,
    brand_perception: /브랜드|인지도|평판|이미지|인식/.test(message) ? 2 : 0,
    creative_testing: /헤드라인|카피|광고 문구|상세페이지 문구|랜딩 문구/.test(message) ? 2 : 0,
  };
  return baseScore + (boosts[simulationType] ?? 0);
}

function buildTaskId(simulationType: SimulationType, message: string): string {
  if (simulationType === "creative_testing" && /헤드라인|상세페이지|랜딩/.test(message)) {
    return "creative_testing.headline_generation_and_test";
  }
  return `${simulationType}.goal_first_intake`;
}

function buildDecisionQuestion(simulationType: SimulationType, message: string): string {
  if (simulationType === "creative_testing") {
    const surface = inferCreativeSurface(message);
    return `어떤 ${surface}이 핵심 고객에게 가장 설득력 있는가?`;
  }
  return "이 의사결정을 어떤 조건으로 시뮬레이션할 것인가?";
}

function buildPreSimulationActions(
  simulationType: SimulationType,
  message: string,
): PreSimulationAction[] {
  if (simulationType !== "creative_testing") return [];
  const hasCandidateMarker = /(?:\n|^)\s*(?:[A-Z][.)]|[가-힣]\)|[-*])\s+/.test(message);
  return hasCandidateMarker ? [] : ["generate_creative_candidates"];
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}
