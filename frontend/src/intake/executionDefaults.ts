import { createSlot, upsertSlot } from "./slotUtils";
import type { IntakeSession, IntakeSlotValue } from "./types";

const COMMON_DEFAULTS: Record<string, unknown> = {
  sample_size: 200,
  seed: 42,
};

const SIMULATION_DEFAULTS: Partial<Record<string, Record<string, unknown>>> = {
  market_segmentation: { n_segments: 6 },
  campaign_strategy: { budget: 100_000_000 },
};

export function materializeIntakeDefaults(session: IntakeSession): IntakeSession {
  const simulationType = session.taskFrame?.primarySimulationType;
  const defaults = {
    ...COMMON_DEFAULTS,
    ...(simulationType ? SIMULATION_DEFAULTS[simulationType] : {}),
  };
  const slots = Object.entries(defaults).reduce((next, [slotId, value]) => {
    if (hasValue(next[slotId])) return next;
    return upsertSlot(
      next,
      createSlot(slotId, value, "default", 1, "system-defaults:v1", false),
    );
  }, session.slots);
  return slots === session.slots ? session : { ...session, slots };
}

function hasValue(slot: IntakeSlotValue | undefined): boolean {
  if (!slot) return false;
  if (Array.isArray(slot.value)) return slot.value.length > 0;
  if (typeof slot.value === "string") return slot.value.trim().length > 0;
  return slot.value !== null && slot.value !== undefined;
}
