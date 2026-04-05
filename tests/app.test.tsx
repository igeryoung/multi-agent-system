import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { App } from "../src/app/App";

vi.mock("@xyflow/react", () => ({
  ReactFlow: ({ nodes, edges, children }: { nodes: unknown[]; edges: unknown[]; children?: React.ReactNode }) => (
    <div data-testid="flow-graph">
      <span data-testid="node-count">{nodes.length} nodes</span>
      <span data-testid="edge-count">{edges.length} edges</span>
      {children}
    </div>
  ),
  Background: () => null,
  BackgroundVariant: { Dots: "dots" },
  Handle: () => null,
  Panel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Position: { Top: "top", Bottom: "bottom" },
  useNodesState: (initial: unknown[]) => {
    const { useState } = require("react");
    const [nodes, setNodes] = useState(initial);
    return [nodes, setNodes, () => {}];
  }
}));

vi.mock("react-resizable-panels", () => ({
  PanelGroup: ({ children, ...props }: Record<string, unknown>) => <div data-testid="panel-group" {...props}>{children as React.ReactNode}</div>,
  Panel: ({ children }: Record<string, unknown>) => <div>{children as React.ReactNode}</div>,
  PanelResizeHandle: () => <div data-testid="resize-handle" />,
  Group: ({ children, ...props }: Record<string, unknown>) => <div {...props}>{children as React.ReactNode}</div>,
  Separator: () => <div />
}));

function addRole(roleLabel: string) {
  fireEvent.click(screen.getAllByText(/add agent/i)[0]);
  fireEvent.click(screen.getByText(roleLabel));
}

function selectSession(title: string) {
  fireEvent.click(screen.getByText(title));
}

