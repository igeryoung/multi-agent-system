import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, test } from "vitest";
import { useSessionStore } from "../src/hooks/use-session-store";
import { saveRunEvents, saveSessions } from "../src/server/events/storage";
import { buildRunScenario } from "../src/server/orchestrator/scenario";
import type { RunEvent } from "../src/shared/contracts/types";

describe("useSessionStore", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test("bootstraps one run-backed session per legacy run and rehydrates live ownership", async () => {
    const scenario = await buildRunScenario("Investigate the roadmap.", ["engineer"]);
    const runMap: Record<string, RunEvent[]> = {
      [scenario.runId]: scenario.initialEvents
    };
    saveRunEvents(scenario.runId, scenario.initialEvents);

    const { result } = renderHook(() => useSessionStore({ runMap }));

    expect(result.current.sessions).toHaveLength(1);
    expect(result.current.activeSession?.linkedRunIds).toContain(scenario.runId);
    expect(result.current.liveSessionId).toBe(result.current.activeSession?.sessionId);
  });

  test("bumps updatedAt when the draft task changes", () => {
    const { result } = renderHook(() => useSessionStore({ runMap: {} }));
    const session = result.current.activeSession;
    expect(session).not.toBeNull();

    const originalUpdatedAt = session?.updatedAt ?? "";

    act(() => {
      result.current.updateSessionDraft(session!.sessionId, {
        taskInput: "Draft session task"
      });
    });

    expect(result.current.activeSession?.draft.taskInput).toBe("Draft session task");
    expect(result.current.activeSession?.updatedAt >= originalUpdatedAt).toBe(true);
  });

  test("blocks deleting the live session and falls back to the remaining session after delete", () => {
    const { result } = renderHook(() => useSessionStore({ runMap: {} }));
    const firstSessionId = result.current.activeSession?.sessionId ?? "";

    act(() => {
      result.current.createSession();
    });

    const secondSessionId = result.current.activeSession?.sessionId ?? "";

    act(() => {
      result.current.markLiveSession(firstSessionId);
    });

    expect(result.current.deleteSession(firstSessionId)).toBe(false);

    act(() => {
      result.current.setActiveSessionId(secondSessionId);
    });

    act(() => {
      expect(result.current.deleteSession(secondSessionId)).toBe(true);
    });

    expect(result.current.activeSessionId).toBe(firstSessionId);
  });

  test("rehydrates the live session deterministically when multiple runs are nonterminal", async () => {
    const first = await buildRunScenario("Investigate alpha.", ["engineer"]);
    const second = await buildRunScenario("Investigate beta.", ["qa"]);
    const timestamp = "2026-04-04T00:00:00.000Z";

    const firstEvents = first.initialEvents.map((event) => ({ ...event, timestamp }));
    const secondEvents = second.initialEvents.map((event) => ({ ...event, timestamp }));

    saveRunEvents(first.runId, firstEvents);
    saveRunEvents(second.runId, secondEvents);
    saveSessions([
      {
        sessionId: "session-a",
        title: "Session A",
        createdAt: timestamp,
        updatedAt: "2026-04-04T00:00:01.000Z",
        linkedRunIds: [first.runId],
        draft: { taskInput: "", selectedRoleIds: [] }
      },
      {
        sessionId: "session-b",
        title: "Session B",
        createdAt: timestamp,
        updatedAt: "2026-04-04T00:00:02.000Z",
        linkedRunIds: [second.runId],
        draft: { taskInput: "", selectedRoleIds: [] }
      }
    ]);

    const runMap: Record<string, RunEvent[]> = {
      [first.runId]: firstEvents,
      [second.runId]: secondEvents
    };

    const { result } = renderHook(() => useSessionStore({ runMap }));

    expect(result.current.liveSessionId).toBe("session-b");
  });

  test("appends multiple runs to the same session for chat-like history", () => {
    const { result } = renderHook(() => useSessionStore({ runMap: {} }));
    const session = result.current.activeSession;
    expect(session).not.toBeNull();

    act(() => {
      result.current.attachRunToSession(
        session!.sessionId,
        "run-a",
        "First task",
        ["engineer"],
        "2026-04-04T00:00:00.000Z"
      );
    });

    act(() => {
      result.current.attachRunToSession(
        session!.sessionId,
        "run-b",
        "Second task",
        ["qa"],
        "2026-04-04T00:00:01.000Z"
      );
    });

    expect(result.current.activeSession?.linkedRunIds).toEqual(["run-a", "run-b"]);
    expect(result.current.activeSession?.draft.taskInput).toBe("Second task");
  });

  test("sanitizes invalid persisted role ids from session drafts", () => {
    saveSessions([
      {
        sessionId: "session-invalid",
        title: "Session Invalid",
        createdAt: "2026-04-04T00:00:00.000Z",
        updatedAt: "2026-04-04T00:00:00.000Z",
        linkedRunIds: [],
        draft: {
          taskInput: "Draft task",
          selectedRoleIds: ["engineer", "not-a-real-role"]
        }
      }
    ]);

    const { result } = renderHook(() => useSessionStore({ runMap: {} }));

    expect(result.current.activeSession?.draft.selectedRoleIds).toEqual(["engineer"]);
  });
});
