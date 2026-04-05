import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { AgentDrawer } from "../src/components/graph/agent-drawer";
import type { AgentProjection } from "../src/shared/contracts/types";

describe("AgentDrawer", () => {
  test("renders the assigned task packet for a role agent", () => {
    const agent: AgentProjection = {
      id: "engineer",
      label: "Engineer",
      kind: "role",
      hue: "#2563eb",
      responsibility: "Builds the implementation path and resolves technical gaps.",
      status: "waiting",
      currentTask: "Build the implementation path",
      assignedTaskPacket: {
        id: "packet-engineer",
        agentId: "engineer",
        why: "Engineer owns the implementation lane.",
        goal: "Translate the head plan into a concrete implementation path.",
        context: ["User task: Investigate the roadmap.", "Prior lane: CEO Planner"],
        constraints: ["Only the head node talks to the user."],
        doneWhen: ["Implementation path is ready for QA review."],
        next: "Send the checkpoint result to QA Tester.",
        inputSource: "mixed",
        returnPolicy: "checkpoint"
      }
    };

    render(
      <AgentDrawer
        agent={agent}
        history={[]}
        isLive={false}
        isDraft={false}
        onClose={() => {}}
      />
    );

    expect(screen.getByText(/assigned task/i)).toBeInTheDocument();
    expect(screen.getByText(/Engineer owns the implementation lane/i)).toBeInTheDocument();
    expect(screen.getByText(/Translate the head plan into a concrete implementation path/i)).toBeInTheDocument();
    expect(screen.getByText(/Send the checkpoint result to QA Tester/i)).toBeInTheDocument();
  });
});