describe("App", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.clearAllTimers();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  test("creates and restores isolated draft sessions", () => {
    render(<App />);

    const taskInput = screen.getByLabelText(/task/i);
    expect(taskInput).toHaveValue("");
    expect(screen.getByText(/no activity yet/i)).toBeInTheDocument();

    addRole("Engineer");
    fireEvent.change(taskInput, { target: { value: "Session alpha task" } });
    expect(screen.getByTestId("node-count")).toHaveTextContent("2 nodes");

    fireEvent.click(screen.getByRole("button", { name: /create session/i }));
    expect(screen.getByLabelText(/task/i)).toHaveValue("");
    expect(screen.getByTestId("node-count")).toHaveTextContent("1 nodes");

    addRole("QA Tester");
    fireEvent.change(screen.getByLabelText(/task/i), { target: { value: "Session beta task" } });

    selectSession("Session 1");
    expect(screen.getByLabelText(/task/i)).toHaveValue("Session alpha task");
    expect(screen.getByTestId("node-count")).toHaveTextContent("2 nodes");

    selectSession("Session 2");
    expect(screen.getByLabelText(/task/i)).toHaveValue("Session beta task");
    expect(screen.getByTestId("node-count")).toHaveTextContent("2 nodes");
  }, 10000);

  test("hides and restores the sessions sidebar from the header toggle", () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText(/task/i), {
      target: { value: "Keep the canvas visible" }
    });

    expect(screen.getByRole("button", { name: /create session/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /collapse sessions sidebar/i }));
    expect(screen.queryByRole("button", { name: /create session/i })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/task/i)).toHaveValue("Keep the canvas visible");

    fireEvent.click(screen.getByRole("button", { name: /expand sessions sidebar/i }));
    expect(screen.getByRole("button", { name: /create session/i })).toBeInTheDocument();
  });

  test("deletes only the selected non-live session and falls back to the remaining session", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /create session/i }));
    fireEvent.change(screen.getByLabelText(/task/i), { target: { value: "Second session" } });

    expect(screen.getByText("Session 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /delete session 2/i }));

    expect(screen.queryByText("Session 2")).not.toBeInTheDocument();
    expect(screen.getByText("Session 1")).toBeInTheDocument();
    expect(screen.getByLabelText(/task/i)).toHaveValue("");
  });

  test("persists inline rename across reload and auto-creates a blank session after deleting the last one", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);

    const view = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /rename session 1/i }));
    fireEvent.change(screen.getByLabelText(/session title/i), {
      target: { value: "Renamed session" }
    });
    fireEvent.blur(screen.getByLabelText(/session title/i));

    view.unmount();
    render(<App />);

    expect(screen.getByText("Renamed session")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/task/i), {
      target: { value: "Temporary task" }
    });
    fireEvent.click(screen.getByRole("button", { name: /delete renamed session/i }));

    expect(screen.queryByText("Renamed session")).not.toBeInTheDocument();
    expect(screen.getByText("Session 1")).toBeInTheDocument();
    expect(screen.getByLabelText(/task/i)).toHaveValue("");
    expect(screen.getByText(/no activity yet/i)).toBeInTheDocument();
  });

  test("restores a run-backed session after switching away and back", async () => {
    render(<App />);

    addRole("Engineer");
    addRole("QA Tester");
    addRole("CEO Planner");
    fireEvent.change(screen.getByLabelText(/task/i), {
      target: { value: "Investigate the roadmap." }
    });

    fireEvent.click(screen.getByRole("button", { name: /start dispatch/i }));
    await vi.advanceTimersByTimeAsync(4200);

    expect(screen.getByText(/atlas planned 3 accountable lanes/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /create session/i }));
    expect(screen.getByText(/no activity yet/i)).toBeInTheDocument();

    selectSession("Session 1");
    expect(screen.getByText(/atlas planned/i)).toBeInTheDocument();
    expect(screen.getAllByText(/investigate the roadmap/i).length).toBeGreaterThan(0);
  }, 10000);

  test("blocks starting another run while one session is live", async () => {
    render(<App />);

    addRole("Engineer");
    addRole("QA Tester");
    addRole("CEO Planner");
    fireEvent.change(screen.getByLabelText(/task/i), {
      target: { value: "Investigate the roadmap." }
    });

    fireEvent.click(screen.getByRole("button", { name: /start dispatch/i }));
    await vi.advanceTimersByTimeAsync(800);

    fireEvent.click(screen.getByRole("button", { name: /create session/i }));

    expect(screen.getByRole("button", { name: /stop run/i })).toBeInTheDocument();
    expect(screen.getByText(/is live\. browsing is allowed/i)).toBeInTheDocument();
  }, 10000);

  test("shows pending approval on the live session and resolves it after reselecting", async () => {
    render(<App />);

    addRole("Engineer");
    addRole("QA Tester");
    addRole("CEO Planner");
    fireEvent.change(screen.getByLabelText(/task/i), {
      target: { value: "Plan and publish the release note for the Q2 roadmap." }
    });

    fireEvent.click(screen.getByRole("button", { name: /start dispatch/i }));

    for (let index = 0; index < 18; index += 1) {
      await vi.advanceTimersByTimeAsync(600);
    }

    fireEvent.click(screen.getByRole("button", { name: /create session/i }));
    expect(screen.getAllByText(/approval pending/i).length).toBeGreaterThan(0);

    selectSession("Session 1");
    fireEvent.click(screen.getAllByRole("button", { name: "Approve" })[0]);

    expect(screen.getByText(/operator approved/i)).toBeInTheDocument();
  }, 10000);

  test("surfaces an explicit failure when the head planner bridge is unavailable", async () => {
    vi.stubGlobal("__SIGNAL_ATLAS_HEAD_PLANNER_MODE__", "bridge");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("bridge unavailable")));

    render(<App />);

    addRole("Engineer");
    fireEvent.change(screen.getByLabelText(/task/i), {
      target: { value: "Investigate the roadmap." }
    });

    fireEvent.click(screen.getByRole("button", { name: /start dispatch/i }));
    await vi.runAllTimersAsync();

    expect(screen.getAllByText(/could not reach the local head planner bridge/i).length).toBeGreaterThan(0);
  });

  test("sanitizes stale invalid draft roles instead of allowing a dead dispatch path", () => {
    localStorage.setItem("signal-atlas:sessions", JSON.stringify([
      {
        sessionId: "session-stale",
        title: "Session Stale",
        createdAt: "2026-04-04T00:00:00.000Z",
        updatedAt: "2026-04-04T00:00:00.000Z",
        linkedRunId: null,
        draft: {
          taskInput: "Investigate the roadmap.",
          selectedRoleIds: ["not-a-real-role"]
        }
      }
    ]));
    localStorage.setItem("signal-atlas:active-session", "session-stale");

    render(<App />);

    expect(screen.getByLabelText(/task/i)).toHaveValue("Investigate the roadmap.");
    expect(screen.getByRole("button", { name: /run in progress/i })).toBeDisabled();
    expect(screen.getByText(/add agents on the canvas/i)).toBeInTheDocument();
  });
});
