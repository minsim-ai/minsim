import type { IntakeEvent } from "../types";

export type ExpectedIntakeActionType =
  | "ask_question"
  | "show_form"
  | "candidate_review"
  | "confirm_assumptions"
  | "run_ready"
  | "repair_input";

export type IntakeEvaluationFixture = {
  id: string;
  title: string;
  category?:
    | "goal_only"
    | "partial"
    | "complete"
    | "ambiguous"
    | "messy"
    | "invalid"
    | "auto_generate"
    | "assumption_review";
  events: IntakeEvent[];
  expectedAction: ExpectedIntakeActionType;
  expectedSimulationType?: string;
  expectedSlotIds?: string[];
  expectedPayloadSimulationType?: string;
  expectedPayloadFields?: string[];
  minCandidates?: number;
  maxCandidates?: number;
};
