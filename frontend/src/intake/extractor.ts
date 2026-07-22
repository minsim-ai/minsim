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

/** Ranked-option labels should stay short; longer text is almost always prose. */
export const MAX_OPTION_LABEL_LEN = 40;

const PROSE_MARKERS = /입니다|이에요|예요|파악하기|선정합니다|조사입니다|수요 및|우선순위를 파악|예산 편성|정책 개선/;

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
  for (const slotId of ["channels", "messages", "statements", "products", "attributes", "core_questions", "items", "options"]) {
    if (listedItems.length === 0 || !pack.slots.some((slot) => slot.id === slotId)) continue;
    if (slotId === "core_questions" && !/(기준|질문|나누|세분|고객군)/.test(cleanMessage)) continue;
    // Auto-fill only when the planner asked for the slot, or the text is clearly a list
    // (not a free-form goal sentence that space-split into particles).
    const looksLikeList = /[\n,/·]/.test(cleanMessage) || /\([^)]{5,}\)/.test(cleanMessage);
    if (!requestedSlotIds.includes(slotId) && !looksLikeList) continue;
    if (!requestedSlotIds.includes(slotId) && cleanMessage.length > 120 && listedItems.some(isProseFragment)) {
      continue;
    }
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

/**
 * Extract short option labels from free text.
 *
 * Prefer parenthetical comma lists (common when users paste a survey goal sentence).
 * Reject prose fragments that used to become ranking items after naive comma-split.
 */
export function extractListedItems(message: string): string[] {
  const trimmed = message.trim();
  if (!trimmed) return [];

  const parenthetical = extractParentheticalLabels(trimmed);
  if (parenthetical.length >= 2) return parenthetical.slice(0, 10);

  const delimiterItems = trimmed
    .split(/\n|,|\/|·/)
    .map(cleanListItem)
    .filter((item) => item.length >= 2 && item.length <= 80);

  if (delimiterItems.length >= 2 && !delimiterItems.some(isProseFragment)) {
    return delimiterItems.slice(0, 10);
  }

  // Space-separated short labels: "어린이집 현금 공중화장실"
  // Never treat full Korean goal sentences ("~하고 싶어요") as option lists.
  if (
    !trimmed.includes("\n")
    && delimiterItems.length < 2
    && !/[.?!]|(?:습니다|해요|싶어요|주세요|까요|입니다|이에요)\s*$/.test(trimmed)
    && !/(을|를|이|가|은|는)\s/.test(trimmed)
  ) {
    const spaceItems = trimmed
      .split(/\s+/)
      .map((item) => item.trim())
      .filter((item) => item.length >= 2 && item.length <= 20);
    if (
      spaceItems.length >= 2
      && spaceItems.length <= 6
      && spaceItems.every((item) => !isProseFragment(item) && !/(요|다|까|고|을|를)$/.test(item))
    ) {
      return spaceItems.slice(0, 10);
    }
  }

  // Contaminated comma-split: drop prose pieces and keep only short clean labels.
  if (delimiterItems.length >= 2) {
    const cleaned = delimiterItems.filter((item) => isValidOptionLabel(item));
    if (cleaned.length >= 2) return cleaned.slice(0, 10);
    return [];
  }

  const colonMatch = trimmed.match(/(?:채널|메시지|후보|기준|속성|경쟁 제품|경쟁사|항목|순위)\s*[:：]\s*(.+)$/);
  if (!colonMatch) return [];
  return colonMatch[1]
    .split(/,|\/|·|와|과/)
    .map(cleanListItem)
    .filter((item) => item.length >= 2 && isValidOptionLabel(item))
    .slice(0, 10);
}

/** Normalize multi_text option slots (items/options) for run payload quality. */
export function normalizeOptionLabels(raw: string[] | string | null | undefined): string[] {
  if (raw == null) return [];
  if (typeof raw === "string") {
    return extractListedItems(raw).filter(isValidOptionLabel);
  }
  const fromArray = raw.map(cleanListItem).filter(Boolean);
  if (fromArray.length >= 2 && fromArray.every(isValidOptionLabel)) {
    return fromArray.slice(0, 10);
  }
  // Array may itself be a comma-split contamination of one sentence.
  const rejoined = fromArray.join(", ");
  const recovered = extractListedItems(rejoined);
  if (recovered.length >= 2) return recovered.filter(isValidOptionLabel).slice(0, 10);
  return fromArray.filter(isValidOptionLabel).slice(0, 10);
}

export function isValidOptionLabel(item: string): boolean {
  const text = cleanListItem(item);
  if (text.length < 2 || text.length > MAX_OPTION_LABEL_LEN) return false;
  if (isProseFragment(text)) return false;
  const opens = (text.match(/\(/g) ?? []).length;
  const closes = (text.match(/\)/g) ?? []).length;
  if (opens !== closes) return false;
  return true;
}

export function isProseFragment(item: string): boolean {
  const text = cleanListItem(item);
  if (text.length > MAX_OPTION_LABEL_LEN) return true;
  if (PROSE_MARKERS.test(text)) return true;
  // Unbalanced parentheses from mid-sentence comma splits.
  if (/\([^)]*$/.test(text) || /^[^(]*\)/.test(text)) return true;
  if (text.includes("에 대한") || text.includes("위한 조사")) return true;
  return false;
}

function extractParentheticalLabels(message: string): string[] {
  const match = message.match(/\(([^)]{5,240})\)/);
  if (!match) return [];
  const labels = match[1]
    .split(/,|\/|·/)
    .map(cleanListItem)
    .map((item) => item.replace(/\s*등\s*$/u, "").trim())
    .filter((item) => item.length >= 2 && item.length <= MAX_OPTION_LABEL_LEN);
  if (labels.length < 2) return [];
  if (labels.some(isProseFragment)) return [];
  return labels;
}

function cleanListItem(item: string): string {
  return item
    .replace(/^\s*(?:[A-Z][.)]|[0-9]+[.)]|[-*])\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
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
