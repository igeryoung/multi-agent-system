import { startTransition, useState } from "react";
import type { RunEvent } from "@/shared/contracts/types";
import { projectRun } from "@/server/events/projectRun";
import { loadRunMap, saveRunEvents } from "@/server/events/storage";

interface RunCatalogEntry {
  runId: string;
  projection: ReturnType<typeof projectRun>;
  eventCount: number;
}

function buildCatalog(runMap: Record<string, RunEvent[]>): RunCatalogEntry[] {
  return Object.entries(runMap)
    .map(([runId, events]) => ({
      runId,
      projection: projectRun(events),
      eventCount: events.length
    }))
    .sort((a, b) =>
      b.projection.lastEventAt.localeCompare(a.projection.lastEventAt)
    );
}

function loadInitialState(): {
  runMap: Record<string, RunEvent[]>;
  activeRunId: string | null;
} {
  const runMap = loadRunMap();
  const catalog = buildCatalog(runMap);
  return { runMap, activeRunId: catalog[0]?.runId ?? null };
}

export function useRunStore() {
  const [initialState] = useState(loadInitialState);
  const [runMap, setRunMap] = useState(initialState.runMap);
  const [activeRunId, setActiveRunId] = useState(initialState.activeRunId);

  const catalog = buildCatalog(runMap);
  const activeEvents = activeRunId ? runMap[activeRunId] ?? [] : [];
  const projection = projectRun(activeEvents);

  function commitRunSnapshot(runId: string, events: RunEvent[]): void {
    saveRunEvents(runId, events);
    setRunMap((prev) => ({ ...prev, [runId]: events }));
  }

  function handleSelectRun(runId: string): void {
    startTransition(() => {
      setActiveRunId(runId);
    });
  }

  function updateRunEvents(runId: string, events: RunEvent[]): void {
    setRunMap((prev) => ({ ...prev, [runId]: events }));
  }

  return {
    runMap,
    activeRunId,
    setActiveRunId,
    activeEvents,
    projection,
    catalog,
    commitRunSnapshot,
    handleSelectRun,
    updateRunEvents
  };
}
