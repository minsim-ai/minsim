import { asString, asStringArray } from "./slotUtils";
import type { CreativeCandidate, IntakeSlotValue } from "./types";

const generatedAudienceFallbacks = [
  "콘텐츠 외주 없이 직접 글을 쓰는 1인 사업자",
  "검색 유입을 늘리고 싶은 온라인 쇼핑몰 운영자",
  "블로그로 고객 문의를 늘리고 싶은 소상공인",
];

export function ensureAudienceAssumptions(
  slots: Record<string, IntakeSlotValue>,
): IntakeSlotValue[] {
  const existing = asStringArray(slots.target_customers);
  const missingCount = Math.max(0, 3 - existing.length);
  return generatedAudienceFallbacks.slice(0, missingCount).map((value, index) => ({
    slotId: "target_customers",
    value,
    source: "generated",
    confidence: index === 0 ? 0.76 : 0.72,
    evidence: "recommended audience autofill",
    needsUserReview: true,
    reviewed: false,
  }));
}

export function generateCreativeCandidates(
  slots: Record<string, IntakeSlotValue>,
): CreativeCandidate[] {
  const product = asString(slots.product_description) || "제품";
  const benefit = asString(slots.main_benefit) || inferBenefit(product);
  const audience = asStringArray(slots.target_customers)[0] || "핵심 고객";
  const productNoun = compactProductName(product);

  const candidates: CreativeCandidate[] = [
    {
      id: "generated-outcome",
      text: `${productNoun}, 결과까지 빠르게 완성하세요`,
      angle: "outcome",
      why: "사용자가 얻는 최종 결과를 직접적으로 보여줍니다.",
      source: "generated",
    },
    {
      id: "generated-pain-relief",
      text: `복잡한 준비 없이 바로 시작하는 ${productNoun}`,
      angle: "pain_relief",
      why: "시작 단계의 번거로움을 줄이는 각도입니다.",
      source: "generated",
    },
    {
      id: "generated-automation",
      text: `${benefit.slice(0, 24)} 돕는 ${productNoun}`,
      angle: "automation",
      why: "자동화와 시간 절약 기대를 강조합니다.",
      source: "generated",
    },
    {
      id: "generated-differentiation",
      text: `${audience.slice(0, 18)}에게 필요한 ${productNoun}`,
      angle: "differentiation",
      why: "누구를 위한 제품인지 선명하게 포지셔닝합니다.",
      source: "generated",
    },
  ];
  return candidates.map((candidate) => ({
    ...candidate,
    text: polishHeadline(candidate.text),
  }));
}

function inferBenefit(product: string): string {
  if (/블로그|글|작성|콘텐츠/.test(product)) return "블로그 작성 시간을 줄이고 검색 유입용 글을 쉽게";
  if (/가격|비용/.test(product)) return "복잡한 판단을 더 빠르게";
  return "반복 업무를 줄이고 더 중요한 일에 집중하도록";
}

function compactProductName(product: string): string {
  if (/블로그/.test(product)) return "블로그 작성 프로그램";
  if (/소프트웨어|프로그램/.test(product)) return "업무 소프트웨어";
  return product
    .split(/[.。,\n]/)[0]
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 18) || "제품";
}

function polishHeadline(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/도와주는 도와주는/g, "도와주는")
    .replace(/\s+(을|를|이|가|은|는)\s+위한/g, "을 위한")
    .trim()
    .slice(0, 48);
}
