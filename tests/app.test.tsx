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
  Panel: ({ children, ...props }: Record<string, unknown>) => <div {...props}>{children as React.ReactNode}</div>,
  PanelResizeHandle: () => <div data-testid="resize-handle" />,
  Group: ({ children, ...props }: Record<string, unknown>) => <div {...props}>{children as React.ReactNode}</div>,
  Separator: () => <div />
}));

describe("App", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  test("shows the required UI surfaces during a run", async () => {
    render(<App />);

    // Add agents via canvas first (RolePalette removed from TaskInput)
    const addButtons = screen.getAllByText(/add agent/i);
    // Click add agent and select roles
    fireEvent.click(addButtons[0]);
    const engineer = screen.getByText("Engineer");
    fireEvent.click(engineer);

    fireEvent.click(addButtons[0]);
    const qa = screen.getByText("QA Tester");
    fireEvent.click(qa);

    fireEvent.click(addButtons[0]);
    const ceo = screen.getByText("CEO Planner");
    fireEvent.click(ceo);

    fireEvent.click(screen.getByRole("button", { name: /start dispatch/i }));

    await vi.advanceTimersByTimeAsync(3200);

    expect(screen.getByTestId("flow-graph")).toBeInTheDocument();
    expect(screen.getByText("Signal Atlas")).toBeInTheDocument();
    expect(screen.getByText(/task received/i)).toBeInTheDocument();
    expect(screen.getByText(/roles assigned/i)).toBeInTheDocument();
  }, 10000);

  test("blocks side effects until the operator approves them", async () => {
    render(<App />);

    // Add agents
    const addButtons = screen.getAllByText(/add agent/i);
    fireEvent.click(addButtons[0]);
    fireEvent.click(screen.getByText("Engineer"));
    fireEvent.click(addButtons[0]);
    fireEvent.click(screen.getByText("QA Tester"));
    fireEvent.click(addButtons[0]);
    fireEvent.click(screen.getByText("CEO Planner"));

    fireEvent.click(screen.getByRole("button", { name: /start dispatch/i }));

    for (let index = 0; index < 18; index += 1) {
      await vi.advanceTimersByTimeAsync(600);
    }

    expect(screen.getByText(/approval required/i)).toBeInTheDocument();
    expect(screen.getByText(/publish a user-facing deliverable/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    expect(screen.getByText(/operator approved/i)).toBeInTheDocument();
  }, 10000);

  test("displays agent messages in the conversation log", async () => {
    render(<App />);

    // Add agents
    const addButtons = screen.getAllByText(/add agent/i);
    fireEvent.click(addButtons[0]);
    fireEvent.click(screen.getByText("Engineer"));
    fireEvent.click(addButtons[0]);
    fireEvent.click(screen.getByText("QA Tester"));
    fireEvent.click(addButtons[0]);
    fireEvent.click(screen.getByText("CEO Planner"));

    fireEvent.click(screen.getByRole("button", { name: /start dispatch/i }));

    await vi.advanceTimersByTimeAsync(4800);

    expect(screen.getAllByText(/handed work to/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/delivered a grounded update/i).length).toBeGreaterThan(0);
  }, 10000);
});
