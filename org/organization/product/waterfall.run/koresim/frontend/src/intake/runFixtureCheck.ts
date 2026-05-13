import { creativeTestingFixtures } from "./fixtures/creativeTestingFixtures";
import { simulationIntakeV2Fixtures } from "./fixtures/simulationIntakeV2Fixtures";
import { campaignStrategyFlowFixtures, simulationRoutingFixtures } from "./fixtures/simulationRoutingFixtures";
import { advanceIntakeSession, createInitialIntakeSession } from "./planner";
import type { IntakeEvaluationFixture } from "./fixtures/types";
import type { IntakeAction, IntakeSession } from "./types";

export type IntakeFixtureCheckResult = {
  ok: boolean;
  failures: string[];
  checked: number;
};

export function runIntakeFixtureCheck(): IntakeFixtureCheckResult {
  const fixtures = [
    ...creativeTestingFixtures,
    ...simulationRoutingFixtures,
    ...campaignStrategyFlowFixtures,
    ...simulationIntakeV2Fixtures,
  ];
  const failures = fixtures.flatMap(checkFixture);
  failures.push(...checkV2Coverage(simulationIntakeV2Fixtures));
  return {
    ok: failures.length === 0,
    failures,
    checked: fixtures.length,
  };
}

function checkV2Coverage(fixtures: IntakeEvaluationFixture[]): string[] {
  const requiredCategories = new Set([
    "goal_only",
    "partial",
    "complete",
    "ambiguous",
    "messy",
    "invalid",
    "auto_generate",
    "assumption_review",
  ]);
  const bySimulation = fixtures.reduce<Record<string, Set<string>>>((acc, fixture) => {
    const simulationType = fixture.expectedSimulationType ?? fixture.id.replace(/-(goal-only|partial|complete|ambiguous|messy|invalid|auto-generate|assumption-review)-v2$/, "");
    if (!simulationType || !fixture.category) return acc;
    acc[simulationType] = acc[simulationType] ?? new Set<string>();
    acc[simulationType].add(fixture.category);
    return acc;
  }, {});
  return Object.entries(bySimulation).flatMap(([simulationType, categories]) =>
    [...requiredCategories]
      .filter((category) => !categories.has(category))
      .map((category) => `${simulationType}: missing intake v2 fixture category ${category}`),
  );
}

function checkFixture(fixture: IntakeEvaluationFixture): string[] {
  const finalSession = fixture.events.reduce<IntakeSession>(
    (session, event) => advanceIntakeSession(session, event),
    createInitialIntakeSession(),
  );
  const action = finalSession.action;
  const failures: string[] = [];

  if (!action) {
    return [`${fixture.id}: missing final action`];
  }
  if (action.type !== fixture.expectedAction) {
    failures.push(`${fixture.id}: expected action ${fixture.expectedAction}, got ${action.type}`);
  }
  if (
    fixture.expectedSimulationType &&
    finalSession.taskFrame?.primarySimulationType !== fixture.expectedSimulationType
  ) {
    failures.push(
      `${fixture.id}: expected simulation ${fixture.expectedSimulationType}, got ${finalSession.taskFrame?.primarySimulationType}`,
    );
  }
  if (fixture.expectedSlotIds && !containsSlotIds(action, fixture.expectedSlotIds)) {
    failures.push(`${fixture.id}: expected slot ids ${fixture.expectedSlotIds.join(", ")}`);
  }
  if (action.type === "candidate_review") {
    const count = action.candidates.length;
    if (fixture.minCandidates && count < fixture.minCandidates) {
      failures.push(`${fixture.id}: expected at least ${fixture.minCandidates} candidates, got ${count}`);
    }
    if (fixture.maxCandidates && count > fixture.maxCandidates) {
      failures.push(`${fixture.id}: expected at most ${fixture.maxCandidates} candidates, got ${count}`);
    }
  }
  if (action.type === "run_ready") {
    if (
      fixture.expectedPayloadSimulationType &&
      action.payload.simulation_type !== fixture.expectedPayloadSimulationType
    ) {
      failures.push(
        `${fixture.id}: expected payload simulation ${fixture.expectedPayloadSimulationType}, got ${action.payload.simulation_type}`,
      );
    }
    const input = action.payload.input;
    if (fixture.expectedPayloadFields) {
      for (const field of fixture.expectedPayloadFields) {
        if (typeof input !== "object" || input === null || !(field in input)) {
          failures.push(`${fixture.id}: run payload missing ${field}`);
        }
      }
    }
    const creatives = typeof input === "object" && "creatives" in input && Array.isArray(input.creatives)
      ? input.creatives
      : [];
    if (action.payload.simulation_type === "creative_testing" && creatives.length < 2) {
      failures.push(`${fixture.id}: run payload has fewer than 2 creatives`);
    }
  }
  return failures;
}

function containsSlotIds(action: IntakeAction, slotIds: string[]): boolean {
  if (action.type !== "ask_question") return false;
  return slotIds.every((slotId) => action.slotIds.includes(slotId));
}
