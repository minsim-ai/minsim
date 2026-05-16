import { inferCreativeSurface } from "./router";
import { createSlot, upsertSlot } from "./slotUtils";
import { getIntakePack } from "./packRegistry";
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
  requestedSlotIds: string[] = [],
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
  if (taskFrame.primarySimulationType && taskFrame.primarySimulationType !== "creative_testing") {
    slots = extractGenericSlots(message, taskFrame.primarySimulationType, slots, requestedSlotIds);
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

function extractGenericSlots(
  message: string,
  simulationType: Exclude<TaskFrame["primarySimulationType"], "creative_testing" | null>,
  currentSlots: Record<string, IntakeSlotValue>,
  requestedSlotIds: string[],
): Record<string, IntakeSlotValue> {
  let slots = currentSlots;
  const pack = getIntakePack(simulationType);
  const cleanMessage = message.trim();
  if (!cleanMessage) return slots;

  for (const slotId of requestedSlotIds) {
    if (slotId === "goal") continue;
    const requirement = pack.slots.find((slot) => slot.id === slotId);
    if (!requirement) continue;
    slots = upsertSlot(
      slots,
      createSlot(slotId, normalizeRequestedSlotValue(cleanMessage, requirement.dataType), "user", 0.92, message, false),
    );
  }

  const prices = extractPriceCandidates(cleanMessage);
  if (prices.length >= 2 && pack.slots.some((slot) => slot.id === "price_points")) {
    slots = upsertSlot(slots, createSlot("price_points", prices, "user", 0.9, message, false));
  }

  const listedItems = extractListedItems(cleanMessage);
  for (const slotId of ["channels", "messages", "statements", "products", "attributes", "core_questions"]) {
    if (listedItems.length === 0 || !pack.slots.some((slot) => slot.id === slotId)) continue;
    if (slotId === "core_questions" && !/(기준|질문|나누|세분|고객군)/.test(cleanMessage)) continue;
    slots = upsertSlot(slots, createSlot(slotId, listedItems, "user", 0.78, message, false));
  }

  const objectSlot = pack.slots.find((slot) => slot.family === "object");
  if (objectSlot && !slots[objectSlot.id]) {
    const objectText = extractBusinessObject(cleanMessage, taskFrameGoalLike(simulationType));
    if (objectText) {
      slots = upsertSlot(slots, createSlot(objectSlot.id, objectText, "user", 0.82, message, false));
    }
  }

  return slots;
}

function normalizeRequestedSlotValue(value: string, dataType: string): string | string[] | number {
  if (dataType === "multi_text") {
    const items = extractListedItems(value);
    return items.length > 0 ? items : [value];
  }
  if (dataType === "number") {
    const number = value.match(/\d[\d,]*/)?.[0];
    return number ? Number(number.replaceAll(",", "")) : value;
  }
  return value;
}

function extractPriceCandidates(message: string): string[] {
  return Array.from(new Set(
    (message.match(/\d[\d,]*(?:\s*(?:원|만원|천원|달러|usd|krw))?/gi) ?? [])
      .map((item) => item.trim())
      .filter(Boolean),
  )).slice(0, 6);
}

function extractListedItems(message: string): string[] {
  const lineItems = message
    .split(/\n|,|\/|·/)
    .map((item) => item.replace(/^\s*(?:[A-Z][.)]|[0-9]+[.)]|[-*])\s*/, "").trim())
    .filter((item) => item.length >= 2 && item.length <= 80);
  if (lineItems.length >= 2) return lineItems.slice(0, 10);

  const colonMatch = message.match(/(?:채널|메시지|후보|기준|속성|경쟁 제품|경쟁사)\s*[:：]\s*(.+)$/);
  if (!colonMatch) return [];
  return colonMatch[1]
    .split(/,|\/|·|와|과/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2)
    .slice(0, 10);
}

function extractBusinessObject(message: string, goalLike: RegExp): string | null {
  const trimmed = message.trim();
  if (goalLike.test(trimmed)) return null;
  if (extractListedItems(trimmed).length >= 2 && trimmed.length < 80) return null;
  if (trimmed.length < 4) return null;
  if (/(입니다|이에요|예요|상품|제품|서비스|브랜드|카테고리|SaaS|saas|구독|캠페인|출시)/.test(trimmed)) {
    return cleanupProductText(trimmed);
  }
  return null;
}

function taskFrameGoalLike(simulationType: string): RegExp {
  if (simulationType === "price_optimization") return /(가격|얼마|요금|최적화).*(해야|할까요|정하|보고 싶)/;
  if (simulationType === "campaign_strategy") return /(캠페인|전략).*(만들|짜고|싶)/;
  if (simulationType === "market_segmentation") return /(고객군|세그먼트|나누고 싶)/;
  return /(보고 싶|알고 싶|테스트|검증|어떻게|할까요)/;
}

function cleanupProductText(value: string): string {
  return value
    .replace(/^(제|내)\s*/, "")
    .replace(/(?:헤드라인|상세페이지|카피|문구).*(?:만들고 싶|보고 싶|테스트).*/, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}
