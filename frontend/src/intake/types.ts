import type { IntakeContextEnvelope, RunCreateRequest, SafeIntakeSummary, SimulationType } from "../types/api";

export type IntakeSlotSource = "user" | "inferred" | "generated" | "default";

export type IntakeSlotImportance = "critical" | "recommended" | "optional";

export type IntakeSlotFamily =
  | "goal"
  | "object"
  | "audience"
  | "options"
  | "context"
  | "criteria"
  | "constraints"
  | "run_config";

export type IntakeFieldType =
  | "text"
  | "textarea"
  | "number"
  | "single_select"
  | "multi_text"
  | "target_filter";

export type PreSimulationAction = "generate_creative_candidates";

export type TaskFrame = {
  taskId: string;
  userGoal: string;
  decisionQuestion: string;
  likelySimulationTypes: SimulationType[];
  primarySimulationType: SimulationType | null;
  preSimulationActions: PreSimulationAction[];
  confidence: number;
  evidence: string[];
};

export type IntakeSlotValue = {
  slotId: string;
  value: unknown;
  source: IntakeSlotSource;
  confidence: number;
  evidence?: string;
  needsUserReview: boolean;
  reviewed?: boolean;
};

export type SlotRequirement = {
  id: string;
  label: string;
  family: IntakeSlotFamily;
  importance: IntakeSlotImportance;
  dataType: IntakeFieldType;
  minItems?: number;
  maxItems?: number;
  recommendedItems?: number;
  canInfer: boolean;
  canGenerate: boolean;
  needsReviewWhenGenerated: boolean;
  placeholder?: string;
  helperText?: string;
  options?: string[];
};

export type DynamicFormField = {
  id: string;
  label: string;
  type: IntakeFieldType;
  required: boolean;
  value?: string | string[] | number;
  source?: IntakeSlotSource;
  placeholder?: string;
  helperText?: string;
  options?: string[];
  minItems?: number;
  maxItems?: number;
  recommendedItems?: number;
  allowAutoFill?: boolean;
};

export type DynamicFormSchema = {
  id: string;
  fields: DynamicFormField[];
  primaryAction: string;
  /** Optional skip CTA when only recommended/optional fields remain. */
  secondaryAction?: string;
};

export type CreativeCandidateAngle =
  | "outcome"
  | "pain_relief"
  | "automation"
  | "differentiation"
  | "trust";

export type CreativeCandidate = {
  id: string;
  text: string;
  angle: CreativeCandidateAngle;
  why: string;
  source: "user" | "generated";
};

export type FieldError = {
  fieldId: string;
  message: string;
};

export type IntakeAction =
  | { type: "ask_question"; message: string; slotIds: string[] }
  | { type: "show_form"; message: string; form: DynamicFormSchema }
  | {
      type: "candidate_review";
      message: string;
      candidates: CreativeCandidate[];
      assumptions: IntakeSlotValue[];
    }
  | { type: "confirm_assumptions"; message: string; assumptions: IntakeSlotValue[] }
  | {
      type: "run_ready";
      message: string;
      payload: RunCreateRequest;
      assumptions: IntakeSlotValue[];
      provenance: IntakeRunProvenance;
    }
  | { type: "repair_input"; message: string; fieldErrors: FieldError[] };

export type IntakeMessage = {
  role: "user" | "assistant";
  content: string;
};

export type IntakeSession = {
  id: string;
  status: "collecting" | "reviewing" | "ready";
  messages: IntakeMessage[];
  taskFrame: TaskFrame | null;
  slots: Record<string, IntakeSlotValue>;
  action: IntakeAction | null;
  turnCount: number;
};

export type IntakeEvent =
  | { type: "user_message"; content: string; selectedSimulationType?: SimulationType }
  | { type: "form_submit"; values: Record<string, string | string[] | number> }
  | { type: "candidate_accept"; candidates: CreativeCandidate[]; assumptions?: IntakeSlotValue[] }
  | { type: "confirm_assumptions" }
  | { type: "reset" };

export type SimulationIntakePack = {
  simulationType: SimulationType;
  version: string;
  label: string;
  routeHints: string[];
  slots: SlotRequirement[];
  formFieldOrder: string[];
  minConfidenceToAutoSelect: number;
};

export type IntakeRunProvenance = {
  userGoal: string;
  simulationType: SimulationType;
  userProvided: Record<string, unknown>;
  inferred: Record<string, unknown>;
  generated: Record<string, unknown>;
  defaults: Record<string, unknown>;
  unreviewedAssumptionCount: number;
};

export type { IntakeContextEnvelope, SafeIntakeSummary };
