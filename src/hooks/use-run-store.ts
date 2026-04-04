import { useMemo, useState } from "react";
import type { RunEvent } from "@/shared/contracts/types";
import { projectRun } from "@/server/events/projectRun";
import { loadRunMap, saveRunEvents } from "@/server/events/storage";

export function useRunStore() {
  const [runMap, setRunMap] = useState(loadRunMap);

  function getRunEvents(runId: string | null): RunEvent[] {
    if (!runId) return [];
    return runMap[runId] ?? [];
  }

  function getProjection(runId: string | null) {
    return projectRun(getRunEvents(runId));
  }

  function commitRunSnapshot(runId: string, events: RunEvent[]): void {
    saveRunEvents(runId, events);
    setRunMap((prev) => ({ ...prev, [runId]: events }));
  }

  function updateRunEvents(runId: string, events: RunEvent[]): void {
    setRunMap((prev) => ({ ...prev, [runId]: events }));
  }

  return {
    runMap,
    getRunEvents,
    getProjection,
    commitRunSnapshot,
    updateRunEvents
  };
}
