import { useEffect, useEffectEvent, useState } from "react";
import type { RunEvent, RunProjection } from "@/shared/contracts/types";
import {
  appendAndPersistRunEvent,
  clearLiveRuntimeSnapshot,
  loadLiveRuntimeSnapshot,
  saveLiveRuntimeSnapshot
} from "@/server/events/storage";
import { projectRun } from "@/server/events/projectRun";
import {
  buildApprovalResolutionEvents,
  buildRunScenario
} from "@/server/orchestrator/scenario";

const LIVE_TICK_MS = 550;

interface UseLiveDrainOptions {
  activeSessionId: string | null;
  activeSessionHasLinkedRun: boolean;
  liveSessionId: string | null;
  liveRunId: string | null;
  runMap: Record<string, RunEvent[]>;
  commitRunSnapshot: (runId: string, events: RunEvent[]) => void;
  updateRunEvents: (runId: string, events: RunEvent[]) => void;
  attachRunToSession: (
    sessionId: string,
    runId: string,
    taskInput: string,
    selectedRoleIds: string[],
    updatedAt: string
  ) => void;
  markLiveSession: (sessionId: string | null) => void;
  setActiveSessionId: (sessionId: string) => void;
}

export function useLiveDrain({
  activeSessionId,
  activeSessionHasLinkedRun,
  liveSessionId,
  liveRunId,
  runMap,
  commitRunSnapshot,
  updateRunEvents,
  attachRunToSession,
  markLiveSession,
  setActiveSessionId
}: UseLiveDrainOptions) {
  const [queue, setQueue] = useState<RunEvent[]>([]);

  const liveEvents = liveRunId ? runMap[liveRunId] ?? [] : [];
  const liveProjection: RunProjection = projectRun(liveEvents);
  const isLive = Boolean(liveSessionId);

  useEffect(() => {
    const snapshot = loadLiveRuntimeSnapshot();

    if (liveRunId && snapshot.runId === liveRunId) {
      setQueue(snapshot.queue);
      return;
    }

    if (liveRunId) {
      setQueue([]);
      if (snapshot.runId && snapshot.runId !== liveRunId) {
        clearLiveRuntimeSnapshot();
      } else {
        saveLiveRuntimeSnapshot({ runId: liveRunId, queue: [] });
      }
      return;
    }

    if (queue.length === 0) {
      clearLiveRuntimeSnapshot();
    }
  }, [liveRunId]);

  useEffect(() => {
    if (!liveRunId) {
      if (queue.length === 0) {
        clearLiveRuntimeSnapshot();
      }
      return;
    }

    saveLiveRuntimeSnapshot({ runId: liveRunId, queue });
  }, [liveRunId, queue]);

  const appendNextEvent = useEffectEvent(() => {
    if (!liveRunId || queue.length === 0) return;
    const [nextEvent, ...rest] = queue;
    const nextEvents = appendAndPersistRunEvent(liveRunId, nextEvent);
    updateRunEvents(liveRunId, nextEvents);
    setQueue(rest);
  });

  useEffect(() => {
    if (!liveRunId || queue.length === 0) return;
    if (liveProjection.phase === "awaiting_approval") return;

    const timeoutId = window.setTimeout(appendNextEvent, LIVE_TICK_MS);
    return () => window.clearTimeout(timeoutId);
  }, [appendNextEvent, liveProjection.phase, liveRunId, queue]);

  useEffect(() => {
    if (!liveSessionId || !liveRunId) return;

    if (queue.length === 0 && (
      liveProjection.phase === "completed" ||
      liveProjection.phase === "failed" ||
      liveProjection.phase === "cancelled"
    )) {
      markLiveSession(null);
      clearLiveRuntimeSnapshot();
    }
  }, [liveProjection.phase, liveRunId, liveSessionId, markLiveSession, queue.length]);

  function handleStartRun(task: string, roleIds: string[]): boolean {
    if (!activeSessionId || liveSessionId || activeSessionHasLinkedRun) {
      return false;
    }

    const sessionIdAtStart = activeSessionId;
    const scenario = buildRunScenario(task, roleIds);
    commitRunSnapshot(scenario.runId, scenario.initialEvents);

    attachRunToSession(
      sessionIdAtStart,
      scenario.runId,
      task,
      roleIds,
      scenario.initialEvents[scenario.initialEvents.length - 1]?.timestamp ?? new Date().toISOString()
    );
    markLiveSession(sessionIdAtStart);
    setQueue(scenario.queuedEvents);
    saveLiveRuntimeSnapshot({ runId: scenario.runId, queue: scenario.queuedEvents });
    return true;
  }

  function handleResolveApproval(decision: "approved" | "rejected"): boolean {
    if (!liveSessionId || !liveRunId) return false;

    if (activeSessionId !== liveSessionId) {
      setActiveSessionId(liveSessionId);
      return false;
    }

    const events = runMap[liveRunId] ?? [];
    const projection = projectRun(events);
    if (projection.approval.status !== "pending") return false;

    const resolutionEvents = buildApprovalResolutionEvents(
      liveRunId,
      events.length + 1,
      decision,
      projection.approval.actionLabel
    );

    let nextEvents = events;
    for (const event of resolutionEvents) {
      nextEvents = appendAndPersistRunEvent(liveRunId, event);
    }

    commitRunSnapshot(liveRunId, nextEvents);
    setQueue([]);
    markLiveSession(null);
    clearLiveRuntimeSnapshot();
    return true;
  }

  return {
    isLive,
    handleStartRun,
    handleResolveApproval
  };
}
