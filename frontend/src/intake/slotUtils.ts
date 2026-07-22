import type { IntakeSlotValue } from "./types";

export function asString(slot: IntakeSlotValue | undefined): string {
  return typeof slot?.value === "string" ? slot.value : "";
}

export function asStringArray(slot: IntakeSlotValue | undefined): string[] {
  return Array.isArray(slot?.value)
    ? slot.value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

export function upsertSlot(
  slots: Record<string, IntakeSlotValue>,
  value: IntakeSlotValue,
): Record<string, IntakeSlotValue> {
  const existing = slots[value.slotId];
  if (existing?.source === "user" && value.source !== "user") return slots;
  return {
    ...slots,
    [value.slotId]: {
      ...existing,
      ...value,
    },
  };
}

export function createSlot(
  slotId: string,
  value: unknown,
  source: IntakeSlotValue["source"],
  confidence: number,
  evidence?: string,
  needsUserReview = source === "generated",
): IntakeSlotValue {
  return {
    slotId,
    value,
    source,
    confidence,
    evidence,
    needsUserReview,
    reviewed: source === "user" || !needsUserReview,
  };
}
