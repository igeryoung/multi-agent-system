import { startTransition, useEffect, useEffectEvent, useState } from "react";
import type { RunEvent, RunProjection } from "@/shared/contracts/types";
import { appendAndPersistRunEvent } from "@/server/events/storage";
import { projectRun } from "@/server/events/projectRun";
import {
  buildRunScenario,
  buildApprovalResolutionEvents
} from "@/server/orchestrator/scenario";

const LIVE_TICK_MS = 550;

interface UseLiveDrainOptions {
  activeRunId: string | null;
  runMap: Record<string, RunEvent[]>;
  setActiveRunId: (id: string) => void;
  commitRunSnapshot: (runId: string, events: RunEvent[]) => void;
  updateRunEvents: (runId: string, events: RunEvent[]) => void;
}

export function useLiveDrain({
  activeRunId,
  runMap,
  setActiveRunId,
  commitRunSnapshot,
  updateRunEvents
}: UseLiveDrainOptions) {
  const [liveRunId, setLiveRunId] = useState<string | null>(null);
  const [queue, setQueue] = useState<RunEvent[]>([]);

  const liveEvents = liveRunId ? runMap[liveRunId] ?? [] : [];
  const liveProjection: RunProjection = projectRun(liveEvents);
  const isLive = Boolean(liveRunId);

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
    if (liveRunId && queue.length === 0 && liveProjection.phase === "completed") {
      setLiveRunId(null);
    }
  }, [liveProjection.phase, liveRunId, queue.length]);

  function handleStartRun(task: string, roleIds: string[]): void {
    const scenario = buildRunScenario(task, roleIds);
    commitRunSnapshot(scenario.runId, scenario.initialEvents);

    startTransition(() => {
      setActiveRunId(scenario.runId);
      setLiveRunId(scenario.runId);
      setQueue(scenario.queuedEvents);
    });
  }

  function handleResolveApproval(decision: "approved" | "rejected"): void {
    if (!activeRunId) return;
    const events = runMap[activeRunId] ?? [];
    const projection = projectRun(events);
    if (projection.approval.status !== "pending") return;

    const resolutionEvents = buildApprovalResolutionEvents(
      activeRunId,
      events.length + 1,
      decision,
      projection.approval.actionLabel
    );

    let nextEvents = events;
    for (const event of resolutionEvents) {
      nextEvents = appendAndPersistRunEvent(activeRunId, event);
    }

    commitRunSnapshot(activeRunId, nextEvents);
    setQueue([]);
    setLiveRunId(null);
  }

  return {
    isLive,
    liveRunId,
    handleStartRun,
    handleResolveApproval
  };
}
