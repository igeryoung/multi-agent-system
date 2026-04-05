import { afterEach, describe, expect, test, vi } from "vitest";
import { createHeadPlan } from "../src/server/orchestrator/head-planner";
import type { ExecutionPlan, RoleDefinition } from "../src/shared/contracts/types";

const selectedRoles: RoleDefinition[] = [
  {
    id: "engineer",
    label: "Engineer",
    responsibility: "Builds the implementation path and resolves technical gaps.",
    stepTemplate: "Build the implementation path",
    hue: "#2563eb"
  }
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createHeadPlan", () => {
  test("forwards streamed planner progress before the final result arrives", async () => {
    const progressUpdates: string[] = [];
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`${JSON.stringify({
          type: "progress",
          message: "Planner bridge accepted request for 1 role(s)."
        })}\n`));
        controller.enqueue(encoder.encode(`${JSON.stringify({
          type: "result",
          payload: {
            ok: true,
            plan: createBridgePlan("engineer")
          }
        })}\n`));
        controller.close();
      }
    });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: () => "application/x-ndjson"
      },
      body: stream
    }));

    const result = await createHeadPlan(
      { task: "Investigate the roadmap.", roles: selectedRoles },
      "bridge",
      (update) => {
        progressUpdates.push(update.message);
      }
    );

    expect(result.ok).toBe(true);
    expect(progressUpdates).toContain("Planner bridge accepted request for 1 role(s).");
  });

  test("fails explicitly when the bridge returns a malformed plan", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        plan: {
          plannerMode: "bridge",
          summary: "bad plan",
          headSummary: "",
          workflowSummary: "",
          steps: [],
          taskPackets: [],
          workflowEdges: [],
          diagnostics: []
        }
      })
    }));

    const result = await createHeadPlan(
      { task: "Investigate the roadmap.", roles: selectedRoles },
      "bridge"
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostic).not.toContain("could not reach");
    expect(result.details.join(" ")).toMatch(/invalid|incomplete/i);
  });

  test("fails explicitly when the bridge returns an unselected role", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        plan: createBridgePlan("qa")
      })
    }));

    const result = await createHeadPlan(
      { task: "Investigate the roadmap.", roles: selectedRoles },
      "bridge"
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.details.join(" ")).toContain("unselected role");
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
