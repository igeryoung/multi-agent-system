import { describe, expect, test, vi } from "vitest";
import { appendRunEvent } from "../src/server/events/storage";
import { projectRun } from "../src/server/events/projectRun";
import { buildApprovalResolutionEvents, buildRunScenario } from "../src/server/orchestrator/scenario";
import type { ExecutionPlan } from "../src/shared/contracts/types";

describe("projectRun", () => {
  test("surfaces a pending approval gate for external side effects", async () => {
    const scenario = await buildRunScenario("Plan and publish the release note for the Q2 roadmap.", [
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
    expect(projection.taskPackets).toHaveLength(3);
  });

  test("records approval resolution and preserves replayable handoff history", async () => {
    const scenario = await buildRunScenario("Plan and send the customer update.", ["ceo-planner", "writer"]);
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
    expect(projection.workflowEdges).toHaveLength(2);
  });

  test("rejects illegal approval transitions", async () => {
    const scenario = await buildRunScenario("Investigate the roadmap.", ["engineer"]);
    const illegalApproval = {
      ...scenario.initialEvents[scenario.initialEvents.length - 1],
      sequence: scenario.initialEvents.length + 1,
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

  test("does not fabricate role agents that were never assigned", async () => {
    const scenario = await buildRunScenario("Investigate the roadmap.", ["engineer"]);
    const projection = projectRun([scenario.initialEvents[0]]);

    expect(projection.agents).toHaveLength(1);
    expect(projection.agents[0].id).toBe("atlas-head");
  });

  test("surfaces an explicit failed run when bridge planning fails", async () => {
    vi.stubGlobal("__SIGNAL_ATLAS_HEAD_PLANNER_MODE__", "bridge");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("bridge unavailable")));

    const scenario = await buildRunScenario("Investigate the roadmap.", ["engineer"]);
    const projection = projectRun(scenario.initialEvents);

    expect(projection.phase).toBe("failed");
    expect(projection.latestSummary).toContain("could not reach the local head planner bridge");
    expect(projection.taskPackets).toHaveLength(0);

    vi.unstubAllGlobals();
  });

  test("emits planning events before the bridge returns the final plan", async () => {
    vi.stubGlobal("__SIGNAL_ATLAS_HEAD_PLANNER_MODE__", "bridge");

    let resolveFetch!: () => void;
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => new Promise((resolve) => {
      resolveFetch = () => resolve({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          plan: createBridgePlan("engineer")
        })
      });
    })));

    const eventTypes: string[] = [];
    const pendingScenario = buildRunScenario("Investigate the roadmap.", ["engineer"], {
      onInitialEvents: ({ initialEvents }) => {
        eventTypes.push(...initialEvents.map((event) => event.eventType));
      }
    });

    expect(eventTypes).toEqual(["run_created", "roles_assigned", "planning_started"]);

    resolveFetch();
    await pendingScenario;

    vi.unstubAllGlobals();
  });
});

function createBridgePlan(agentId: string): ExecutionPlan {
  return {
    plannerMode: "bridge",
    summary: "Atlas generated a plan.",
    headSummary: "Atlas prepared the head summary.",
    workflowSummary: "Atlas Head Agent assigns the first lane.",
    steps: [
      {
        id: "step-1",
        ownerId: agentId,
        title: "Lane 1",
        summary: "Do the work",
        taskPacketId: `packet-${agentId}`,
        returnPolicy: "final_only"
      }
    ],
    taskPackets: [
      {
        id: `packet-${agentId}`,
        agentId,
        why: "Why this agent is needed.",
        goal: "Do the work.",
        context: ["User task"],
        constraints: ["Only the head node talks to the user."],
        doneWhen: ["The lane is complete."],
        next: "Return the final result to Atlas Head Agent.",
        inputSource: "user_task",
        returnPolicy: "final_only"
      }
    ],
    workflowEdges: [
      {
        id: "edge-1",
        fromAgentId: "atlas-head",
        toAgentId: agentId,
        kind: "head_handoff",
        note: "Atlas Head Agent assigns the first lane.",
        requiresIntermediateReturn: false
      }
    ],
    diagnostics: []
  };
}
