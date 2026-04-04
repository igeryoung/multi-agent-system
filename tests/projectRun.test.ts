import { describe, expect, test } from "vitest";
import { appendRunEvent } from "../src/server/events/storage";
import { projectRun } from "../src/server/events/projectRun";
import { buildApprovalResolutionEvents, buildRunScenario } from "../src/server/orchestrator/scenario";

describe("projectRun", () => {
  test("surfaces a pending approval gate for external side effects", () => {
    const scenario = buildRunScenario("Plan and publish the release note for the Q2 roadmap.", [
      "ceo-planner",
      "engineer",
      "qa"
    ]);
    const blockedIndex = scenario.queuedEvents.findIndex((event) => event.eventType === "blocked_action_requested");
    const events = [...scenario.initialEvents, ...scenario.queuedEvents.slice(0, blockedIndex + 1)];
    const projection = projectRun(events);

    expect(projection.phase).toBe("awaiting_approval");
    expect(projection.approval.status).toBe("pending");
    expect(projection.approval.actionLabel).toContain("Publish");
    expect(projection.activeAgentId).toBe("atlas-head");
    expect(projection.handoffs.length).toBeGreaterThanOrEqual(3);
  });

  test("records approval resolution and preserves replayable handoff history", () => {
    const scenario = buildRunScenario("Plan and send the customer update.", ["ceo-planner", "writer"]);
    const blockedIndex = scenario.queuedEvents.findIndex((event) => event.eventType === "blocked_action_requested");
    let events = [...scenario.initialEvents, ...scenario.queuedEvents.slice(0, blockedIndex + 1)];

    for (const event of buildApprovalResolutionEvents(
      scenario.runId,
      events.length + 1,
      "approved",
      "Send an external communication"
    )) {
      events = appendRunEvent(events, event);
    }

    const projection = projectRun(events);

    expect(projection.phase).toBe("completed");
    expect(projection.approval.status).toBe("approved");
    expect(projection.handoffs.map((handoff) => `${handoff.fromAgentId}->${handoff.toAgentId}`)).toEqual([
      "atlas-head->ceo-planner",
      "ceo-planner->writer"
    ]);
  });

  test("rejects illegal approval transitions", () => {
    const scenario = buildRunScenario("Investigate the roadmap.", ["engineer"]);
    const illegalApproval = {
      ...scenario.initialEvents[2],
      sequence: 4,
      eventType: "approval_recorded" as const,
      phase: "planning" as const,
      actorType: "user" as const,
      actorId: "operator",
      payload: {
        decision: "approved",
        note: "This should fail."
      }
    };

    expect(() => appendRunEvent(scenario.initialEvents, illegalApproval)).toThrow(
      "Approval decisions are only valid while awaiting approval."
    );
  });

  test("does not fabricate role agents that were never assigned", () => {
    const scenario = buildRunScenario("Investigate the roadmap.", ["engineer"]);
    const projection = projectRun([scenario.initialEvents[0]]);

    expect(projection.agents).toHaveLength(1);
    expect(projection.agents[0].id).toBe("atlas-head");
  });
});
