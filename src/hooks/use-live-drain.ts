import { useEffect, useEffectEvent, useRef, useState } from "react";
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
import { getHeadPlannerBridgeUrl } from "@/server/orchestrator/head-planner";

const LIVE_TICK_MS = 550;

interface DebugEntry {
  id: string;
  level: "info" | "error";
  message: string;
  details?: string[];
}

interface UseLiveDrainOptions {
  activeSessionId: string | null;
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
  const [isStartingRun, setIsStartingRun] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [debugEntries, setDebugEntries] = useState<DebugEntry[]>([]);
  const [planningTask, setPlanningTask] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const liveEvents = liveRunId ? runMap[liveRunId] ?? [] : [];
  const liveProjection: RunProjection = projectRun(liveEvents);
  const isLive = Boolean(liveSessionId);

  const pushDebugEntry = useEffectEvent((
    level: DebugEntry["level"],
    message: string,
    details?: string[]
  ) => {
    setDebugEntries((previous) => [
      ...previous.slice(-23),
      {
        id: `${Date.now().toString(36)}-${previous.length.toString(36)}`,
        level,
        message,
        details
      }
    ]);
  });

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

  async function handleStartRun(task: string, roleIds: string[]): Promise<boolean> {
    if (!activeSessionId || liveSessionId || isStartingRun) {
      return false;
    }
    if (roleIds.length === 0) {
      setStartError("Add at least one valid agent before dispatching a task.");
      pushDebugEntry("error", "Dispatch blocked because no valid canvas agents are selected.");
      return false;
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setIsStartingRun(true);
    setStartError(null);
    setPlanningTask(task.trim());
    try {
      const sessionIdAtStart = activeSessionId;
      let attachedRunId: string | null = null;
      pushDebugEntry("info", `Dispatch requested for ${roleIds.length} selected agent(s).`);
      pushDebugEntry("info", `Calling head planner bridge at ${getHeadPlannerBridgeUrl()}.`);
      const scenario = await buildRunScenario(task, roleIds, {
        signal: abortController.signal,
        onInitialEvents: ({ runId, initialEvents }) => {
          attachedRunId = runId;
          commitRunSnapshot(runId, initialEvents);
          attachRunToSession(
            sessionIdAtStart,
            runId,
            task,
            roleIds,
            initialEvents[initialEvents.length - 1]?.timestamp ?? new Date().toISOString()
          );
          markLiveSession(sessionIdAtStart);
        },
        onPlanningEvent: (event) => {
          attachedRunId = event.runId;
          const nextEvents = appendAndPersistRunEvent(event.runId, event);
          updateRunEvents(event.runId, nextEvents);
        }
      });

      // If user cancelled during planning, discard the result silently
      if (abortController.signal.aborted) {
        return false;
      }

      pushDebugEntry("info", `Head planner returned ${scenario.initialEvents.length} initial event(s).`);
      commitRunSnapshot(scenario.runId, scenario.initialEvents);
      if (!attachedRunId) {
        attachRunToSession(
          sessionIdAtStart,
          scenario.runId,
          task,
          roleIds,
          scenario.initialEvents[scenario.initialEvents.length - 1]?.timestamp ?? new Date().toISOString()
        );
      }

      const projection = projectRun(scenario.initialEvents);
      if (
        projection.phase === "failed" ||
        projection.phase === "completed" ||
        projection.phase === "cancelled"
      ) {
        pushDebugEntry(
          projection.phase === "failed" ? "error" : "info",
          projection.latestSummary || projection.currentDecision,
          projection.diagnostics
        );
        setQueue([]);
        clearLiveRuntimeSnapshot();
        markLiveSession(null);
        return true;
      }

      if (!attachedRunId) {
        markLiveSession(sessionIdAtStart);
      }
      setQueue(scenario.queuedEvents);
      pushDebugEntry("info", `Queued ${scenario.queuedEvents.length} replay event(s) after head planning.`);
      saveLiveRuntimeSnapshot({ runId: scenario.runId, queue: scenario.queuedEvents });
      return true;
    } catch (error) {
      if (abortController.signal.aborted) {
        return false;
      }
      const message = error instanceof Error ? error.message : String(error);
      setStartError(message);
      pushDebugEntry("error", "Dispatch failed before queueing the run.", [message]);
      return false;
    } finally {
      abortControllerRef.current = null;
      setIsStartingRun(false);
      setPlanningTask(null);
    }
  }

  function handleCancelRun(): void {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsStartingRun(false);
    setPlanningTask(null);

    if (liveRunId) {
      const cancelEvent = {
        runId: liveRunId,
        sequence: (runMap[liveRunId]?.length ?? 0) + 1,
        timestamp: new Date().toISOString(),
        actorType: "user" as const,
        actorId: "operator",
        eventType: "run_failed" as const,
        phase: "cancelled" as const,
        payload: { summary: "Run cancelled by user." }
      };
      const nextEvents = appendAndPersistRunEvent(liveRunId, cancelEvent);
      updateRunEvents(liveRunId, nextEvents);
    }

    setQueue([]);
    markLiveSession(null);
    clearLiveRuntimeSnapshot();
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
    isLive: isLive || isStartingRun,
    isStartingRun,
    planningTask,
    startError,
    debugEntries,
    handleStartRun,
    handleCancelRun,
    handleResolveApproval
  };
}
