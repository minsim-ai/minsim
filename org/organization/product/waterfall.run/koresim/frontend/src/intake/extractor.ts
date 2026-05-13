import { inferCreativeSurface } from "./router";
import { createSlot, upsertSlot } from "./slotUtils";
import type { IntakeSlotValue, TaskFrame } from "./types";

const goalFragments = [
  "헤드라인",
  "상세페이지",
  "랜딩",
  "광고",
  "카피",
  "문구",
  "만들고 싶",
  "테스트",
  "비교",
  "보고 싶",
];

export function extractSlotsFromMessage(
  message: string,
  taskFrame: TaskFrame,
  currentSlots: Record<string, IntakeSlotValue>,
): Record<string, IntakeSlotValue> {
  let slots = currentSlots;
  if (taskFrame.primarySimulationType === "creative_testing") {
    slots = upsertSlot(
      slots,
      createSlot("creative_surface", inferCreativeSurface(message), "inferred", 0.86, message, false),
    );
    const productDescription = extractProductDescription(message);
    if (productDescription) {
      slots = upsertSlot(
        slots,
        createSlot("product_description", productDescription, "user", 0.9, message, false),
      );
    }
    const candidates = extractCreativeCandidates(message);
    if (candidates.length >= 2) {
      slots = upsertSlot(
        slots,
        createSlot("creative_candidates", candidates, "user", 0.94, message, false),
      );
    }
    const sampleSize = extractSampleSize(message);
    if (sampleSize) {
      slots = upsertSlot(slots, createSlot("sample_size", sampleSize, "user", 0.84, message, false));
    }
  }
  return slots;
}

export function mergeFormValues(
  values: Record<string, string | string[] | number>,
  currentSlots: Record<string, IntakeSlotValue>,
): Record<string, IntakeSlotValue> {
  return Object.entries(values).reduce((slots, [slotId, value]) => {
    const normalized = Array.isArray(value)
      ? value.map((item) => item.trim()).filter(Boolean)
      : typeof value === "string"
        ? value.trim()
        : value;
    if (Array.isArray(normalized) && normalized.length === 0) return slots;
    if (typeof normalized === "string" && !normalized) return slots;
    return upsertSlot(slots, createSlot(slotId, normalized, "user", 0.95, "form_submit", false));
  }, currentSlots);
}

function extractProductDescription(message: string): string | null {
  const trimmed = message.trim();
  if (!trimmed) return null;
  if (extractCreativeCandidates(trimmed).length >= 2) return null;
  if (/(제|내)\s*상품.*(?:헤드라인|상세페이지|카피|문구).*만들/.test(trimmed)) return null;
  if (/^(이미지|영상|동영상)?\s*광고\s*(문구|카피)?를?\s*(테스트|비교)/.test(trimmed)) return null;

  const productPatterns = [
    /(?:제품|서비스|프로그램|소프트웨어)(?:은|는|이|가)?\s*(.+?)(?:입니다|이에요|예요|이고요|입니다요|$)/,
    /(.+?)(?:이라는|라는)\s*(?:제품|서비스|프로그램|소프트웨어)/,
  ];
  const matched = productPatterns
    .map((pattern) => trimmed.match(pattern)?.[1]?.trim())
    .find((value): value is string => Boolean(value && value.length >= 4));
  if (matched) return cleanupProductText(matched);

  const withoutGoal = goalFragments.reduce(
    (text, fragment) => text.replaceAll(fragment, " "),
    trimmed,
  ).replace(/\s+/g, " ").trim();
  const genericProductOnly = /^(제|내)?\s*상품\s*(을|를|은|는)?\s*$/.test(
    withoutGoal.replace(/[.?!요\s]/g, ""),
  );

  if (
    withoutGoal.length >= 8 &&
    !/^(제|내)?\s*$/.test(withoutGoal) &&
    !genericProductOnly
  ) {
    return cleanupProductText(withoutGoal);
  }
  return null;
}

function extractCreativeCandidates(message: string): string[] {
  const lines = message
    .split("\n")
    .map((line) => line.replace(/^\s*(?:[A-Z][.)]|[0-9]+[.)]|[-*])\s*/, "").trim())
    .filter((line) => line.length >= 2);
  if (lines.length < 2) return [];
  return lines.filter((line) => !line.includes("후보") && !line.includes("비교")).slice(0, 12);
}

function extractSampleSize(message: string): number | null {
  const match = message.match(/(\d{1,4})\s*명/);
  if (!match) return null;
  return Math.max(1, Math.min(Number(match[1]), 200));
}

function cleanupProductText(value: string): string {
  return value
    .replace(/^(제|내)\s*/, "")
    .replace(/(?:헤드라인|상세페이지|카피|문구).*(?:만들고 싶|보고 싶|테스트).*/, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}
